-- Linked external accounts (real-world bank/savings accounts the user pulls
-- money from / pushes to). Stored numbers are last-4 only; we don't simulate
-- a real ACH layer, but the schema reflects what a real one would look like
-- so the UI can pretend.

create table if not exists public.external_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  nickname text not null,
  institution text,
  account_kind text not null check (account_kind in ('checking', 'savings')),
  last4 text not null check (last4 ~ '^\d{4}$'),
  routing_last4 text check (routing_last4 is null or routing_last4 ~ '^\d{4}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists external_accounts_user_idx
  on public.external_accounts (user_id, created_at);

-- One default account per user (enforced via partial unique index).
create unique index if not exists external_accounts_one_default_per_user
  on public.external_accounts (user_id) where is_default;

alter table public.external_accounts enable row level security;

drop policy if exists "self read external_accounts" on public.external_accounts;
create policy "self read external_accounts" on public.external_accounts
  for select using (auth.uid() = user_id);

-- ── RPC: link_external_account ───────────────────────────────────────────
-- Users can link up to 5 external accounts. The first one auto-becomes the
-- default; subsequent links join the list without disturbing the default.
create or replace function public.link_external_account(
  p_nickname text,
  p_institution text,
  p_account_kind text,
  p_last4 text,
  p_routing_last4 text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_nickname text := nullif(trim(p_nickname), '');
  v_institution text := nullif(trim(p_institution), '');
  v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_nickname is null or length(v_nickname) > 60 then raise exception 'nickname required'; end if;
  if p_account_kind not in ('checking', 'savings') then raise exception 'invalid account kind'; end if;
  if p_last4 is null or p_last4 !~ '^\d{4}$' then raise exception 'last4 must be 4 digits'; end if;
  if p_routing_last4 is not null and p_routing_last4 !~ '^\d{4}$' then raise exception 'routing last4 must be 4 digits'; end if;

  select count(*) into v_count from public.external_accounts where user_id = v_user;
  if v_count >= 5 then raise exception 'maximum of 5 linked accounts reached'; end if;

  insert into public.external_accounts (user_id, nickname, institution, account_kind, last4, routing_last4, is_default)
  values (v_user, v_nickname, v_institution, p_account_kind, p_last4, p_routing_last4, v_count = 0)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── RPC: unlink_external_account ─────────────────────────────────────────
-- If we delete the default, promote the oldest remaining row to default so
-- the user always has a sane fallback.
create or replace function public.unlink_external_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_was_default boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  delete from public.external_accounts
  where id = p_id and user_id = v_user
  returning is_default into v_was_default;

  if not found then raise exception 'no such account'; end if;

  if v_was_default then
    update public.external_accounts
    set is_default = true
    where id = (
      select id from public.external_accounts
      where user_id = v_user
      order by created_at asc
      limit 1
    );
  end if;
end;
$$;

-- ── RPC: set_default_external_account ────────────────────────────────────
-- Two-step (clear, then set) so the partial unique index never sees two
-- defaults at once.
create or replace function public.set_default_external_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.external_accounts where id = p_id and user_id = v_user) then
    raise exception 'no such account';
  end if;
  update public.external_accounts set is_default = false where user_id = v_user and is_default;
  update public.external_accounts set is_default = true where id = p_id and user_id = v_user;
end;
$$;

-- Realtime so add/remove from settings updates the wallet picker live.
do $$ begin
  alter publication supabase_realtime add table public.external_accounts;
exception when duplicate_object then null; end $$;

-- ── transactions: track which external account funded a transfer ─────────
-- Optional column: NULL for legacy rows and for non-transfer transaction
-- types (BUY, SELL, CARD_SPEND, MEMBERSHIP). Set null on delete so the
-- audit log survives even if the user later unlinks the account.
alter table public.transactions
  add column if not exists external_account_id uuid
  references public.external_accounts(id) on delete set null;

-- ── deposit/withdraw: accept the funding account ─────────────────────────
-- Validates the account belongs to the caller before any state changes.
create or replace function public.deposit(
  p_amount numeric,
  p_client_id text default null,
  p_external_account_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_new numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  if p_external_account_id is not null and not exists (
    select 1 from public.external_accounts
    where id = p_external_account_id and user_id = v_user
  ) then
    raise exception 'unknown external account';
  end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return (select cash_balance from public.profiles where id = v_user);
  end if;

  begin
    update public.profiles
    set cash_balance = cash_balance + p_amount,
        updated_at = now()
    where id = v_user
    returning cash_balance into v_new;

    insert into public.transactions (user_id, type, amount, client_id, external_account_id)
    values (v_user, 'DEPOSIT', p_amount, p_client_id, p_external_account_id);

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

create or replace function public.withdraw(
  p_amount numeric,
  p_client_id text default null,
  p_external_account_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_new numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  if p_external_account_id is not null and not exists (
    select 1 from public.external_accounts
    where id = p_external_account_id and user_id = v_user
  ) then
    raise exception 'unknown external account';
  end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return (select cash_balance from public.profiles where id = v_user);
  end if;

  begin
    update public.profiles
    set cash_balance = cash_balance - p_amount,
        updated_at = now()
    where id = v_user and cash_balance >= p_amount
    returning cash_balance into v_new;

    if v_new is null then raise exception 'insufficient cash'; end if;

    insert into public.transactions (user_id, type, amount, client_id, external_account_id)
    values (v_user, 'WITHDRAW', p_amount, p_client_id, p_external_account_id);

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

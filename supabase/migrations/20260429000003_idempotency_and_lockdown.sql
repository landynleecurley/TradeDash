-- 1. Lock down profiles: drop the open self-update policy that lets clients
--    write cash_balance directly. All cash mutations must go through the
--    SECURITY DEFINER RPCs (which bypass RLS).
drop policy if exists "self update profile" on public.profiles;

-- 2. Idempotency: every mutating RPC accepts an optional client-generated id.
--    Repeating an RPC call with the same client_id is a no-op that returns
--    the current state. This survives network retries, server action quirks,
--    and any other accidental double-fire.
alter table public.transactions add column if not exists client_id text;
create unique index if not exists transactions_client_id_uniq
  on public.transactions (user_id, client_id)
  where client_id is not null;

-- ── RPC: deposit (idempotent) ────────────────────────────────────────────
create or replace function public.deposit(p_amount numeric, p_client_id text default null)
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

  -- Fast path: if this client_id was already used, return current balance.
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

    insert into public.transactions (user_id, type, amount, client_id)
    values (v_user, 'DEPOSIT', p_amount, p_client_id);

    return v_new;
  exception when unique_violation then
    -- Concurrent duplicate. Return current balance, treat as no-op.
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

-- ── RPC: withdraw (idempotent) ───────────────────────────────────────────
create or replace function public.withdraw(p_amount numeric, p_client_id text default null)
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

    insert into public.transactions (user_id, type, amount, client_id)
    values (v_user, 'WITHDRAW', p_amount, p_client_id);

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

-- ── RPC: buy_stock (idempotent) ──────────────────────────────────────────
create or replace function public.buy_stock(
  p_symbol text,
  p_name text,
  p_shares numeric,
  p_price numeric,
  p_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cost numeric := p_shares * p_price;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_shares <= 0 or p_price <= 0 then raise exception 'shares and price must be positive'; end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return;
  end if;

  begin
    update public.profiles
    set cash_balance = cash_balance - v_cost,
        updated_at = now()
    where id = v_user and cash_balance >= v_cost;

    if not found then raise exception 'insufficient cash'; end if;

    insert into public.positions (user_id, symbol, name, shares, cost_basis_total, acquired)
    values (v_user, p_symbol, p_name, p_shares, v_cost, current_date)
    on conflict (user_id, symbol) do update set
      shares = positions.shares + excluded.shares,
      cost_basis_total = positions.cost_basis_total + excluded.cost_basis_total,
      name = coalesce(excluded.name, positions.name),
      updated_at = now();

    insert into public.watchlist (user_id, symbol, name)
    values (v_user, p_symbol, p_name)
    on conflict (user_id, symbol) do nothing;

    insert into public.transactions (user_id, type, symbol, shares, price, amount, client_id)
    values (v_user, 'BUY', p_symbol, p_shares, p_price, v_cost, p_client_id);
  exception when unique_violation then
    -- Idempotent retry of the same client_id; do nothing.
    return;
  end;
end;
$$;

-- ── RPC: sell_stock (idempotent) ─────────────────────────────────────────
create or replace function public.sell_stock(
  p_symbol text,
  p_shares numeric,
  p_price numeric,
  p_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_proceeds numeric := p_shares * p_price;
  v_pos public.positions%rowtype;
  v_basis_per_share numeric;
  v_remaining numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_shares <= 0 or p_price <= 0 then raise exception 'shares and price must be positive'; end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return;
  end if;

  begin
    select * into v_pos
    from public.positions
    where user_id = v_user and symbol = p_symbol
    for update;

    if not found or v_pos.shares < p_shares then
      raise exception 'insufficient shares';
    end if;

    v_basis_per_share := case when v_pos.shares = 0 then 0 else v_pos.cost_basis_total / v_pos.shares end;
    v_remaining := v_pos.shares - p_shares;

    if v_remaining = 0 then
      delete from public.positions where id = v_pos.id;
    else
      update public.positions
      set shares = v_remaining,
          cost_basis_total = v_remaining * v_basis_per_share,
          updated_at = now()
      where id = v_pos.id;
    end if;

    update public.profiles
    set cash_balance = cash_balance + v_proceeds,
        updated_at = now()
    where id = v_user;

    insert into public.transactions (user_id, type, symbol, shares, price, amount, client_id)
    values (v_user, 'SELL', p_symbol, p_shares, p_price, v_proceeds, p_client_id);
  exception when unique_violation then
    return;
  end;
end;
$$;

-- 3. One-shot reconciliation: rebuild cash_balance from the transaction log
--    so any drift (manual edits, the missing $1000) is corrected.
update public.profiles p
set cash_balance = coalesce((
  select sum(case
    when type in ('DEPOSIT', 'SELL') then amount
    when type in ('WITHDRAW', 'BUY') then -amount
  end)
  from public.transactions where user_id = p.id
), 0),
updated_at = now();

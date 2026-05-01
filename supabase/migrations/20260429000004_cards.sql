-- Virtual debit cards. One active card per user. Numbers are generated client/
-- server side (Luhn-valid) and stored as plain text since they aren't backed
-- by a real network. RLS restricts visibility to the owner.

create table if not exists public.cards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  card_number text not null,
  cardholder_name text,
  expiry_month int not null check (expiry_month between 1 and 12),
  expiry_year int not null,
  cvv text not null,
  status text not null default 'active' check (status in ('active', 'frozen', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active+frozen card per user (cancelled rows are kept for history).
create unique index if not exists cards_one_active_per_user
  on public.cards (user_id) where status <> 'cancelled';

alter table public.cards enable row level security;

drop policy if exists "self read cards" on public.cards;
create policy "self read cards" on public.cards
  for select using (auth.uid() = user_id);

-- ── RPC: create_card ─────────────────────────────────────────────────────
-- Caller (server action) generates a Luhn-valid number + CVV; this RPC just
-- inserts it under the authenticated user.
create or replace function public.create_card(
  p_card_number text,
  p_cardholder_name text,
  p_expiry_month int,
  p_expiry_year int,
  p_cvv text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.cards where user_id = v_user and status <> 'cancelled') then
    raise exception 'card already exists';
  end if;

  insert into public.cards (user_id, card_number, cardholder_name, expiry_month, expiry_year, cvv)
  values (v_user, p_card_number, p_cardholder_name, p_expiry_month, p_expiry_year, p_cvv)
  returning id into v_id;

  return (
    select json_build_object(
      'id', id,
      'card_number', card_number,
      'cardholder_name', cardholder_name,
      'expiry_month', expiry_month,
      'expiry_year', expiry_year,
      'cvv', cvv,
      'status', status,
      'created_at', created_at
    )
    from public.cards where id = v_id
  );
end;
$$;

-- ── RPC: set_card_status ────────────────────────────────────────────────
create or replace function public.set_card_status(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_status not in ('active', 'frozen', 'cancelled') then
    raise exception 'invalid status';
  end if;

  update public.cards
  set status = p_status,
      updated_at = now()
  where user_id = v_user and status <> 'cancelled';

  if not found then raise exception 'no card to update'; end if;
end;
$$;

-- Realtime so card status flips push to other tabs/devices.
do $$ begin
  alter publication supabase_realtime add table public.cards;
exception when duplicate_object then null; end $$;

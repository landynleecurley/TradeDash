-- Run this in the Supabase SQL Editor after 0001_init.sql.

-- ── watchlist ────────────────────────────────────────────────────────────
create table if not exists public.watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  symbol text not null,
  name text,
  added_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists watchlist_user_idx on public.watchlist (user_id);

alter table public.watchlist enable row level security;

drop policy if exists "self read watchlist" on public.watchlist;
create policy "self read watchlist" on public.watchlist
  for select using (auth.uid() = user_id);

-- ── RPC: add_watchlist ───────────────────────────────────────────────────
create or replace function public.add_watchlist(p_symbol text, p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_symbol), '') = '' then raise exception 'symbol required'; end if;
  insert into public.watchlist (user_id, symbol, name)
  values (v_user, upper(trim(p_symbol)), p_name)
  on conflict (user_id, symbol) do update set name = coalesce(excluded.name, watchlist.name);
end;
$$;

-- ── RPC: remove_watchlist ────────────────────────────────────────────────
create or replace function public.remove_watchlist(p_symbol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  delete from public.watchlist
  where user_id = v_user and symbol = upper(trim(p_symbol));
end;
$$;

-- ── update buy_stock to auto-add to watchlist ────────────────────────────
create or replace function public.buy_stock(
  p_symbol text,
  p_name text,
  p_shares numeric,
  p_price numeric
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

  insert into public.transactions (user_id, type, symbol, shares, price, amount)
  values (v_user, 'BUY', p_symbol, p_shares, p_price, v_cost);
end;
$$;

-- ── Enable Realtime on user-facing tables ────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.positions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.watchlist;
exception when duplicate_object then null; end $$;

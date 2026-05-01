-- Schema for the trading platform. Run via `npm run db:push` from /dashboard.

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth.users row. Holds cash balance.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  cash_balance numeric(14, 2) not null default 0 check (cash_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── positions ────────────────────────────────────────────────────────────
-- One row per (user, symbol). Avg cost is derived = cost_basis_total / shares.
create table if not exists public.positions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  symbol text not null,
  name text,
  shares numeric(20, 6) not null check (shares >= 0),
  cost_basis_total numeric(14, 2) not null check (cost_basis_total >= 0),
  acquired date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists positions_user_idx on public.positions (user_id);

-- ── transactions ─────────────────────────────────────────────────────────
-- Append-only audit log.
do $$ begin
  create type transaction_type as enum ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAW');
exception when duplicate_object then null; end $$;

create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type transaction_type not null,
  symbol text,
  shares numeric(20, 6),
  price numeric(14, 4),
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "self read profile" on public.profiles;
drop policy if exists "self update profile" on public.profiles;
drop policy if exists "self read positions" on public.positions;
drop policy if exists "self read transactions" on public.transactions;

create policy "self read profile" on public.profiles
  for select using (auth.uid() = id);
create policy "self update profile" on public.profiles
  for update using (auth.uid() = id);

create policy "self read positions" on public.positions
  for select using (auth.uid() = user_id);

create policy "self read transactions" on public.transactions
  for select using (auth.uid() = user_id);

-- Note: writes to profiles/positions/transactions go through SECURITY DEFINER RPCs
-- below, so we deliberately don't grant insert/update/delete via RLS.

-- ── auto-create profile on signup ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── RPC: deposit ─────────────────────────────────────────────────────────
create or replace function public.deposit(p_amount numeric)
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

  update public.profiles
  set cash_balance = cash_balance + p_amount,
      updated_at = now()
  where id = v_user
  returning cash_balance into v_new;

  insert into public.transactions (user_id, type, amount)
  values (v_user, 'DEPOSIT', p_amount);

  return v_new;
end;
$$;

-- ── RPC: withdraw ────────────────────────────────────────────────────────
create or replace function public.withdraw(p_amount numeric)
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

  update public.profiles
  set cash_balance = cash_balance - p_amount,
      updated_at = now()
  where id = v_user and cash_balance >= p_amount
  returning cash_balance into v_new;

  if v_new is null then raise exception 'insufficient cash'; end if;

  insert into public.transactions (user_id, type, amount)
  values (v_user, 'WITHDRAW', p_amount);

  return v_new;
end;
$$;

-- ── RPC: buy_stock ───────────────────────────────────────────────────────
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

  insert into public.transactions (user_id, type, symbol, shares, price, amount)
  values (v_user, 'BUY', p_symbol, p_shares, p_price, v_cost);
end;
$$;

-- ── RPC: sell_stock ──────────────────────────────────────────────────────
create or replace function public.sell_stock(
  p_symbol text,
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
  v_proceeds numeric := p_shares * p_price;
  v_pos public.positions%rowtype;
  v_basis_per_share numeric;
  v_remaining numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_shares <= 0 or p_price <= 0 then raise exception 'shares and price must be positive'; end if;

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

  insert into public.transactions (user_id, type, symbol, shares, price, amount)
  values (v_user, 'SELL', p_symbol, p_shares, p_price, v_proceeds);
end;
$$;

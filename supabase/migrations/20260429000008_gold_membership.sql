-- TradeDash Gold: a virtual subscription paid from cash. Charges $5/mo or
-- $50/yr; sets expires_at; cancellation flags but doesn't shorten the period.
-- Active = status='active' AND expires_at > now() (computed in app, not in DB).

alter type transaction_type add value if not exists 'MEMBERSHIP';

create table if not exists public.memberships (
  user_id uuid references auth.users on delete cascade primary key,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  plan text check (plan in ('monthly', 'annual')),
  started_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  total_paid numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

drop policy if exists "self read membership" on public.memberships;
create policy "self read membership" on public.memberships
  for select using (auth.uid() = user_id);

-- ── RPC: subscribe_membership ────────────────────────────────────────────
create or replace function public.subscribe_membership(p_plan text, p_client_id text default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric;
  v_duration interval;
  v_now timestamptz := now();
  v_existing_expiry timestamptz;
  v_new_expiry timestamptz;
  v_new_balance numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'annual') then raise exception 'invalid plan'; end if;

  v_amount := case p_plan when 'monthly' then 5.00 when 'annual' then 50.00 end;
  v_duration := case p_plan when 'monthly' then interval '30 days' when 'annual' then interval '365 days' end;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return (select cash_balance from public.profiles where id = v_user);
  end if;

  -- Charge cash.
  update public.profiles
  set cash_balance = cash_balance - v_amount,
      updated_at = v_now
  where id = v_user and cash_balance >= v_amount
  returning cash_balance into v_new_balance;
  if v_new_balance is null then raise exception 'insufficient cash'; end if;

  -- If renewing a still-active membership, stack the duration on top.
  select expires_at into v_existing_expiry from public.memberships where user_id = v_user;
  v_new_expiry := case
    when v_existing_expiry is not null and v_existing_expiry > v_now then v_existing_expiry + v_duration
    else v_now + v_duration
  end;

  begin
    insert into public.memberships (user_id, status, plan, started_at, expires_at, cancelled_at, total_paid, updated_at)
    values (v_user, 'active', p_plan, v_now, v_new_expiry, null, v_amount, v_now)
    on conflict (user_id) do update set
      status = 'active',
      plan = excluded.plan,
      started_at = coalesce(memberships.started_at, excluded.started_at),
      expires_at = v_new_expiry,
      cancelled_at = null,
      total_paid = memberships.total_paid + excluded.total_paid,
      updated_at = excluded.updated_at;

    insert into public.transactions (user_id, type, amount, symbol, client_id)
    values (v_user, 'MEMBERSHIP', v_amount, 'TradeDash Gold', p_client_id);

    return v_new_balance;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

-- ── RPC: cancel_membership ───────────────────────────────────────────────
-- Marks the membership for cancellation. Benefits remain until expires_at.
create or replace function public.cancel_membership()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.memberships
  set cancelled_at = now(),
      updated_at = now()
  where user_id = v_user and cancelled_at is null;
  if not found then raise exception 'no active membership to cancel'; end if;
end;
$$;

do $$ begin
  alter publication supabase_realtime add table public.memberships;
exception when duplicate_object then null; end $$;

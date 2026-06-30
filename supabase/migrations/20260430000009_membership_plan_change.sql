-- Scheduled plan changes. A Gold member can no longer re-pick a plan from the
-- Gold page; instead they queue a switch on the billing page and it takes
-- effect at the NEXT renewal. The queued plan lives in `pending_plan` and is
-- consumed inside subscribe_membership when an active membership renews.

alter table public.memberships
  add column if not exists pending_plan text check (pending_plan in ('monthly', 'annual'));

-- ── RPC: schedule_plan_change ────────────────────────────────────────────
-- Queues a plan change for the next billing cycle. Passing the CURRENT plan
-- clears any pending change ("keep my current plan").
create or replace function public.schedule_plan_change(p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_status text;
  v_expires timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'annual') then raise exception 'invalid plan'; end if;

  select plan, status, expires_at into v_plan, v_status, v_expires
  from public.memberships where user_id = v_user;

  if v_plan is null or v_status <> 'active' or v_expires is null or v_expires <= now() then
    raise exception 'no active membership';
  end if;

  update public.memberships
  set pending_plan = case when p_plan = v_plan then null else p_plan end,
      updated_at = now()
  where user_id = v_user;
end;
$$;

-- ── RPC: subscribe_membership (updated) ──────────────────────────────────
-- Same as before, except: when an ACTIVE membership renews and a plan change
-- is queued in `pending_plan`, the queued plan wins over whatever the caller
-- passed, and the queue is cleared. New subscriptions are unaffected.
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
  v_pending_plan text;
  v_new_expiry timestamptz;
  v_new_balance numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_plan not in ('monthly', 'annual') then raise exception 'invalid plan'; end if;

  -- A scheduled plan change is consumed when an active membership renews.
  select expires_at, pending_plan into v_existing_expiry, v_pending_plan
  from public.memberships where user_id = v_user;
  if v_existing_expiry is not null and v_existing_expiry > v_now and v_pending_plan is not null then
    p_plan := v_pending_plan;
  end if;

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
  v_new_expiry := case
    when v_existing_expiry is not null and v_existing_expiry > v_now then v_existing_expiry + v_duration
    else v_now + v_duration
  end;

  begin
    insert into public.memberships (user_id, status, plan, started_at, expires_at, cancelled_at, total_paid, pending_plan, updated_at)
    values (v_user, 'active', p_plan, v_now, v_new_expiry, null, v_amount, null, v_now)
    on conflict (user_id) do update set
      status = 'active',
      plan = excluded.plan,
      started_at = coalesce(memberships.started_at, excluded.started_at),
      expires_at = v_new_expiry,
      cancelled_at = null,
      total_paid = memberships.total_paid + excluded.total_paid,
      pending_plan = null,
      updated_at = excluded.updated_at;

    insert into public.transactions (user_id, type, amount, symbol, client_id)
    values (v_user, 'MEMBERSHIP', v_amount, 'TradeDash Gold', p_client_id);

    return v_new_balance;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

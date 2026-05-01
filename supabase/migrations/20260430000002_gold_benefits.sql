-- Activate the listed Gold benefits with real server-side logic.
--
-- 1. Deposit match: every DEPOSIT made by an active Gold member receives a
--    1% bonus credited as a separate transaction so it shows up in Activity.
-- 2. 5% APY on cash: a new RPC (`accrue_gold_interest`) walks the time elapsed
--    since the last credit and adds pro-rated interest. The client calls it
--    on every refresh; the RPC no-ops when nothing meaningful has accrued.
-- 3. Watchlist limit: free users cap at 10 symbols; Gold has no cap. Enforced
--    in `add_watchlist` so the existing client UI immediately benefits.

-- Track when we last paid out interest so the next call only credits the
-- delta. Defaulting to NULL means new users start "fresh" — the first
-- accrual call sets the baseline without paying out for time that didn't
-- exist as a Gold member.
alter table public.profiles
  add column if not exists last_interest_credit_at timestamptz;

-- ── deposit (with Gold 1% match) ─────────────────────────────────────────
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
  v_match numeric;
  v_is_gold boolean;
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

    -- Gold deposit match: credit a 1% bonus alongside the user's deposit.
    select status = 'active' and expires_at is not null and expires_at > now()
      into v_is_gold
    from public.memberships
    where user_id = v_user;

    if coalesce(v_is_gold, false) then
      v_match := round(p_amount * 0.01, 2);
      if v_match >= 0.01 then
        update public.profiles
        set cash_balance = cash_balance + v_match,
            updated_at = now()
        where id = v_user
        returning cash_balance into v_new;

        insert into public.transactions (user_id, type, amount, symbol)
        values (v_user, 'DEPOSIT', v_match, 'Gold deposit match · 1%');
      end if;
    end if;

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

-- ── accrue_gold_interest ─────────────────────────────────────────────────
-- Pro-rates 5% APY across the time since the last credit. Caller (the SPA's
-- useStockData hook) invokes on each refresh; the RPC is idempotent in
-- practice because it tracks `last_interest_credit_at` and only writes when
-- the rounded interest crosses $0.01.
create or replace function public.accrue_gold_interest()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_last timestamptz;
  v_cash numeric;
  v_is_gold boolean;
  v_seconds numeric;
  v_interest numeric;
  v_apy numeric := 0.05;
  v_year_seconds numeric := 365 * 24 * 60 * 60;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select status = 'active' and expires_at is not null and expires_at > v_now
    into v_is_gold
  from public.memberships
  where user_id = v_user;

  if not coalesce(v_is_gold, false) then
    return 0;
  end if;

  select last_interest_credit_at, cash_balance
    into v_last, v_cash
  from public.profiles
  where id = v_user;

  -- First call ever: set the baseline so we don't backdate interest.
  if v_last is null then
    update public.profiles
    set last_interest_credit_at = v_now
    where id = v_user;
    return 0;
  end if;

  -- Nothing to accrue on.
  if coalesce(v_cash, 0) <= 0 then
    update public.profiles
    set last_interest_credit_at = v_now
    where id = v_user;
    return 0;
  end if;

  v_seconds := extract(epoch from (v_now - v_last));
  if v_seconds <= 0 then
    return 0;
  end if;

  v_interest := round(v_cash * v_apy * v_seconds / v_year_seconds, 2);

  -- Skip when the rounded payout is sub-cent. Leave the timestamp alone so
  -- the next call accumulates from the same starting point.
  if v_interest < 0.01 then
    return 0;
  end if;

  update public.profiles
  set cash_balance = cash_balance + v_interest,
      last_interest_credit_at = v_now,
      updated_at = v_now
  where id = v_user;

  insert into public.transactions (user_id, type, amount, symbol)
  values (v_user, 'DEPOSIT', v_interest, 'Gold interest · 5% APY');

  return v_interest;
end;
$$;

-- ── add_watchlist (with non-Gold limit) ──────────────────────────────────
create or replace function public.add_watchlist(p_symbol text, p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count int;
  v_is_gold boolean;
  v_limit int := 10;
  v_symbol text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  v_symbol := upper(trim(p_symbol));
  if coalesce(v_symbol, '') = '' then raise exception 'symbol required'; end if;

  -- Already on the watchlist? No-op upsert; bypass the limit check.
  if exists (select 1 from public.watchlist where user_id = v_user and symbol = v_symbol) then
    update public.watchlist set name = coalesce(p_name, name)
    where user_id = v_user and symbol = v_symbol;
    return;
  end if;

  select status = 'active' and expires_at is not null and expires_at > now()
    into v_is_gold
  from public.memberships
  where user_id = v_user;

  if not coalesce(v_is_gold, false) then
    select count(*) into v_count from public.watchlist where user_id = v_user;
    if v_count >= v_limit then
      raise exception 'watchlist limit reached: % symbols (Gold members get unlimited)', v_limit;
    end if;
  end if;

  insert into public.watchlist (user_id, symbol, name)
  values (v_user, v_symbol, p_name);
end;
$$;

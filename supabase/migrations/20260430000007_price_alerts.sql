-- Smart price alerts (Gold benefit). Users set above/below thresholds on
-- watchlist symbols; the client-side WS feed watches live prices and calls
-- `trigger_price_alert` once a threshold is crossed. The RPC is the only
-- code path that can flip an alert to "triggered", and it also writes the
-- accompanying notification row so the bell + push channels light up.

create table if not exists public.price_alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  symbol text not null,
  direction text not null check (direction in ('above', 'below')),
  threshold numeric(14, 4) not null check (threshold > 0),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price numeric(14, 4)
);

create index if not exists price_alerts_user_idx
  on public.price_alerts (user_id);

create index if not exists price_alerts_user_active_idx
  on public.price_alerts (user_id, symbol)
  where triggered_at is null;

alter table public.price_alerts enable row level security;

drop policy if exists "self read price_alerts" on public.price_alerts;
create policy "self read price_alerts" on public.price_alerts
  for select using (auth.uid() = user_id);

-- ── RPC: create_price_alert (Gold-gated) ─────────────────────────────────
create or replace function public.create_price_alert(
  p_symbol text,
  p_direction text,
  p_threshold numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_is_gold boolean;
  v_active_count int;
  v_symbol text := upper(trim(coalesce(p_symbol, '')));
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_direction not in ('above', 'below') then raise exception 'invalid direction'; end if;
  if p_threshold is null or p_threshold <= 0 then raise exception 'threshold must be positive'; end if;
  if v_symbol = '' then raise exception 'symbol required'; end if;

  -- Gold gate. Lapsed members can still see and delete their existing
  -- alerts (RLS allows that); they just can't create new ones.
  select status = 'active' and expires_at is not null and expires_at > now()
    into v_is_gold
  from public.memberships where user_id = v_user;
  if not coalesce(v_is_gold, false) then
    raise exception 'gold membership required for smart price alerts';
  end if;

  -- Sanity cap so a runaway script can't fill the table.
  select count(*) into v_active_count
  from public.price_alerts
  where user_id = v_user and triggered_at is null;
  if v_active_count >= 25 then
    raise exception 'maximum of 25 active alerts reached — delete or wait for triggers first';
  end if;

  -- Reject exact duplicates (same symbol, same direction, same threshold)
  -- so a misclick doesn't queue two of the same alert.
  if exists (
    select 1 from public.price_alerts
    where user_id = v_user
      and symbol = v_symbol
      and direction = p_direction
      and triggered_at is null
      and abs(threshold - p_threshold) < 0.0001
  ) then
    raise exception 'duplicate alert: same symbol, direction, and threshold already active';
  end if;

  insert into public.price_alerts (user_id, symbol, direction, threshold)
  values (v_user, v_symbol, p_direction, p_threshold)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── RPC: delete_price_alert ──────────────────────────────────────────────
create or replace function public.delete_price_alert(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  delete from public.price_alerts where id = p_id and user_id = v_user;
end;
$$;

-- ── RPC: trigger_price_alert ─────────────────────────────────────────────
-- Fired by the client-side watcher once a live price crosses an alert's
-- threshold. The RPC is the gatekeeper: it re-checks the threshold against
-- the supplied price, flips `triggered_at` so re-firing is impossible, and
-- inserts a corresponding row into the notifications table so the bell +
-- email/SMS channels light up.
create or replace function public.trigger_price_alert(p_id uuid, p_price numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_alert record;
  v_should_fire boolean;
  v_threshold_str text;
  v_price_str text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_price is null or p_price <= 0 then return false; end if;

  select * into v_alert
  from public.price_alerts
  where id = p_id and user_id = v_user and triggered_at is null;
  if not found then return false; end if;

  v_should_fire := case v_alert.direction
    when 'above' then p_price >= v_alert.threshold
    when 'below' then p_price <= v_alert.threshold
  end;
  if not coalesce(v_should_fire, false) then return false; end if;

  -- Atomic flip — guards against two tabs racing the same trigger.
  update public.price_alerts
  set triggered_at = now(),
      triggered_price = p_price
  where id = p_id and user_id = v_user and triggered_at is null;
  if not found then return false; end if;

  v_threshold_str := '$' || to_char(v_alert.threshold, 'FM999G990D00');
  v_price_str := '$' || to_char(p_price, 'FM999G990D00');

  insert into public.notifications (user_id, category, title, body, link)
  values (
    v_user,
    'alert',
    v_alert.symbol || ' ' || (case v_alert.direction
      when 'above' then 'crossed above'
      else 'fell below'
    end) || ' ' || v_threshold_str,
    'Now trading at ' || v_price_str,
    '/stock/' || v_alert.symbol
  );

  return true;
end;
$$;

do $$ begin
  alter publication supabase_realtime add table public.price_alerts;
exception when duplicate_object then null; end $$;

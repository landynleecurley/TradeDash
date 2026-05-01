-- Notifications + per-category delivery preferences. Notifications are fired
-- via an after-insert trigger on the transactions table so every BUY, SELL,
-- transfer, card spend, and membership charge emits a row automatically.
-- The client filters by the user's prefs at render time — we always store
-- the full feed so toggling a category back on doesn't lose history.

create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  category text not null check (category in ('trade','transfer','card','gold','security','alert','product')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "self read notifications" on public.notifications;
create policy "self read notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- Per-category, per-channel toggles. Channels are 'inApp' / 'email' / 'sms';
-- only inApp is functional in this build but the schema accommodates the
-- others so the settings UI can show them as ready-to-flip switches.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{
    "trade":     {"inApp": true,  "email": false, "sms": false},
    "transfer":  {"inApp": true,  "email": false, "sms": false},
    "card":      {"inApp": true,  "email": false, "sms": false},
    "gold":      {"inApp": true,  "email": false, "sms": false},
    "security":  {"inApp": true,  "email": true,  "sms": false},
    "alert":     {"inApp": true,  "email": false, "sms": false},
    "product":   {"inApp": false, "email": false, "sms": false}
  }'::jsonb;

-- Backfill defaults for any pre-existing rows that came in with NULL.
update public.profiles
set notification_prefs = '{
  "trade":     {"inApp": true,  "email": false, "sms": false},
  "transfer":  {"inApp": true,  "email": false, "sms": false},
  "card":      {"inApp": true,  "email": false, "sms": false},
  "gold":      {"inApp": true,  "email": false, "sms": false},
  "security":  {"inApp": true,  "email": true,  "sms": false},
  "alert":     {"inApp": true,  "email": false, "sms": false},
  "product":   {"inApp": false, "email": false, "sms": false}
}'::jsonb
where notification_prefs is null;

-- ── trigger: emit a notification on every transaction ────────────────────
-- Splits transaction types into categories the UI groups by. The Gold
-- interest / deposit match rows pivot off the magic `symbol` strings the
-- accrue/deposit RPCs write.
create or replace function public.emit_transaction_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_title text;
  v_body text;
  v_link text;
  v_amount text := '$' || to_char(new.amount, 'FM999G999G990D00');
begin
  case new.type
    when 'BUY' then
      v_category := 'trade';
      v_title := 'Buy filled';
      v_body := coalesce(new.symbol, '') || ' · '
        || to_char(new.shares, 'FM999G999G990D######') || ' shares · ' || v_amount;
      v_link := '/stock/' || coalesce(new.symbol, '');
    when 'SELL' then
      v_category := 'trade';
      v_title := 'Sell filled';
      v_body := coalesce(new.symbol, '') || ' · '
        || to_char(new.shares, 'FM999G999G990D######') || ' shares · ' || v_amount;
      v_link := '/stock/' || coalesce(new.symbol, '');
    when 'DEPOSIT' then
      if new.symbol = 'Gold interest · 5% APY' then
        v_category := 'gold';
        v_title := 'Gold interest paid';
        v_body := v_amount || ' added to your wallet';
        v_link := '/gold';
      elsif new.symbol = 'Gold deposit match · 1%' then
        v_category := 'gold';
        v_title := 'Gold deposit match';
        v_body := v_amount || ' bonus on your deposit';
        v_link := '/gold';
      else
        v_category := 'transfer';
        v_title := 'Deposit complete';
        v_body := v_amount || ' added to your wallet';
        v_link := '/wallet';
      end if;
    when 'WITHDRAW' then
      v_category := 'transfer';
      v_title := 'Withdrawal complete';
      v_body := v_amount || ' moved to your linked account';
      v_link := '/wallet';
    when 'CARD_SPEND' then
      v_category := 'card';
      v_title := 'Card charged';
      v_body := coalesce(new.symbol, 'Merchant') || ' · ' || v_amount;
      v_link := '/wallet';
    when 'MEMBERSHIP' then
      v_category := 'gold';
      v_title := coalesce(new.symbol, 'Membership charge');
      v_body := v_amount || ' charged from your wallet';
      v_link := '/gold';
    else
      return new;
  end case;

  insert into public.notifications (user_id, category, title, body, link)
  values (new.user_id, v_category, v_title, v_body, v_link);

  return new;
end;
$$;

drop trigger if exists transactions_emit_notification on public.transactions;
create trigger transactions_emit_notification
  after insert on public.transactions
  for each row execute procedure public.emit_transaction_notification();

-- ── RPC: update_notification_prefs ───────────────────────────────────────
-- Replaces the entire prefs object. We trust the caller to merge — the
-- client always sends the full shape so partial updates aren't a concern.
create or replace function public.update_notification_prefs(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_prefs is null then raise exception 'prefs required'; end if;

  update public.profiles
  set notification_prefs = p_prefs,
      updated_at = now()
  where id = v_user;
end;
$$;

-- ── RPC: mark_notification_read ──────────────────────────────────────────
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.notifications
  set read_at = now()
  where id = p_id and user_id = v_user and read_at is null;
end;
$$;

-- ── RPC: mark_all_notifications_read ─────────────────────────────────────
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.notifications
  set read_at = now()
  where user_id = v_user and read_at is null;
end;
$$;

-- Realtime — the bell subscribes for new notifications and read-state flips.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

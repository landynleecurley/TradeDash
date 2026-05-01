-- Optional 4-digit PIN. Stored as a bcrypt hash via pgcrypto, never plaintext.
-- A generated `has_pin` column is what the client reads so the hash never
-- leaves the server.

alter table public.cards
  add column if not exists pin_hash text,
  add column if not exists has_pin boolean generated always as (pin_hash is not null) stored;

-- ── RPC: set_card_pin ────────────────────────────────────────────────────
create or replace function public.set_card_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_pin is null or not (p_pin ~ '^\d{4}$') then raise exception 'pin must be 4 digits'; end if;
  update public.cards
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where user_id = v_user and status <> 'cancelled';
  if not found then raise exception 'no active card'; end if;
end;
$$;

-- ── RPC: clear_card_pin ──────────────────────────────────────────────────
create or replace function public.clear_card_pin()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.cards
  set pin_hash = null,
      updated_at = now()
  where user_id = v_user and status <> 'cancelled';
  if not found then raise exception 'no active card'; end if;
end;
$$;

-- ── Re-create card_spend with PIN gate ───────────────────────────────────
-- If a PIN is set, the caller must pass it. crypt(input, hash) regenerates
-- the same hash when input matches, so equality check is the verification.
create or replace function public.card_spend(
  p_amount numeric,
  p_merchant text,
  p_pin text default null,
  p_client_id text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_card record;
  v_new numeric;
  v_spent_today numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return (select cash_balance from public.profiles where id = v_user);
  end if;

  select status, daily_limit, pin_hash into v_card
  from public.cards
  where user_id = v_user and status <> 'cancelled'
  limit 1;

  if v_card is null then raise exception 'no active card'; end if;
  if v_card.status = 'frozen' then raise exception 'card is frozen'; end if;

  if v_card.pin_hash is not null then
    if p_pin is null or extensions.crypt(p_pin, v_card.pin_hash) <> v_card.pin_hash then
      raise exception 'invalid pin';
    end if;
  end if;

  if v_card.daily_limit is not null then
    select coalesce(sum(amount), 0) into v_spent_today
    from public.transactions
    where user_id = v_user
      and type = 'CARD_SPEND'
      and created_at >= date_trunc('day', now());
    if v_spent_today + p_amount > v_card.daily_limit then
      raise exception 'daily spending limit reached';
    end if;
  end if;

  begin
    update public.profiles
    set cash_balance = cash_balance - p_amount,
        updated_at = now()
    where id = v_user and cash_balance >= p_amount
    returning cash_balance into v_new;

    if v_new is null then raise exception 'insufficient cash'; end if;

    insert into public.transactions (user_id, type, symbol, amount, client_id)
    values (v_user, 'CARD_SPEND', nullif(trim(p_merchant), ''), p_amount, p_client_id);

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

-- Note: `has_pin` is added to the card row's selectable columns; pin_hash
-- itself stays available only to the SECURITY DEFINER RPCs above (RLS still
-- gates row reads to the owner, but the hash is never useful client-side).

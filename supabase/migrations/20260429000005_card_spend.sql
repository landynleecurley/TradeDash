-- Cards can now spend cash via a virtual purchase. Adds a CARD_SPEND
-- transaction type, an idempotent card_spend() RPC, and an update_card_name()
-- RPC so users can fix the cardholder name without re-issuing.

alter type transaction_type add value if not exists 'CARD_SPEND';

-- ── RPC: card_spend ──────────────────────────────────────────────────────
-- Charges the user's cash balance. The "merchant" string is stored on the
-- transaction's `symbol` column so the existing reads don't need a schema
-- change. A frozen or cancelled card rejects the charge.
create or replace function public.card_spend(
  p_amount numeric,
  p_merchant text,
  p_client_id text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card_status text;
  v_new numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  if p_client_id is not null and exists (
    select 1 from public.transactions where user_id = v_user and client_id = p_client_id
  ) then
    return (select cash_balance from public.profiles where id = v_user);
  end if;

  select status into v_card_status
  from public.cards
  where user_id = v_user and status <> 'cancelled'
  limit 1;

  if v_card_status is null then raise exception 'no active card'; end if;
  if v_card_status = 'frozen' then raise exception 'card is frozen'; end if;

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

-- ── RPC: update_card_name ────────────────────────────────────────────────
create or replace function public.update_card_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clean text := upper(trim(p_name));
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if length(v_clean) < 3 then raise exception 'name too short'; end if;

  update public.cards
  set cardholder_name = v_clean,
      updated_at = now()
  where user_id = v_user and status <> 'cancelled';

  if not found then raise exception 'no active card to rename'; end if;
end;
$$;

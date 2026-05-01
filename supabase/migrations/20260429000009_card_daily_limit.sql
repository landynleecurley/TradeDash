-- Optional per-card daily spending cap. NULL = no limit (default).
alter table public.cards
  add column if not exists daily_limit numeric(14, 2);

-- ── RPC: update_card_limit ───────────────────────────────────────────────
-- Pass a positive number to set; pass NULL to clear.
create or replace function public.update_card_limit(p_limit numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_limit is not null and p_limit < 0 then raise exception 'limit must be positive'; end if;

  update public.cards
  set daily_limit = p_limit,
      updated_at = now()
  where user_id = v_user and status <> 'cancelled';

  if not found then raise exception 'no active card to update'; end if;
end;
$$;

-- ── Re-create card_spend with daily-limit enforcement ────────────────────
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

  select status, daily_limit into v_card
  from public.cards
  where user_id = v_user and status <> 'cancelled'
  limit 1;

  if v_card is null then raise exception 'no active card'; end if;
  if v_card.status = 'frozen' then raise exception 'card is frozen'; end if;

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

-- Physical / metal card upgrade. Gold members get a free standard plastic
-- card; anyone can pay a one-time $149 fee for the metal card. Both flow
-- through a single RPC that adds shipping timestamps onto the existing
-- card row (we don't track full shipping addresses yet — country comes
-- from the profile).

alter table public.cards
  add column if not exists card_type text not null default 'virtual'
    check (card_type in ('virtual', 'standard', 'metal')),
  add column if not exists ordered_at timestamptz,
  add column if not exists shipped_at timestamptz;

-- ── RPC: order_physical_card ─────────────────────────────────────────────
-- Caller picks 'standard' (Gold-only, free) or 'metal' ($149 from cash).
-- Mutates the existing active card (we don't issue a new number for the
-- physical upgrade — the virtual card is the same account, just plastic).
create or replace function public.order_physical_card(p_card_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card_id uuid;
  v_current_type text;
  v_is_gold boolean := false;
  v_membership record;
  v_metal_fee numeric := 149.00;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_card_type not in ('standard', 'metal') then
    raise exception 'invalid card type';
  end if;

  select id, card_type into v_card_id, v_current_type
  from public.cards
  where user_id = v_user and status <> 'cancelled'
  limit 1;

  if v_card_id is null then raise exception 'no active card to upgrade'; end if;
  if v_current_type <> 'virtual' then raise exception 'card is already physical'; end if;

  -- Standard physical card is a Gold-tier perk.
  if p_card_type = 'standard' then
    select status, expires_at into v_membership
    from public.memberships where user_id = v_user;
    v_is_gold := v_membership.status = 'active'
      and v_membership.expires_at is not null
      and v_membership.expires_at > now();
    if not v_is_gold then raise exception 'gold membership required for free physical card'; end if;
  end if;

  -- Metal card costs the user $149 deducted from cash.
  if p_card_type = 'metal' then
    update public.profiles
    set cash_balance = cash_balance - v_metal_fee,
        updated_at = now()
    where id = v_user and cash_balance >= v_metal_fee;
    if not found then raise exception 'insufficient cash for metal card fee'; end if;

    insert into public.transactions (user_id, type, symbol, amount)
    values (v_user, 'MEMBERSHIP', 'Metal Card · One-time fee', v_metal_fee);
  end if;

  update public.cards
  set card_type = p_card_type,
      ordered_at = now(),
      updated_at = now()
  where id = v_card_id;
end;
$$;

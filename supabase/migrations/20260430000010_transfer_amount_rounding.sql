-- Transfer amount hygiene.
--
-- cash_balance and transactions.amount are numeric(14,2), so a sub-cent
-- transfer (e.g. 0.004) silently rounds to 0.00 — booking a ghost $0.00 row
-- and moving no money. The UI now blocks that, but harden the RPCs too so a
-- direct call can't do it either: round to the cent and require >= 0.01.
--
-- Both bodies are otherwise identical to their latest definitions (deposit
-- keeps the Gold 1% match from 20260430000002; withdraw keeps the external
-- account + idempotency handling from 20260429000012).

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

  p_amount := round(p_amount, 2);
  if p_amount < 0.01 then raise exception 'amount must be at least 0.01'; end if;

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

create or replace function public.withdraw(
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
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  p_amount := round(p_amount, 2);
  if p_amount < 0.01 then raise exception 'amount must be at least 0.01'; end if;

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
    set cash_balance = cash_balance - p_amount,
        updated_at = now()
    where id = v_user and cash_balance >= p_amount
    returning cash_balance into v_new;

    if v_new is null then raise exception 'insufficient cash'; end if;

    insert into public.transactions (user_id, type, amount, client_id, external_account_id)
    values (v_user, 'WITHDRAW', p_amount, p_client_id, p_external_account_id);

    return v_new;
  exception when unique_violation then
    return (select cash_balance from public.profiles where id = v_user);
  end;
end;
$$;

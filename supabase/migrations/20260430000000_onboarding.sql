-- Onboarding fields collected during signup. Stored on the existing profiles
-- row (one-to-one with auth.users) so a single read in useStockData hydrates
-- the whole user state. `onboarded_at` is the gate: null = redirect into
-- /onboarding; non-null = profile is complete and the app is usable.

alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists country text,
  add column if not exists experience_level text
    check (experience_level is null or experience_level in ('beginner','intermediate','expert')),
  add column if not exists annual_income text
    check (annual_income is null or annual_income in ('<50k','50-100k','100-250k','250k-1m','1m+')),
  add column if not exists risk_tolerance text
    check (risk_tolerance is null or risk_tolerance in ('conservative','balanced','aggressive')),
  add column if not exists onboarded_at timestamptz;

-- ── RPC: complete_onboarding ─────────────────────────────────────────────
-- Accepts every onboarding field and writes them in one shot. Validates
-- everything server-side so the client UI is just convenience: we still
-- enforce 18+, country length, and the enum vocabularies here. Setting
-- `onboarded_at` is the signal to the rest of the app that onboarding is
-- done — checked by the proxy/middleware and the home page.
create or replace function public.complete_onboarding(
  p_first_name text,
  p_last_name text,
  p_date_of_birth date,
  p_country text,
  p_experience_level text,
  p_annual_income text,
  p_risk_tolerance text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_first text := nullif(trim(p_first_name), '');
  v_last  text := nullif(trim(p_last_name), '');
  v_country text := nullif(trim(p_country), '');
  v_age int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if v_first is null or v_last is null then raise exception 'name required'; end if;
  if length(v_first) > 40 or length(v_last) > 40 then raise exception 'name too long'; end if;

  if p_date_of_birth is null then raise exception 'date of birth required'; end if;
  v_age := extract(year from age(p_date_of_birth));
  if v_age < 18 then raise exception 'must be at least 18 years old'; end if;
  if v_age > 120 then raise exception 'invalid date of birth'; end if;

  if v_country is null or length(v_country) > 60 then raise exception 'country required'; end if;

  if p_experience_level not in ('beginner','intermediate','expert') then
    raise exception 'invalid experience level';
  end if;
  if p_annual_income not in ('<50k','50-100k','100-250k','250k-1m','1m+') then
    raise exception 'invalid annual income';
  end if;
  if p_risk_tolerance not in ('conservative','balanced','aggressive') then
    raise exception 'invalid risk tolerance';
  end if;

  update public.profiles
  set first_name = v_first,
      last_name = v_last,
      display_name = v_first || ' ' || v_last,
      date_of_birth = p_date_of_birth,
      country = v_country,
      experience_level = p_experience_level,
      annual_income = p_annual_income,
      risk_tolerance = p_risk_tolerance,
      onboarded_at = coalesce(onboarded_at, now()),
      updated_at = now()
  where id = v_user;

  if not found then raise exception 'no profile to update'; end if;
end;
$$;

-- Theme preference + phone-for-SMS columns. Email lives on auth.users so
-- we don't need a column for it; signup confirmations make it implicitly
-- "verified". Phone is captured here with a separate verified-at timestamp
-- and a mock OTP RPC so the SMS notification toggle has something real to
-- gate on (delivery comes later when we wire a provider like Twilio).

alter table public.profiles
  add column if not exists theme text not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz;

-- ── RPC: update_theme ────────────────────────────────────────────────────
create or replace function public.update_theme(p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_theme not in ('light', 'dark', 'system') then raise exception 'invalid theme'; end if;
  update public.profiles
  set theme = p_theme,
      updated_at = now()
  where id = v_user;
end;
$$;

-- ── RPC: update_phone ────────────────────────────────────────────────────
-- Strips formatting, stores digits only, and clears the verified-at
-- timestamp because changing the number invalidates the prior verification.
create or replace function public.update_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clean text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_clean is not null and (length(v_clean) < 7 or length(v_clean) > 15) then
    raise exception 'phone must be 7–15 digits';
  end if;
  update public.profiles
  set phone = v_clean,
      phone_verified_at = null,
      updated_at = now()
  where id = v_user;
end;
$$;

-- ── RPC: verify_phone ────────────────────────────────────────────────────
-- Mock OTP for the demo: any 6-digit code unlocks the verified state. Real
-- delivery infrastructure (Twilio Verify, etc.) would replace this with a
-- code-comparison against a stored OTP row.
create or replace function public.verify_phone(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_code is null or p_code !~ '^\d{6}$' then
    raise exception 'enter the 6-digit code we sent';
  end if;
  update public.profiles
  set phone_verified_at = now(),
      updated_at = now()
  where id = v_user and phone is not null;
  if not found then raise exception 'add a phone number first'; end if;
end;
$$;

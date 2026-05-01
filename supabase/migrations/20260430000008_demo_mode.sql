-- Demo mode: when an anonymous user is created (via Supabase's
-- `signInAnonymously`), seed their profile with a usable starter state so
-- the app feels alive immediately — $10k cash, a sensible watchlist, and a
-- placeholder name so card issuance doesn't trip the "name required" guard.
--
-- Also: keep `profiles.email` in sync after a user converts an anonymous
-- account to a permanent one (via `auth.updateUser({ email, password })`),
-- since the existing handle_new_user trigger only fires on insert.
--
-- Note: anonymous sign-in must also be enabled in the Supabase dashboard
-- (Authentication → Sign In Providers → Allow anonymous sign-ins). This
-- migration only handles the schema side.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_anonymous then
    insert into public.profiles (
      id, email, cash_balance, first_name, last_name
    )
    values (
      new.id, null, 10000, 'Demo', 'User'
    )
    on conflict (id) do update set
      cash_balance = 10000,
      first_name = 'Demo',
      last_name = 'User',
      updated_at = now();

    -- Five popular tickers so the chart and sidebar aren't empty on first load.
    insert into public.watchlist (user_id, symbol, name) values
      (new.id, 'AAPL',  'Apple Inc.'),
      (new.id, 'NVDA',  'NVIDIA Corporation'),
      (new.id, 'TSLA',  'Tesla, Inc.'),
      (new.id, 'MSFT',  'Microsoft Corporation'),
      (new.id, 'GOOGL', 'Alphabet Inc.')
    on conflict do nothing;

    -- A starter deposit shows up in Activity + cash flow analytics so the
    -- demo's transaction history isn't empty.
    insert into public.transactions (user_id, type, amount, symbol)
    values (new.id, 'DEPOSIT', 10000, 'Demo starter');
  else
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- ── sync profiles.email after auth.users.email changes ───────────────────
-- Fires when an anonymous user converts (auth.updateUser sets the email),
-- and any time a user changes their email later. We only mirror the value
-- so reads from `profiles` don't have to join across schemas.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email,
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

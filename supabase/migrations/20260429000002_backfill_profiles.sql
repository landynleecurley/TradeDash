-- Backfill profile rows for any auth.users that signed up before the
-- on_auth_user_created trigger existed. Idempotent.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

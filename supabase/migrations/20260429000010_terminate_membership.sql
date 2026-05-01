-- Hard cancel: immediately ends benefits (sets expires_at to now and flips
-- status to inactive). Distinct from cancel_membership(), which only marks
-- the auto-renew off but keeps benefits until the existing expires_at.
create or replace function public.terminate_membership()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.memberships
  set status = 'inactive',
      cancelled_at = coalesce(cancelled_at, now()),
      expires_at = now(),
      updated_at = now()
  where user_id = v_user;
  if not found then raise exception 'no membership to terminate'; end if;
end;
$$;

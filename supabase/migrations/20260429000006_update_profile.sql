-- Lets users update their own display_name without granting blanket UPDATE on
-- profiles (which would also expose cash_balance to client edits — see 0003).
create or replace function public.update_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clean text := nullif(trim(p_display_name), '');
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if v_clean is not null and length(v_clean) > 60 then
    raise exception 'display name too long';
  end if;

  update public.profiles
  set display_name = v_clean,
      updated_at = now()
  where id = v_user;

  if not found then raise exception 'no profile to update'; end if;
end;
$$;

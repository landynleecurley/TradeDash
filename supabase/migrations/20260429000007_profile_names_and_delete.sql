-- Split display_name into first_name + last_name (canonical identity for the
-- card, account page, etc.). Backfill from existing display_name where
-- possible.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.profiles
set first_name = split_part(display_name, ' ', 1),
    last_name  = nullif(trim(substr(display_name, position(' ' in display_name) + 1)), '')
where display_name is not null
  and first_name is null
  and last_name is null;

-- ── RPC: update_profile (first + last) ───────────────────────────────────
-- Replaces the old single-field signature. Sets first/last and also keeps
-- display_name in sync as the joined string for any code still reading it.
create or replace function public.update_profile(p_first_name text, p_last_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_first text := nullif(trim(p_first_name), '');
  v_last  text := nullif(trim(p_last_name), '');
  v_display text := trim(coalesce(v_first, '') || ' ' || coalesce(v_last, ''));
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if length(coalesce(v_first, '')) > 40 or length(coalesce(v_last, '')) > 40 then
    raise exception 'name too long';
  end if;

  update public.profiles
  set first_name = v_first,
      last_name = v_last,
      display_name = nullif(v_display, ''),
      updated_at = now()
  where id = v_user;

  if not found then raise exception 'no profile to update'; end if;
end;
$$;

-- ── RPC: delete_my_account ───────────────────────────────────────────────
-- Cascades through profiles/positions/watchlist/transactions/cards via the
-- existing `on delete cascade` references on auth.users.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = v_user;
end;
$$;

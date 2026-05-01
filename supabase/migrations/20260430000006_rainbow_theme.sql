-- Adds the 'rainbow' RGB-cycle option to the Gold accent color picker.
-- Drops + recreates the check constraint since CHECK constraints can't be
-- altered in place; the column itself stays put.

alter table public.profiles
  drop constraint if exists profiles_theme_color_check;

alter table public.profiles
  add constraint profiles_theme_color_check
  check (theme_color in ('lime','blue','pink','yellow','orange','red','purple','oled','rainbow'));

-- ── RPC: update_theme_color (rainbow-aware) ──────────────────────────────
-- Same Gold gate as before. Only `lime` is allowed without a membership so
-- a lapsed user can still revert to the default.
create or replace function public.update_theme_color(p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_gold boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_color not in ('lime','blue','pink','yellow','orange','red','purple','oled','rainbow') then
    raise exception 'invalid theme color';
  end if;

  if p_color <> 'lime' then
    select status = 'active' and expires_at is not null and expires_at > now()
      into v_is_gold
    from public.memberships
    where user_id = v_user;
    if not coalesce(v_is_gold, false) then
      raise exception 'gold membership required to customize the theme color';
    end if;
  end if;

  update public.profiles
  set theme_color = p_color,
      updated_at = now()
  where id = v_user;
end;
$$;

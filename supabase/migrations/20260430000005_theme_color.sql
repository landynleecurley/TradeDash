-- Gold benefit: per-user accent color. Eight presets the UI knows about,
-- one of which (`oled`) ALSO repaints background/foreground for a deep
-- black + white look. Default 'lime' matches the legacy lime green.

alter table public.profiles
  add column if not exists theme_color text not null default 'lime'
    check (theme_color in ('lime','blue','pink','yellow','orange','red','purple','oled'));

-- ── RPC: update_theme_color ──────────────────────────────────────────────
-- Gated to Gold members; non-Gold callers stay on the default lime palette
-- and will get a 'gold required' error if they try to switch.
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
  if p_color not in ('lime','blue','pink','yellow','orange','red','purple','oled') then
    raise exception 'invalid theme color';
  end if;

  -- Allow resetting to lime even without Gold so users keep a sane default
  -- after a membership lapse without admin help.
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

-- =====================================================================
--  Echo United Alliances -- paint each carrier in its own colours
--
--  Until now every one of the 602 carriers wore its division's accent, so a
--  directory page showed eight colours across 600 airlines. The game knows
--  better: each airline has a livery, and player_livery_config carries the
--  colours it actually paints its aircraft.
--
--  There is no logo image in the game's API to download -- the client draws
--  each aircraft from these colours plus a chosen tail mark. So the livery IS
--  the brand, and brand_color (derived in build_database.py) is the one colour
--  that reads as the airline's own: 261 distinct values across 537 carriers.
--
--  The other 65 fly white throughout and keep the division accent, which is
--  the honest answer rather than inventing a colour for them.
--
--  mv_airline_directory caches the accent, so it is rebuilt here.
-- =====================================================================

begin;

create or replace view public.v_airline_accent
with (security_invoker = on) as
select a.uid                                          as airline_uid,
       coalesce(l.brand_color, a.accent_color, d.accent_color) as accent_color,
       l.brand_color is not null                      as is_own_livery,
       l.livery_type,
       l.tail_color, l.fuselage_color, l.winglet_color, l.engine_color
  from public.airlines a
  join public.divisions d on d.division_code = a.division_code
  left join public.airline_liveries l on l.airline_uid = a.uid;

comment on view public.v_airline_accent is
    'The colour to paint a carrier: its own livery where it has one, its division''s otherwise. is_own_livery says which.';

grant select on public.v_airline_accent to anon, authenticated;

commit;

-- The directory caches accent_color, so it has to be rebuilt to pick these up.
refresh materialized view public.mv_airline_directory;

-- =====================================================================
--  Echo United Alliances -- one division's whole network
--
--  Neither existing arc source answers "what does this division fly".
--
--    mv_network_arcs      the alliance's 1,200 busiest pairs, coloured by
--                         division. Filtering it by division leaves whatever
--                         happened to make that global cut -- 371 arcs for
--                         Kyra but 29 for Elysium, which is not a network,
--                         it is a rounding error.
--    mv_route_adjacency   one row per pair, tagged with the division that
--                         flies it MOST. A pair Kyra dominates disappears
--                         from Aegis entirely, even when Aegis flies it.
--
--  So: every city pair any published carrier in the division serves, with the
--  traffic they put on it between them. Both directions are already folded
--  together by v_route_pairs, so a pair appears once.
--
--  MATERIALISED, because computing it live took 15 to 30 seconds -- it means
--  re-aggregating 820,000 leg-days through a view that has already grouped
--  them once per airline. Behind a map toggle that is not a wait, it is a
--  bug.
--
--  Two things are deliberately NOT stored here, and both are joined on at
--  query time instead:
--
--    the accent colour, because caching it is what made changing the palette
--    a three-place edit last time -- divisions has eight rows and joining it
--    costs nothing;
--    the coordinates, so a re-run of 03_airports_backfill does not silently
--    leave this holding stale positions.
--
--  Refresh it when the flight data changes, alongside echo_refresh_search.
-- =====================================================================

begin;

drop function if exists public.division_arcs(text, integer);
drop materialized view if exists public.mv_division_arcs cascade;

create materialized view public.mv_division_arcs as
select p.division_code,
       p.airport_a,
       p.airport_b,
       sum(p.departures_per_week)::bigint    as weekly_departures,
       count(distinct p.airline_uid)::bigint as carriers
  from public.v_route_pairs p
 group by p.division_code, p.airport_a, p.airport_b;

comment on materialized view public.mv_division_arcs is
    'Every city pair each division serves, with the whole division''s weekly traffic on it. Carries no colours and no coordinates on purpose -- both are joined on at read time so a palette change or an airport backfill does not strand this holding stale values.';

-- The read is always "this division, busiest first".
create unique index if not exists mv_division_arcs_key
    on public.mv_division_arcs (division_code, airport_a, airport_b);
create index if not exists mv_division_arcs_traffic
    on public.mv_division_arcs (division_code, weekly_departures desc);

grant select on public.mv_division_arcs to anon, authenticated;

create or replace function public.division_arcs(
    p_division text,
    p_limit    integer default 700
)
returns table (
    origin_iata       text,
    destination_iata  text,
    division_code     text,
    weekly_departures bigint,
    carriers          bigint,
    origin_lat        double precision,
    origin_lon        double precision,
    dest_lat          double precision,
    dest_lon          double precision,
    accent_color      text
)
language sql stable parallel safe as $$
    select m.airport_a, m.airport_b, m.division_code,
           m.weekly_departures, m.carriers,
           o.latitude, o.longitude, x.latitude, x.longitude,
           coalesce(dv.accent_color, '#A855F7')
      from public.mv_division_arcs m
      join public.divisions dv on dv.division_code = m.division_code
      join public.airports  o  on o.iata_code = m.airport_a
      join public.airports  x  on x.iata_code = m.airport_b
     where m.division_code = lower(btrim(coalesce(p_division, '')))
       and o.latitude is not null
       and x.latitude is not null
     order by m.weekly_departures desc
     limit greatest(coalesce(p_limit, 700), 1);
$$;

comment on function public.division_arcs(text, integer) is
    'One division''s network, shaped like mv_network_arcs so the map can draw either without knowing the difference.';

grant execute on function public.division_arcs(text, integer) to anon, authenticated;

commit;

-- =====================================================================
--  Weekly scrape, step 3 of 3: rebuild everything derived from the merge
--
--  Run immediately after 2_merge.sql. Until this finishes the site reads last
--  week's materialised views over this week's tables: a search can still offer
--  a flight the merge deleted, and booking it fails on the foreign key.
--
--  THREE THINGS THIS FILE LEARNT THE HARD WAY, 16 SEPTEMBER 2026
--
--  1. The pooler gives every session a 2 minute statement_timeout, and the
--     first attempt to refresh mv_leg_departures was cancelled at exactly two
--     minutes. This is the owner doing maintenance, so it lifts its own limit.
--
--  2. The second attempt ran out of disk: "could not write to file
--     base/pgsql_tmp/...: No space left on device". The database is about
--     530 MB on a small volume, and two things were fighting over the rest:
--       - echo_stage, a full second copy of the scrape (158 MB), and
--       - REFRESH ... CONCURRENTLY on the 255 MB leg table, which builds the
--         whole new contents AND a diff of them against the old before it
--         swaps -- roughly three copies at once.
--     So staging is dropped first -- the merge has committed and nothing reads
--     it -- and mv_leg_departures is refreshed WITHOUT concurrently, which
--     needs one new copy. It locks the table while it rebuilds; that measured
--     17 seconds, against the ten minutes the site had already spent reading
--     stale views while the concurrent attempts failed.
--
--  3. The order is the dependency order, read off the catalogue rather than
--     guessed, and by what each view copies out of the airports table:
--
--       mv_leg_departures
--         -> mv_route_adjacency, mv_division_arcs
--              -> mv_airport_connectivity, mv_network_arcs (coordinates)
--                   -> mv_airport_directory (names, zones) -> mv_network_nodes
--       mv_airline_directory (independent)
-- =====================================================================
\set ON_ERROR_STOP on
\timing on

set statement_timeout = 0;

drop schema if exists echo_stage cascade;

-- Not in a transaction block, so each runs on its own. Reclaims the rows the
-- merge replaced before the heavy rebuild wants the space.
vacuum public.flights;
vacuum public.flight_assignments;
vacuum public.aircraft;

-- New airports arrive from the merge as bare IATA codes. 03 gives them names,
-- countries, timezones and coordinates, and is safe to re-run: it only
-- touches airports whose data actually changed, and never overwrites a city
-- name 27 has already cleaned.
\i database/sql/03_airports_backfill.sql

refresh materialized view              public.mv_leg_departures;
refresh materialized view concurrently public.mv_route_adjacency;
refresh materialized view concurrently public.mv_division_arcs;
refresh materialized view concurrently public.mv_airport_connectivity;
refresh materialized view              public.mv_network_arcs;
refresh materialized view concurrently public.mv_airline_directory;

-- City names and place labels. 27 reads which airports are served from the
-- mv_leg_departures just rebuilt -- a new airport in a city the alliance
-- already flies to changes the label of the airport that was there first --
-- and ends by rebuilding mv_airport_directory and mv_network_nodes itself.
\i database/sql/27_place_names.sql

vacuum analyze public.mv_leg_departures;
vacuum analyze public.mv_division_arcs;
analyze public.airlines;
analyze public.airports;

select 'mv_leg_departures' as matview, count(*) from public.mv_leg_departures
union all select 'mv_airline_directory',    count(*) from public.mv_airline_directory
union all select 'mv_airport_directory',    count(*) from public.mv_airport_directory
union all select 'mv_route_adjacency',      count(*) from public.mv_route_adjacency
union all select 'mv_network_arcs',         count(*) from public.mv_network_arcs
union all select 'mv_network_nodes',        count(*) from public.mv_network_nodes
union all select 'mv_division_arcs',        count(*) from public.mv_division_arcs
union all select 'mv_airport_connectivity', count(*) from public.mv_airport_connectivity;

select pg_size_pretty(pg_database_size(current_database())) as database_size;

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

-- Rewrite the three tables the merge churns, packed.
--
-- A week's merge deletes and inserts about 9% of each. A plain VACUUM only
-- marks that space reusable -- the files never shrink -- and Supabase bills the
-- file size against the free plan's 500 MB. On 16 September 2026 that slack
-- was 46 MB of rows and about as much again in their indexes, and the database
-- stood at 557 MB. VACUUM FULL writes each table out fresh and rebuilds its
-- indexes: measured then at 14, 9 and 11 seconds, taking the database to 422 MB.
--
-- It locks each table while it runs, so it goes HERE, in the window where the
-- site is already reading last week's views, rather than after the refresh has
-- put things right. And it goes before the leg refresh, which needs the disk.
vacuum (full, analyze) public.flights;
vacuum (full, analyze) public.aircraft;
vacuum (full, analyze) public.flight_assignments;

-- New airports arrive from the merge as bare IATA codes. 03 gives them names,
-- countries, timezones and coordinates, and is safe to re-run: it only
-- touches airports whose data actually changed, and never overwrites a city
-- name 27 has already cleaned.
\i database/sql/03_airports_backfill.sql

refresh materialized view              public.mv_leg_departures;
-- Plain, not concurrent. Concurrent builds a diff and leaves the replaced rows
-- behind as dead space -- 7 MB of it on 16 September -- on a disk that has
-- already run out once. A plain rebuild is packed and takes a few seconds.
refresh materialized view              public.mv_route_adjacency;
-- Plain, not concurrent: see 20_division_network.sql for why it has no unique index.
refresh materialized view              public.mv_division_arcs;
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

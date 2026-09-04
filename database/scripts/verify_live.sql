-- =====================================================================
--  Echo United Alliances -- post-deploy verification
--
--  Run against the live database after deploy.ps1. Every check is something
--  the website actually does, so a pass here means the site's data path works
--  rather than that the tables merely exist.
--
--      psql "$env:ECHO_DB_URL" -f database/scripts/verify_live.sql
-- =====================================================================

\set ON_ERROR_STOP on
\timing off
\pset pager off

\echo ''
\echo '=== row counts ==='
select 'divisions'          as table_name, count(*), 8       as expected from public.divisions
union all select 'airlines',            count(*), 590     from public.airlines
union all select 'airports',            count(*), 2187    from public.airports
union all select 'aircraft',            count(*), 153688  from public.aircraft
union all select 'flights',             count(*), 341710  from public.flights
union all select 'flight_assignments',  count(*), 411027  from public.flight_assignments
union all select 'countries',           count(*), 229     from public.countries
order by table_name;

\echo ''
\echo '=== materialised views (all must be non-empty) ==='
select 'mv_leg_departures'       as view_name, count(*) from public.mv_leg_departures
union all select 'mv_route_adjacency',      count(*) from public.mv_route_adjacency
union all select 'mv_airport_connectivity', count(*) from public.mv_airport_connectivity
union all select 'mv_airline_directory',    count(*) from public.mv_airline_directory
union all select 'mv_airport_directory',    count(*) from public.mv_airport_directory
union all select 'mv_network_arcs',         count(*) from public.mv_network_arcs
union all select 'mv_network_nodes',        count(*) from public.mv_network_nodes
order by view_name;

\echo ''
\echo '=== the weekday mask still reproduces the original expansion ==='
\echo '(expected exactly 3,603,332 leg-days)'
select sum(length(replace((departure_days_mask::int)::bit(7)::text, '0', '')))
           as leg_days_from_masks
  from public.mv_leg_departures;

\echo ''
\echo '=== airport enrichment ==='
select count(*) filter (where airport_name is not null) as named,
       count(*) filter (where latitude is not null)     as located,
       count(*) filter (where timezone is not null)     as with_timezone,
       count(*)                                          as total
  from public.airports;

\echo ''
\echo '=== every RPC the website calls ==='
select 'search_airports(lond)'      as rpc, count(*) from public.search_airports('lond', 8)
union all select 'search_airlines(emirates)',  count(*) from public.search_airlines('emirates', null, null, 20, 0)
union all select 'airport_carriers(LHR)',      count(*) from public.airport_carriers('LHR')
union all select 'airport_routes(LHR)',        count(*) from public.airport_routes('LHR')
union all select 'search_flights(LHR-JFK)',    count(*) from public.search_flights('LHR','JFK', current_date + 7, 'ECONOMY', 1)
union all select 'search_itineraries nonstop', count(*) from public.search_itineraries('LHR','JFK', current_date + 7, 'ECONOMY', 1, 0, 50)
union all select 'search_itineraries 1-stop',  count(*) from public.search_itineraries('SGN','LIM', current_date + 7, 'ECONOMY', 1, 1, 50)
union all select 'search_itineraries 2-stop',  count(*) from public.search_itineraries('SGN','LIM', current_date + 7, 'ECONOMY', 1, 2, 50)
order by rpc;

\echo ''
\echo '=== generated carrier profile (a sample) ==='
select left(description, 200) as profile
  from public.v_airline_profile
 order by prominence desc
 limit 1;

\echo ''
\echo '=== division palette ==='
select division_code, division_name, accent_color, carriers
  from public.v_division_summary order by sort_order;

\echo ''
\echo '=== anonymous access: what a browser can and cannot reach ==='
select 'airlines readable'      as check, has_table_privilege('anon','public.airlines','SELECT')             as allowed, true  as expected
union all select 'directory readable',    has_table_privilege('anon','public.mv_airline_directory','SELECT'), true
union all select 'arcs readable',         has_table_privilege('anon','public.mv_network_arcs','SELECT'),      true
union all select 'countries readable',    has_table_privilege('anon','public.countries','SELECT'),            true
union all select 'bookings NOT readable', has_table_privilege('anon','public.bookings','SELECT'),             false
union all select 'passengers NOT readable',has_table_privilege('anon','public.passengers','SELECT'),          false
union all select 'assignments NOT readable',has_table_privilege('anon','public.flight_assignments','SELECT'), false
order by check;

\echo ''
\echo '=== booking RPCs are callable by an anonymous visitor ==='
select p.proname as rpc, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_call
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_booking','find_booking','cancel_booking',
                     'search_itineraries','search_airlines','search_airports',
                     'airport_routes','airline_timetable')
 order by p.proname;

\echo ''
\echo '=== row level security is on where it matters ==='
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('bookings','passengers','booking_segments','tickets',
                   'resonants','departure_inventory','airlines','flights')
 order by relname;

\echo ''
\echo '=== database size ==='
select pg_size_pretty(pg_database_size(current_database())) as size;

-- =====================================================================
--  Echo United Alliances -- what the site reads from the legs, kept as small tables
--
--  mv_legs -- every departure, per aircraft, 1.3M rows, 209 MB -- was the
--  largest thing in the database, on a free plan whose dashboard read 514 of
--  500 MB on 21 November 2026. From now on it is filled only while the weekly
--  build runs: the departure boards, the airline timetables and the airport
--  carrier lists are written out of it to Supabase Storage as files
--  (database/scripts/export_schedule.py), and then it is emptied
--  (database/weekly/4_finish.sql).
--
--  Everything else the site read from it is kept here instead, as three small
--  tables the weekly build refills while the legs are still there:
--
--    route_pairs                    v_route_pairs, one row per carrier and city
--                                   pair (the carrier page's route list, and
--                                   mv_division_arcs, which the admin network
--                                   rebuild refreshes on its own)
--    airline_departureless_routes   the 'no_departures' half of
--                                   v_airline_idle_routes
--    airline_leg_facts              each carrier's longest and busiest sector,
--                                   for airline_profile_facts and
--                                   echo_generate_profile
--
--  and the views and functions that read the legs read these. The weekly
--  build calls echo_build_schedule_summaries() right after refreshing mv_legs.
--
--  v_routes (one row per DIRECTED route, 435k) is dropped: the two profile
--  functions above were its only readers.
--
--  echo_refresh_division_network -- the admin rebuild after moving a carrier
--  -- no longer refreshes mv_route_adjacency, which is built from the legs:
--  the division maps (mv_division_arcs, from route_pairs) still update at
--  once, and the global map's colouring by dominant division at the next
--  weekly build.
--
--  This file fills the tables from the legs as they are now, so it must run
--  while mv_legs is populated.
-- =====================================================================

begin;

set local statement_timeout = 0;

-- ---------------------------------------------------------------------
--  The tables, filled now from the views they replace
-- ---------------------------------------------------------------------

create table public.route_pairs as select * from public.v_route_pairs;
create index route_pairs_airline on public.route_pairs (airline_uid);

create table public.airline_departureless_routes as
select f.airline_uid,
       least(f.origin_iata, f.destination_iata)    as airport_a,
       greatest(f.origin_iata, f.destination_iata) as airport_b
  from public.flights f
 where not exists (
        select 1 from public.mv_leg_departures l
         where l.airline_uid = f.airline_uid
           and least(l.origin_iata, l.destination_iata)    = least(f.origin_iata, f.destination_iata)
           and greatest(l.origin_iata, l.destination_iata) = greatest(f.origin_iata, f.destination_iata))
 group by 1, 2, 3;
create index airline_departureless_routes_airline on public.airline_departureless_routes (airline_uid);

create table public.airline_leg_facts (
    airline_uid     uuid primary key,
    longest_from    text,
    longest_to      text,
    longest_minutes integer,
    busiest_from    text,
    busiest_to      text,
    busiest_weekly  bigint
);

comment on table public.route_pairs is
    'v_route_pairs, stored: one row per carrier and city pair. Refilled by echo_build_schedule_summaries() in the weekly build, while mv_legs is populated (51_schedule_summaries.sql).';
comment on table public.airline_departureless_routes is
    'Flights filed without a single departure, by carrier and city pair: the no_departures half of v_airline_idle_routes. Refilled weekly (51_schedule_summaries.sql).';
comment on table public.airline_leg_facts is
    'Each carrier''s longest sector and busiest directed route, for airline_profile_facts and echo_generate_profile. Refilled weekly (51_schedule_summaries.sql).';

-- Public data, read through security-invoker views: visitors may read, and
-- nothing more. Supabase grants new tables everything by default.
do $$
declare t text;
begin
    foreach t in array array['route_pairs', 'airline_departureless_routes', 'airline_leg_facts'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select using (true)', t || '_public_read', t);
        execute format('revoke all on public.%I from anon, authenticated', t);
        execute format('grant select on public.%I to anon, authenticated', t);
    end loop;
end
$$;

-- ---------------------------------------------------------------------
--  The weekly refill, run while mv_legs is populated
-- ---------------------------------------------------------------------

create or replace function public.echo_build_schedule_summaries()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not exists (select 1 from pg_matviews where schemaname = 'public'
                                               and matviewname = 'mv_legs' and ispopulated) then
        raise exception 'mv_legs is not populated: refresh it first (database/weekly/3_refresh.sql). The summaries were left as they were.';
    end if;

    truncate public.route_pairs;
    insert into public.route_pairs
    select l.airline_uid,
           a.division_code,
           a.carrier_code,
           least(l.origin_iata, l.destination_iata),
           greatest(l.origin_iata, l.destination_iata),
           sum(length(replace(coalesce(l.departure_days_mask::integer, 0)::bit(7)::text, '0', ''))),
           count(distinct l.origin_iata),
           min(l.origin_iata),
           min(l.duration_minutes),
           min(l.economy_price),
           min(l.business_price)
      from public.mv_leg_departures l
      join public.airlines a on a.uid = l.airline_uid
     group by l.airline_uid, a.division_code, a.carrier_code,
              least(l.origin_iata, l.destination_iata),
              greatest(l.origin_iata, l.destination_iata);

    truncate public.airline_departureless_routes;
    insert into public.airline_departureless_routes
    select f.airline_uid,
           least(f.origin_iata, f.destination_iata),
           greatest(f.origin_iata, f.destination_iata)
      from public.flights f
     where not exists (
            select 1 from public.route_pairs p
             where p.airline_uid = f.airline_uid
               and p.airport_a = least(f.origin_iata, f.destination_iata)
               and p.airport_b = greatest(f.origin_iata, f.destination_iata))
     group by 1, 2, 3;

    truncate public.airline_leg_facts;
    insert into public.airline_leg_facts
    select a.uid,
           lg.origin_iata, lg.destination_iata, lg.duration_minutes,
           bz.origin_iata, bz.destination_iata, bz.weekly
      from public.airlines a
      left join lateral (
            select l.origin_iata, l.destination_iata, l.duration_minutes
              from public.mv_leg_departures l
             where l.airline_uid = a.uid
             order by l.duration_minutes desc limit 1) lg on true
      left join lateral (
            select l.origin_iata, l.destination_iata,
                   sum(length(replace(coalesce(l.departure_days_mask::integer, 0)::bit(7)::text, '0', ''))) as weekly
              from public.mv_leg_departures l
             where l.airline_uid = a.uid
             group by l.origin_iata, l.destination_iata
             order by 3 desc limit 1) bz on true
     where lg.origin_iata is not null or bz.origin_iata is not null;

    analyze public.route_pairs;
    analyze public.airline_departureless_routes;
    analyze public.airline_leg_facts;
end;
$$;

revoke all on function public.echo_build_schedule_summaries() from public, anon, authenticated;

select public.echo_build_schedule_summaries();

-- ---------------------------------------------------------------------
--  The readers, pointed at the tables
-- ---------------------------------------------------------------------

-- Same columns, same types: mv_division_arcs reads this view and keeps working.
create or replace view public.v_route_pairs with (security_invoker = on) as
select airline_uid, division_code, carrier_code, airport_a, airport_b,
       departures_per_week, directions, sole_origin, fastest_minutes,
       cheapest_economy_usd, cheapest_business_usd
  from public.route_pairs;

create or replace view public.v_airline_idle_routes with (security_invoker = on) as
select u.airline_uid,
       least(u.origin_iata, u.destination_iata)    as airport_a,
       greatest(u.origin_iata, u.destination_iata) as airport_b,
       'no_flights'::text                          as reason
  from public.airline_unflown_routes u
union
select d.airline_uid, d.airport_a, d.airport_b, 'no_departures'::text
  from public.airline_departureless_routes d;

-- weekly_departures was a count of leg rows; it is now the real weekly count.
create or replace view public.v_alliance_overview with (security_invoker = on) as
select (select count(*) from public.airlines where airlines.is_published) as airlines,
       (select count(*) from public.divisions) as divisions,
       (select count(*) from public.airports) as airports,
       ((select count(*) from public.aircraft where not aircraft.is_placeholder)
          + (select coalesce(sum(aircraft_idle.idle_count), 0::bigint) from public.aircraft_idle)) as aircraft,
       (select count(*) from public.flights) as flight_pairs,
       (select coalesce(sum(p.departures_per_week), 0)::bigint from public.route_pairs p) as weekly_departures,
       (select count(distinct (flights.origin_iata || flights.destination_iata)) from public.flights) as routes;

create or replace function public.airline_profile_facts(p_uid uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    a         record;
    d         record;
    countries integer;
    wide      integer;
    lf        record;
begin
    select * into a from public.mv_airline_directory where uid = p_uid;
    if not found then
        return null;
    end if;
    select * into d from public.divisions where division_code = a.division_code;

    select count(distinct ap.country_code) into countries
      from public.flights f
      cross join lateral (values (f.origin_iata), (f.destination_iata)) as x(iata)
      join public.airports ap on ap.iata_code = x.iata
     where f.airline_uid = p_uid and ap.country_code is not null;

    select count(*) into wide
      from public.aircraft ac
     where ac.airline_uid = p_uid and not ac.is_placeholder
       and public.echo_is_widebody(ac.aircraft_model);

    select * into lf from public.airline_leg_facts where airline_uid = p_uid;

    return jsonb_build_object(
        'airline_name',   nullif(trim(a.airline_name), ''),
        'division_name',  d.division_name,
        'country_code',   a.airline_country,
        'hubs',           case when a.hubs is not null and array_length(a.hubs, 1) > 0
                               then to_jsonb(a.hubs[1:least(array_length(a.hubs, 1), 3)]) end,
        'routes',         a.routes,
        'destinations',   a.destinations,
        'countries',      countries,
        'fleet_size',     a.fleet_size,
        'aircraft_types', a.aircraft_types,
        'main_aircraft',  a.most_common_aircraft,
        'widebodies',     wide,
        'longest',        case when lf.longest_from is not null then jsonb_build_object(
                              'from', lf.longest_from, 'to', lf.longest_to,
                              'minutes', lf.longest_minutes) end,
        'busiest',        case when lf.busiest_from is not null then jsonb_build_object(
                              'from', lf.busiest_from, 'to', lf.busiest_to,
                              'weekly', lf.busiest_weekly) end
    );
end;
$$;

-- The generator's text is unchanged; only where it reads its two sectors from.
do $$
declare src text;
begin
    select pg_get_functiondef('public.echo_generate_profile'::regproc) into src;
    src := replace(src,
        E'    select l.origin_iata, l.destination_iata, l.duration_minutes into longest\n      from public.mv_leg_departures l\n     where l.airline_uid = p_uid\n     order by l.duration_minutes desc limit 1;',
        E'    select f.longest_from as origin_iata, f.longest_to as destination_iata,\n           f.longest_minutes as duration_minutes into longest\n      from public.airline_leg_facts f\n     where f.airline_uid = p_uid;');
    src := replace(src,
        E'    select r.origin_iata, r.destination_iata, r.departures_per_week into busiest\n      from public.v_routes r\n     where r.airline_uid = p_uid\n     order by r.departures_per_week desc limit 1;',
        E'    select f.busiest_from as origin_iata, f.busiest_to as destination_iata,\n           f.busiest_weekly as departures_per_week into busiest\n      from public.airline_leg_facts f\n     where f.airline_uid = p_uid;');
    if src ~ 'mv_leg_departures' or src ~ 'v_routes' then
        raise exception 'echo_generate_profile did not match the expected text; nothing changed.';
    end if;
    execute src;
end
$$;

create or replace function public.echo_refresh_division_network()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    -- mv_route_adjacency is built from the legs, which are empty between
    -- weekly builds (51_schedule_summaries.sql), so it is not refreshed here:
    -- the global map's dominant-division colours catch up at the next weekly
    -- build. The division maps come from route_pairs and update now.
    refresh materialized view public.mv_network_arcs;
    -- Not concurrently: that needs a unique index, and mv_division_arcs_key
    -- (5 MB, never once scanned) existed for nothing else. It was dropped on
    -- 16 September 2026 to bring the database under the free plan's 500 MB.
    -- A plain refresh locks the division maps for about two seconds.
    refresh materialized view public.mv_division_arcs;
end;
$$;

drop view public.v_routes;

commit;

-- =====================================================================
--  Echo United Alliances -- the turnaround grows with the route
--
--  A return leg leaves once the outbound has landed and turned around, and
--  04_views.sql costed that turnaround as a flat 60 minutes plus
--  turnaroundOffset quarter hours. The quarter hours are right -- that was the
--  7 September fix, and TK2433 proved it. The flat 60 is only right on short
--  routes, and TK2432 is IST-AYT, 518 km.
--
--  Reported 22 September 2026: Asilat LR107, SYD-DXB, published at 04:30 when
--  the game has it leaving at 06:00. DXB-SYD is 12,043 km. The game's base
--  turnaround scales with the distance flown:
--
--          route        base     LR107: offset 22
--      up to 1,500 km    60
--      up to 4,000 km    90
--      up to 10,000 km  120
--      beyond           150      150 + 22 x 15 = 480 min -> 06:00, as the game says
--
--  Read off the game's own scheduling, not guessed. The game will not let an
--  aircraft start its next rotation before the last one is home, so every
--  airframe's week is a hard constraint on how long each round trip really
--  takes. Under the flat 60, 1.69 million rotations packed back to back with
--  gaps as short as 0 minutes after short routes, but never under 30 after
--  routes over 1,500 km, never under 60 over 4,000 and never under 90 over
--  10,000. Those were the missing minutes. With the base below, every tier
--  packs down to 0 -- hundreds of thousands of rotations sit within 5 minutes
--  of the limit -- and not one rotation overlaps another.
--
--  Stopovers agree independently. The game back-computes a stopover parent's
--  offset (hence 33.333 slots on Asilat's DXB-GRU) so that its return leaves
--  the stop the same dwell after the child's return lands there as the
--  outbound spent there. Under this rule the two dwells agree on 12,207 of
--  12,471 chains (98%); under the flat 60, on 35%. That is on each airport's
--  clock as the game kept it when the scrape ran, summer time included. The
--  site's clocks ignore summer time, which is a separate matter.
--
--  The boundary is in whole kilometres: floor(distance) > 1500, and so on.
--  The last routes the game still keeps on the lower tier are MSY-PHF at
--  1500.35 km, HKG-DJJ at 4000.51 and HKG-SFJ at 10000.57, which rules out
--  rounding to the nearest. 65 of 68,523 routes lie within two kilometres of a
--  boundary, where the game's coordinates could differ from ours.
--
--  Nothing is stored differently: flights keep the game's own offset, and only
--  the view that turns it into a time changes. v_flight_legs keeps exactly the
--  columns 04_views.sql gave it, so everything built on it -- the bookable
--  surface, the leg table, search, the board, timetables -- is untouched and
--  simply reads corrected times once mv_leg_departures is rebuilt, which this
--  file does. Bookings already sold keep the times they were sold with.
--
--  Supersedes the ground-time rule and v_flight_legs in 04_views.sql. If 04 is
--  ever re-run, run this after it; verify.ps1 fails until you do.
-- =====================================================================

set statement_timeout = 0;

begin;

-- Great-circle distance in kilometres (haversine, mean Earth radius). least()
-- keeps floating-point error from pushing asin past 1 on antipodal pairs.
create or replace function public.echo_route_km(
    lat1 double precision, lon1 double precision,
    lat2 double precision, lon2 double precision
)
returns double precision language sql immutable parallel safe as $$
    select 2 * 6371.0 * asin(least(1.0, sqrt(
               power(sin(radians(lat2 - lat1) / 2), 2)
             + cos(radians(lat1)) * cos(radians(lat2))
               * power(sin(radians(lon2 - lon1) / 2), 2))));
$$;

comment on function public.echo_route_km(double precision, double precision, double precision, double precision) is
    'Great-circle distance in km between two coordinates. Null if any coordinate is unknown.';

-- The game's base turnaround for a route of this length. An airport with no
-- coordinates falls back to 60, the short-haul figure.
create or replace function public.echo_turnaround_base_minutes(route_km double precision)
returns integer language sql immutable parallel safe as $$
    select case
             when route_km is null        then 60
             when floor(route_km) > 10000 then 150
             when floor(route_km) > 4000  then 120
             when floor(route_km) > 1500  then 90
             else 60
           end;
$$;

comment on function public.echo_turnaround_base_minutes(double precision) is
    'Base turnaround the game gives a route: 60 min up to 1,500 km, 90 up to 4,000, 120 up to 10,000, 150 beyond. Whole kilometres.';

create or replace function public.echo_ground_minutes(
    turnaround_offset numeric, route_km double precision
)
returns numeric language sql immutable parallel safe as $$
    select public.echo_turnaround_base_minutes(route_km)
         + coalesce(turnaround_offset, 0) * 15::numeric;
$$;

comment on function public.echo_ground_minutes(numeric, double precision) is
    'Minutes on the ground before the return leg departs: the base turnaround for the route''s length plus turnaroundOffset counted in quarter hours. The offset is slots, not minutes.';

-- Same columns, same order, same types as 04_views.sql: only the inbound
-- departure changes, so CREATE OR REPLACE keeps every dependant in place.
create or replace view public.v_flight_legs
with (security_invoker = on) as
with legs as (
    -- outbound: departs the origin at exactly the exported time. The stored
    -- day offset is folded back in so stopover legs keep their true position.
    select
        f.flight_id,
        'OUTBOUND'::text            as direction,
        f.airline_uid,
        f.outbound_flight_number    as flight_number,
        f.origin_iata,
        f.destination_iata,
        f.outbound_duration_minutes as duration_minutes,
        (f.departure_daily_seconds + f.departure_day_offset * 86400)::numeric
                                    as departure_seconds,
        f.is_stopover,
        f.child_stopover_flight_id,
        f.turnaround_offset_slots
    from public.flights f

    union all

    -- inbound: departs the far end once the outbound has landed and turned
    -- around -- for as long as the route's length demands. That sum lands on
    -- the OUTBOUND origin's clock, so it is shifted onto the far end's own
    -- clock here.
    select
        f.flight_id,
        'INBOUND'::text,
        f.airline_uid,
        f.inbound_flight_number,
        f.destination_iata,
        f.origin_iata,
        f.inbound_duration_minutes,
        (f.departure_daily_seconds + f.departure_day_offset * 86400)
          + f.outbound_duration_minutes * 60
          + public.echo_ground_minutes(
                f.turnaround_offset_slots,
                public.echo_route_km(home.latitude, home.longitude,
                                     far.latitude,  far.longitude)) * 60
          + coalesce(far.utc_offset_minutes - home.utc_offset_minutes, 0) * 60,
        f.is_stopover,
        f.child_stopover_flight_id,
        f.turnaround_offset_slots
    from public.flights f
    join public.airports home on home.iata_code = f.origin_iata
    join public.airports far  on far.iata_code  = f.destination_iata
)
select
    l.flight_id,
    l.direction,
    l.airline_uid,
    al.division_code,
    al.airline_code,
    al.carrier_code,
    al.airline_name,
    al.airline_slug,
    l.flight_number,
    -- carrier_code, not airline_code: seven carriers share "EK".
    al.carrier_code || ' ' || l.flight_number as flight_designator,
    l.origin_iata,
    l.destination_iata,
    l.duration_minutes,

    public.echo_day_offset(l.departure_seconds)  as departure_day_offset,
    public.echo_time_of_day(l.departure_seconds) as departure_time,

    -- arrival = departure + block time, shifted onto the destination's clock.
    -- With either offset unknown the shift is 0 and the arrival stays on the
    -- origin's clock; tz_resolved says which you are looking at.
    public.echo_day_offset(l.departure_seconds + l.duration_minutes * 60
        + coalesce(dst.utc_offset_minutes - org.utc_offset_minutes, 0) * 60)
                                                 as arrival_day_offset,
    public.echo_time_of_day(l.departure_seconds + l.duration_minutes * 60
        + coalesce(dst.utc_offset_minutes - org.utc_offset_minutes, 0) * 60)
                                                 as arrival_time,
    (org.utc_offset_minutes is not null
     and dst.utc_offset_minutes is not null)     as tz_resolved,

    l.is_stopover,
    l.child_stopover_flight_id,
    (l.child_stopover_flight_id is not null)     as has_onward_leg,
    (parent.flight_id is not null)               as is_second_leg,
    l.departure_seconds                          as departure_seconds_raw,
    l.turnaround_offset_slots
from legs l
join public.airlines al  on al.uid = l.airline_uid
join public.airports org on org.iata_code = l.origin_iata
join public.airports dst on dst.iata_code = l.destination_iata
left join public.flights parent on parent.child_stopover_flight_id = l.flight_id;

comment on view public.v_flight_legs is
    'Directional legs. Two rows per flights row: OUTBOUND origin->destination and INBOUND back, the return after a turnaround sized by the route''s length (31_turnaround_by_distance.sql).';

-- The flat-60 rule, gone so nothing can call it by mistake. Nothing depends on
-- it once the view above is in place; 04_views.sql recreates it if re-run.
drop function if exists public.echo_ground_minutes(numeric);

-- Every stored leg time is derived from the view above. Rebuilt plainly, not
-- concurrently: see database/weekly/3_refresh.sql for the disk it would need.
-- Nothing else needs it: the route graph and division arcs count departures,
-- and a leg moving past midnight changes its weekday, not how often it flies.
refresh materialized view public.mv_leg_departures;

commit;

analyze public.mv_leg_departures;

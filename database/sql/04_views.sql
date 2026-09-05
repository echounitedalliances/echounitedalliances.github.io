-- =====================================================================
--  Echo United Alliances -- views
--
--  The exports describe flight *pairs* on a repeating weekly pattern. Every
--  booking surface needs directional legs on a real date, so this file builds
--  that ladder:
--
--    v_flight_legs        one row per directional leg (2 per flight pair)
--    v_bookable_departures leg x operating weekday x cabin -- the search surface
--    mv_leg_departures    the same, materialised and aggregated, for connections
--    v_stopover_itineraries through journeys A -> B -> C
--    v_routes / v_fleet / v_airline_metrics   the showcase surfaces
--
--  All daily times are on the LOCAL clock of the departure airport.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Time helpers
-- ---------------------------------------------------------------------

-- Whole days contained in a second offset (floor, so negatives work too).
create or replace function public.echo_day_offset(total_seconds numeric)
returns integer language sql immutable parallel safe as $$
    select floor(total_seconds / 86400.0)::integer;
$$;

-- Wall-clock time of a second offset, wrapped into 00:00:00 - 23:59:59.
create or replace function public.echo_time_of_day(total_seconds numeric)
returns time language sql immutable parallel safe as $$
    select (make_interval(secs => ((total_seconds::bigint % 86400) + 86400) % 86400))::time;
$$;

-- Ground time before the return leg departs. turnaround_offset_minutes is 0 on
-- most of the export, which would have the return leg depart the instant the
-- outbound lands, so 60 minutes is the floor. Change the constant here and
-- every timetable in the database follows.
create or replace function public.echo_ground_minutes(turnaround_offset numeric)
returns numeric language sql immutable parallel safe as $$
    select greatest(coalesce(turnaround_offset, 0), 60::numeric);
$$;

-- ---------------------------------------------------------------------
-- Weekday masks
--
-- Operating days are a 7-bit mask, bit 0 = Monday. A leg whose departure rolls
-- past midnight operates on the following weekday, so the mask rotates rather
-- than shifts -- Sunday wraps back to Monday.
-- ---------------------------------------------------------------------
create or replace function public.echo_rotate_mask(p_mask smallint, p_shift integer)
returns smallint language sql immutable parallel safe as $$
    select case when coalesce(p_shift, 0) % 7 = 0 then p_mask
    else ((((p_mask::int << (((p_shift % 7) + 7) % 7))
            | (p_mask::int >> (7 - (((p_shift % 7) + 7) % 7)))) & 127))::smallint
    end;
$$;

create or replace function public.echo_operates_on(p_mask smallint, p_dow integer)
returns boolean language sql immutable parallel safe as $$
    select (coalesce(p_mask, 0)::int >> p_dow) & 1 = 1;
$$;

-- The weekdays in a mask, for display.
create or replace function public.echo_mask_days(p_mask smallint)
returns integer[] language sql immutable parallel safe as $$
    select coalesce(array_agg(d order by d), '{}')
      from generate_series(0, 6) d
     where (coalesce(p_mask, 0)::int >> d) & 1 = 1;
$$;

comment on function public.echo_rotate_mask(smallint, integer) is
    'Rotate a 7-bit weekday mask. Used where a day rollover moves every operating day along by one.';

-- Minimum time to make a connection between two different flights.
create or replace function public.echo_min_connect_minutes()
returns integer language sql immutable parallel safe as $$ select 60; $$;

-- The most a connection may sit on the ground before it stops being one trip.
create or replace function public.echo_max_connect_minutes()
returns integer language sql immutable parallel safe as $$ select 360; $$;

comment on function public.echo_min_connect_minutes() is
    'Floor for a connection, in minutes. Matches the 60 minute turnaround the game itself uses on stopovers.';

-- ---------------------------------------------------------------------
-- v_flight_legs -- one row per directional leg
-- ---------------------------------------------------------------------
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
        f.turnaround_offset_minutes
    from public.flights f

    union all

    -- inbound: departs the far end once the outbound has landed and turned
    -- around. That sum lands on the OUTBOUND origin's clock, so it is shifted
    -- onto the far end's own clock here.
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
          + public.echo_ground_minutes(f.turnaround_offset_minutes) * 60
          + coalesce(far.utc_offset_minutes - home.utc_offset_minutes, 0) * 60,
        f.is_stopover,
        f.child_stopover_flight_id,
        f.turnaround_offset_minutes
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
    l.turnaround_offset_minutes
from legs l
join public.airlines al  on al.uid = l.airline_uid
join public.airports org on org.iata_code = l.origin_iata
join public.airports dst on dst.iata_code = l.destination_iata
left join public.flights parent on parent.child_stopover_flight_id = l.flight_id;

comment on view public.v_flight_legs is
    'Directional legs. Two rows per flights row: OUTBOUND origin->destination and INBOUND back.';

-- ---------------------------------------------------------------------
-- v_bookable_departures -- leg x operating weekday x cabin
-- ---------------------------------------------------------------------
create or replace view public.v_bookable_departures
with (security_invoker = on) as
select
    l.flight_id,
    fa.aircraft_id,
    l.direction,
    fr.cabin_code,

    l.airline_uid,
    l.division_code,
    l.airline_code,
    l.carrier_code,
    l.airline_name,
    l.airline_slug,
    l.flight_number,
    l.flight_designator,
    l.origin_iata,
    l.destination_iata,

    fa.operating_days_mask                                       as rotation_days_mask,
    public.echo_rotate_mask(fa.operating_days_mask, l.departure_day_offset)
                                                                 as departure_days_mask,
    l.departure_time,
    l.arrival_time,
    (l.arrival_day_offset - l.departure_day_offset)              as arrival_days_after_departure,
    l.duration_minutes,
    l.tz_resolved,

    fr.seats_per_departure,
    fr.weekly_seats_for_sale,
    fr.price_usd,
    cc.cabin_name,
    cc.sort_order as cabin_sort_order,

    ac.registration,
    ac.aircraft_model,
    ac.is_placeholder as aircraft_is_placeholder,
    (fr.seats_per_departure > 0 and fr.price_usd > 0)            as is_sellable,
    l.has_onward_leg,
    l.is_second_leg,
    l.child_stopover_flight_id
from public.v_flight_legs l
join public.flight_assignments fa on fa.flight_id = l.flight_id
-- the four cabin columns back out as rows, for anything that wants them long
cross join lateral (values
    ('ECONOMY',         fa.eco_price,      fa.eco_seats,      fa.eco_weekly_seats),
    ('PREMIUM_ECONOMY', fa.prem_eco_price, fa.prem_eco_seats, fa.prem_eco_weekly_seats),
    ('BUSINESS',        fa.biz_price,      fa.biz_seats,      fa.biz_weekly_seats),
    ('FIRST',           fa.first_price,    fa.first_seats,    fa.first_weekly_seats)
) as fr(cabin_code, price_usd, seats_per_departure, weekly_seats_for_sale)
join public.cabin_classes cc on cc.cabin_code = fr.cabin_code
join public.aircraft      ac on ac.aircraft_id = fa.aircraft_id;

comment on view public.v_bookable_departures is
    'Leg x cabin, with the operating weekdays as a mask. Bit 0 = Monday. The four cabins live as columns on flight_assignments; this view is where they read as rows.';

-- ---------------------------------------------------------------------
-- mv_leg_departures -- the connection engine's primitive
--
-- One row per leg per operating weekday, with the four cabins folded into
-- columns. 341,710 flight pairs become roughly 3.6M rows here, small enough to
-- index tightly and join three deep without touching the 14M-row cabin view.
-- ---------------------------------------------------------------------
drop materialized view if exists public.mv_leg_departures cascade;
create materialized view public.mv_leg_departures as
select
    l.flight_id,
    fa.aircraft_id,
    l.direction,
    l.airline_uid,
    l.origin_iata,
    l.destination_iata,
    public.echo_rotate_mask(fa.operating_days_mask, l.departure_day_offset)
                                                        as departure_days_mask,
    l.departure_time,
    l.arrival_time,
    (l.arrival_day_offset - l.departure_day_offset)     as arrival_days_after_departure,
    l.duration_minutes,
    (extract(epoch from l.departure_time) / 60)::integer as departure_minute,
    (extract(epoch from l.departure_time) / 60)::integer
        + l.duration_minutes                             as arrival_minute_abs,

    -- nulled where the cabin is not sold, so "is this bookable" stays one test
    nullif(fa.eco_price, 0)                  as economy_price,
    nullif(fa.prem_eco_price, 0)             as prem_eco_price,
    nullif(fa.biz_price, 0)                  as business_price,
    nullif(fa.first_price, 0)                as first_price,
    case when fa.eco_price      > 0 then nullif(fa.eco_seats, 0)      end as economy_seats,
    case when fa.prem_eco_price > 0 then nullif(fa.prem_eco_seats, 0) end as prem_eco_seats,
    case when fa.biz_price      > 0 then nullif(fa.biz_seats, 0)      end as business_seats,
    case when fa.first_price    > 0 then nullif(fa.first_seats, 0)    end as first_seats
from public.v_flight_legs l
join public.flight_assignments fa on fa.flight_id = l.flight_id
-- Sellable means ONE cabin has both a price and seats. Testing the two
-- greatest() values separately is not the same thing: it lets through a leg
-- priced in economy but with seats only in business, and four leg-days slipped
-- in that way.
where fa.operating_days_mask <> 0
  and ((fa.eco_price      > 0 and fa.eco_seats      > 0)
    or (fa.prem_eco_price > 0 and fa.prem_eco_seats > 0)
    or (fa.biz_price      > 0 and fa.biz_seats      > 0)
    or (fa.first_price    > 0 and fa.first_seats    > 0));

comment on materialized view public.mv_leg_departures is
    'One sellable leg, cabins as columns and operating weekdays as a mask. Carries ids only -- carrier codes, division and aircraft model are joined on for the handful of rows a page actually displays, which is what keeps this from being the largest object in the database.';

-- Only the indexes that earn their space -- but note how that was decided.
-- Reading pg_stat_user_indexes on a freshly built database says everything is
-- unused, because nothing has run yet. This key looked idle for exactly that
-- reason and dropping it cost 7 seconds a search: search_itineraries joins
-- back on it to turn the chosen itineraries into JSON, and without it every
-- result row sequentially scanned all 820k legs.
create unique index if not exists mv_leg_departures_key
    on public.mv_leg_departures (flight_id, aircraft_id, direction);
create index if not exists mv_leg_departures_pair_idx
    on public.mv_leg_departures (origin_iata, destination_iata);
create index if not exists mv_leg_departures_origin_idx
    on public.mv_leg_departures (origin_iata);
create index if not exists mv_leg_departures_airline_idx
    on public.mv_leg_departures (airline_uid);
-- board_departures reads each airport's next few departures in time order
create index if not exists mv_leg_departures_origin_time_idx
    on public.mv_leg_departures (origin_iata, departure_time);

-- ---------------------------------------------------------------------
-- v_stopover_itineraries -- through journeys A -> B -> C
-- Both legs keep the parent's flight number, so present them as one flight
-- with one stop rather than as a connection.
-- ---------------------------------------------------------------------
create or replace view public.v_stopover_itineraries
with (security_invoker = on) as
select
    p.flight_id                       as parent_flight_id,
    c.flight_id                       as child_flight_id,
    p.airline_uid,
    a.carrier_code,
    a.airline_name,
    a.division_code,
    p.origin_iata                     as origin_iata,
    p.destination_iata                as stopover_iata,
    c.destination_iata                as final_iata,
    p.outbound_flight_number          as flight_number,
    p.outbound_duration_minutes       as first_leg_minutes,
    c.outbound_duration_minutes       as second_leg_minutes,
    p.outbound_duration_minutes + c.outbound_duration_minutes as flying_minutes,
    public.echo_time_of_day(p.departure_daily_seconds + p.departure_day_offset * 86400)
                                      as first_departure_time,
    public.echo_time_of_day(c.departure_daily_seconds + c.departure_day_offset * 86400)
                                      as second_departure_time
from public.flights p
join public.airlines a on a.uid = p.airline_uid
join public.flights c  on c.flight_id = p.child_stopover_flight_id;

comment on view public.v_stopover_itineraries is
    'Through journeys A -> B -> C. Both legs carry the parent flight number, so present them as one flight with a stop, not as a connection.';

-- ---------------------------------------------------------------------
-- Showcase surfaces
-- ---------------------------------------------------------------------

-- Every city pair a carrier serves, in both directions, with its cheapest fare.
create or replace view public.v_routes
with (security_invoker = on) as
select
    l.airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    l.origin_iata,
    l.destination_iata,
    -- departures a week is now the popcount of the operating mask rather than
    -- a row count, since one row covers every day the leg runs
    sum(length(replace((coalesce(l.departure_days_mask,0))::bit(7)::text, '0', '')))::bigint
                                            as departures_per_week,
    min(l.duration_minutes)                 as fastest_minutes,
    min(l.economy_price)                    as cheapest_economy_usd,
    min(l.business_price)                   as cheapest_business_usd,
    array_agg(distinct ac.aircraft_model order by ac.aircraft_model) as aircraft_models
from public.mv_leg_departures l
join public.airlines a  on a.uid = l.airline_uid
join public.aircraft ac on ac.aircraft_id = l.aircraft_id
group by l.airline_uid, a.division_code, a.carrier_code, a.airline_name,
         l.origin_iata, l.destination_iata;

comment on view public.v_routes is
    'Every city pair a carrier serves, with weekly departures counted from the operating mask.';

-- Fleet rolled up by model, for the carrier profile page.
create or replace view public.v_fleet
with (security_invoker = on) as
select
    ac.airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    ac.aircraft_model,
    m.manufacturer,
    count(*)                                     as aircraft_count,
    count(*) filter (where ac.is_placeholder)    as placeholder_count,
    round(avg(ac.eco_ratio)::numeric,      4)    as avg_eco_ratio,
    round(avg(ac.prem_eco_ratio)::numeric, 4)    as avg_prem_eco_ratio,
    round(avg(ac.biz_ratio)::numeric,      4)    as avg_biz_ratio,
    round(avg(ac.first_ratio)::numeric,    4)    as avg_first_ratio,
    min(ac.delivery_date)                        as first_delivery,
    max(ac.delivery_date)                        as latest_delivery
from public.aircraft ac
join public.airlines a       on a.uid = ac.airline_uid
left join public.aircraft_models m on m.aircraft_model = ac.aircraft_model
group by ac.airline_uid, a.division_code, a.carrier_code, a.airline_name,
         ac.aircraft_model, m.manufacturer;

-- The numbers a carrier profile leads with. Computed from the schedule, so it
-- covers all 590 carriers rather than the one division that exported stats.
create or replace view public.v_airline_metrics
with (security_invoker = on) as
select
    a.uid                                       as airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    a.airline_slug,
    a.airline_country,
    coalesce(f.flight_pairs, 0)                 as flight_pairs,
    coalesce(f.routes, 0)                       as routes,
    coalesce(f.destinations, 0)                 as destinations,
    coalesce(ac.fleet_size, 0)                  as fleet_size,
    coalesce(ac.models, 0)                      as aircraft_types,
    ac.top_model                                as most_common_aircraft,
    coalesce(h.hub_count, 0)                    as hub_count,
    h.hubs,
    f.longest_route_minutes,
    f.cheapest_economy_usd,
    s.last_online_time
from public.airlines a
left join lateral (
    select count(*)                                            as flight_pairs,
           count(distinct fl.origin_iata || fl.destination_iata) as routes,
           count(distinct x.iata)                              as destinations,
           max(greatest(fl.outbound_duration_minutes, fl.inbound_duration_minutes))
                                                               as longest_route_minutes,
           (select min(fa.eco_price)
              from public.flights f2
              join public.flight_assignments fa on fa.flight_id = f2.flight_id
             where f2.airline_uid = a.uid
               and fa.eco_price > 0)                           as cheapest_economy_usd
      from public.flights fl
      cross join lateral (values (fl.origin_iata), (fl.destination_iata)) as x(iata)
     where fl.airline_uid = a.uid
) f on true
left join lateral (
    select count(*)                          as fleet_size,
           count(distinct aircraft_model)    as models,
           mode() within group (order by aircraft_model) as top_model
      from public.aircraft
     where airline_uid = a.uid and not is_placeholder
) ac on true
left join lateral (
    select count(*) as hub_count,
           array_agg(airport_iata order by is_major_hub desc, airport_iata) as hubs
      from public.airline_hubs where airline_uid = a.uid
) h on true
left join public.airline_stats s on s.airline_uid = a.uid;

comment on view public.v_airline_metrics is
    'Headline figures per carrier, derived from the schedule so every division is covered.';

-- A ready-made sentence for the carrier profile, used only where
-- airlines.description_md is still null. Nothing overwrites a hand-written one.
create or replace view public.v_airline_description_seed
with (security_invoker = on) as
select
    m.airline_uid,
    coalesce(m.airline_name, 'This carrier')
      || ' is a ' || d.division_name || ' division carrier'
      || coalesce(' registered in ' || m.airline_country, '')
      || ', operating ' || m.fleet_size || ' aircraft'
      || case when m.aircraft_types > 0
              then ' across ' || m.aircraft_types || ' types' else '' end
      || ' on ' || m.routes || ' routes to ' || m.destinations || ' destinations'
      || case when m.hub_count > 0
              then ', hubbed at ' || array_to_string(m.hubs[1:3], ', ') else '' end
      || '.'                                    as description_seed
from public.v_airline_metrics m
join public.divisions d on d.division_code = m.division_code;

-- 134 exported airframes have cabin ratios that do not sum to 1.0. They load as
-- exported; this is where to find them.
create or replace view public.v_aircraft_ratio_anomalies
with (security_invoker = on) as
select ac.aircraft_id, ac.airline_uid, a.carrier_code, a.airline_name,
       ac.registration, ac.aircraft_model,
       coalesce(ac.eco_ratio,0) + coalesce(ac.prem_eco_ratio,0)
     + coalesce(ac.biz_ratio,0) + coalesce(ac.first_ratio,0) as ratio_sum
from public.aircraft ac
join public.airlines a on a.uid = ac.airline_uid
where coalesce(ac.eco_ratio,0) + coalesce(ac.prem_eco_ratio,0)
    + coalesce(ac.biz_ratio,0) + coalesce(ac.first_ratio,0) not between 0.999 and 1.001;

-- Alliance-wide totals for the home page.
create or replace view public.v_alliance_overview
with (security_invoker = on) as
select
    (select count(*) from public.airlines where is_published)      as airlines,
    (select count(*) from public.divisions)                        as divisions,
    (select count(*) from public.airports)                         as airports,
    (select count(*) from public.aircraft where not is_placeholder) as aircraft,
    (select count(*) from public.flights)                          as flight_pairs,
    (select count(*) from public.mv_leg_departures)                as weekly_departures,
    (select count(distinct origin_iata || destination_iata) from public.flights) as routes;

-- ---------------------------------------------------------------------
-- Direct search
-- ---------------------------------------------------------------------
create or replace function public.search_flights(
    p_origin      text,
    p_destination text,
    p_travel_date date,
    p_cabin       text default 'ECONOMY',
    p_seats       integer default 1
)
returns table (
    flight_id           uuid,
    aircraft_id         uuid,
    direction           text,
    division_code       text,
    carrier_code        text,
    airline_name        text,
    airline_slug        text,
    flight_designator   text,
    origin_iata         text,
    destination_iata    text,
    departure_date      date,
    departure_time      time,
    arrival_date        date,
    arrival_time        time,
    duration_minutes    integer,
    cabin_code          text,
    price_usd           integer,
    seats_per_departure integer,
    aircraft_model      text,
    registration        text,
    tz_resolved         boolean
)
language sql stable parallel safe as $$
    select
        d.flight_id, d.aircraft_id, d.direction, d.division_code, d.carrier_code,
        d.airline_name, d.airline_slug, d.flight_designator,
        d.origin_iata, d.destination_iata,
        p_travel_date,
        d.departure_time,
        p_travel_date + d.arrival_days_after_departure,
        d.arrival_time,
        d.duration_minutes,
        d.cabin_code, d.price_usd, d.seats_per_departure,
        d.aircraft_model, d.registration, d.tz_resolved
    from public.v_bookable_departures d
    join public.airlines a on a.uid = d.airline_uid and a.is_published
    where d.origin_iata      = upper(p_origin)
      and d.destination_iata = upper(p_destination)
      and d.cabin_code       = upper(p_cabin)
      and d.is_sellable
      and d.seats_per_departure >= greatest(p_seats, 1)
      -- Postgres isodow is 1 = Monday; the game's dowList is 0 = Monday
      and public.echo_operates_on(d.departure_days_mask,
                                  (extract(isodow from p_travel_date)::int - 1))
    order by d.price_usd, d.departure_time;
$$;

comment on function public.search_flights(text, text, date, text, integer) is
    'Nonstop legs on a date for a cabin, cheapest first.';

-- Rebuild everything the search path materialises. Run after any data reload.
create or replace function public.echo_refresh_search()
returns void language plpgsql as $$
begin
    refresh materialized view public.mv_leg_departures;
    begin
        refresh materialized view public.mv_route_adjacency;
    exception when undefined_table then
        null;   -- 07_connections has not been applied yet
    end;
    analyze public.mv_leg_departures;
end;
$$;

commit;

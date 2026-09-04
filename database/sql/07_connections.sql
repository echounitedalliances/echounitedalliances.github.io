-- =====================================================================
--  Echo United Alliances -- connecting itineraries, nonstop to two stops
--
--  This follows the approach proven in the KarinationGroup database
--  (database/sql/13_connections.sql there), scaled from 3 carriers to 590 and
--  extended from one stop to three.
--
--  The idea that makes it work: settle the CONNECTING AIRPORTS first, from the
--  route graph alone, before the timetable is touched. Airports the origin
--  reaches that also fly into the destination is a savagely restrictive test --
--  and once the via set is fixed, every timetable scan is bounded by BOTH of
--  its endpoints, which is an index probe returning a handful of rows.
--
--  The mistake worth recording: bounding leg scans by their origin only and
--  filtering the destination afterwards. One such scan at DXB returns 12,538
--  legs for a single weekday, and two stops then did not finish inside 90
--  seconds. Both endpoints, always.
--
--  Dates, not day offsets. A first leg can land the same day or the next, so
--  onward legs consider three candidate departure dates and apply the weekday
--  test per date.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The graph
-- ---------------------------------------------------------------------

drop materialized view if exists public.mv_route_adjacency cascade;
create materialized view public.mv_route_adjacency as
with legs as (
    select l.origin_iata, l.destination_iata, l.airline_uid, a.division_code,
           l.duration_minutes, l.economy_price,
           length(replace((l.departure_days_mask::int)::bit(7)::text, '0', '')) as days
      from public.mv_leg_departures l
      join public.airlines a on a.uid = l.airline_uid
),
per_division as (
    select origin_iata, destination_iata, division_code, sum(days) as n
      from legs group by origin_iata, destination_iata, division_code
),
dominant as (
    -- whichever division flies the pair most; the colour the globe draws it in
    select distinct on (origin_iata, destination_iata)
           origin_iata, destination_iata, division_code
      from per_division
     order by origin_iata, destination_iata, n desc, division_code
)
select
    l.origin_iata,
    l.destination_iata,
    sum(l.days)::bigint                   as weekly_departures,
    count(distinct l.airline_uid)         as carriers,
    min(l.duration_minutes)               as min_duration_minutes,
    min(l.economy_price)                  as min_economy_price,
    bool_or(l.economy_price is not null)   as sells_economy,
    max(dom.division_code)                as division_code
from legs l
join dominant dom on dom.origin_iata = l.origin_iata
                 and dom.destination_iata = l.destination_iata
group by l.origin_iata, l.destination_iata;

comment on materialized view public.mv_route_adjacency is
    'Directional city pairs the alliance actually flies. The pruning graph; refresh with echo_refresh_search().';

create unique index if not exists mv_route_adjacency_key
    on public.mv_route_adjacency (origin_iata, destination_iata);
create index if not exists mv_route_adjacency_dest_idx
    on public.mv_route_adjacency (destination_iata, origin_iata);

-- How many routes each airport carries. Ordering candidate connecting points by
-- this keeps the genuine hubs and drops the spokes that merely happen to sit on
-- both route lists -- and it needs no hand-maintained list of hubs.
drop materialized view if exists public.mv_airport_connectivity cascade;
create materialized view public.mv_airport_connectivity as
select
    a.iata_code,
    coalesce(o.out_degree, 0)     as out_degree,
    coalesce(i.in_degree, 0)      as in_degree,
    coalesce(o.out_departures, 0) as weekly_departures
from public.airports a
left join lateral (
    select count(*) as out_degree, sum(weekly_departures) as out_departures
      from public.mv_route_adjacency where origin_iata = a.iata_code
) o on true
left join lateral (
    select count(*) as in_degree
      from public.mv_route_adjacency where destination_iata = a.iata_code
) i on true;

create unique index if not exists mv_airport_connectivity_key
    on public.mv_airport_connectivity (iata_code);
create index if not exists mv_airport_connectivity_degree_idx
    on public.mv_airport_connectivity (out_degree desc);

-- ---------------------------------------------------------------------
-- Tunables
-- ---------------------------------------------------------------------

-- How many connecting airports (or airport pairs/triples) to consider. The
-- candidate set is ordered by traffic, so this keeps the real hubs.
create or replace function public.echo_max_vias()
returns integer language sql immutable parallel safe as $$ select 12; $$;

comment on function public.echo_max_vias() is
    'Connecting points considered per search, highest-traffic first. Deeper searches are therefore a strong heuristic, not an exhaustive enumeration.';

-- Ground time we are willing to sell as a connection. The floor matches the 60
-- minutes every scheduled stopover in the network already turns in; the ceiling
-- is the fare-rule line between a connection and a stopover.
create or replace function public.echo_max_connect_minutes()
returns integer language sql immutable parallel safe as $$ select 1440; $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- One leg in the shape the frontend renders.
create or replace function public.echo_leg_json(
    p_flight_id uuid, p_aircraft_id uuid, p_designator text, p_carrier text,
    p_division text, p_origin text, p_destination text, p_departure_date date,
    p_departure time, p_arrival_date date, p_arrival time, p_duration integer,
    p_price integer, p_model text
)
returns jsonb language sql immutable parallel safe as $$
    select jsonb_build_object(
        'flight_id',        p_flight_id,
        'aircraft_id',      p_aircraft_id,
        'designator',       p_designator,
        'carrier_code',     p_carrier,
        'division',         p_division,
        'origin',           p_origin,
        'destination',      p_destination,
        'departure_date',   p_departure_date,
        'departure_time',   to_char(p_departure, 'HH24:MI'),
        'arrival_date',     p_arrival_date,
        'arrival_time',     to_char(p_arrival, 'HH24:MI'),
        'duration_minutes', p_duration,
        'price_usd',        p_price,
        'aircraft_model',   p_model
    );
$$;

-- Alliance-wide interline is the default; interline_agreements records only
-- exceptions, so an absent row means the connection is allowed.
create or replace function public.echo_interline_ok(p_from uuid, p_to uuid)
returns boolean language sql stable parallel safe as $$
    select p_from = p_to
        or not exists (
            select 1 from public.interline_agreements
             where from_airline_uid = p_from and to_airline_uid = p_to
               and not is_allowed
        );
$$;

-- Ground time between two legs. Both clocks are local to the connecting
-- airport, so the gap is the date difference plus the clock difference.
create or replace function public.echo_connect_minutes(
    p_arrival_date date, p_arrival_time time,
    p_departure_date date, p_departure_time time
)
returns integer language sql immutable parallel safe as $$
    select ((p_departure_date - p_arrival_date) * 1440
            + (extract(epoch from p_departure_time) / 60)::integer
            - (extract(epoch from p_arrival_time) / 60)::integer);
$$;

-- ---------------------------------------------------------------------
-- search_itineraries -- the one entry point the site calls
--
-- Two decisions here are performance, not style, and both were measured:
--
--   * Set-based, not nested LATERAL. Resolving each candidate routing with
--     per-row lookups issued thousands of separate index probes: 43 seconds
--     for two stops. Collecting every city pair the via sets could need,
--     scanning the timetable ONCE for all of them, then joining that small
--     set to itself does the same work in a single pass.
--
--   * No helper function calls inside the expansion. Postgres does not inline
--     echo_leg_json() here, so calling it per candidate row runs a full
--     executor invocation each time -- auto_explain showed thousands of them
--     and 25 seconds on a one-stop search. Connect arithmetic is written out
--     inline, and the JSON is built only for the rows that survive the LIMIT.
-- ---------------------------------------------------------------------
create or replace function public.search_itineraries(
    p_origin      text,
    p_destination text,
    p_travel_date date,
    p_cabin       text default 'ECONOMY',
    p_seats       integer default 1,
    p_max_stops   integer default 2,   -- capped at 2; see the note above
    p_limit       integer default 50
)
returns table (
    stops           integer,
    via             text[],
    total_price_usd integer,
    total_minutes   integer,
    carriers        text[],
    divisions       text[],
    is_interline    boolean,
    legs            jsonb
)
language plpgsql volatile as $$
#variable_conflict use_column
declare
    v_o     text    := upper(p_origin);
    v_d     text    := upper(p_destination);
    v_cab   text    := upper(coalesce(p_cabin, 'ECONOMY'));
    v_seats integer := greatest(coalesce(p_seats, 1), 1);
    v_stops integer := least(greatest(coalesce(p_max_stops, 2), 0), 2);
    v_minc  integer := public.echo_min_connect_minutes();
    v_maxc  integer := public.echo_max_connect_minutes();
    v_vias  integer := public.echo_max_vias();
    v_lim   integer := greatest(coalesce(p_limit, 50), 1);
    v_days  integer := 4;      -- candidate departure dates for onward legs
begin
    -- The candidate legs go into an indexed temp table, not a CTE. A CTE has no
    -- indexes and no statistics, so the three- and four-way self-joins below
    -- degenerate into repeated sequential scans -- measured at 23s for two
    -- stops on a 946-row set. With indexes the same joins are lookups.
    set local client_min_messages = warning;   -- the drop below is expected
    drop table if exists echo_seg;
    create temporary table echo_seg (
        flight_id uuid, aircraft_id uuid, direction text, airline_uid uuid,
        origin_iata text, destination_iata text, duration_minutes integer,
        departure_date date, dep_min integer, arr_min integer,
        price_usd integer, seats integer, carrier_code text, division_code text
    ) on commit drop;

    insert into echo_seg
    with
    deg as materialized (
        select iata_code, out_degree + in_degree as deg
          from public.mv_airport_connectivity
    ),
    -- Airports the origin reaches, and airports that reach the destination,
    -- capped by traffic BEFORE anything expands them. Uncapped, the origin
    -- frontier alone is 520 airports for SGN and the three-stop expansion over
    -- it runs to eight figures of intermediate rows.
    fwd as materialized (
        select r.destination_iata as iata, d.deg
          from public.mv_route_adjacency r
          join deg d on d.iata_code = r.destination_iata
         where r.origin_iata = v_o and r.destination_iata <> v_d
         order by d.deg desc
         limit v_vias * 4
    ),
    bwd as materialized (
        select r.origin_iata as iata, d.deg
          from public.mv_route_adjacency r
          join deg d on d.iata_code = r.origin_iata
         where r.destination_iata = v_d and r.origin_iata <> v_o
         order by d.deg desc
         limit v_vias * 4
    ),
    -- One stop searches the full frontiers rather than the capped ones: it is
    -- two indexed lookups and an intersection, and it is the common case.
    via1 as materialized (
        select r1.destination_iata as a, d.deg
          from public.mv_route_adjacency r1
          join public.mv_route_adjacency r2 on r2.origin_iata = r1.destination_iata
          join deg d on d.iata_code = r1.destination_iata
         where v_stops >= 1
           and r1.origin_iata = v_o
           and r2.destination_iata = v_d
           and r1.destination_iata not in (v_o, v_d)
         group by r1.destination_iata, d.deg
         order by d.deg desc
         limit v_vias
    ),
    via2 as materialized (
        select f.iata as a, b.iata as b
          from fwd f
          join public.mv_route_adjacency r on r.origin_iata = f.iata
          join bwd b on b.iata = r.destination_iata
         where v_stops >= 2 and f.iata <> b.iata
         order by f.deg + b.deg desc limit v_vias
    ),

    -- Every city pair any surviving routing could need, once.
    pairs as materialized (
        select v_o as o, v_d as d
        union select v_o, a from via1
        union select a, v_d from via1
        union select v_o, a from via2
        union select a, b   from via2
        union select b, v_d from via2
    ),

    -- One scan of the timetable for all of them, across the candidate dates.
    -- Both endpoints are bound, so this rides mv_leg_departures_pair_idx.
    -- arr_min is minutes from the itinerary's first midnight, so a connection
    -- is plain integer subtraction with no function call.
    seg as materialized (
        select l.flight_id, l.aircraft_id, l.direction, l.airline_uid,
               l.origin_iata, l.destination_iata, l.duration_minutes,
               dd.d as departure_date,
               (dd.d - p_travel_date) * 1440
                 + (extract(epoch from l.departure_time) / 60)::integer as dep_min,
               (dd.d - p_travel_date) * 1440
                 + (extract(epoch from l.departure_time) / 60)::integer
                 + l.duration_minutes                                   as arr_min,
               case v_cab when 'ECONOMY'         then l.economy_price
                          when 'PREMIUM_ECONOMY' then l.prem_eco_price
                          when 'BUSINESS'        then l.business_price
                          when 'FIRST'           then l.first_price end as price_usd,
               case v_cab when 'ECONOMY'         then l.economy_seats
                          when 'PREMIUM_ECONOMY' then l.prem_eco_seats
                          when 'BUSINESS'        then l.business_seats
                          when 'FIRST'           then l.first_seats end as seats,
               al.carrier_code, al.division_code
          from pairs p
          cross join lateral (
              select p_travel_date + g.n as d from generate_series(0, v_days) g(n)
          ) dd
          join public.mv_leg_departures l
            on l.origin_iata = p.o
           and l.destination_iata = p.d
           and public.echo_operates_on(l.departure_days_mask,
                                       (extract(isodow from dd.d)::int - 1))
          join public.airlines al on al.uid = l.airline_uid and al.is_published
    ),
    keep as (
        select * from seg where price_usd is not null and seats >= v_seats
    )
    select * from keep;

    create index on echo_seg (origin_iata, destination_iata, dep_min);
    create index on echo_seg (destination_iata, origin_iata);
    analyze echo_seg;

    return query
    with
    first_leg as (
        select * from echo_seg where origin_iata = v_o and departure_date = p_travel_date
    ),
    sellable as (
        select * from echo_seg
    ),
    via1 as (
        select distinct e.destination_iata as a
          from echo_seg e
         where v_stops >= 1 and e.origin_iata = v_o and e.destination_iata <> v_d
           and exists (select 1 from echo_seg x
                        where x.origin_iata = e.destination_iata
                          and x.destination_iata = v_d)
    ),
    via2 as (
        select distinct e1.destination_iata as a, e2.destination_iata as b
          from echo_seg e1
          join echo_seg e2 on e2.origin_iata = e1.destination_iata
         where v_stops >= 2 and e1.origin_iata = v_o
           and e1.destination_iata not in (v_o, v_d)
           and e2.destination_iata not in (v_o, v_d)
           and exists (select 1 from echo_seg x
                        where x.origin_iata = e2.destination_iata
                          and x.destination_iata = v_d)
    ),
    blocked as (
        select from_airline_uid, to_airline_uid
          from public.interline_agreements where not is_allowed
    ),

    i0 as (
        select 0 as stops, array[]::text[] as via, f.price_usd as total_price,
               f.duration_minutes as total_minutes,
               array[f.carrier_code] as carriers, array[f.division_code] as divisions,
               array[f.airline_uid] as uids,
               array[f.flight_id] as fids, array[f.aircraft_id] as acids,
               array[f.direction] as dirs, array[f.departure_date] as dates
          from first_leg f
         where f.destination_iata = v_d
    ),
    i1 as (
        select 1, array[v.a], l1.price_usd + l2.price_usd,
               l2.arr_min - l1.dep_min,
               array[l1.carrier_code, l2.carrier_code],
               array[l1.division_code, l2.division_code],
               array[l1.airline_uid, l2.airline_uid],
               array[l1.flight_id, l2.flight_id],
               array[l1.aircraft_id, l2.aircraft_id],
               array[l1.direction, l2.direction],
               array[l1.departure_date, l2.departure_date]
          from via1 v
          join first_leg l1 on l1.destination_iata = v.a
          join sellable  l2 on l2.origin_iata = v.a and l2.destination_iata = v_d
         where l2.dep_min - l1.arr_min between v_minc and v_maxc
           and not exists (select 1 from blocked b
                            where b.from_airline_uid = l1.airline_uid
                              and b.to_airline_uid   = l2.airline_uid)
    ),
    i2 as (
        select 2, array[v.a, v.b], l1.price_usd + l2.price_usd + l3.price_usd,
               l3.arr_min - l1.dep_min,
               array[l1.carrier_code, l2.carrier_code, l3.carrier_code],
               array[l1.division_code, l2.division_code, l3.division_code],
               array[l1.airline_uid, l2.airline_uid, l3.airline_uid],
               array[l1.flight_id, l2.flight_id, l3.flight_id],
               array[l1.aircraft_id, l2.aircraft_id, l3.aircraft_id],
               array[l1.direction, l2.direction, l3.direction],
               array[l1.departure_date, l2.departure_date, l3.departure_date]
          from via2 v
          join first_leg l1 on l1.destination_iata = v.a
          join sellable  l2 on l2.origin_iata = v.a and l2.destination_iata = v.b
          join sellable  l3 on l3.origin_iata = v.b and l3.destination_iata = v_d
         where l2.dep_min - l1.arr_min between v_minc and v_maxc
           and l3.dep_min - l2.arr_min between v_minc and v_maxc
           and not exists (select 1 from blocked b
                            where b.from_airline_uid = l1.airline_uid
                              and b.to_airline_uid   = l2.airline_uid)
           and not exists (select 1 from blocked b
                            where b.from_airline_uid = l2.airline_uid
                              and b.to_airline_uid   = l3.airline_uid)
    ),
    all_options as (
        select * from i0
        union all select * from i1
        union all select * from i2
    ),
    -- Cut to the result page BEFORE any JSON is built.
    best as (
        select o.*, row_number() over (order by o.total_price, o.total_minutes) as rn
          from all_options o
    )
    select b.stops, b.via, b.total_price, b.total_minutes, b.carriers, b.divisions,
           (select count(distinct x) from unnest(b.uids) x) > 1,
           (select jsonb_agg(jsonb_build_object(
                       'flight_id',        l.flight_id,
                       'aircraft_id',      l.aircraft_id,
                       'designator',       al.carrier_code || ' ' ||
                           case when l.direction = 'OUTBOUND' then f.outbound_flight_number
                                else f.inbound_flight_number end,
                       'carrier_code',     al.carrier_code,
                       'division',         al.division_code,
                       'origin',           l.origin_iata,
                       'destination',      l.destination_iata,
                       'departure_date',   k.dt,
                       'departure_time',   to_char(l.departure_time, 'HH24:MI'),
                       'arrival_date',     k.dt + l.arrival_days_after_departure,
                       'arrival_time',     to_char(l.arrival_time, 'HH24:MI'),
                       'duration_minutes', l.duration_minutes,
                       'aircraft_model',   ac.aircraft_model,
                       'price_usd',
                           case v_cab when 'ECONOMY'         then l.economy_price
                                      when 'PREMIUM_ECONOMY' then l.prem_eco_price
                                      when 'BUSINESS'        then l.business_price
                                      when 'FIRST'           then l.first_price end)
                     order by k.ord)
              from unnest(b.fids, b.acids, b.dirs, b.dates)
                   with ordinality as k(fid, acid, dir, dt, ord)
              join public.mv_leg_departures l
                on l.flight_id = k.fid and l.aircraft_id = k.acid
               and l.direction = k.dir
              join public.airlines al on al.uid = l.airline_uid
              join public.aircraft ac on ac.aircraft_id = l.aircraft_id
              join public.flights  f  on f.flight_id = l.flight_id)
      from best b
     where b.rn <= v_lim
     order by b.total_price, b.total_minutes;
end;
$$;

comment on function public.search_itineraries(text, text, date, text, integer, integer, integer) is
    'Nonstop through three-stop itineraries across every carrier in the alliance, cheapest first. Connecting points are the highest-traffic echo_max_vias() candidates, so results beyond nonstop are a strong heuristic rather than an exhaustive enumeration.';

commit;

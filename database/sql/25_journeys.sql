-- =====================================================================
--  Echo United Alliances -- journeys beyond a single one-way
--
--  search_itineraries() answers "get me from A to B on this date" and it is
--  the right tool for that. Three of the four things added here are built on
--  top of it rather than beside it:
--
--    return        two searches, paired in the browser. The connection logic
--                  that makes a search correct is hard-won and lives in one
--                  place; a second copy of it that drifted would be worse
--                  than a round trip.
--    multi-city    the same, once per leg.
--    flexible      NOT that, and this file exists mostly because of it. A
--                  seven-day calendar means seven searches, and a two-stop
--                  search measured 3.7 seconds -- twenty-six seconds for a
--                  price strip nobody asked to wait for. fare_calendar()
--                  below answers the much smaller question a calendar
--                  actually asks: what is the cheapest fare each day.
--    round-the-world  genuinely new. See rtw_quote().
--
--  A note on why the calendar stops at one connection. search_itineraries
--  goes to two because a real routing sometimes needs two; a calendar is a
--  hint about which day to look at, and the second connection roughly squares
--  the work to move a number most travellers will not act on. If the answer
--  for a day is "only via two stops", the calendar says nothing for that day
--  and the day's own search still finds it.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  A destination-side index.
--
--  mv_leg_departures is indexed on origin, and on (origin, destination), so
--  "flights INTO JFK" was a sequential scan of 830,744 rows -- 1.1 seconds,
--  every time, and the calendar needs it once per candidate day. The inbound
--  half of a one-stop journey is exactly that query.
-- ---------------------------------------------------------------------
create index if not exists mv_leg_departures_dest_idx
    on public.mv_leg_departures (destination_iata, origin_iata);

-- ---------------------------------------------------------------------
--  Great-circle distance, for the round-the-world mileage bands.
-- ---------------------------------------------------------------------
create or replace function public.echo_gc_km(
    p_lat1 double precision, p_lon1 double precision,
    p_lat2 double precision, p_lon2 double precision
)
returns double precision language sql immutable parallel safe as $fn$
    select 6371.0088 * 2 * asin(least(1.0, sqrt(
        sin(radians(p_lat2 - p_lat1) / 2) ^ 2
        + cos(radians(p_lat1)) * cos(radians(p_lat2))
          * sin(radians(p_lon2 - p_lon1) / 2) ^ 2
    )));
$fn$;

comment on function public.echo_gc_km(double precision, double precision, double precision, double precision) is
    'Great-circle distance in kilometres. Haversine, clamped before asin so floating point cannot push an antipodal pair out of domain.';

-- ---------------------------------------------------------------------
--  How far round the world one hop takes you.
--
--  The signed shortest way round, in degrees, in (-180, 180]. Going from
--  Tokyo to Los Angeles is +91 degrees east, not -269 west, and a
--  round-the-world itinerary is exactly one whose hops add up to a full turn.
-- ---------------------------------------------------------------------
create or replace function public.echo_lon_delta(
    p_from double precision, p_to double precision
)
returns double precision language sql immutable parallel safe as $fn$
    select ((((p_to - p_from)::numeric + 540) % 360) - 180)::double precision;
$fn$;

comment on function public.echo_lon_delta(double precision, double precision) is
    'Signed shortest longitude change for one hop, in (-180, 180]. Summed over a closed loop it is +-360 for a genuine circumnavigation and near 0 for an out-and-back.';

-- ---------------------------------------------------------------------
--  fare_calendar -- the cheapest fare on each of the next N days
--
--  Nonstop and one connection, set-based, no temp table. Returns a row per
--  day only where something actually flies, so an empty day is an answer.
-- ---------------------------------------------------------------------
create or replace function public.fare_calendar(
    p_origin      text,
    p_destination text,
    p_from        date,
    p_days        integer default 7,
    p_cabin       text default 'ECONOMY',
    p_seats       integer default 1
)
returns table (
    travel_date  date,
    cheapest_usd integer,
    nonstop      boolean
)
language plpgsql stable parallel safe as $fn$
declare
    v_o    text    := upper(btrim(p_origin));
    v_d    text    := upper(btrim(p_destination));
    v_cab  text    := upper(coalesce(p_cabin, 'ECONOMY'));
    v_seat integer := greatest(coalesce(p_seats, 1), 1);
    v_days integer := least(greatest(coalesce(p_days, 7), 1), 21);
    v_minc integer := public.echo_min_connect_minutes();
    v_maxc integer := public.echo_max_connect_minutes();
begin
    if v_o is null or v_d is null or v_o = v_d or p_from is null then
        return;
    end if;

    return query
    with
    day as (
        select (p_from + g.n)::date as d,
               (extract(isodow from (p_from + g.n))::int - 1) as dow0,
               (extract(isodow from (p_from + g.n + 1))::int - 1) as dow1
          from generate_series(0, v_days - 1) g(n)
    ),
    -- The nonstop answer, straight off the pair index.
    nonstop_cheapest as (
        select day.d,
               min(case v_cab when 'ECONOMY'         then l.economy_price
                              when 'PREMIUM_ECONOMY' then l.prem_eco_price
                              when 'BUSINESS'        then l.business_price
                              when 'FIRST'           then l.first_price end) as price
          from day
          join public.mv_leg_departures l
            on l.origin_iata = v_o
           and l.destination_iata = v_d
           and public.echo_operates_on(l.departure_days_mask, day.dow0)
         where case v_cab when 'ECONOMY'         then l.economy_seats
                          when 'PREMIUM_ECONOMY' then l.prem_eco_seats
                          when 'BUSINESS'        then l.business_seats
                          when 'FIRST'           then l.first_seats end >= v_seat
         group by day.d
    ),
    -- The connecting airports worth considering, chosen exactly the way
    -- search_itineraries chooses them: reachable from the origin, reaching
    -- the destination, busiest first, capped at echo_max_vias().
    --
    -- Copying that rule is the point. An unbounded hub set made this 26
    -- seconds on LHR-SYD, and it would also have quoted fares through hubs
    -- the search itself never considers -- a calendar that disagrees with
    -- the search it links to is worse than no calendar.
    via1 as materialized (
        select r1.destination_iata as hub
          from public.mv_route_adjacency r1
          join public.mv_route_adjacency r2 on r2.origin_iata = r1.destination_iata
          join public.mv_airport_connectivity c
            on c.iata_code = r1.destination_iata
         where r1.origin_iata = v_o
           and r2.destination_iata = v_d
           and r1.destination_iata <> v_o
           and r1.destination_iata <> v_d
         group by r1.destination_iata, c.out_degree, c.in_degree
         order by c.out_degree + c.in_degree desc
         limit public.echo_max_vias()
    ),
    -- Both endpoints bound on each scan, so these ride the pair index.
    out_leg as (
        select l.destination_iata as hub,
               l.departure_days_mask as mask,
               (extract(epoch from l.departure_time) / 60)::integer
                 + l.duration_minutes as arrives_at,
               case v_cab when 'ECONOMY'         then l.economy_price
                          when 'PREMIUM_ECONOMY' then l.prem_eco_price
                          when 'BUSINESS'        then l.business_price
                          when 'FIRST'           then l.first_price end as price
          from via1 v
          join public.mv_leg_departures l
            on l.origin_iata = v_o and l.destination_iata = v.hub
         where case v_cab when 'ECONOMY'         then l.economy_seats
                          when 'PREMIUM_ECONOMY' then l.prem_eco_seats
                          when 'BUSINESS'        then l.business_seats
                          when 'FIRST'           then l.first_seats end >= v_seat
    ),
    in_leg as (
        select l.origin_iata as hub,
               l.departure_days_mask as mask,
               (extract(epoch from l.departure_time) / 60)::integer as departs_at,
               case v_cab when 'ECONOMY'         then l.economy_price
                          when 'PREMIUM_ECONOMY' then l.prem_eco_price
                          when 'BUSINESS'        then l.business_price
                          when 'FIRST'           then l.first_price end as price
          from via1 v
          join public.mv_leg_departures l
            on l.origin_iata = v.hub and l.destination_iata = v_d
         where case v_cab when 'ECONOMY'         then l.economy_seats
                          when 'PREMIUM_ECONOMY' then l.prem_eco_seats
                          when 'BUSINESS'        then l.business_seats
                          when 'FIRST'           then l.first_seats end >= v_seat
    ),
    -- Every connection that works, collapsed to the cheapest per weekday
    -- combination before the dates are joined on. The masks are seven bits,
    -- so this is a handful of rows however many flights fed it.
    -- Collapse identical departures first. A flight flown by several aircraft
    -- is several rows here with the same hub, weekday mask and clock time, and
    -- every one of them would otherwise be joined against every inbound.
    out_slim as (
        select hub, mask, arrives_at, min(price) as price
          from out_leg where price is not null
         group by hub, mask, arrives_at
    ),
    in_slim as (
        select hub, mask, departs_at, min(price) as price
          from in_leg where price is not null
         group by hub, mask, departs_at
    ),
    pair as (
        select o.mask as out_mask, i.mask as in_mask, k.k,
               min(o.price + i.price) as price
          from out_slim o
          join in_slim i on i.hub = o.hub
          cross join generate_series(0, 1) k(k)
         where (k.k * 1440 + i.departs_at) - o.arrives_at between v_minc and v_maxc
         group by o.mask, i.mask, k.k
    ),
    onestop_cheapest as (
        select day.d, min(p.price) as price
          from day
          join pair p
            on public.echo_operates_on(p.out_mask, day.dow0)
           and public.echo_operates_on(p.in_mask,
                                       case p.k when 0 then day.dow0 else day.dow1 end)
         group by day.d
    ),
    best as (
        select coalesce(n.d, s.d) as d, n.price as direct_price, s.price as onestop_price
          from nonstop_cheapest n
          full join onestop_cheapest s on s.d = n.d
    )
    select b.d,
           least(coalesce(b.direct_price, 2147483647),
                 coalesce(b.onestop_price, 2147483647))::integer,
           b.direct_price is not null
             and b.direct_price <= coalesce(b.onestop_price, 2147483647)
      from best b
     where b.direct_price is not null or b.onestop_price is not null
     order by 1;
end;
$fn$;

comment on function public.fare_calendar(text, text, date, integer, text, integer) is
    'Cheapest sellable fare for each of the next N days, over nonstop and one-connection journeys. A day with no row has nothing under two stops -- run the day''s own search to be sure.';

grant execute on function public.fare_calendar(text, text, date, integer, text, integer)
    to anon, authenticated;

-- ---------------------------------------------------------------------
--  Round-the-world fares
--
--  A real alliance round-the-world fare is not the sum of its flights. It is
--  a single product priced on how far round you go, sold on the condition
--  that you keep going the same way and come back to where you started. That
--  is what makes it worth having: the fare does not care that you added
--  another stop, only that you did not double back.
--
--  So the bands are data, not arithmetic on segment prices, and they live in
--  a table the board can edit without a migration.
-- ---------------------------------------------------------------------
create table if not exists public.rtw_fare_bands (
    band_code    text primary key,
    band_name    text not null,
    -- Inclusive ceiling on total great-circle distance. The last band has
    -- none, and is the one a null here means.
    max_km       integer,
    economy_usd  integer not null,
    premium_usd  integer not null,
    business_usd integer not null,
    first_usd    integer not null,
    sort_order   integer not null unique
);

comment on table public.rtw_fare_bands is
    'What a round-the-world fare costs, by how far round the world it goes. Edit these to reprice the product; nothing else needs to change.';

insert into public.rtw_fare_bands
    (band_code, band_name, max_km, economy_usd, premium_usd, business_usd, first_usd, sort_order)
values
    -- Set against what the segments actually cost in this network: a five-hop
    -- economy circumnavigation sums to roughly $2,000 of one-way fares, so a
    -- band priced above that would be a worse deal than buying the flights,
    -- and the planner shows both numbers side by side.
    ('RTW1', 'Meridian',        29000, 1450, 2300, 5900,  9900,  1),
    ('RTW2', 'Continent',       39000, 1850, 2950, 7400,  12400, 2),
    ('RTW3', 'Horizon',         48000, 2350, 3750, 9300,  15600, 3),
    ('RTW4', 'Circumnavigator',  null, 2900, 4650, 11500, 19300, 4)
on conflict (band_code) do update set
    band_name    = excluded.band_name,
    max_km       = excluded.max_km,
    economy_usd  = excluded.economy_usd,
    premium_usd  = excluded.premium_usd,
    business_usd = excluded.business_usd,
    first_usd    = excluded.first_usd,
    sort_order   = excluded.sort_order;

grant select on public.rtw_fare_bands to anon, authenticated;

-- ---------------------------------------------------------------------
--  rtw_quote -- validate a round-the-world routing and price it
--
--  p_stops is the tour in order and does NOT repeat the origin: pass
--  {LHR,SIN,SYD,LAX} and the loop is LHR -> SIN -> SYD -> LAX -> LHR.
--
--  The rules are the ones that make the fare mean something, and each is
--  reported separately so the planner can say which one you broke:
--
--    one direction   every hop's signed longitude change is summed. A real
--                    circumnavigation totals +-360. An out-and-back totals
--                    about zero however far it flew, which is the case a
--                    distance-only check would happily sell.
--    no doubling back  a single hop may go against the direction by up to
--                    35 degrees -- that is a detour within a continent, and
--                    real fares allow it. More is a change of mind.
--    three countries  a loop that never leaves one country is a domestic
--                    tour, whatever its longitudes say.
--
--  Every hop is also looked up against the schedule, so the planner can show
--  which are flown nonstop by a member and which will need a connection.
-- ---------------------------------------------------------------------
create or replace function public.rtw_quote(
    p_stops text[],
    p_cabin text default 'ECONOMY'
)
returns table (
    ok             boolean,
    problems       text[],
    direction      text,
    total_km       integer,
    longitude_turn integer,
    countries      integer,
    band_code      text,
    band_name      text,
    fare_usd       integer,
    segments_usd   integer,
    hops           jsonb
)
language plpgsql stable parallel safe as $fn$
declare
    v_cab   text := upper(coalesce(p_cabin, 'ECONOMY'));
    v_n     integer := coalesce(array_length(p_stops, 1), 0);
    v_stops text[];
    v_probs text[] := '{}';
    v_turn  double precision;
    v_km    double precision;
    -- The most extreme hop in each direction, so "did it double back"
    -- is one comparison whichever way the tour runs.
    v_worst_west double precision;
    v_worst_east double precision;
    v_ctry  integer;
    v_dir   text;
    v_band  public.rtw_fare_bands%rowtype;
    v_fare  integer;
    v_hops  jsonb;
    v_seg   integer;
    v_missing text[];
begin
    if v_cab not in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST') then
        v_cab := 'ECONOMY';
    end if;

    -- Normalise, and let a caller close the loop explicitly if they want to.
    select array_agg(upper(btrim(s)) order by ord)
      into v_stops
      from unnest(p_stops) with ordinality as t(s, ord);

    if v_stops is not null and array_length(v_stops, 1) > 1
       and v_stops[1] = v_stops[array_length(v_stops, 1)] then
        v_stops := v_stops[1:array_length(v_stops, 1) - 1];
    end if;
    v_n := coalesce(array_length(v_stops, 1), 0);

    if v_n < 3 then
        return query select false,
            array['A round-the-world fare needs at least three stops before it comes home.']::text[],
            null::text, 0, 0, 0, null::text, null::text, null::integer, null::integer, '[]'::jsonb;
        return;
    end if;

    if v_n > 7 then
        v_probs := v_probs || 'A round-the-world fare covers at most seven stops; this one has ' || v_n || '.';
    end if;

    -- Every stop has to be an airport we know the position of, or none of
    -- the geometry below means anything.
    select array_agg(s order by ord)
      into v_missing
      from unnest(v_stops) with ordinality as t(s, ord)
     where not exists (
        select 1 from public.airports a
         where a.iata_code = t.s and a.latitude is not null and a.longitude is not null
     );

    if v_missing is not null then
        return query select false,
            array['Not an airport in the alliance network: ' || array_to_string(v_missing, ', ')]::text[],
            null::text, 0, 0, 0, null::text, null::text, null::integer, null::integer, '[]'::jsonb;
        return;
    end if;

    -- The loop, hop by hop: each stop to the next, and the last back home.
    with tour as (
        select t.ord, t.s as code, a.latitude, a.longitude, a.country_code, a.city_name
          from unnest(v_stops) with ordinality as t(s, ord)
          join public.airports a on a.iata_code = t.s
    ),
    hop as (
        select f.ord,
               f.code as from_code, f.city_name as from_city,
               n.code as to_code,   n.city_name as to_city,
               public.echo_gc_km(f.latitude, f.longitude, n.latitude, n.longitude) as km,
               public.echo_lon_delta(f.longitude, n.longitude) as dlon
          from tour f
          join tour n on n.ord = (f.ord % v_n) + 1
    ),
    flown as (
        select h.ord,
               bool_or(l.flight_id is not null) as nonstop,
               min(case v_cab when 'ECONOMY'         then l.economy_price
                              when 'PREMIUM_ECONOMY' then l.prem_eco_price
                              when 'BUSINESS'        then l.business_price
                              when 'FIRST'           then l.first_price end) as cheapest,
               count(distinct al.carrier_code) as carrier_count,
               (array_remove(array_agg(distinct al.carrier_code), null))[1:6] as carriers
          from hop h
          left join public.mv_leg_departures l
            on l.origin_iata = h.from_code and l.destination_iata = h.to_code
          left join public.airlines al
            on al.uid = l.airline_uid and al.is_published
         group by h.ord
    )
    select sum(h.dlon), sum(h.km), min(h.dlon), max(h.dlon),
           case when count(*) filter (where f.cheapest is null) = 0
                then sum(f.cheapest)::integer end,
           jsonb_agg(jsonb_build_object(
               'seq',       h.ord,
               'from',      h.from_code,
               'from_city', h.from_city,
               'to',        h.to_code,
               'to_city',   h.to_city,
               'km',        round(h.km)::integer,
               'nonstop',   coalesce(f.nonstop, false),
               'cheapest_usd', f.cheapest,
               'carriers',  coalesce(to_jsonb(f.carriers), '[]'::jsonb),
               'carrier_count', coalesce(f.carrier_count, 0)
           ) order by h.ord)
      into v_turn, v_km, v_worst_west, v_worst_east, v_seg, v_hops
      from hop h
      left join flown f on f.ord = h.ord;

    select count(distinct a.country_code) into v_ctry
      from unnest(v_stops) s
      join public.airports a on a.iata_code = s;

    v_dir := case when v_turn > 0 then 'EAST' when v_turn < 0 then 'WEST' else null end;

    -- Did it actually go round?
    if abs(v_turn) < 320 then
        v_probs := v_probs ||
            ('This routing turns ' || round(abs(v_turn))::text ||
             ' degrees around the globe. A round-the-world fare has to complete the circle — keep going the same way rather than turning back.');
    elsif abs(v_turn) > 400 then
        v_probs := v_probs ||
            ('This routing turns ' || round(abs(v_turn))::text ||
             ' degrees, more than one full circle. A round-the-world fare covers one lap.');
    end if;

    -- Did it double back on itself? Up to 35 degrees against the run of the
    -- tour is a detour within a continent, which real fares allow.
    if v_dir = 'EAST' and v_worst_west < -35 then
        v_probs := v_probs ||
            ('One hop goes ' || round(abs(v_worst_west))::text ||
             ' degrees back west against an eastbound tour. Up to 35 degrees is a detour; more is a change of direction.');
    elsif v_dir = 'WEST' and v_worst_east > 35 then
        v_probs := v_probs ||
            ('One hop goes ' || round(v_worst_east)::text ||
             ' degrees back east against a westbound tour. Up to 35 degrees is a detour; more is a change of direction.');
    end if;

    if v_ctry < 3 then
        v_probs := v_probs ||
            ('A round-the-world fare has to reach at least three countries; this one reaches ' || v_ctry || '.');
    end if;

    select * into v_band
      from public.rtw_fare_bands
     where max_km is null or v_km <= max_km
     order by sort_order
     limit 1;

    v_fare := case v_cab
                when 'ECONOMY'         then v_band.economy_usd
                when 'PREMIUM_ECONOMY' then v_band.premium_usd
                when 'BUSINESS'        then v_band.business_usd
                when 'FIRST'           then v_band.first_usd
              end;

    return query select
        cardinality(v_probs) = 0,
        v_probs,
        v_dir,
        round(v_km)::integer,
        round(v_turn)::integer,
        v_ctry,
        v_band.band_code,
        v_band.band_name,
        v_fare,
        v_seg,
        coalesce(v_hops, '[]'::jsonb);
end;
$fn$;

comment on function public.rtw_quote(text[], text) is
    'Validate a round-the-world routing and price it from the mileage bands. p_stops is the tour in order, not repeating the origin. Reports each broken rule separately, and says which hops a member flies nonstop.';

grant execute on function public.rtw_quote(text[], text) to anon, authenticated;

commit;

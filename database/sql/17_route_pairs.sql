-- =====================================================================
--  Echo United Alliances -- city pairs, not directed legs
--
--  v_routes has one row per DIRECTED pair, which is right for anything that
--  cares which way an aircraft is pointing. The carrier page's "busiest
--  routes" table is not one of those things: it was listing LHR -> JFK and
--  JFK -> LHR as two separate routes, one above the other, each with half the
--  weekly departures of the route a person would say the airline flies.
--
--  This folds the two directions together on (least, greatest) of the airport
--  codes, so a route appears once with the traffic it actually carries. It
--  also reports whether the return leg exists at all. As it happens every one
--  of the 158,773 pairs in the export is flown both ways, so directions is 2
--  everywhere today -- the column is what lets the page say so rather than
--  assume it, and what will catch the first one-way route that appears.
--
--  Ordering by departures_per_week here is the point. Doing this in the
--  browser would mean summing pairs AFTER the server had already picked a
--  top-N from half-counted rows, which can pick the wrong routes.
-- =====================================================================

begin;

create or replace view public.v_route_pairs
with (security_invoker = on) as
select
    l.airline_uid,
    a.division_code,
    a.carrier_code,
    least(l.origin_iata, l.destination_iata)    as airport_a,
    greatest(l.origin_iata, l.destination_iata) as airport_b,
    -- same popcount-of-the-mask count as v_routes, over both directions
    sum(length(replace((coalesce(l.departure_days_mask, 0))::bit(7)::text, '0', '')))::bigint
                                                as departures_per_week,
    count(distinct l.origin_iata)               as directions,
    -- only meaningful when directions = 1, and then it is the way it is flown
    min(l.origin_iata)                          as sole_origin,
    min(l.duration_minutes)                     as fastest_minutes,
    min(l.economy_price)                        as cheapest_economy_usd,
    min(l.business_price)                       as cheapest_business_usd
from public.mv_leg_departures l
join public.airlines a on a.uid = l.airline_uid
group by l.airline_uid, a.division_code, a.carrier_code,
         least(l.origin_iata, l.destination_iata),
         greatest(l.origin_iata, l.destination_iata);

comment on view public.v_route_pairs is
    'Every city pair a carrier serves, both directions folded into one row. directions is 1 or 2; when it is 1, sole_origin is the end it departs from.';

grant select on public.v_route_pairs to anon, authenticated;

commit;

-- =====================================================================
--  Echo United Alliances -- v_airline_idle_routes without the pair index
--
--  39 wrote the "no departures" half as an either-direction match, which
--  leaned on mv_legs_pair_idx. 45 dropped that index for space, and the
--  view fell back to probing every leg out of each airport: Air Amayrica,
--  flying out of ATL, JFK and LAX, took 13 s and hit the API timeout, and
--  its carrier page sat on "No fleet recorded" until the request gave up.
--
--  Matching on the folded pair instead (least/greatest on both sides) is
--  the same test, and the planner answers it from the airline index with
--  a hash anti join: 0.9 s for the same carrier, no new index needed.
-- =====================================================================

begin;

create or replace view public.v_airline_idle_routes with (security_invoker = on) as
select u.airline_uid,
       least(u.origin_iata, u.destination_iata)    as airport_a,
       greatest(u.origin_iata, u.destination_iata) as airport_b,
       'no_flights'::text                          as reason
  from public.airline_unflown_routes u
union
select f.airline_uid,
       least(f.origin_iata, f.destination_iata),
       greatest(f.origin_iata, f.destination_iata),
       'no_departures'::text
  from public.flights f
 where not exists (
        select 1 from public.mv_leg_departures l
         where l.airline_uid = f.airline_uid
           and least(l.origin_iata, l.destination_iata)    = least(f.origin_iata, f.destination_iata)
           and greatest(l.origin_iata, l.destination_iata) = greatest(f.origin_iata, f.destination_iata));

commit;

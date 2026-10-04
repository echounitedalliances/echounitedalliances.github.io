-- =====================================================================
--  Echo United Alliances -- routes the game counts that have no flights
--
--  Reported 4 October 2026: Tsuki Airways shows 92 routes in the game and
--  81 here. The game keeps an airline's routes in their own table,
--  player_route_data, which the scraper never read; a route can be opened
--  there with no flight on it. Tsuki had opened 11 such -- KIX to HND, NRT,
--  ITM, NGO, UKB, SDJ, TAK, HIJ, FUK, CTS and CAN -- and flights on none.
--  Nothing on them can be sold, but they are the airline's routes.
--
--  airline_unflown_routes holds those: a route the airline has opened with
--  no flight on that city pair (build_database.py, from routes.json). The
--  route count adds them, so it is the game's figure.
--
--  v_airline_idle_routes is what the carrier page lists under its routes:
--  every city pair the airline holds that has no departure to sell, whether
--  for want of a flight (no_flights) or of an aircraft, days or fares on the
--  flights it has (no_departures) -- Tsuki's HND-AKL, KIX-GRU and KIX-ICN are
--  flights the game carries with no aircraft assigned.
-- =====================================================================

begin;

create table if not exists public.airline_unflown_routes (
    airline_uid      uuid not null references public.airlines (uid) on delete cascade,
    origin_iata      text not null references public.airports (iata_code),
    destination_iata text not null references public.airports (iata_code),
    primary key (airline_uid, origin_iata, destination_iata)
);

comment on table public.airline_unflown_routes is
    'Routes an airline has opened in the game (player_route_data) with no flight on that city pair. Counted in its routes; nothing to sell.';

alter table public.airline_unflown_routes enable row level security;
drop policy if exists airline_unflown_routes_public_read on public.airline_unflown_routes;
create policy airline_unflown_routes_public_read on public.airline_unflown_routes for select using (true);
grant select on public.airline_unflown_routes to anon, authenticated;

-- The route count: city pairs it flies, plus routes opened with none.
create or replace view public.v_airline_metrics with (security_invoker = on) as
 SELECT a.uid AS airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    a.airline_slug,
    a.airline_country,
    COALESCE(f.flight_pairs, 0::bigint) AS flight_pairs,
    COALESCE(f.routes, 0::bigint) + COALESCE(u.unflown, 0::bigint) AS routes,
    COALESCE(f.destinations, 0::bigint) AS destinations,
    COALESCE(ac.fleet_size, 0::bigint) AS fleet_size,
    COALESCE(ac.models, 0::bigint) AS aircraft_types,
    ac.top_model AS most_common_aircraft,
    COALESCE(h.hub_count, 0::bigint) AS hub_count,
    h.hubs,
    f.longest_route_minutes,
    f.cheapest_economy_usd,
    s.last_online_time
   FROM airlines a
     LEFT JOIN LATERAL ( SELECT count(*) AS flight_pairs,
            count(DISTINCT fl.origin_iata || fl.destination_iata) AS routes,
            count(DISTINCT x.iata) AS destinations,
            max(GREATEST(fl.outbound_duration_minutes, fl.inbound_duration_minutes)) AS longest_route_minutes,
            ( SELECT min(fa.eco_price) AS min
                   FROM flights f2
                     JOIN flight_assignments fa ON fa.flight_id = f2.flight_id
                  WHERE f2.airline_uid = a.uid AND fa.eco_price > 0) AS cheapest_economy_usd
           FROM flights fl
             CROSS JOIN LATERAL ( VALUES (fl.origin_iata), (fl.destination_iata)) x(iata)
          WHERE fl.airline_uid = a.uid) f ON true
     LEFT JOIN LATERAL ( SELECT sum(g.n)::bigint AS fleet_size,
            count(g.aircraft_model) AS models,
            (array_agg(g.aircraft_model ORDER BY g.n DESC, g.aircraft_model)
                 FILTER (WHERE g.aircraft_model IS NOT NULL))[1] AS top_model
           FROM ( SELECT u.aircraft_model, sum(u.n) AS n
                    FROM ( SELECT aircraft.aircraft_model, 1 AS n
                             FROM aircraft
                            WHERE aircraft.airline_uid = a.uid AND NOT aircraft.is_placeholder
                          UNION ALL
                           SELECT i.aircraft_model, i.idle_count
                             FROM aircraft_idle i
                            WHERE i.airline_uid = a.uid) u
                   GROUP BY u.aircraft_model) g) ac ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS hub_count,
            array_agg(airline_hubs.airport_iata ORDER BY airline_hubs.is_major_hub DESC, airline_hubs.airport_iata) AS hubs
           FROM airline_hubs
          WHERE airline_hubs.airline_uid = a.uid) h ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS unflown
           FROM airline_unflown_routes uf
          WHERE uf.airline_uid = a.uid) u ON true
     LEFT JOIN airline_stats s ON s.airline_uid = a.uid;

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
           and ((l.origin_iata = f.origin_iata and l.destination_iata = f.destination_iata)
             or (l.origin_iata = f.destination_iata and l.destination_iata = f.origin_iata)));

comment on view public.v_airline_idle_routes is
    'City pairs an airline holds with nothing to sell: opened with no flights (no_flights), or flights with no aircraft, days or fares (no_departures).';

grant select on public.v_airline_idle_routes to anon, authenticated, service_role;

commit;

refresh materialized view public.mv_airline_directory;

-- =====================================================================
--  Echo United Alliances -- flight booking and trip search withdrawn
--
--  30 October 2026, decided by the owner. The database had reached the
--  free plan's 500 MB, and the week's scrape (708 airlines, 466k flights)
--  would have taken it over. Booking and the multi-airline trip search were
--  the features that held space without being what the site is for, so they
--  go: the network, the departure board, the timetables, the airline and
--  airport pages and the maps all stay.
--
--  What goes:
--    * bookings, booking_segments, passengers, tickets and the seat
--      inventory, with every function and trigger that wrote them;
--    * the itinerary search, the fare calendar and round-the-world, with the
--      connection rules only they used, and the interline and RTW tables;
--    * the indexes on the departure table that only the search read (origin
--      and destination pairs), and the flights' pair indexes likewise;
--    * the views over bookings and sales.
--  What shrinks:
--    * mv_division_arcs keeps each division's busiest 1,000 city pairs.
--      Its one reader, division_arcs(), draws at most 700.
--
--  Resonance accounts stay: they are how admins sign in. Their "your trips"
--  list went with the bookings.
--
--  The weekly merge no longer holds back flights a booking named
--  (database/weekly/2_merge.sql). Files 05, 06, 07, 10, 25, 33 and 35 still
--  create all of this on a fresh build; this file, run after them, takes it
--  out again.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Functions: booking, inventory, accounts' trips, search, fares, RTW
-- ---------------------------------------------------------------------
drop function if exists public.add_booking_to_account(p_pnr text, p_family_name text);
drop function if exists public.cancel_booking(p_pnr text, p_family_name text);
drop function if exists public.cancel_my_booking(p_booking_id uuid);
drop function if exists public.create_booking(p_contact_email text, p_contact_name text, p_cabin text, p_passengers jsonb, p_segments jsonb, p_save_to_account boolean);
drop function if exists public.find_booking(p_pnr text, p_family_name text);
drop function if exists public.remove_booking_from_account(p_booking_id uuid);
drop function if exists public.simulate_bookings(p_max_rows integer);
drop function if exists public.search_itineraries(p_origin text, p_destination text, p_travel_date date, p_cabin text, p_seats integer, p_max_stops integer, p_limit integer, p_stops_exactly integer, p_offset integer);
drop function if exists public.search_flights(p_origin text, p_destination text, p_travel_date date, p_cabin text, p_seats integer);
drop function if exists public.fare_calendar(p_origin text, p_destination text, p_from date, p_days integer, p_cabin text, p_seats integer);
drop function if exists public.rtw_quote(p_stops text[], p_cabin text);
drop function if exists public.echo_refresh_search();

-- ---------------------------------------------------------------------
-- Views over bookings, sales and the search (after the functions that
-- return their row types)
-- ---------------------------------------------------------------------
drop view if exists public.v_booking_details;
drop view if exists public.v_alliance_sales;
drop view if exists public.v_departure_load;
drop view if exists public.v_bookable_departures;
drop view if exists public.v_stopover_itineraries;

-- ---------------------------------------------------------------------
-- The tables (their triggers and policies go with them)
-- ---------------------------------------------------------------------
drop table if exists public.tickets;
drop table if exists public.passengers;
drop table if exists public.booking_segments;
drop table if exists public.bookings;
drop table if exists public.departure_inventory;
drop table if exists public.interline_agreements;
drop table if exists public.rtw_fare_bands;

-- Trigger functions and helpers only the above used.
drop function if exists public.echo_bookings_before_write();
drop function if exists public.echo_segment_before_write();
drop function if exists public.echo_segment_take_inventory();
drop function if exists public.echo_segment_release_inventory();
drop function if exists public.echo_touch_booking_total();
drop function if exists public.echo_recalculate_booking_total(p_booking_id uuid);
drop function if exists public.echo_available_seats(p_flight_id uuid, p_aircraft_id uuid, p_direction text, p_travel_date date, p_cabin text);
drop function if exists public.echo_seed_departure(p_flight_id uuid, p_aircraft_id uuid, p_direction text, p_travel_date date, p_cabin text);
drop function if exists public.echo_generate_pnr();
drop function if exists public.echo_demand_curve(p_days_out integer);
drop function if exists public.echo_demand_rate(p_key text, p_capacity integer);
drop function if exists public.echo_interline_ok(p_from uuid, p_to uuid);
drop function if exists public.echo_leg_json(p_flight_id uuid, p_aircraft_id uuid, p_designator text, p_carrier text, p_division text, p_origin text, p_destination text, p_departure_date date, p_departure time without time zone, p_arrival_date date, p_arrival time without time zone, p_duration integer, p_price integer, p_model text);
drop function if exists public.echo_lon_delta(p_from double precision, p_to double precision);
drop function if exists public.echo_connect_minutes(p_arrival_date date, p_arrival_time time without time zone, p_departure_date date, p_departure_time time without time zone);
drop function if exists public.echo_min_connect_minutes();
drop function if exists public.echo_max_connect_minutes();
drop function if exists public.echo_max_vias();
drop function if exists public.echo_tier_limit();
drop function if exists public.echo_max_party_size();

-- ---------------------------------------------------------------------
-- Indexes only the search read
-- ---------------------------------------------------------------------
drop index if exists public.mv_legs_pair_idx;
drop index if exists public.mv_legs_dest_idx;
drop index if exists public.flights_origin_dest_idx;
drop index if exists public.flights_dest_origin_idx;
drop index if exists public.aircraft_model_idx;

-- ---------------------------------------------------------------------
-- The division maps: only what can be drawn
-- ---------------------------------------------------------------------
drop function if exists public.division_arcs(text, integer);
drop materialized view if exists public.mv_division_arcs;

create materialized view public.mv_division_arcs as
select division_code, airport_a, airport_b, weekly_departures, carriers
  from (
    select p.division_code,
           p.airport_a,
           p.airport_b,
           sum(p.departures_per_week)::bigint    as weekly_departures,
           count(distinct p.airline_uid)::bigint as carriers,
           row_number() over (partition by p.division_code
                              order by sum(p.departures_per_week) desc, p.airport_a, p.airport_b) as rank
      from public.v_route_pairs p
     group by p.division_code, p.airport_a, p.airport_b
  ) ranked
 where rank <= 1000;

comment on materialized view public.mv_division_arcs is
    'Each division''s busiest 1,000 city pairs with the whole division''s weekly traffic on them -- the most division_arcs() will ever draw is 700. No colours or coordinates; both are joined on at read time.';

create index if not exists mv_division_arcs_traffic
    on public.mv_division_arcs (division_code, weekly_departures desc);

grant select on public.mv_division_arcs to anon, authenticated;

create or replace function public.division_arcs(
    p_division text,
    p_limit    integer default 700
)
returns table (
    origin_iata       text,
    destination_iata  text,
    division_code     text,
    weekly_departures bigint,
    carriers          bigint,
    origin_lat        double precision,
    origin_lon        double precision,
    dest_lat          double precision,
    dest_lon          double precision,
    accent_color      text
)
language sql stable parallel safe as $$
    select m.airport_a, m.airport_b, m.division_code,
           m.weekly_departures, m.carriers,
           o.latitude, o.longitude, x.latitude, x.longitude,
           coalesce(dv.accent_color, '#A855F7')
      from public.mv_division_arcs m
      join public.divisions dv on dv.division_code = m.division_code
      join public.airports  o  on o.iata_code = m.airport_a
      join public.airports  x  on x.iata_code = m.airport_b
     where m.division_code = lower(btrim(coalesce(p_division, '')))
       and o.latitude is not null
       and x.latitude is not null
     order by m.weekly_departures desc
     limit least(greatest(coalesce(p_limit, 700), 1), 1000);
$$;

comment on function public.division_arcs(text, integer) is
    'One division''s network, shaped like mv_network_arcs so the map can draw either without knowing the difference.';

grant execute on function public.division_arcs(text, integer) to anon, authenticated;

commit;

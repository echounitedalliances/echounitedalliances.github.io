-- =====================================================================
--  Echo United Alliances -- load the exported data
--
--  Uses psql's client-side \copy, so the CSVs are read from your machine and
--  no server-side file access is needed. Run from the repository root:
--
--      psql "$ECHO_DB_URL" -v ON_ERROR_STOP=1 -f database/sql/02_load_from_csv.sql
--
--  Re-runnable: every table is truncated first. Order matters for the foreign
--  keys; flights.child_stopover_flight_id is deferred to commit because a
--  stopover parent may be loaded before its child.
-- =====================================================================

begin;

set constraints all deferred;

truncate table
    public.flight_assignments,
    public.flights,
    public.aircraft,
    public.airline_stats,
    public.airline_liveries,
    public.airline_hubs,
    public.interline_agreements,
    public.airlines,
    public.divisions,
    public.aircraft_models,
    public.cabin_classes,
    public.airports
    restart identity cascade;

\copy public.airports (iata_code) from 'database/csv/airports.csv' with (format csv, header true)

\copy public.divisions (division_code, division_name, sort_order, alliance_uid, alliance_name, alliance_description, alliance_type, alliance_logo, alliance_logo_color, created_time, leader_uid) from 'database/csv/divisions.csv' with (format csv, header true, null '')

\copy public.airlines (uid, division_code, airline_code, carrier_code, airline_name, airline_slug, airline_country, airline_handle, flagship_aircraft_model, extra_special_livery_slot, version_string, claim_profit_time, is_division_leader) from 'database/csv/airlines.csv' with (format csv, header true, null '')
\copy public.airline_liveries (airline_uid, livery_type, brand_color, tail_color, fuselage_color, winglet_color, engine_color, tail_logo_type, tail_logo_color) from 'database/csv/airline_liveries.csv' with (format csv, header true, null '')

\copy public.airline_hubs (airline_uid, airport_iata, is_major_hub, hub_source) from 'database/csv/airline_hubs.csv' with (format csv, header true, null '')

\copy public.airline_stats (airline_uid, num_aircraft, num_routes, num_flights, flagship_aircraft_model, major_hub_iata, last_online_time) from 'database/csv/airline_stats.csv' with (format csv, header true, null '')

\copy public.aircraft_models (aircraft_model, manufacturer) from 'database/csv/aircraft_models.csv' with (format csv, header true, null '')

\copy public.cabin_classes (cabin_code, cabin_name, sort_order, source_key_prefix) from 'database/csv/cabin_classes.csv' with (format csv, header true)

\copy public.aircraft (aircraft_id, airline_uid, aircraft_model, registration, delivery_date, hub_airport_iata, eco_ratio, prem_eco_ratio, biz_ratio, first_ratio, eco_product, prem_eco_product, biz_product, first_product, eco_config_type, eco_pitch, prem_eco_pitch, biz_pitch, first_pitch, engine_option, winglet_option, eyemask_option, background_image_index, weekly_flight_time, is_placeholder) from 'database/csv/aircraft.csv' with (format csv, header true, null '')

\copy public.flights (flight_id, airline_uid, outbound_flight_number, inbound_flight_number, flight_string, origin_iata, destination_iata, departure_daily_seconds, departure_day_offset, departure_daily_seconds_raw, outbound_duration_minutes, inbound_duration_minutes, turnaround_offset_slots, is_stopover, child_stopover_flight_id) from 'database/csv/flights.csv' with (format csv, header true, null '')

\copy public.flight_assignments (flight_id, aircraft_id, operating_days_per_week, operating_days_mask, flight_profit, eco_price, prem_eco_price, biz_price, first_price, eco_seats, prem_eco_seats, biz_seats, first_seats, eco_weekly_seats, prem_eco_weekly_seats, biz_weekly_seats, first_weekly_seats) from 'database/csv/flight_assignments.csv' with (format csv, header true, null '')



-- ---------------------------------------------------------------------
-- Division identity.
--
-- The colours the group uses for itself. Change a value here and every
-- surface follows: division pages, carrier accents, the map arcs and the
-- directory filters.
--
-- 19_division_colours.sql sets the same values on an existing database, and
-- refreshes the two materialised views that cache them. Change both together.
-- ---------------------------------------------------------------------
update public.divisions set accent_color = v.accent
  from (values
    ('kyra',    '#7B35FF'),   -- violet
    ('aegis',   '#D0FF4D'),   -- chartreuse
    ('elysium', '#E46EFF'),   -- orchid
    ('proxima', '#81FBFE'),   -- pale cyan
    ('vilis',   '#FF7E42'),   -- orange
    ('rhea',    '#5DFE95'),   -- mint
    ('elion',   '#7EA0F4'),   -- periwinkle
    ('aura',    '#EF9D9E')    -- rose
  ) as v(code, accent)
 where divisions.division_code = v.code;

-- Carriers inherit their division's accent unless one is set by hand later.
update public.airlines a
   set accent_color = d.accent_color
  from public.divisions d
 where d.division_code = a.division_code
   and a.accent_color is null;

commit;

-- ---------------------------------------------------------------------
-- Post-load sanity. Every count below is printed by the deploy script; the
-- expected figures are in database/reports/build_report.md.
-- ---------------------------------------------------------------------
analyze;

select 'divisions'              as table_name, count(*) from public.divisions
union all select 'airlines',              count(*) from public.airlines
union all select 'airports',              count(*) from public.airports
union all select 'aircraft_models',       count(*) from public.aircraft_models
union all select 'aircraft',              count(*) from public.aircraft
union all select 'airline_hubs',          count(*) from public.airline_hubs
union all select 'airline_stats',         count(*) from public.airline_stats
union all select 'flights',               count(*) from public.flights
union all select 'flight_assignments',    count(*) from public.flight_assignments
order by table_name;

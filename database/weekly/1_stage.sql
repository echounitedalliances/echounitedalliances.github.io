-- =====================================================================
--  Weekly scrape, step 1 of 3: stage the fresh CSVs
--
--  Loads database/csv/*.csv into echo_stage.* -- a schema the site never
--  reads, revoked from anon and authenticated. The column lists are the ones
--  02_load_from_csv.sql uses, so what lands here is exactly what 02 would have
--  put into the live tables, without truncating anything to get there.
--
--  Run from the repository root (the \copy paths are relative), after
--  database/scripts/build_database.py. Nothing live changes in this step.
-- =====================================================================
\set ON_ERROR_STOP on

drop schema if exists echo_stage cascade;
create schema echo_stage;
revoke all on schema echo_stage from public, anon, authenticated;

create table echo_stage.airports             (like public.airports             including defaults);
create table echo_stage.divisions            (like public.divisions            including defaults);
create table echo_stage.airlines             (like public.airlines             including defaults);
create table echo_stage.airline_liveries     (like public.airline_liveries     including defaults);
create table echo_stage.airline_hubs         (like public.airline_hubs         including defaults);
create table echo_stage.airline_stats        (like public.airline_stats        including defaults);
create table echo_stage.aircraft_models      (like public.aircraft_models      including defaults);
create table echo_stage.cabin_classes        (like public.cabin_classes        including defaults);
create table echo_stage.aircraft             (like public.aircraft             including defaults);
create table echo_stage.flights              (like public.flights              including defaults);
create table echo_stage.flight_assignments   (like public.flight_assignments   including defaults);

\copy echo_stage.airports (iata_code) from 'database/csv/airports.csv' with (format csv, header true)
\copy echo_stage.divisions (division_code, division_name, sort_order, alliance_uid, alliance_name, alliance_description, alliance_type, alliance_logo, alliance_logo_color, created_time, leader_uid) from 'database/csv/divisions.csv' with (format csv, header true, null '')
\copy echo_stage.airlines (uid, division_code, airline_code, carrier_code, airline_name, airline_slug, airline_country, airline_handle, flagship_aircraft_model, extra_special_livery_slot, version_string, claim_profit_time, is_division_leader) from 'database/csv/airlines.csv' with (format csv, header true, null '')
\copy echo_stage.airline_liveries (airline_uid, livery_type, brand_color, tail_color, fuselage_color, winglet_color, engine_color, tail_logo_type, tail_logo_color) from 'database/csv/airline_liveries.csv' with (format csv, header true, null '')
\copy echo_stage.airline_hubs (airline_uid, airport_iata, is_major_hub, hub_source) from 'database/csv/airline_hubs.csv' with (format csv, header true, null '')
\copy echo_stage.airline_stats (airline_uid, num_aircraft, num_routes, num_flights, flagship_aircraft_model, major_hub_iata, last_online_time) from 'database/csv/airline_stats.csv' with (format csv, header true, null '')
\copy echo_stage.aircraft_models (aircraft_model, manufacturer) from 'database/csv/aircraft_models.csv' with (format csv, header true, null '')
\copy echo_stage.cabin_classes (cabin_code, cabin_name, sort_order, source_key_prefix) from 'database/csv/cabin_classes.csv' with (format csv, header true)
\copy echo_stage.aircraft (aircraft_id, airline_uid, aircraft_model, registration, delivery_date, hub_airport_iata, eco_ratio, prem_eco_ratio, biz_ratio, first_ratio, eco_product, prem_eco_product, biz_product, first_product, eco_config_type, eco_pitch, prem_eco_pitch, biz_pitch, first_pitch, engine_option, winglet_option, eyemask_option, background_image_index, weekly_flight_time, is_placeholder) from 'database/csv/aircraft.csv' with (format csv, header true, null '')
\copy echo_stage.flights (flight_id, airline_uid, outbound_flight_number, inbound_flight_number, flight_string, origin_iata, destination_iata, departure_daily_seconds, departure_day_offset, departure_daily_seconds_raw, outbound_duration_minutes, inbound_duration_minutes, turnaround_offset_slots, is_stopover, child_stopover_flight_id) from 'database/csv/flights.csv' with (format csv, header true, null '')
\copy echo_stage.flight_assignments (flight_id, aircraft_id, operating_days_per_week, operating_days_mask, flight_profit, eco_price, prem_eco_price, biz_price, first_price, eco_seats, prem_eco_seats, biz_seats, first_seats, eco_weekly_seats, prem_eco_weekly_seats, biz_weekly_seats, first_weekly_seats) from 'database/csv/flight_assignments.csv' with (format csv, header true, null '')

create unique index on echo_stage.airlines (uid);
create unique index on echo_stage.aircraft (aircraft_id);
create unique index on echo_stage.flights (flight_id);
create unique index on echo_stage.flight_assignments (flight_id, aircraft_id);
create unique index on echo_stage.airports (iata_code);
analyze echo_stage.airlines; analyze echo_stage.aircraft; analyze echo_stage.flights;
analyze echo_stage.flight_assignments; analyze echo_stage.airports;

select 'airlines' t, count(*) from echo_stage.airlines
union all select 'airports', count(*) from echo_stage.airports
union all select 'aircraft', count(*) from echo_stage.aircraft
union all select 'flights', count(*) from echo_stage.flights
union all select 'flight_assignments', count(*) from echo_stage.flight_assignments
union all select 'airline_hubs', count(*) from echo_stage.airline_hubs
union all select 'airline_liveries', count(*) from echo_stage.airline_liveries
union all select 'airline_stats', count(*) from echo_stage.airline_stats
union all select 'divisions', count(*) from echo_stage.divisions
union all select 'aircraft_models', count(*) from echo_stage.aircraft_models
union all select 'cabin_classes', count(*) from echo_stage.cabin_classes;

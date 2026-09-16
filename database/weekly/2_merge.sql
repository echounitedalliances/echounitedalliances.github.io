-- =====================================================================
--  Weekly scrape, step 2 of 3: merge echo_stage into the live tables
--
--  WHY THIS EXISTS INSTEAD OF 02_load_from_csv.sql
--
--  02 empties the game tables with TRUNCATE ... CASCADE before reloading them.
--  On a database people use, cascade walks the foreign keys straight into
--  their data. Measured on 16 September 2026, it would have emptied:
--
--      resonants            every account, both admins included   (via divisions)
--      bookings, booking_segments, passengers, tickets             (via cabin_classes)
--      departure_inventory  every seat already sold                (via cabin_classes)
--      member_site_airlines the 18 member-site buttons             (via airlines)
--
--  02 is still right for building an empty database. It must never be run
--  against the live one again, and deploy.ps1 now refuses to.
--
--  THE APPROACH
--
--  Every game table is keyed on the game's own stable identifier -- airline
--  uid, flight and aircraft uuid, IATA code -- so the scrape can be merged in
--  place: insert what is new, update what changed, delete what left. A booking
--  that points at flight X still points at flight X afterwards, because X was
--  updated rather than deleted and recreated. The site stays up throughout and
--  sees the old data until the single commit at the end.
--
--  WHAT LEFT, BUT A TRAVELLER STILL HOLDS
--
--  A player can delete a flight somebody has already booked, or leave the
--  alliance with bookings outstanding. booking_segments refuses to let those
--  rows go (its foreign keys have no ON DELETE), and it is right to: the
--  booking should still show what was bought. So those rows are RETIRED, not
--  deleted:
--
--      flight     keeps its row, loses its assignments -- and mv_leg_departures
--                 inner-joins assignments, so it can no longer be searched,
--                 shown on a board or sold again
--      aircraft   keeps its row, marked is_placeholder so it stops counting
--                 towards a fleet
--      airline    keeps its row, unpublished; its carrier_code moves to the
--                 E00001 series and its slug to '~<uid>', so a newcomer can use
--                 both. The booking is unaffected: it stores its own
--                 designator and carrier.
--
--  Everything below runs in one transaction. If any statement fails, nothing
--  has changed.
-- =====================================================================
\set ON_ERROR_STOP on

begin;

set constraints all deferred;

-- ---------------------------------------------------------------------
--  0. Refuse a scrape that looks partial
--
--  An expired token or an unreachable roster part-way through produces a
--  staging set with most of the group missing. The merge would read that as a
--  mass departure and delete their schedules. A real week has never moved
--  more than a few percent.
-- ---------------------------------------------------------------------
do $guard$
declare
    live_air  bigint := (select count(*) from public.airlines where is_published);
    stage_air bigint := (select count(*) from echo_stage.airlines);
    live_fl   bigint := (select count(*) from public.flights);
    stage_fl  bigint := (select count(*) from echo_stage.flights);
    stage_div bigint := (select count(*) from echo_stage.divisions);
begin
    if stage_div <> 8 then
        raise exception 'echo_stage has % divisions, expected 8', stage_div;
    end if;
    if stage_air < live_air * 0.85 then
        raise exception 'echo_stage has % airlines against % live -- that is a partial scrape, not a week of departures. Nothing merged.', stage_air, live_air;
    end if;
    if stage_fl < live_fl * 0.85 then
        raise exception 'echo_stage has % flights against % live -- that is a partial scrape. Nothing merged.', stage_fl, live_fl;
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
--  1. Decide what is leaving, and what of that a booking still holds,
--     before anything moves.
-- ---------------------------------------------------------------------
create temp table departing_airlines on commit drop as
select p.uid from public.airlines p
 where not exists (select 1 from echo_stage.airlines s where s.uid = p.uid);

create temp table departing_flights on commit drop as
select p.flight_id from public.flights p
 where not exists (select 1 from echo_stage.flights s where s.flight_id = p.flight_id);

create temp table departing_aircraft on commit drop as
select p.aircraft_id from public.aircraft p
 where not exists (select 1 from echo_stage.aircraft s where s.aircraft_id = p.aircraft_id);

create temp table kept_flights on commit drop as
select distinct bs.flight_id from public.booking_segments bs
  join departing_flights d using (flight_id);

create temp table kept_aircraft on commit drop as
select distinct bs.aircraft_id from public.booking_segments bs
  join departing_aircraft d using (aircraft_id);

-- A departing airline is kept if a booking names it, or owns a flight or an
-- aircraft that is being kept -- deleting it would cascade to those.
create temp table kept_airlines on commit drop as
select distinct x.uid from (
    select bs.operating_airline_uid as uid from public.booking_segments bs
    union select f.airline_uid from public.flights  f join kept_flights  k using (flight_id)
    union select a.airline_uid from public.aircraft a join kept_aircraft k using (aircraft_id)
) x
 where x.uid in (select uid from departing_airlines);

-- Where each carrier sat before, for its colour below.
create temp table prior_airlines on commit drop as
select uid, division_code, accent_color from public.airlines;

-- ---------------------------------------------------------------------
--  2. Reference data. Added to, never deleted from: airports, divisions and
--     aircraft models are all named by rows that have to keep resolving.
-- ---------------------------------------------------------------------
insert into public.airports (iata_code)
select iata_code from echo_stage.airports
on conflict (iata_code) do nothing;

-- sort_order is group policy (16_division_policy) and accent_color is the
-- group's palette (19_division_colours). Neither comes from the game.
update public.divisions d
   set division_name        = s.division_name,
       alliance_uid         = s.alliance_uid,
       alliance_name        = s.alliance_name,
       alliance_description = s.alliance_description,
       alliance_type        = s.alliance_type,
       alliance_logo        = s.alliance_logo,
       alliance_logo_color  = s.alliance_logo_color,
       created_time         = s.created_time,
       leader_uid           = s.leader_uid
  from echo_stage.divisions s
 where s.division_code = d.division_code;

insert into public.cabin_classes (cabin_code, cabin_name, sort_order, source_key_prefix)
select cabin_code, cabin_name, sort_order, source_key_prefix from echo_stage.cabin_classes
on conflict (cabin_code) do update
   set cabin_name = excluded.cabin_name,
       sort_order = excluded.sort_order,
       source_key_prefix = excluded.source_key_prefix;

insert into public.aircraft_models (aircraft_model, manufacturer)
select aircraft_model, manufacturer from echo_stage.aircraft_models
on conflict (aircraft_model) do update set manufacturer = excluded.manufacturer;

-- ---------------------------------------------------------------------
--  3. Airlines
--
--  carrier_code and (division_code, airline_slug) are unique and NOT
--  deferrable, so an airline taking a code another still holds fails on the
--  row, not at commit. Two phases get round it: everything that is changing
--  or leaving first moves to a value no one else can have, and only then
--  does anyone take their new one.
-- ---------------------------------------------------------------------
--  The value they move to has to satisfy carrier_code's own check,
--  ^[A-Z0-9]{2,6}$, so it cannot simply be marked with a symbol. It does not
--  need to be: every division tag (PX AG AU EN EY KY VH VS) contains a letter
--  that is not a hex digit, and a real code of four or more characters always
--  has its tag in positions 3-4. So a code with DIGITS there is one the
--  assigner can never produce, and two series of them are free to use:
--
--      F00001...  transient: vacates a code, replaced before commit
--      E00001...  permanent: a retired airline that a booking still names
--
--  Slugs have no such check, and slugify turns '~' into '_', so '~<uid>' is
--  equally out of reach of any real slug.
with departing as (
    select a.uid, (a.uid in (select uid from kept_airlines)) as kept,
           row_number() over (partition by (a.uid in (select uid from kept_airlines))
                              order by a.uid) as n
      from public.airlines a
     where a.uid in (select uid from departing_airlines)
       -- Already retired in an earlier week: leave its code where it is.
       and a.carrier_code !~ '^E[0-9]{5}$'
),
retired_max as (
    select coalesce(max(substr(carrier_code, 2)::int), 0) as m
      from public.airlines where carrier_code ~ '^E[0-9]{5}$'
)
update public.airlines a
   set carrier_code = case when d.kept then 'E' || lpad((rm.m + d.n)::text, 5, '0')
                           else 'F' || lpad(d.n::text, 5, '0') end,
       airline_slug = '~' || a.uid::text,
       is_published = false
  from departing d, retired_max rm
 where d.uid = a.uid;

update public.airlines a
   set is_published = false
 where a.uid in (select uid from departing_airlines);

with changing as (
    select a.uid,
           -- Numbered after the departing airlines' transient codes, so the
           -- two sets cannot collide with each other either.
           (select count(*) from departing_airlines) + row_number() over (order by a.uid) as n
      from public.airlines a
      join echo_stage.airlines s using (uid)
     where a.carrier_code  is distinct from s.carrier_code
        or a.airline_slug  is distinct from s.airline_slug
        or a.division_code is distinct from s.division_code
)
update public.airlines a
   set carrier_code = 'F' || lpad(c.n::text, 5, '0'),
       airline_slug = '~' || a.uid::text
  from changing c
 where c.uid = a.uid;

-- Only the columns the game owns. website_url, booking_url, description_md
-- and logo_path are editorial and are not in this list, so an edit made on
-- the site survives the weekly scrape instead of being wiped by it.
insert into public.airlines
       (uid, division_code, airline_code, carrier_code, airline_name, airline_slug,
        airline_country, airline_handle, flagship_aircraft_model, extra_special_livery_slot,
        version_string, claim_profit_time, is_division_leader, is_published)
select uid, division_code, airline_code, carrier_code, airline_name, airline_slug,
       airline_country, airline_handle, flagship_aircraft_model, extra_special_livery_slot,
       version_string, claim_profit_time, is_division_leader, true
  from echo_stage.airlines
on conflict (uid) do update
   set division_code             = excluded.division_code,
       airline_code              = excluded.airline_code,
       carrier_code              = excluded.carrier_code,
       airline_name              = excluded.airline_name,
       airline_slug              = excluded.airline_slug,
       airline_country           = excluded.airline_country,
       airline_handle            = excluded.airline_handle,
       flagship_aircraft_model   = excluded.flagship_aircraft_model,
       extra_special_livery_slot = excluded.extra_special_livery_slot,
       version_string            = excluded.version_string,
       claim_profit_time         = excluded.claim_profit_time,
       is_division_leader        = excluded.is_division_leader,
       is_published              = true
 where (airlines.division_code, airlines.airline_code, airlines.carrier_code, airlines.airline_name,
        airlines.airline_slug, airlines.airline_country, airlines.airline_handle,
        airlines.flagship_aircraft_model, airlines.extra_special_livery_slot,
        airlines.version_string, airlines.claim_profit_time, airlines.is_division_leader,
        airlines.is_published)
       is distinct from
       (excluded.division_code, excluded.airline_code, excluded.carrier_code, excluded.airline_name,
        excluded.airline_slug, excluded.airline_country, excluded.airline_handle,
        excluded.flagship_aircraft_model, excluded.extra_special_livery_slot,
        excluded.version_string, excluded.claim_profit_time, excluded.is_division_leader,
        true);

-- A new carrier takes its division's colour. One the game moved takes its new
-- division's -- but only if it was still wearing the old one, the same guard
-- 19_division_colours and 29_airline_division_moves use.
update public.airlines a
   set accent_color = dnew.accent_color
  from public.divisions dnew
 where dnew.division_code = a.division_code
   and a.uid in (select uid from echo_stage.airlines)
   and (a.accent_color is null
        or exists (select 1
                     from prior_airlines p
                     join public.divisions dold on dold.division_code = p.division_code
                    where p.uid = a.uid
                      and p.division_code <> a.division_code
                      and upper(a.accent_color) = upper(dold.accent_color)));

-- ---------------------------------------------------------------------
--  4. What hangs off an airline and nothing else points at: replaced whole.
--     Inside the transaction, so readers see the old set until commit.
-- ---------------------------------------------------------------------
delete from public.airline_hubs;
insert into public.airline_hubs (airline_uid, airport_iata, is_major_hub, hub_source)
select airline_uid, airport_iata, is_major_hub, hub_source from echo_stage.airline_hubs;

delete from public.airline_stats;
insert into public.airline_stats (airline_uid, num_aircraft, num_routes, num_flights,
                                  flagship_aircraft_model, major_hub_iata, last_online_time)
select airline_uid, num_aircraft, num_routes, num_flights,
       flagship_aircraft_model, major_hub_iata, last_online_time
  from echo_stage.airline_stats;

-- Liveries are HELD BACK, on the owner's instruction of 16 September 2026, and
-- this merge deliberately leaves public.airline_liveries as it finds it. The
-- scraper still fetches livery.json and build_database.py still stages it, so
-- nothing is lost and turning them back on is only restoring the four lines
-- below. A departing airline's livery row still goes with it, by cascade.
--
-- For whoever turns them back on: they were suspected of growing the
-- database, and did not -- all 583 are 176 kB in Postgres and 2 MB on disk.
-- The growth that week was the scraper writing indented JSON. Nothing on the
-- site reads them either: only v_airline_accent does, and nothing reads that.
--
--   delete from public.airline_liveries;
--   insert into public.airline_liveries (airline_uid, livery_type, brand_color, tail_color,
--       fuselage_color, winglet_color, engine_color, tail_logo_type, tail_logo_color)
--   select airline_uid, livery_type, brand_color, tail_color, fuselage_color,
--          winglet_color, engine_color, tail_logo_type, tail_logo_color
--     from echo_stage.airline_liveries;

-- ---------------------------------------------------------------------
--  5. Aircraft, flights, and which aircraft flies what
-- ---------------------------------------------------------------------
insert into public.aircraft
       (aircraft_id, airline_uid, aircraft_model, registration, delivery_date, hub_airport_iata,
        eco_ratio, prem_eco_ratio, biz_ratio, first_ratio,
        eco_product, prem_eco_product, biz_product, first_product,
        eco_config_type, eco_pitch, prem_eco_pitch, biz_pitch, first_pitch,
        engine_option, winglet_option, eyemask_option, background_image_index,
        weekly_flight_time, is_placeholder)
select aircraft_id, airline_uid, aircraft_model, registration, delivery_date, hub_airport_iata,
       eco_ratio, prem_eco_ratio, biz_ratio, first_ratio,
       eco_product, prem_eco_product, biz_product, first_product,
       eco_config_type, eco_pitch, prem_eco_pitch, biz_pitch, first_pitch,
       engine_option, winglet_option, eyemask_option, background_image_index,
       weekly_flight_time, is_placeholder
  from echo_stage.aircraft
on conflict (aircraft_id) do update
   set airline_uid = excluded.airline_uid, aircraft_model = excluded.aircraft_model,
       registration = excluded.registration, delivery_date = excluded.delivery_date,
       hub_airport_iata = excluded.hub_airport_iata,
       eco_ratio = excluded.eco_ratio, prem_eco_ratio = excluded.prem_eco_ratio,
       biz_ratio = excluded.biz_ratio, first_ratio = excluded.first_ratio,
       eco_product = excluded.eco_product, prem_eco_product = excluded.prem_eco_product,
       biz_product = excluded.biz_product, first_product = excluded.first_product,
       eco_config_type = excluded.eco_config_type, eco_pitch = excluded.eco_pitch,
       prem_eco_pitch = excluded.prem_eco_pitch, biz_pitch = excluded.biz_pitch,
       first_pitch = excluded.first_pitch, engine_option = excluded.engine_option,
       winglet_option = excluded.winglet_option, eyemask_option = excluded.eyemask_option,
       background_image_index = excluded.background_image_index,
       weekly_flight_time = excluded.weekly_flight_time, is_placeholder = excluded.is_placeholder
 -- Unchanged rows are left alone: no rewrite, no row lock held on a flight
 -- somebody is booking while this transaction runs.
 where (aircraft.*) is distinct from (excluded.*);

insert into public.flights
       (flight_id, airline_uid, outbound_flight_number, inbound_flight_number, flight_string,
        origin_iata, destination_iata, departure_daily_seconds, departure_day_offset,
        departure_daily_seconds_raw, outbound_duration_minutes, inbound_duration_minutes,
        turnaround_offset_slots, is_stopover, child_stopover_flight_id)
select flight_id, airline_uid, outbound_flight_number, inbound_flight_number, flight_string,
       origin_iata, destination_iata, departure_daily_seconds, departure_day_offset,
       departure_daily_seconds_raw, outbound_duration_minutes, inbound_duration_minutes,
       turnaround_offset_slots, is_stopover, child_stopover_flight_id
  from echo_stage.flights
on conflict (flight_id) do update
   set airline_uid = excluded.airline_uid,
       outbound_flight_number = excluded.outbound_flight_number,
       inbound_flight_number = excluded.inbound_flight_number,
       flight_string = excluded.flight_string,
       origin_iata = excluded.origin_iata, destination_iata = excluded.destination_iata,
       departure_daily_seconds = excluded.departure_daily_seconds,
       departure_day_offset = excluded.departure_day_offset,
       departure_daily_seconds_raw = excluded.departure_daily_seconds_raw,
       outbound_duration_minutes = excluded.outbound_duration_minutes,
       inbound_duration_minutes = excluded.inbound_duration_minutes,
       turnaround_offset_slots = excluded.turnaround_offset_slots,
       is_stopover = excluded.is_stopover,
       child_stopover_flight_id = excluded.child_stopover_flight_id
 -- Unchanged rows are left alone: no rewrite, no row lock held on a flight
 -- somebody is booking while this transaction runs.
 where (flights.*) is distinct from (excluded.*);

-- Assignments nothing points at, so the ones that went are simply deleted.
-- This is also what retires a kept flight: without an assignment it has no
-- leg, and without a leg it cannot be found or sold.
delete from public.flight_assignments p
 where not exists (select 1 from echo_stage.flight_assignments s
                    where s.flight_id = p.flight_id and s.aircraft_id = p.aircraft_id);

insert into public.flight_assignments
       (flight_id, aircraft_id, operating_days_per_week, operating_days_mask, flight_profit,
        eco_price, prem_eco_price, biz_price, first_price,
        eco_seats, prem_eco_seats, biz_seats, first_seats,
        eco_weekly_seats, prem_eco_weekly_seats, biz_weekly_seats, first_weekly_seats)
select flight_id, aircraft_id, operating_days_per_week, operating_days_mask, flight_profit,
       eco_price, prem_eco_price, biz_price, first_price,
       eco_seats, prem_eco_seats, biz_seats, first_seats,
       eco_weekly_seats, prem_eco_weekly_seats, biz_weekly_seats, first_weekly_seats
  from echo_stage.flight_assignments
on conflict (flight_id, aircraft_id) do update
   set operating_days_per_week = excluded.operating_days_per_week,
       operating_days_mask = excluded.operating_days_mask,
       flight_profit = excluded.flight_profit,
       eco_price = excluded.eco_price, prem_eco_price = excluded.prem_eco_price,
       biz_price = excluded.biz_price, first_price = excluded.first_price,
       eco_seats = excluded.eco_seats, prem_eco_seats = excluded.prem_eco_seats,
       biz_seats = excluded.biz_seats, first_seats = excluded.first_seats,
       eco_weekly_seats = excluded.eco_weekly_seats,
       prem_eco_weekly_seats = excluded.prem_eco_weekly_seats,
       biz_weekly_seats = excluded.biz_weekly_seats,
       first_weekly_seats = excluded.first_weekly_seats
 -- Unchanged rows are left alone: no rewrite, no row lock held on a flight
 -- somebody is booking while this transaction runs.
 where (flight_assignments.*) is distinct from (excluded.*);

-- ---------------------------------------------------------------------
--  6. Retire what a booking holds; delete the rest of what left
-- ---------------------------------------------------------------------
update public.flights f set child_stopover_flight_id = null
 where f.flight_id in (select flight_id from kept_flights);

update public.aircraft a set is_placeholder = true
 where a.aircraft_id in (select aircraft_id from kept_aircraft);

delete from public.flights f
 where f.flight_id in (select flight_id from departing_flights)
   and f.flight_id not in (select flight_id from kept_flights);

delete from public.aircraft a
 where a.aircraft_id in (select aircraft_id from departing_aircraft)
   and a.aircraft_id not in (select aircraft_id from kept_aircraft);

-- Cascades to what is left of their hubs, liveries and member-site rows.
-- airline_overrides has no foreign key on purpose, so an admin's edit to a
-- carrier that leaves is still there if it comes back.
delete from public.airlines a
 where a.uid in (select uid from departing_airlines)
   and a.uid not in (select uid from kept_airlines);

-- ---------------------------------------------------------------------
--  7. Admin edits back on top: names, descriptions, division moves
-- ---------------------------------------------------------------------
select public.echo_apply_airline_overrides() as overrides_reapplied;

-- ---------------------------------------------------------------------
--  8. What happened, for the log
-- ---------------------------------------------------------------------
select 'airlines joined'   as what, count(*) as n from echo_stage.airlines s
 where not exists (select 1 from prior_airlines p where p.uid = s.uid)
union all select 'airlines departed',              count(*) from departing_airlines
union all select 'airlines retired, booking held', count(*) from kept_airlines
union all select 'flights retired, booking held',  count(*) from kept_flights
union all select 'aircraft retired, booking held', count(*) from kept_aircraft
union all select 'airlines now published',         count(*) from public.airlines where is_published
union all select 'flights now',                    count(*) from public.flights
union all select 'assignments now',                count(*) from public.flight_assignments
union all select 'aircraft now',                   count(*) from public.aircraft
union all select 'resonants (must be unchanged)',  count(*) from public.resonants
union all select 'bookings (must be unchanged)',   count(*) from public.bookings
union all select 'booking_segments (must be unchanged)', count(*) from public.booking_segments
union all select 'member_site_airlines (must be 18)', count(*) from public.member_site_airlines;

commit;

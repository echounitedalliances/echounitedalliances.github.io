-- =====================================================================
--  One-off, 22 September 2026: bring sold segments into line with the
--  corrected schedule. Run with psql from the repository root:
--
--      psql ... -v commit=0 -f database/fixes/2026-09-22_booking_times.sql   (dry run)
--      psql ... -v commit=1 -f database/fixes/2026-09-22_booking_times.sql
--
--  Two corrections, both to what a traveller's booking says, neither to what
--  they paid.
--
--  1. RETURN LEGS SOLD UNDER THE FLAT 60-MINUTE TURNAROUND.
--     31_turnaround_by_distance.sql moved every return leg over 1,500 km 30,
--     60 or 90 minutes later. Segments already sold kept the old, early time.
--     Each is corrected to the schedule -- but only where the schedule differs
--     from what was sold by exactly the turnaround correction, so a flight a
--     player has since retimed for their own reasons is not swept up in it.
--     Where the later time crosses midnight the departure is the next day's,
--     so the travel date moves with it and the seat moves to that departure.
--
--  2. THE ARRIVAL DAY. Every segment ever sold said it arrives the same day:
--     arrival_days_after is NOT NULL DEFAULT 0, so the trigger's coalesce()
--     never saw a null to fill from the schedule (33_segment_arrival_day.sql
--     fixes that for new sales). Segments whose times still match the
--     schedule take its arrival day.
--
--  Idempotent: once corrected, a segment's times equal the schedule's, which
--  neither condition matches, so a second run changes nothing.
--
--  A segment on a flight its airline has dropped altogether -- kept in the
--  database only because the booking points at it -- has no schedule to be
--  corrected to. It is listed, and left alone.
-- =====================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------
--  1. The return legs
-- ---------------------------------------------------------------------

create temp table fix on commit drop as
select bs.segment_id, bs.booking_id, bs.flight_id, bs.aircraft_id, bs.direction,
       bs.cabin_code,
       bs.travel_date                                       as old_date,
       -- 30 to 90 minutes later can only carry it past midnight, never further.
       bs.travel_date + (l.departure_time < bs.departure_time)::int
                                                            as new_date,
       l.departure_time, l.arrival_time,
       l.arrival_days_after_departure                       as arrival_days_after,
       (select greatest(count(*), 1) from public.passengers p
         where p.booking_id = bs.booking_id)                as seats
  from public.booking_segments bs
  join public.flights  f on f.flight_id  = bs.flight_id
  join public.airports o on o.iata_code  = f.origin_iata
  join public.airports d on d.iata_code  = f.destination_iata
  join public.mv_leg_departures l
    on l.flight_id = bs.flight_id and l.aircraft_id = bs.aircraft_id
   and l.direction = bs.direction
 where bs.direction = 'INBOUND'
   and bs.travel_date >= current_date
   and ((extract(epoch from (l.departure_time - bs.departure_time))::int / 60) % 1440 + 1440) % 1440
       = public.echo_turnaround_base_minutes(
             public.echo_route_km(o.latitude, o.longitude, d.latitude, d.longitude)) - 60
   and public.echo_turnaround_base_minutes(
             public.echo_route_km(o.latitude, o.longitude, d.latitude, d.longitude)) > 60;

-- The segment trigger refuses a date the leg does not fly, and one refusal
-- would abort everything. None is expected; set any aside and list it.
create temp table fix_skipped on commit drop as
select * from fix x
 where not public.echo_flight_operates_on(x.flight_id, x.aircraft_id, x.direction, x.new_date);
delete from fix x using fix_skipped s where x.segment_id = s.segment_id;

-- The seat follows a departure that moved to the next day: given back on the
-- old date, taken on the new one, exactly as the release and take triggers in
-- 06_inventory.sql do it.
update public.departure_inventory di
   set booked_seats = greatest(0, di.booked_seats - x.seats),
       sold_out_at  = null
  from fix x
 where x.new_date <> x.old_date
   and di.flight_id = x.flight_id and di.aircraft_id = x.aircraft_id
   and di.direction = x.direction and di.travel_date = x.old_date
   and di.cabin_code = x.cabin_code;

select public.echo_seed_departure(x.flight_id, x.aircraft_id, x.direction, x.new_date, x.cabin_code)
  from fix x where x.new_date <> x.old_date;

update public.departure_inventory di
   set simulated_seats_sold = greatest(0, di.simulated_seats_sold
                                  - greatest(0, x.seats - (di.capacity_seats - di.simulated_seats_sold - di.booked_seats))),
       booked_seats = di.booked_seats + x.seats,
       sold_out_at  = case
           when greatest(0, di.simulated_seats_sold
                   - greatest(0, x.seats - (di.capacity_seats - di.simulated_seats_sold - di.booked_seats)))
                + di.booked_seats + x.seats >= di.capacity_seats
           then now() else di.sold_out_at end
  from fix x
 where x.new_date <> x.old_date
   and di.flight_id = x.flight_id and di.aircraft_id = x.aircraft_id
   and di.direction = x.direction and di.travel_date = x.new_date
   and di.cabin_code = x.cabin_code;

-- The before-write trigger checks the new date is one the leg flies, and
-- keeps these explicit values rather than refilling them.
update public.booking_segments bs
   set travel_date        = x.new_date,
       departure_time     = x.departure_time,
       arrival_time       = x.arrival_time,
       arrival_days_after = x.arrival_days_after
  from fix x
 where bs.segment_id = x.segment_id;

-- ---------------------------------------------------------------------
--  2. The arrival day, wherever the times still match the schedule
-- ---------------------------------------------------------------------

create temp table arrival_fix on commit drop as
select bs.segment_id, l.arrival_days_after_departure as arrival_days_after
  from public.booking_segments bs
  join public.mv_leg_departures l
    on l.flight_id = bs.flight_id and l.aircraft_id = bs.aircraft_id
   and l.direction = bs.direction
 where bs.departure_time = l.departure_time
   and bs.arrival_time   = l.arrival_time
   and bs.arrival_days_after is distinct from l.arrival_days_after_departure
   and bs.segment_id not in (select segment_id from fix)
   -- the trigger re-checks the date on any update; a past segment on a flight
   -- since moved to other weekdays would be refused and abort the lot
   and public.echo_flight_operates_on(bs.flight_id, bs.aircraft_id, bs.direction, bs.travel_date);

update public.booking_segments bs
   set arrival_days_after = a.arrival_days_after
  from arrival_fix a
 where bs.segment_id = a.segment_id;

update public.bookings b
   set updated_at = now()
 where b.booking_id in (select booking_id from fix
                        union
                        select bs.booking_id from public.booking_segments bs
                         where bs.segment_id in (select segment_id from arrival_fix));

-- ---------------------------------------------------------------------
--  What happened. No booking references: these land in a terminal log.
-- ---------------------------------------------------------------------

select 'return segments retimed'           as what, count(*) as n from fix
union all select '... of them moved to the next day', count(*) from fix where new_date <> old_date
union all select 'bookings they belong to',           count(distinct booking_id) from fix
union all select 'set aside: new date not flown (expected 0)', count(*) from fix_skipped
union all select 'arrival days corrected elsewhere',  count(*) from arrival_fix
union all select 'segments still out of step (no schedule to follow)', count(*)
  from public.booking_segments bs
 where bs.travel_date >= current_date
   and not exists (select 1 from public.mv_leg_departures l
                    where l.flight_id = bs.flight_id and l.aircraft_id = bs.aircraft_id
                      and l.direction = bs.direction);

select bs.flight_designator, bs.origin_iata || '-' || bs.destination_iata as route,
       bs.travel_date, bs.departure_time
  from public.booking_segments bs
 where bs.travel_date >= current_date
   and not exists (select 1 from public.mv_leg_departures l
                    where l.flight_id = bs.flight_id and l.aircraft_id = bs.aircraft_id
                      and l.direction = bs.direction);

\if :commit
commit;
\else
rollback;
\echo 'DRY RUN -- rolled back, nothing changed.'
\endif

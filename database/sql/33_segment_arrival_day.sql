-- =====================================================================
--  Echo United Alliances -- a sold segment arrives on the right day
--
--  booking_segments.arrival_days_after is NOT NULL DEFAULT 0, and the
--  before-write trigger in 05_reservations.sql filled it with
--  coalesce(new.arrival_days_after, <the schedule's>) -- which never sees a
--  null, because the column default gets there first. create_booking passes
--  no value of its own, so every segment ever sold said it arrives the same
--  day, overnight flights included: the Trips page dropped the +1 and sorted
--  those trips by an arrival a day too early. Found 22 September 2026; the
--  segments already sold were put right by
--  database/fixes/2026-09-22_booking_times.sql.
--
--  On INSERT the schedule now decides. Nothing that inserts a segment has a
--  value of its own to pass, and on UPDATE the stored value stands: a sold
--  booking keeps what it was sold with.
--
--  Same function, same trigger. Supersedes echo_segment_before_write in
--  05_reservations.sql; run this after it if that file is ever re-run.
-- =====================================================================

begin;

create or replace function public.echo_segment_before_write()
returns trigger language plpgsql as $$
declare
    v_leg record;
begin
    if not public.echo_flight_operates_on(new.flight_id, new.aircraft_id,
                                          new.direction, new.travel_date) then
        raise exception 'flight % (% %) does not operate on %',
            new.flight_id, new.aircraft_id, new.direction, new.travel_date;
    end if;

    -- Fill the denormalised columns from the schedule as it stands right now.
    select d.carrier_code, d.airline_uid, d.flight_designator, d.origin_iata,
           d.destination_iata, d.departure_time, d.arrival_time,
           d.arrival_days_after_departure, d.price_usd
      into v_leg
      from public.v_bookable_departures d
     where d.flight_id = new.flight_id and d.aircraft_id = new.aircraft_id
       and d.direction = new.direction and d.cabin_code = new.cabin_code
       and public.echo_operates_on(d.departure_days_mask,
                                   (extract(isodow from new.travel_date)::int - 1))
     limit 1;

    if found then
        new.marketing_carrier_code := coalesce(new.marketing_carrier_code, v_leg.carrier_code);
        new.operating_airline_uid  := coalesce(new.operating_airline_uid, v_leg.airline_uid);
        new.flight_designator      := coalesce(new.flight_designator, v_leg.flight_designator);
        new.origin_iata            := coalesce(new.origin_iata, v_leg.origin_iata);
        new.destination_iata       := coalesce(new.destination_iata, v_leg.destination_iata);
        new.departure_time         := coalesce(new.departure_time, v_leg.departure_time);
        new.arrival_time           := coalesce(new.arrival_time, v_leg.arrival_time);
        -- Not coalesce: the column is never null here, so that kept the 0.
        if tg_op = 'INSERT' then
            new.arrival_days_after := coalesce(v_leg.arrival_days_after_departure,
                                               new.arrival_days_after);
        end if;
        if new.price_usd = 0 then
            new.price_usd := v_leg.price_usd;
        end if;
    end if;
    return new;
end;
$$;

commit;

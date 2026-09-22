-- =====================================================================
--  Echo United Alliances -- one timetable line per service you can tell apart
--
--  airline_timetable() returned a line per airframe. Asilat flies LREY 109
--  SYD-SIN at 18:30 every day of the week on four different A380s, so its
--  timetable listed LREY 109 four times: identical in every column a
--  traveller can see, each lit on a different handful of days. Reported
--  22 September 2026.
--
--  Lines now fold together when everything the timetable shows is the same --
--  flight number, route, departure, arrival and its day, block time, aircraft
--  type and fare -- and their days are unioned. Where anything shown differs
--  (another type on Sundays, another fare) the line stays separate, because
--  then there is something to tell apart.
--
--  business_price is returned but not shown on the timetable, so it does not
--  split a line; a folded line carries the lowest of its rows.
--
--  Folding also keeps a big carrier under the PostgREST row cap that
--  21_timetable_pair.sql describes: the same services, in fewer lines.
--
--  Same signature and columns as 21_timetable_pair.sql, which this replaces;
--  its grants carry over.
-- =====================================================================

begin;

create or replace function public.airline_timetable(
    p_uid       uuid,
    p_airport   text default null,
    p_pair_with text default null
)
returns table (
    flight_designator text,
    origin_iata       text,
    destination_iata  text,
    departure_time    time,
    arrival_time      time,
    arrival_days_after integer,
    duration_minutes  integer,
    aircraft_model    text,
    days              integer[],
    economy_price     integer,
    business_price    integer
)
language sql stable parallel safe as $$
    select t.designator, t.origin, t.destination,
           t.dep, t.arr, t.arr_days,
           t.minutes, t.model,
           public.echo_mask_days(bit_or(t.mask)),
           t.economy, min(t.business)
      from (
        select a.carrier_code || ' ' ||
                 case when l.direction = 'OUTBOUND' then f.outbound_flight_number
                      else f.inbound_flight_number end   as designator,
               l.origin_iata                             as origin,
               l.destination_iata                        as destination,
               l.departure_time                          as dep,
               l.arrival_time                            as arr,
               l.arrival_days_after_departure            as arr_days,
               l.duration_minutes                        as minutes,
               ac.aircraft_model                         as model,
               l.departure_days_mask                     as mask,
               l.economy_price                           as economy,
               l.business_price                          as business
          from public.mv_leg_departures l
          join public.airlines a  on a.uid = l.airline_uid
          join public.aircraft ac on ac.aircraft_id = l.aircraft_id
          join public.flights  f  on f.flight_id = l.flight_id
         where l.airline_uid = p_uid
           and case
                 -- a route: both directions of one pair
                 when nullif(btrim(coalesce(p_pair_with, '')), '') is not null
                      and nullif(btrim(coalesce(p_airport, '')), '') is not null then
                   (l.origin_iata = upper(btrim(p_airport))
                      and l.destination_iata = upper(btrim(p_pair_with)))
                   or (l.origin_iata = upper(btrim(p_pair_with))
                      and l.destination_iata = upper(btrim(p_airport)))
                 -- one end only: departures from it
                 when nullif(btrim(coalesce(p_airport, '')), '') is not null then
                   l.origin_iata = upper(btrim(p_airport))
                 else true
               end
      ) t
     group by t.designator, t.origin, t.destination, t.dep, t.arr, t.arr_days,
              t.minutes, t.model, t.economy
     order by t.origin, t.dep, t.designator;
$$;

comment on function public.airline_timetable(uuid, text, text) is
    'One line per service a traveller can tell apart, with every weekday it operates (0 = Monday): airframes flying the same number, route, times, aircraft type and fare fold into one line. p_airport narrows to departures from one airport; adding p_pair_with narrows to one route in both directions.';

commit;

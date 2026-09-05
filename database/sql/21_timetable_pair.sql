-- =====================================================================
--  Echo United Alliances -- a timetable you can actually read to the end
--
--  airline_timetable() has no LIMIT, which is not the same as returning
--  everything. PostgREST caps a result at db-max-rows -- 1,000 on this
--  project -- and says nothing about having done so. A carrier the size of
--  Karination files more services than that, so the query came back with
--  exactly 1,000 rows ordered by origin, and every airport after HAN in the
--  alphabet simply did not exist as far as the site was concerned. Asking for
--  SGN's departures returned none, from an airport it serves 140 times a week.
--
--  Two things fix it, and neither is raising the cap:
--
--    p_pair_with  the services between two airports, BOTH directions, which
--                 is what "the full timetable for this route" means. A handful
--                 of rows instead of thousands.
--    p_airport    already existed and already narrows to one end. The page now
--                 actually uses it instead of filtering the truncated list in
--                 the browser.
--
--  The unfiltered call still exists for the default view and can still be
--  capped; the page now notices when a result comes back at exactly the cap
--  and says so rather than presenting a slice as the whole.
-- =====================================================================

begin;

drop function if exists public.airline_timetable(uuid, text);
drop function if exists public.airline_timetable(uuid, text, text);

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
    select a.carrier_code || ' ' ||
             case when l.direction = 'OUTBOUND' then f.outbound_flight_number
                  else f.inbound_flight_number end,
           l.origin_iata, l.destination_iata,
           l.departure_time, l.arrival_time, l.arrival_days_after_departure,
           l.duration_minutes, ac.aircraft_model,
           public.echo_mask_days(l.departure_days_mask),
           l.economy_price, l.business_price
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
     order by l.origin_iata, l.departure_time;
$$;

comment on function public.airline_timetable(uuid, text, text) is
    'One row per scheduled service with the weekdays it operates (0 = Monday). p_airport narrows to departures from one airport; adding p_pair_with narrows to one route in both directions, which is the only way to be sure of a complete answer -- an unfiltered call can be truncated at the PostgREST row cap.';

grant execute on function public.airline_timetable(uuid, text, text)
    to anon, authenticated;

commit;

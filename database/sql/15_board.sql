-- =====================================================================
--  Echo United Alliances -- the live departure board
--
--  Two faults, found in order.
--
--  The first: board_departures ordered by departure_minute with no time
--  filter, so it returned the earliest departures of the day, every time. The
--  board sat frozen on a row of 00:00 flights. It also returned only a local
--  clock string with no zone attached, which a browser cannot convert.
--
--  The second only showed up once the first was fixed. Asking a 590-airline
--  alliance for its next eight departures returns eight flights leaving in the
--  same minute -- the network pushes roughly 350 departures a minute -- so the
--  board read as frozen again, at 06:45 instead of 00:00.
--
--  So this is scoped the way a departure board actually is: one airport, one
--  flight per departure slot, ascending. Which airport is chosen from the
--  viewer's own timezone, so the board shows the hub they would be standing in.
--
--  Times come back as timestamptz -- the real instant of the next occurrence,
--  computed in the ORIGIN airport's timezone via AT TIME ZONE so daylight
--  saving is handled rather than assumed away. The client renders that in the
--  viewer's zone without knowing anything about airports.
-- =====================================================================

begin;

drop function if exists public.board_departures(text, integer);
drop function if exists public.board_departures(text, integer, timestamptz);
drop function if exists public.board_departures(text, integer, text, timestamptz);
drop function if exists public.echo_board_airports();

create or replace function public.board_departures(
    p_origin     text        default null,
    p_limit      integer     default 8,
    p_viewer_tz  text        default null,
    p_now        timestamptz default now()
)
returns table (
    departs_at        timestamptz,
    departure_local   text,
    origin_tz         text,
    origin_iata       text,
    origin_city       text,
    flight_designator text,
    destination_iata  text,
    destination_city  text,
    carrier_code      text,
    airline_name      text,
    division_code     text,
    accent_color      text
)
language sql stable parallel safe as $$
    -- p_viewer_tz arrives from a browser, so it is matched against
    -- pg_timezone_names before being handed to AT TIME ZONE, which throws on
    -- a name it does not know.
    with vtz as (
        select n.name from pg_timezone_names n
         where n.name = nullif(p_viewer_tz, '') limit 1
    ),
    scope as (
        select a.iata_code, a.timezone,
               coalesce(a.city_name, a.airport_name, a.iata_code) as city,
               (p_now at time zone a.timezone) as local_now
          from public.mv_airport_directory a
         where a.iata_code = coalesce(
             -- what the caller asked for
             nullif(upper(coalesce(p_origin, '')), ''),
             -- the busiest alliance hub in the viewer's own timezone
             (select b.iata_code from public.mv_airport_directory b
               where b.timezone = (select name from vtz)
               order by b.weekly_departures desc limit 1),
             -- failing that, one that at least reads on the viewer's clock:
             -- two zones showing the same wall time right now share an offset
             (select b.iata_code from public.mv_airport_directory b
               where exists (select 1 from vtz)
                 and b.timezone is not null
                 and (p_now at time zone b.timezone)
                     = (p_now at time zone (select name from vtz))
               order by b.weekly_departures desc limit 1),
             -- failing that, the busiest hub in the alliance
             (select b.iata_code from public.mv_airport_directory b
               where b.timezone is not null
               order by b.weekly_departures desc limit 1))
    ),
    -- One flight per departure slot. LHR alone pushes 143 flights at 06:00;
    -- listing them all would fill the board with a single repeated time. Two
    -- capped, index-ordered reads -- the rest of today, then tomorrow from
    -- midnight -- and a few spare slots so rows dropped by the joins below
    -- still leave a full board.
    slots as (
        select s.iata_code, s.timezone, s.city, n.*
          from scope s
          cross join lateral (
              (
                select distinct on (l.departure_time)
                       l.flight_id, l.aircraft_id, l.direction, l.airline_uid,
                       l.destination_iata, l.departure_time,
                       ((s.local_now::date + l.departure_time)
                            at time zone s.timezone) as at_utc
                  from public.mv_leg_departures l
                 where l.origin_iata = s.iata_code
                   and l.departure_time >= s.local_now::time
                   and ((l.departure_days_mask::int
                         >> (extract(isodow from s.local_now::date)::int - 1)) & 1) = 1
                 order by l.departure_time
                 limit greatest(coalesce(p_limit, 8), 1) + 6
              )
              union all
              (
                select distinct on (l.departure_time)
                       l.flight_id, l.aircraft_id, l.direction, l.airline_uid,
                       l.destination_iata, l.departure_time,
                       ((s.local_now::date + 1 + l.departure_time)
                            at time zone s.timezone)
                  from public.mv_leg_departures l
                 where l.origin_iata = s.iata_code
                   and ((l.departure_days_mask::int
                         >> (extract(isodow from s.local_now::date + 1)::int - 1)) & 1) = 1
                 order by l.departure_time
                 limit greatest(coalesce(p_limit, 8), 1) + 6
              )
          ) n
    )
    select p.at_utc,
           to_char(p.departure_time, 'HH24:MI'),
           p.timezone,
           p.iata_code,
           p.city,
           a.carrier_code || ' ' ||
             case when p.direction = 'OUTBOUND' then f.outbound_flight_number
                  else f.inbound_flight_number end,
           p.destination_iata,
           coalesce(d.city_name, d.airport_name, p.destination_iata),
           a.carrier_code,
           a.airline_name,
           a.division_code,
           coalesce(a.accent_color, dv.accent_color, '#A855F7')
      from slots p
      join public.airlines  a  on a.uid = p.airline_uid and a.is_published
      join public.flights   f  on f.flight_id = p.flight_id
      join public.airports  d  on d.iata_code = p.destination_iata
      left join public.divisions dv on dv.division_code = a.division_code
     where p.at_utc >= p_now
     order by p.at_utc
     limit greatest(coalesce(p_limit, 8), 1);
$$;

comment on function public.board_departures(text, integer, text, timestamptz) is
    'One airport''s next departures, one flight per slot. departs_at is a real instant so the client renders it in the viewer''s own timezone; departure_local is the origin''s own clock. With no p_origin, the hub is chosen from p_viewer_tz.';

grant execute on function public.board_departures(text, integer, text, timestamptz)
    to anon, authenticated;

commit;

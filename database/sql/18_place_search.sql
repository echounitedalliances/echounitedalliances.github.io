-- =====================================================================
--  Echo United Alliances -- searching for a place, not an airport code
--
--  search_airports() returns a flat list capped at seven rows, which is fine
--  for "what is LHR" and wrong for the way people actually book. Typing
--  "london" has to show every London airport together -- LHR, LGW and LCY --
--  and a flat cap silently drops some of them the moment another city also
--  matches. There are 40 such cities in the alliance's map: Moscow has three,
--  New York, Beijing, Bangkok, Seoul, Chicago, Rome, Osaka and Toronto two
--  each.
--
--  So this ranks CITIES and then returns ALL of their airports -- including
--  ones that did not match the text themselves, so "lhr" still offers Gatwick
--  and City. The limit counts places, not rows, which is what keeps a
--  multi-airport city intact.
--
--  Ranking, best first:
--    0  the query is exactly this airport's code        ("lhr")
--    1  the city name starts with the query             ("lond" -> London)
--    2  an airport name starts with the query           ("heath" -> Heathrow)
--    3  matched somewhere else in the blob              ("gatw", "kingdom")
--  ties broken by how much the alliance actually flies there.
-- =====================================================================

begin;

create or replace function public.search_places(
    p_query text,
    p_limit integer default 6
)
returns table (
    iata_code         text,
    airport_name      text,
    city_name         text,
    country_code      text,
    latitude          double precision,
    longitude         double precision,
    weekly_departures numeric,
    carriers          bigint,
    -- everything below is what lets the client group the list
    place_key         text,
    place_name        text,
    place_airports    integer,
    place_rank        integer
)
language sql stable parallel safe as $$
    with q as (
        select lower(btrim(coalesce(p_query, ''))) as needle
    ),
    -- every airport, tagged with the place it belongs to. Cheap over 2,187
    -- rows, and it is what lets a matched city bring its other airports with
    -- it: typing "lhr" should still offer Gatwick and City, the way a real
    -- booking box does.
    tagged as (
        select a.*,
               coalesce(nullif(lower(btrim(a.city_name)), ''), lower(a.iata_code))
                 || '|' || coalesce(a.country_code, '')          as place_key,
               coalesce(nullif(btrim(a.city_name), ''), a.airport_name, a.iata_code)
                                                                 as place_name
          from public.mv_airport_directory a
    ),
    hit as (
        select t.place_key, t.place_name, t.weekly_departures,
               case
                 when lower(t.iata_code) = (select needle from q)                            then 0
                 when lower(coalesce(t.city_name, ''))    like (select needle from q) || '%' then 1
                 when lower(coalesce(t.airport_name, '')) like (select needle from q) || '%' then 2
                 else 3
               end                                               as hit_rank
          from tagged t, q
         where q.needle <> ''
           and t.search_blob like '%' || q.needle || '%'
    ),
    -- a place ranks by its best-matching airport, so one exact code pulls the
    -- whole city up rather than just that one row
    place as (
        select place_key,
               row_number() over (order by min(hit_rank), sum(weekly_departures) desc,
                                           min(place_name))    as rn
          from hit
         group by place_key
    )
    select t.iata_code, t.airport_name, t.city_name, t.country_code,
           t.latitude, t.longitude, t.weekly_departures, t.carriers,
           t.place_key, t.place_name,
           count(*) over (partition by t.place_key)::integer as place_airports,
           p.rn::integer
      from tagged t
      join place p on p.place_key = t.place_key
      cross join q
     where p.rn <= greatest(coalesce(p_limit, 6), 1)
     -- inside a place, the code someone actually typed comes first
     order by p.rn, (lower(t.iata_code) = q.needle) desc, t.weekly_departures desc, t.iata_code;
$$;

comment on function public.search_places(text, integer) is
    'Airport typeahead that groups by city. p_limit counts places, not rows, so every airport of a multi-airport city comes back together.';

grant execute on function public.search_places(text, integer) to anon, authenticated;

commit;

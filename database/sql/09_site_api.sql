-- =====================================================================
--  Echo United Alliances -- the API the website reads
--
--  The site is a static build on GitHub Pages talking straight to Supabase,
--  so everything it needs has to be one indexed read behind the anon key.
--  Nothing here is new data: these are the shapes the pages actually want,
--  sized so a browser can hold them.
--
--  The globe is the reason mv_network_arcs exists. 123,080 routes will not
--  render, so it carries the busiest ones with coordinates already attached.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Divisions
-- ---------------------------------------------------------------------

create or replace view public.v_division_summary
with (security_invoker = on) as
select
    d.division_code,
    d.division_name,
    d.sort_order,
    d.accent_color,
    d.alliance_description,
    d.created_time,
    count(distinct a.uid)                                as carriers,
    coalesce(sum(m.fleet_size), 0)::bigint               as aircraft,
    coalesce(sum(m.flight_pairs), 0)::bigint             as flight_pairs,
    coalesce(sum(m.routes), 0)::bigint                   as routes,
    (select count(distinct x.iata)
       from public.airlines a2
       join public.flights f2 on f2.airline_uid = a2.uid
       cross join lateral (values (f2.origin_iata), (f2.destination_iata)) as x(iata)
      where a2.division_code = d.division_code)          as destinations,
    (select array_agg(h.airport_iata order by h.n desc)
       from (select ah.airport_iata, count(*) as n
               from public.airline_hubs ah
               join public.airlines a3 on a3.uid = ah.airline_uid
              where a3.division_code = d.division_code
              group by ah.airport_iata
              order by count(*) desc
              limit 6) h)                                as top_hubs
from public.divisions d
left join public.airlines a on a.division_code = d.division_code and a.is_published
left join public.v_airline_metrics m on m.airline_uid = a.uid
group by d.division_code, d.division_name, d.sort_order, d.accent_color,
         d.alliance_description, d.created_time;

comment on view public.v_division_summary is
    'One row per division for the division grid and division hub pages.';

-- ---------------------------------------------------------------------
-- Carriers -- the directory, and one carrier's profile
-- ---------------------------------------------------------------------

-- Materialised: the directory sorts and filters across all 590 on every
-- keystroke, and v_airline_metrics is far too expensive to run per request.
drop materialized view if exists public.mv_airline_directory cascade;
create materialized view public.mv_airline_directory as
select
    a.uid,
    a.division_code,
    d.division_name,
    -- The carrier's own livery first: 537 of 602 have one, and eight
    -- division colours spread across 600 airlines told you nothing.
    coalesce(lv.brand_color, a.accent_color, d.accent_color) as accent_color,
    a.airline_slug,
    a.carrier_code,
    a.airline_code,
    a.airline_name,
    a.airline_country,
    a.is_division_leader,
    a.website_url,
    a.booking_url,
    a.description_md,
    coalesce(a.description_md, s.description_seed) as description,
    m.fleet_size,
    m.aircraft_types,
    m.most_common_aircraft,
    m.flight_pairs,
    m.routes,
    m.destinations,
    m.hub_count,
    m.hubs,
    m.cheapest_economy_usd,
    -- for the directory's default sort and the "spotlight" picks
    (m.fleet_size * 2 + m.routes)             as prominence,
    lower(coalesce(a.airline_name, '') || ' ' || coalesce(a.carrier_code, '') || ' '
          || coalesce(a.airline_code, '') || ' ' || coalesce(a.airline_country, '')
          || ' ' || d.division_name)          as search_blob
from public.airlines a
join public.divisions d on d.division_code = a.division_code
left join public.airline_liveries lv on lv.airline_uid = a.uid
join public.v_airline_metrics m on m.airline_uid = a.uid
left join public.v_airline_description_seed s on s.airline_uid = a.uid
where a.is_published;

create unique index if not exists mv_airline_directory_key on public.mv_airline_directory (uid);
create unique index if not exists mv_airline_directory_slug
    on public.mv_airline_directory (division_code, airline_slug);
create index if not exists mv_airline_directory_prominence
    on public.mv_airline_directory (prominence desc);
create index if not exists mv_airline_directory_division
    on public.mv_airline_directory (division_code, prominence desc);
create index if not exists mv_airline_directory_country
    on public.mv_airline_directory (airline_country);
create index if not exists mv_airline_directory_search
    on public.mv_airline_directory using gin (search_blob gin_trgm_ops);

comment on materialized view public.mv_airline_directory is
    'Every published carrier with its headline figures, ready to filter and sort. Rebuilt by echo_refresh_search().';

-- Free-text carrier search for the directory page.
create or replace function public.search_airlines(
    p_query    text default null,
    p_division text default null,
    p_country  text default null,
    p_limit    integer default 60,
    p_offset   integer default 0
)
returns setof public.mv_airline_directory
language sql stable parallel safe as $$
    select *
      from public.mv_airline_directory
     where (p_query    is null or p_query = ''
            or search_blob like '%' || lower(trim(p_query)) || '%')
       and (p_division is null or p_division = '' or division_code = p_division)
       and (p_country  is null or p_country  = '' or airline_country = upper(p_country))
     order by prominence desc, airline_name
     limit  greatest(coalesce(p_limit, 60), 1)
    offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_airlines(text, text, text, integer, integer) is
    'The carrier directory: free text over name, code, country and division, with filters.';

-- ---------------------------------------------------------------------
-- Airports
-- ---------------------------------------------------------------------

drop materialized view if exists public.mv_airport_directory cascade;
create materialized view public.mv_airport_directory as
select
    ap.iata_code,
    ap.airport_name,
    ap.city_name,
    ap.country_code,
    ap.latitude,
    ap.longitude,
    ap.timezone,
    c.out_degree,
    c.in_degree,
    c.weekly_departures,
    (select count(distinct l.airline_uid) from public.mv_leg_departures l
      where l.origin_iata = ap.iata_code)                  as carriers,
    (select count(*) from public.airline_hubs h
      where h.airport_iata = ap.iata_code)                 as hub_for,
    lower(ap.iata_code || ' ' || coalesce(ap.city_name, '') || ' '
          || coalesce(ap.airport_name, ''))                as search_blob
from public.airports ap
join public.mv_airport_connectivity c on c.iata_code = ap.iata_code;

create unique index if not exists mv_airport_directory_key
    on public.mv_airport_directory (iata_code);
create index if not exists mv_airport_directory_traffic
    on public.mv_airport_directory (weekly_departures desc);
create index if not exists mv_airport_directory_search
    on public.mv_airport_directory using gin (search_blob gin_trgm_ops);

-- Typeahead for the search box. Exact IATA first, then city, then anything.
create or replace function public.search_airports(
    p_query text, p_limit integer default 8
)
returns setof public.mv_airport_directory
language sql stable parallel safe as $$
    select *
      from public.mv_airport_directory
     where p_query is not null and p_query <> ''
       and search_blob like '%' || lower(trim(p_query)) || '%'
     order by (iata_code = upper(trim(p_query))) desc,
              (lower(coalesce(city_name, '')) like lower(trim(p_query)) || '%') desc,
              weekly_departures desc
     limit greatest(coalesce(p_limit, 8), 1);
$$;

-- Every alliance carrier serving one airport -- the "find by airport" page.
create or replace function public.airport_carriers(p_iata text)
returns table (
    uid uuid, division_code text, division_name text, accent_color text,
    airline_slug text, carrier_code text, airline_name text,
    destinations_from_here bigint, is_hub boolean
)
language sql stable parallel safe as $$
    select d.uid, d.division_code, d.division_name, d.accent_color,
           d.airline_slug, d.carrier_code, d.airline_name,
           count(distinct l.destination_iata) as destinations_from_here,
           exists (select 1 from public.airline_hubs h
                    where h.airline_uid = d.uid and h.airport_iata = upper(p_iata)) as is_hub
      from public.mv_leg_departures l
      join public.mv_airline_directory d on d.uid = l.airline_uid
     where l.origin_iata = upper(p_iata)
     group by d.uid, d.division_code, d.division_name, d.accent_color,
              d.airline_slug, d.carrier_code, d.airline_name
     order by count(distinct l.destination_iata) desc, d.airline_name;
$$;

-- ---------------------------------------------------------------------
-- The globe
-- ---------------------------------------------------------------------

-- 123,080 routes will not render in a browser. This is the busiest slice,
-- with coordinates and a division colour already attached, so the globe is a
-- single fetch and no client-side joining.
drop materialized view if exists public.mv_network_arcs cascade;
create materialized view public.mv_network_arcs as
select
    r.origin_iata, r.destination_iata, r.division_code,
    r.weekly_departures, r.carriers,
    o.latitude as origin_lat, o.longitude as origin_lon,
    d.latitude as dest_lat,   d.longitude as dest_lon,
    coalesce(dv.accent_color, '#A855F7') as accent_color
from public.mv_route_adjacency r
join public.airports o on o.iata_code = r.origin_iata
join public.airports d on d.iata_code = r.destination_iata
left join public.divisions dv on dv.division_code = r.division_code
-- one direction only: an arc is the same line drawn twice otherwise
where r.origin_iata < r.destination_iata
  and o.latitude is not null and d.latitude is not null
order by r.weekly_departures desc
limit 1200;

comment on materialized view public.mv_network_arcs is
    'The 1,200 busiest city pairs with coordinates and a division colour. What the globe draws.';

-- The airports worth plotting as points.
drop materialized view if exists public.mv_network_nodes cascade;
create materialized view public.mv_network_nodes as
select iata_code, city_name, country_code, latitude, longitude,
       weekly_departures, carriers, hub_for
from public.mv_airport_directory
where latitude is not null
  and weekly_departures > 0
order by weekly_departures desc
limit 900;

create index if not exists mv_network_nodes_key on public.mv_network_nodes (iata_code);

-- ---------------------------------------------------------------------
-- Refresh
-- ---------------------------------------------------------------------

create or replace function public.echo_refresh_search()
returns void language plpgsql as $$
begin
    refresh materialized view public.mv_leg_departures;
    analyze public.mv_leg_departures;

    begin
        refresh materialized view public.mv_route_adjacency;
        refresh materialized view public.mv_airport_connectivity;
    exception when undefined_table then null;
    end;

    begin
        refresh materialized view public.mv_airline_directory;
        refresh materialized view public.mv_airport_directory;
        refresh materialized view public.mv_network_arcs;
        refresh materialized view public.mv_network_nodes;
    exception when undefined_table then null;
    end;

    analyze public.mv_route_adjacency;
    analyze public.mv_airline_directory;
end;
$$;

comment on function public.echo_refresh_search() is
    'Rebuild everything materialised, in dependency order. Run after any data reload.';

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

grant select on
    public.v_division_summary,
    public.mv_airline_directory,
    public.mv_airport_directory,
    public.mv_network_arcs,
    public.mv_network_nodes
to anon, authenticated;

grant execute on function
    public.search_airlines(text, text, text, integer, integer),
    public.search_airports(text, integer),
    public.airport_carriers(text)
to anon, authenticated;

revoke all on function public.echo_refresh_search() from anon, authenticated;

commit;

-- =====================================================================
--  The departure board used to live here, and no longer does.
--
--  That version ordered by departure_minute with no time filter, so it always
--  returned the day's earliest departures and the board sat frozen on a row of
--  00:00 flights. It is replaced wholesale by 15_board.sql, which returns real
--  instants instead of bare clock strings. Leaving the old definition here
--  would have quietly recreated it on every rebuild.
-- =====================================================================

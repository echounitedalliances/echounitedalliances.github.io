-- =====================================================================
--  Echo United Alliances -- every division on the network map
--
--  mv_network_arcs was the 1,200 busiest city pairs, each coloured by the
--  division that flies it most, and the maps draw the top 320 (home) or 400
--  (network page) of those. A young division never gets that far up: Eos,
--  opened 2 October 2026, dominated five pairs in the 1,200 and none in
--  what was drawn, so the map showed eight colours for nine divisions.
--
--  Now each division's eight busiest pairs are always included and flagged
--  `featured`; the pages order by featured first, so those are drawn
--  whatever the cap. The rest is the busiest 1,200 as before. Ties are
--  broken by airport code, so the same pairs are chosen every refresh.
--
--  Supersedes the definition in 37_slim_storage.sql. Nothing is built on
--  this view, so dropping it takes nothing else.
-- =====================================================================

begin;

drop materialized view if exists public.mv_network_arcs;

create materialized view public.mv_network_arcs as
with pairs as (
    select r.origin_iata,
           r.destination_iata,
           r.division_code,
           r.weekly_departures,
           r.carriers,
           o.latitude  as origin_lat,
           o.longitude as origin_lon,
           d.latitude  as dest_lat,
           d.longitude as dest_lon,
           coalesce(dv.accent_color, '#A855F7'::text) as accent_color,
           row_number() over (order by r.weekly_departures desc,
                                       r.origin_iata, r.destination_iata) as overall_rank,
           row_number() over (partition by r.division_code
                              order by r.weekly_departures desc,
                                       r.origin_iata, r.destination_iata) as division_rank
      from public.mv_route_adjacency r
      join public.airports o on o.iata_code = r.origin_iata
      join public.airports d on d.iata_code = r.destination_iata
      left join public.divisions dv on dv.division_code = r.division_code
     where r.origin_iata < r.destination_iata
       and o.latitude is not null and d.latitude is not null
)
select origin_iata, destination_iata, division_code, weekly_departures, carriers,
       origin_lat, origin_lon, dest_lat, dest_lon, accent_color,
       (division_rank <= 8) as featured
  from pairs
 where overall_rank <= 1200 or division_rank <= 8
 order by weekly_departures desc;

comment on materialized view public.mv_network_arcs is
    'The 1,200 busiest city pairs, plus each division''s eight busiest (featured), with coordinates and a division colour. Order by featured desc, weekly_departures desc so every division is drawn.';

grant select on public.mv_network_arcs to anon, authenticated, service_role;

commit;

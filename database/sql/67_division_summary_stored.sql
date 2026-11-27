-- =====================================================================
--  Echo United Alliances -- the division summary, worked out once a week
--
--  v_division_summary added up every division's carriers, aircraft, routes
--  and airports from the live tables on every read: all 528,814 flights
--  (28 November 2026), every time someone opened the home page or
--  /divisions. That took 2.8-6.7 s, past the roughly 3 s Supabase allows a
--  visitor's query, so the divisions grid sometimes came back empty.
--
--  The same figures now live in mv_division_summary: ten rows, rebuilt by
--  database/weekly/3_refresh.sql after the merge, and by
--  echo_refresh_division_network() when an admin moves a carrier and
--  rebuilds the network. v_division_summary keeps its name, columns and
--  grants, and reads the stored rows, so nothing that queries it changes.
-- =====================================================================

begin;

set local statement_timeout = 0;

drop materialized view if exists public.mv_division_summary;

create materialized view public.mv_division_summary as
select d.division_code,
       d.division_name,
       d.sort_order,
       d.accent_color,
       d.alliance_description,
       d.created_time,
       count(distinct a.uid) as carriers,
       coalesce(sum(m.fleet_size), 0)::bigint   as aircraft,
       coalesce(sum(m.flight_pairs), 0)::bigint as flight_pairs,
       coalesce(sum(m.routes), 0)::bigint       as routes,
       (select count(distinct x.iata)
          from public.airlines a2
          join public.flights f2 on f2.airline_uid = a2.uid
         cross join lateral (values (f2.origin_iata), (f2.destination_iata)) x(iata)
         where a2.division_code = d.division_code) as destinations,
       (select array_agg(h.airport_iata order by h.n desc)
          from (select ah.airport_iata, count(*) as n
                  from public.airline_hubs ah
                  join public.airlines a3 on a3.uid = ah.airline_uid
                 where a3.division_code = d.division_code
                 group by ah.airport_iata
                 order by count(*) desc
                 limit 6) h) as top_hubs
  from public.divisions d
  left join public.airlines a on a.division_code = d.division_code and a.is_published
  left join public.v_airline_metrics m on m.airline_uid = a.uid
 group by d.division_code, d.division_name, d.sort_order, d.accent_color,
          d.alliance_description, d.created_time;

create unique index mv_division_summary_key on public.mv_division_summary (division_code);

comment on materialized view public.mv_division_summary is
    'Each division''s headline figures, rebuilt weekly by 3_refresh.sql and by echo_refresh_division_network() (67_division_summary_stored.sql). Read through v_division_summary.';

revoke all on public.mv_division_summary from anon, authenticated;
grant select on public.mv_division_summary to anon, authenticated;

create or replace view public.v_division_summary
with (security_invoker = on) as
select division_code, division_name, sort_order, accent_color, alliance_description,
       created_time, carriers, aircraft, flight_pairs, routes, destinations, top_hubs
  from public.mv_division_summary;

-- Only ever read: the table-wide grants Supabase gave this view by default
-- did nothing useful.
revoke all on public.v_division_summary from anon, authenticated;
grant select on public.v_division_summary to anon, authenticated;

create or replace function public.echo_refresh_division_network()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    -- mv_route_adjacency is built from the legs, which are empty between
    -- weekly builds (51_schedule_summaries.sql), so it is not refreshed here:
    -- the global map's dominant-division colours catch up at the next weekly
    -- build. The division maps come from route_pairs and update now.
    refresh materialized view public.mv_network_arcs;
    -- Not concurrently: that needs a unique index, and mv_division_arcs_key
    -- (5 MB, never once scanned) existed for nothing else. It was dropped on
    -- 16 September 2026 to bring the database under the free plan's 500 MB.
    -- A plain refresh locks the division maps for about two seconds.
    refresh materialized view public.mv_division_arcs;
    -- The divisions grid's figures (67_division_summary_stored.sql), so a
    -- moved carrier is counted in its new division straight away.
    refresh materialized view concurrently public.mv_division_summary;
end;
$function$;

commit;

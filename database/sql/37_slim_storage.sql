-- =====================================================================
--  Echo United Alliances -- slimming the storage, 2 October 2026
--
--  The free plan's 500 MB counts every database on the server, and Postgres's
--  two template databases take 15 MB of it, so ours has about 485. After the
--  2 October scrape it stood at 488. Nothing here removes anything the site
--  shows; it stops storing what nobody reads, and stores the rest tighter.
--
--  1. Columns nothing reads. Every aircraft carried its cabin product names,
--     seat pitches, engine/winglet/eyemask options, a background image index
--     and a weekly flight time -- a third of the row, read by no view, no
--     function and no page. Flights carried the game's flight string and the
--     raw departure value (always day_offset * 86400 + seconds, so nothing is
--     lost), and assignments a per-flight profit. All are still in the scrape
--     on disk if they are ever wanted.
--
--  2. Idle airframes as counts. 29% of airframes fly nothing -- 27,398 of
--     them one carrier's -- and an idle airframe is only ever counted. They
--     become aircraft_idle: one row per airline and type. Every reader of
--     fleet sizes (v_fleet, v_airline_metrics, v_alliance_overview, the
--     generated profile) adds the counts in, so no figure on the site moves.
--     An idle airframe that a booking still names keeps its row.
--
--  3. The search table, tighter. mv_leg_departures stored each departure
--     time twice (as a time and as minutes) and its duration, which is
--     arrival minus departure. The rows now live in mv_legs with times as
--     minutes in smallints, the direction as a flag and seat counts as
--     smallints; mv_leg_departures is a view over it that puts back every
--     column under the same name and type, so all of 04-36 and the site read
--     it unchanged. Arrival time is still stored: it is in the destination's
--     local time, so it cannot be worked out from the rest.
--
--     A materialised view's columns cannot be dropped, so the old one is
--     dropped and nine objects built on it go with it. They are recreated
--     below from their exact live definitions (pg_dump, 2 October 2026), so
--     on a fresh build this file is where those nine are last defined -- as
--     31 is for the legs view. Change them here.
--
--  Everything is one transaction, so the site sees the old tables until the
--  new ones are complete. Followed by VACUUM FULL, outside it, to hand the
--  space back -- dropped columns are only reclaimed when rows are rewritten.
-- =====================================================================

set statement_timeout = 0;

begin;

-- ---------------------------------------------------------------------
--  1. Columns nothing reads
-- ---------------------------------------------------------------------
alter table public.aircraft
    drop column if exists eco_product,
    drop column if exists prem_eco_product,
    drop column if exists biz_product,
    drop column if exists first_product,
    drop column if exists eco_config_type,
    drop column if exists eco_pitch,
    drop column if exists prem_eco_pitch,
    drop column if exists biz_pitch,
    drop column if exists first_pitch,
    drop column if exists engine_option,
    drop column if exists winglet_option,
    drop column if exists eyemask_option,
    drop column if exists background_image_index,
    drop column if exists weekly_flight_time;

alter table public.flights
    drop column if exists flight_string,
    drop column if exists departure_daily_seconds_raw;

alter table public.flight_assignments
    drop column if exists flight_profit;

-- ---------------------------------------------------------------------
--  2. Idle airframes as counts
-- ---------------------------------------------------------------------
create table if not exists public.aircraft_idle (
    airline_uid    uuid    not null references public.airlines (uid) on delete cascade,
    aircraft_model text    not null references public.aircraft_models (aircraft_model),
    idle_count     integer not null check (idle_count > 0),
    primary key (airline_uid, aircraft_model)
);

comment on table public.aircraft_idle is
    'Airframes that fly nothing, counted per airline and type rather than stored as rows. Fleet sizes are aircraft rows plus these counts.';

-- Game data: anyone may read it, nobody writes it through the API. The views
-- over it are security_invoker, so a visitor needs the read itself.
alter table public.aircraft_idle enable row level security;
drop policy if exists aircraft_idle_public_read on public.aircraft_idle;
create policy aircraft_idle_public_read on public.aircraft_idle for select using (true);
grant select on public.aircraft_idle to anon, authenticated;

-- An existing database: count its idle airframes, then let the rows go. A
-- fresh build loaded them as counts already (build_database.py), so there is
-- nothing to move. Rows a booking names, and placeholders, stay.
create temp table echo_idle_rows on commit drop as
select ac.aircraft_id, ac.airline_uid, ac.aircraft_model
  from public.aircraft ac
 where not ac.is_placeholder
   and ac.aircraft_model is not null
   and not exists (select 1 from public.flight_assignments fa where fa.aircraft_id = ac.aircraft_id)
   and not exists (select 1 from public.booking_segments bs where bs.aircraft_id = ac.aircraft_id);

insert into public.aircraft_idle (airline_uid, aircraft_model, idle_count)
select airline_uid, aircraft_model, count(*)
  from echo_idle_rows
 group by airline_uid, aircraft_model
on conflict (airline_uid, aircraft_model)
   do update set idle_count = public.aircraft_idle.idle_count + excluded.idle_count;

delete from public.aircraft ac using echo_idle_rows i where i.aircraft_id = ac.aircraft_id;

-- The fleet by type, which the carrier page reads. Averages and delivery
-- dates now describe the airframes that fly; nothing on the site reads them.
-- A union rather than a join, so a page asking for one carrier still only
-- reads that carrier's rows.
create or replace view public.v_fleet with (security_invoker = on) as
select x.airline_uid,
       a.division_code,
       a.carrier_code,
       a.airline_name,
       x.aircraft_model,
       m.manufacturer,
       sum(x.n)::bigint                                  as aircraft_count,
       count(*) filter (where x.is_placeholder)          as placeholder_count,
       round(avg(x.eco_ratio)::numeric, 4)               as avg_eco_ratio,
       round(avg(x.prem_eco_ratio)::numeric, 4)          as avg_prem_eco_ratio,
       round(avg(x.biz_ratio)::numeric, 4)               as avg_biz_ratio,
       round(avg(x.first_ratio)::numeric, 4)             as avg_first_ratio,
       min(x.delivery_date)                              as first_delivery,
       max(x.delivery_date)                              as latest_delivery
  from (select ac.airline_uid, ac.aircraft_model, 1 as n, ac.is_placeholder,
               ac.eco_ratio, ac.prem_eco_ratio, ac.biz_ratio, ac.first_ratio, ac.delivery_date
          from public.aircraft ac
        union all
        select i.airline_uid, i.aircraft_model, i.idle_count, false,
               null::double precision, null::double precision, null::double precision,
               null::double precision, null::timestamptz
          from public.aircraft_idle i) x
  join public.airlines a on a.uid = x.airline_uid
  left join public.aircraft_models m on m.aircraft_model = x.aircraft_model
 group by x.airline_uid, a.division_code, a.carrier_code, a.airline_name, x.aircraft_model, m.manufacturer;

-- Fleet size, type count and most common type: rows plus counts. The most
-- common type is mode()'s answer -- ties go to the first name alphabetically.
create or replace view public.v_airline_metrics with (security_invoker = on) as
 SELECT a.uid AS airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    a.airline_slug,
    a.airline_country,
    COALESCE(f.flight_pairs, 0::bigint) AS flight_pairs,
    COALESCE(f.routes, 0::bigint) AS routes,
    COALESCE(f.destinations, 0::bigint) AS destinations,
    COALESCE(ac.fleet_size, 0::bigint) AS fleet_size,
    COALESCE(ac.models, 0::bigint) AS aircraft_types,
    ac.top_model AS most_common_aircraft,
    COALESCE(h.hub_count, 0::bigint) AS hub_count,
    h.hubs,
    f.longest_route_minutes,
    f.cheapest_economy_usd,
    s.last_online_time
   FROM airlines a
     LEFT JOIN LATERAL ( SELECT count(*) AS flight_pairs,
            count(DISTINCT fl.origin_iata || fl.destination_iata) AS routes,
            count(DISTINCT x.iata) AS destinations,
            max(GREATEST(fl.outbound_duration_minutes, fl.inbound_duration_minutes)) AS longest_route_minutes,
            ( SELECT min(fa.eco_price) AS min
                   FROM flights f2
                     JOIN flight_assignments fa ON fa.flight_id = f2.flight_id
                  WHERE f2.airline_uid = a.uid AND fa.eco_price > 0) AS cheapest_economy_usd
           FROM flights fl
             CROSS JOIN LATERAL ( VALUES (fl.origin_iata), (fl.destination_iata)) x(iata)
          WHERE fl.airline_uid = a.uid) f ON true
     LEFT JOIN LATERAL ( SELECT sum(g.n)::bigint AS fleet_size,
            count(g.aircraft_model) AS models,
            (array_agg(g.aircraft_model ORDER BY g.n DESC, g.aircraft_model)
                 FILTER (WHERE g.aircraft_model IS NOT NULL))[1] AS top_model
           FROM ( SELECT u.aircraft_model, sum(u.n) AS n
                    FROM ( SELECT aircraft.aircraft_model, 1 AS n
                             FROM aircraft
                            WHERE aircraft.airline_uid = a.uid AND NOT aircraft.is_placeholder
                          UNION ALL
                           SELECT i.aircraft_model, i.idle_count
                             FROM aircraft_idle i
                            WHERE i.airline_uid = a.uid) u
                   GROUP BY u.aircraft_model) g) ac ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS hub_count,
            array_agg(airline_hubs.airport_iata ORDER BY airline_hubs.is_major_hub DESC, airline_hubs.airport_iata) AS hubs
           FROM airline_hubs
          WHERE airline_hubs.airline_uid = a.uid) h ON true
     LEFT JOIN airline_stats s ON s.airline_uid = a.uid;


-- The generated profile counts widebodies itself: idle ones are counts now.
-- Otherwise exactly the live function of 2 October 2026 (11/12 defined it).
CREATE OR REPLACE FUNCTION public.echo_generate_profile(p_uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    a          record;
    d          record;
    home       text;
    countries  integer;
    hub_list   text;
    wide       integer;
    longest    record;
    busiest    record;
    reach      text;
    fleet_line text;
    out_text   text;
begin
    select * into a from public.mv_airline_directory where uid = p_uid;
    if not found then
        return null;
    end if;
    select * into d from public.divisions where division_code = a.division_code;

    select coalesce(c.the_name, a.airline_country) into home
      from (select 1) z
      left join public.countries c on c.country_code = a.airline_country;

    select count(distinct ap.country_code) into countries
      from public.flights f
      cross join lateral (values (f.origin_iata), (f.destination_iata)) as x(iata)
      join public.airports ap on ap.iata_code = x.iata
     where f.airline_uid = p_uid and ap.country_code is not null;

    select count(*) into wide
      from public.aircraft ac
     where ac.airline_uid = p_uid and not ac.is_placeholder
       and public.echo_is_widebody(ac.aircraft_model);
    wide := wide + coalesce((select sum(i.idle_count)::integer
                               from public.aircraft_idle i
                              where i.airline_uid = p_uid
                                and public.echo_is_widebody(i.aircraft_model)), 0);

    select l.origin_iata, l.destination_iata, l.duration_minutes into longest
      from public.mv_leg_departures l
     where l.airline_uid = p_uid
     order by l.duration_minutes desc limit 1;

    select r.origin_iata, r.destination_iata, r.departures_per_week into busiest
      from public.v_routes r
     where r.airline_uid = p_uid
     order by r.departures_per_week desc limit 1;

    if a.hubs is not null and array_length(a.hubs, 1) > 0 then
        hub_list := array_to_string(a.hubs[1:least(array_length(a.hubs,1), 3)], ', ');
    end if;

    out_text := coalesce(nullif(trim(a.airline_name), ''), 'This carrier')
        || ' is a member of Echo United Alliances, flying in the '
        || d.division_name || ' division';
    if home is not null then
        out_text := out_text || ' out of ' || home;
    end if;
    out_text := out_text || '.';

    if a.routes = 0 then
        return out_text || ' It holds a fleet but has not yet filed a schedule.';
    end if;

    reach := case
        when countries >= 40 then 'a genuinely global network'
        when countries >= 15 then 'a wide international network'
        when countries >= 5  then 'an international network'
        when countries = 1   then 'a domestic network'
        else 'a regional network'
    end;

    out_text := out_text || ' From ' || coalesce(hub_list, 'its bases')
        || ' it operates ' || reach || ' of ' || a.routes || ' routes to '
        || a.destinations || ' destinations';
    if countries > 1 then
        out_text := out_text || ' across ' || countries || ' countries';
    end if;
    out_text := out_text || '.';

    -- Fleet. An all-widebody operator is a different airline from one with a
    -- handful of them, and the sentence should say so rather than reporting
    -- "271 widebodies" out of 271 aircraft.
    fleet_line := ' The fleet numbers ' || a.fleet_size || ' aircraft';
    if a.aircraft_types > 1 then
        fleet_line := fleet_line || ' across ' || a.aircraft_types || ' types';
    end if;
    if a.most_common_aircraft is not null then
        fleet_line := fleet_line || ', built around the ' || a.most_common_aircraft;
    end if;
    if a.fleet_size > 0 and wide = a.fleet_size then
        fleet_line := fleet_line || ', widebodies throughout';
    elsif wide > 0 then
        fleet_line := fleet_line || ', including ' || wide
            || case when wide = 1 then ' widebody' else ' widebodies' end
            || ' for the long-haul work';
    end if;
    out_text := out_text || fleet_line || '.';

    if longest.origin_iata is not null and longest.duration_minutes >= 480 then
        out_text := out_text || ' Its longest sector, ' || longest.origin_iata
            || ' to ' || longest.destination_iata || ', blocks at '
            || (longest.duration_minutes / 60) || 'h '
            || lpad((longest.duration_minutes % 60)::text, 2, '0') || 'm.';
    elsif busiest.origin_iata is not null and busiest.departures_per_week >= 7 then
        out_text := out_text || ' Its busiest sector, ' || busiest.origin_iata
            || ' to ' || busiest.destination_iata || ', runs '
            || busiest.departures_per_week || ' times a week.';
    end if;

    return out_text;
end;
$function$;

-- ---------------------------------------------------------------------
--  3. The search table, tighter
-- ---------------------------------------------------------------------
-- Takes the nine objects built on it; all are recreated below.
drop materialized view if exists public.mv_leg_departures cascade;

-- Column order is for packing: the 16-byte ids, then 4-byte fares, then the
-- 2-byte minutes, days and seats together, then the flag and the codes.
-- Minutes are from local midnight; arrival_minute is the arrival's time of day
-- in the destination's local time, arrival_minute_abs is departure minute plus
-- duration. Seats fit a smallint many times over (the largest cabin is 434).
create materialized view public.mv_legs as
select l.flight_id,
       fa.aircraft_id,
       l.airline_uid,
       nullif(fa.eco_price, 0)                                         as economy_price,
       nullif(fa.prem_eco_price, 0)                                    as prem_eco_price,
       nullif(fa.biz_price, 0)                                         as business_price,
       nullif(fa.first_price, 0)                                       as first_price,
       public.echo_rotate_mask(fa.operating_days_mask, l.departure_day_offset)
                                                                       as departure_days_mask,
       ((extract(epoch from l.departure_time) / 60)::integer)::smallint as departure_minute,
       ((extract(epoch from l.arrival_time) / 60)::integer)::smallint   as arrival_minute,
       (l.arrival_day_offset - l.departure_day_offset)::smallint       as arrival_days_after_departure,
       ((extract(epoch from l.departure_time) / 60)::integer + l.duration_minutes)::smallint
                                                                       as arrival_minute_abs,
       (case when fa.eco_price      > 0 then nullif(fa.eco_seats, 0)      end)::smallint as economy_seats,
       (case when fa.prem_eco_price > 0 then nullif(fa.prem_eco_seats, 0) end)::smallint as prem_eco_seats,
       (case when fa.biz_price      > 0 then nullif(fa.biz_seats, 0)      end)::smallint as business_seats,
       (case when fa.first_price    > 0 then nullif(fa.first_seats, 0)    end)::smallint as first_seats,
       (l.direction = 'INBOUND')                                       as is_inbound,
       l.origin_iata,
       l.destination_iata
  from public.v_flight_legs l
  join public.flight_assignments fa on fa.flight_id = l.flight_id
 where fa.operating_days_mask <> 0
   and (   (fa.eco_price > 0 and fa.eco_seats > 0)
        or (fa.prem_eco_price > 0 and fa.prem_eco_seats > 0)
        or (fa.biz_price > 0 and fa.biz_seats > 0)
        or (fa.first_price > 0 and fa.first_seats > 0));

comment on materialized view public.mv_legs is
    'The stored rows behind mv_leg_departures: one sellable leg, times as minutes. Read mv_leg_departures; refresh this.';

-- The same columns, names, types and order mv_leg_departures always had.
create view public.mv_leg_departures as
select m.flight_id,
       m.aircraft_id,
       case when m.is_inbound then 'INBOUND'::text else 'OUTBOUND'::text end as direction,
       m.airline_uid,
       m.origin_iata,
       m.destination_iata,
       m.departure_days_mask,
       (m.departure_minute * '00:01:00'::interval)::time without time zone   as departure_time,
       (m.arrival_minute * '00:01:00'::interval)::time without time zone     as arrival_time,
       m.arrival_days_after_departure::integer                               as arrival_days_after_departure,
       (m.arrival_minute_abs - m.departure_minute)::integer                  as duration_minutes,
       m.departure_minute::integer                                           as departure_minute,
       m.arrival_minute_abs::integer                                         as arrival_minute_abs,
       m.economy_price,
       m.prem_eco_price,
       m.business_price,
       m.first_price,
       m.economy_seats::integer                                              as economy_seats,
       m.prem_eco_seats::integer                                             as prem_eco_seats,
       m.business_seats::integer                                             as business_seats,
       m.first_seats::integer                                                as first_seats
  from public.mv_legs m;

comment on view public.mv_leg_departures is
    'One sellable leg, cabins as columns and operating weekdays as a mask. A view over mv_legs since 2 October 2026, with every column it had as a materialised view. Carries ids only -- carrier codes, division and aircraft model are joined on for the handful of rows a page actually displays.';

-- The lookups search and the board make. The departure-time index is on the
-- same expression the view computes, so "origin = X and departure_time >= T
-- order by departure_time" is still one index range scan. And never drop the
-- flight_id lookup: without it search_itineraries scans every leg per result.
create index mv_legs_flight_idx      on public.mv_legs (flight_id);
create index mv_legs_origin_time_idx on public.mv_legs
    (origin_iata, ((departure_minute * '00:01:00'::interval)::time without time zone));
create index mv_legs_pair_idx        on public.mv_legs (origin_iata, destination_iata);
create index mv_legs_dest_idx        on public.mv_legs (destination_iata, origin_iata);
create index mv_legs_airline_idx     on public.mv_legs (airline_uid);
analyze public.mv_legs;

-- Visitors read the view, which reads the rows with its owner's rights.
revoke all on public.mv_legs from anon, authenticated;
grant select on public.mv_legs to service_role;
grant select on public.mv_leg_departures to anon, authenticated, service_role;

-- The weekly refresh and echo_refresh_search refresh the rows, not the view.
create or replace function public.echo_refresh_search()
 returns void
 language plpgsql
as $function$
begin
    refresh materialized view public.mv_legs;
    analyze public.mv_legs;

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
$function$;

-- ---------------------------------------------------------------------
--  The nine, as they were (pg_dump of the live database, 2 October 2026).
--  The one change: v_alliance_overview's aircraft adds the idle counts.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW public.mv_route_adjacency AS
 WITH legs AS (
         SELECT l_1.origin_iata,
            l_1.destination_iata,
            l_1.airline_uid,
            a.division_code,
            l_1.duration_minutes,
            l_1.economy_price,
            length(replace((((l_1.departure_days_mask)::integer)::bit(7))::text, '0'::text, ''::text)) AS days
           FROM (public.mv_leg_departures l_1
             JOIN public.airlines a ON ((a.uid = l_1.airline_uid)))
        ), per_division AS (
         SELECT legs.origin_iata,
            legs.destination_iata,
            legs.division_code,
            sum(legs.days) AS n
           FROM legs
          GROUP BY legs.origin_iata, legs.destination_iata, legs.division_code
        ), dominant AS (
         SELECT DISTINCT ON (per_division.origin_iata, per_division.destination_iata) per_division.origin_iata,
            per_division.destination_iata,
            per_division.division_code
           FROM per_division
          ORDER BY per_division.origin_iata, per_division.destination_iata, per_division.n DESC, per_division.division_code
        )
 SELECT l.origin_iata,
    l.destination_iata,
    sum(l.days) AS weekly_departures,
    count(DISTINCT l.airline_uid) AS carriers,
    min(l.duration_minutes) AS min_duration_minutes,
    min(l.economy_price) AS min_economy_price,
    bool_or((l.economy_price IS NOT NULL)) AS sells_economy,
    max(dom.division_code) AS division_code
   FROM (legs l
     JOIN dominant dom ON (((dom.origin_iata = l.origin_iata) AND (dom.destination_iata = l.destination_iata))))
  GROUP BY l.origin_iata, l.destination_iata;

COMMENT ON MATERIALIZED VIEW public.mv_route_adjacency IS 'Directional city pairs the alliance actually flies. The pruning graph; refresh with echo_refresh_search().';

CREATE MATERIALIZED VIEW public.mv_airport_connectivity AS
 SELECT a.iata_code,
    COALESCE(o.out_degree, (0)::bigint) AS out_degree,
    COALESCE(i.in_degree, (0)::bigint) AS in_degree,
    COALESCE(o.out_departures, (0)::numeric) AS weekly_departures
   FROM ((public.airports a
     LEFT JOIN LATERAL ( SELECT count(*) AS out_degree,
            sum(mv_route_adjacency.weekly_departures) AS out_departures
           FROM public.mv_route_adjacency
          WHERE (mv_route_adjacency.origin_iata = a.iata_code)) o ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS in_degree
           FROM public.mv_route_adjacency
          WHERE (mv_route_adjacency.destination_iata = a.iata_code)) i ON (true));

CREATE MATERIALIZED VIEW public.mv_airport_directory AS
 SELECT ap.iata_code,
    ap.airport_name,
    ap.city_name,
    ap.country_code,
    ap.latitude,
    ap.longitude,
    ap.timezone,
    c.out_degree,
    c.in_degree,
    c.weekly_departures,
    ( SELECT count(DISTINCT l.airline_uid) AS count
           FROM public.mv_leg_departures l
          WHERE (l.origin_iata = ap.iata_code)) AS carriers,
    ( SELECT count(*) AS count
           FROM public.airline_hubs h
          WHERE (h.airport_iata = ap.iata_code)) AS hub_for,
    lower(((((ap.iata_code || ' '::text) || COALESCE(ap.city_name, ''::text)) || ' '::text) || COALESCE(ap.airport_name, ''::text))) AS search_blob
   FROM (public.airports ap
     JOIN public.mv_airport_connectivity c ON ((c.iata_code = ap.iata_code)));

CREATE VIEW public.v_route_pairs WITH (security_invoker='on') AS
 SELECT l.airline_uid,
    a.division_code,
    a.carrier_code,
    LEAST(l.origin_iata, l.destination_iata) AS airport_a,
    GREATEST(l.origin_iata, l.destination_iata) AS airport_b,
    sum(length(replace(((COALESCE((l.departure_days_mask)::integer, 0))::bit(7))::text, '0'::text, ''::text))) AS departures_per_week,
    count(DISTINCT l.origin_iata) AS directions,
    min(l.origin_iata) AS sole_origin,
    min(l.duration_minutes) AS fastest_minutes,
    min(l.economy_price) AS cheapest_economy_usd,
    min(l.business_price) AS cheapest_business_usd
   FROM (public.mv_leg_departures l
     JOIN public.airlines a ON ((a.uid = l.airline_uid)))
  GROUP BY l.airline_uid, a.division_code, a.carrier_code, LEAST(l.origin_iata, l.destination_iata), GREATEST(l.origin_iata, l.destination_iata);

COMMENT ON VIEW public.v_route_pairs IS 'Every city pair a carrier serves, both directions folded into one row. directions is 1 or 2; when it is 1, sole_origin is the end it departs from.';

CREATE MATERIALIZED VIEW public.mv_division_arcs AS
 SELECT division_code,
    airport_a,
    airport_b,
    (sum(departures_per_week))::bigint AS weekly_departures,
    count(DISTINCT airline_uid) AS carriers
   FROM public.v_route_pairs p
  GROUP BY division_code, airport_a, airport_b;

COMMENT ON MATERIALIZED VIEW public.mv_division_arcs IS 'Every city pair each division serves, with the whole division''s weekly traffic on it. Carries no colours and no coordinates on purpose -- both are joined on at read time so a palette change or an airport backfill does not strand this holding stale values.';

CREATE MATERIALIZED VIEW public.mv_network_arcs AS
 SELECT r.origin_iata,
    r.destination_iata,
    r.division_code,
    r.weekly_departures,
    r.carriers,
    o.latitude AS origin_lat,
    o.longitude AS origin_lon,
    d.latitude AS dest_lat,
    d.longitude AS dest_lon,
    COALESCE(dv.accent_color, '#A855F7'::text) AS accent_color
   FROM (((public.mv_route_adjacency r
     JOIN public.airports o ON ((o.iata_code = r.origin_iata)))
     JOIN public.airports d ON ((d.iata_code = r.destination_iata)))
     LEFT JOIN public.divisions dv ON ((dv.division_code = r.division_code)))
  WHERE ((r.origin_iata < r.destination_iata) AND (o.latitude IS NOT NULL) AND (d.latitude IS NOT NULL))
  ORDER BY r.weekly_departures DESC
 LIMIT 1200;

COMMENT ON MATERIALIZED VIEW public.mv_network_arcs IS 'The 1,200 busiest city pairs with coordinates and a division colour. What the globe draws.';

CREATE MATERIALIZED VIEW public.mv_network_nodes AS
 SELECT iata_code,
    city_name,
    country_code,
    latitude,
    longitude,
    weekly_departures,
    carriers,
    hub_for
   FROM public.mv_airport_directory
  WHERE ((latitude IS NOT NULL) AND (weekly_departures > (0)::numeric))
  ORDER BY weekly_departures DESC
 LIMIT 900;

CREATE VIEW public.v_alliance_overview WITH (security_invoker='on') AS
 SELECT ( SELECT count(*) AS count
           FROM public.airlines
          WHERE airlines.is_published) AS airlines,
    ( SELECT count(*) AS count
           FROM public.divisions) AS divisions,
    ( SELECT count(*) AS count
           FROM public.airports) AS airports,
    (( SELECT count(*) AS count
           FROM public.aircraft
          WHERE (NOT aircraft.is_placeholder)) + ( SELECT COALESCE(sum(aircraft_idle.idle_count), (0)::bigint) AS sum
           FROM public.aircraft_idle))::bigint AS aircraft,
    ( SELECT count(*) AS count
           FROM public.flights) AS flight_pairs,
    ( SELECT count(*) AS count
           FROM public.mv_leg_departures) AS weekly_departures,
    ( SELECT count(DISTINCT (flights.origin_iata || flights.destination_iata)) AS count
           FROM public.flights) AS routes;

CREATE VIEW public.v_routes WITH (security_invoker='on') AS
 SELECT l.airline_uid,
    a.division_code,
    a.carrier_code,
    a.airline_name,
    l.origin_iata,
    l.destination_iata,
    sum(length(replace(((COALESCE((l.departure_days_mask)::integer, 0))::bit(7))::text, '0'::text, ''::text))) AS departures_per_week,
    min(l.duration_minutes) AS fastest_minutes,
    min(l.economy_price) AS cheapest_economy_usd,
    min(l.business_price) AS cheapest_business_usd,
    array_agg(DISTINCT ac.aircraft_model ORDER BY ac.aircraft_model) AS aircraft_models
   FROM ((public.mv_leg_departures l
     JOIN public.airlines a ON ((a.uid = l.airline_uid)))
     JOIN public.aircraft ac ON ((ac.aircraft_id = l.aircraft_id)))
  GROUP BY l.airline_uid, a.division_code, a.carrier_code, a.airline_name, l.origin_iata, l.destination_iata;

COMMENT ON VIEW public.v_routes IS 'Every city pair a carrier serves, with weekly departures counted from the operating mask.';

CREATE INDEX mv_airport_connectivity_degree_idx ON public.mv_airport_connectivity USING btree (out_degree DESC);

CREATE UNIQUE INDEX mv_airport_connectivity_key ON public.mv_airport_connectivity USING btree (iata_code);

CREATE UNIQUE INDEX mv_airport_directory_key ON public.mv_airport_directory USING btree (iata_code);

CREATE INDEX mv_airport_directory_search ON public.mv_airport_directory USING gin (search_blob public.gin_trgm_ops);

CREATE INDEX mv_airport_directory_traffic ON public.mv_airport_directory USING btree (weekly_departures DESC);

CREATE INDEX mv_division_arcs_traffic ON public.mv_division_arcs USING btree (division_code, weekly_departures DESC);

CREATE INDEX mv_network_nodes_key ON public.mv_network_nodes USING btree (iata_code);

CREATE INDEX mv_route_adjacency_dest_idx ON public.mv_route_adjacency USING btree (destination_iata, origin_iata);

CREATE UNIQUE INDEX mv_route_adjacency_key ON public.mv_route_adjacency USING btree (origin_iata, destination_iata);

GRANT ALL ON TABLE public.mv_route_adjacency TO anon;
GRANT ALL ON TABLE public.mv_route_adjacency TO authenticated;
GRANT ALL ON TABLE public.mv_route_adjacency TO service_role;

GRANT ALL ON TABLE public.mv_airport_connectivity TO anon;
GRANT ALL ON TABLE public.mv_airport_connectivity TO authenticated;
GRANT ALL ON TABLE public.mv_airport_connectivity TO service_role;

GRANT ALL ON TABLE public.mv_airport_directory TO anon;
GRANT ALL ON TABLE public.mv_airport_directory TO authenticated;
GRANT ALL ON TABLE public.mv_airport_directory TO service_role;

GRANT ALL ON TABLE public.v_route_pairs TO anon;
GRANT ALL ON TABLE public.v_route_pairs TO authenticated;
GRANT ALL ON TABLE public.v_route_pairs TO service_role;

GRANT ALL ON TABLE public.mv_division_arcs TO anon;
GRANT ALL ON TABLE public.mv_division_arcs TO authenticated;
GRANT ALL ON TABLE public.mv_division_arcs TO service_role;

GRANT ALL ON TABLE public.mv_network_arcs TO anon;
GRANT ALL ON TABLE public.mv_network_arcs TO authenticated;
GRANT ALL ON TABLE public.mv_network_arcs TO service_role;

GRANT ALL ON TABLE public.mv_network_nodes TO anon;
GRANT ALL ON TABLE public.mv_network_nodes TO authenticated;
GRANT ALL ON TABLE public.mv_network_nodes TO service_role;

GRANT ALL ON TABLE public.v_alliance_overview TO anon;
GRANT ALL ON TABLE public.v_alliance_overview TO authenticated;
GRANT ALL ON TABLE public.v_alliance_overview TO service_role;

GRANT ALL ON TABLE public.v_routes TO anon;
GRANT ALL ON TABLE public.v_routes TO authenticated;
GRANT ALL ON TABLE public.v_routes TO service_role;

-- The airport autocomplete returns rows of mv_airport_directory, so the
-- cascade takes it as well. As it was, with its grants.
CREATE OR REPLACE FUNCTION public.search_airports(p_query text, p_limit integer DEFAULT 8)
 RETURNS SETOF mv_airport_directory
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
    select *
      from public.mv_airport_directory
     where p_query is not null and p_query <> ''
       and search_blob like '%' || lower(trim(p_query)) || '%'
     order by (iata_code = upper(trim(p_query))) desc,
              (lower(coalesce(city_name, '')) like lower(trim(p_query)) || '%') desc,
              weekly_departures desc
     limit greatest(coalesce(p_limit, 8), 1);
$function$;

grant execute on function public.search_airports(text, integer) to public, anon, authenticated, service_role;

commit;

-- Hand the space back: dropped columns and the idle rows are only reclaimed
-- when the tables are rewritten. Then the carrier directory, whose fleet
-- sizes come through v_airline_metrics.
vacuum (full, analyze) public.aircraft;
vacuum (full, analyze) public.flights;
vacuum (full, analyze) public.flight_assignments;
refresh materialized view public.mv_airline_directory;

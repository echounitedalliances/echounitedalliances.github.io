-- =====================================================================
--  Echo United Alliances -- carrier profiles, timetables, admin editing
--
--  Three things the site needs that the game data does not provide directly:
--
--    1. A written profile for each of the 590 carriers. Nobody is going to
--       hand-write 590, so one is generated from what the airline actually
--       does -- where it flies, from where, on what -- and a person can
--       overwrite it whenever they like. The generated text is never stored
--       over a hand-written one.
--
--    2. A timetable a person can read, by day of week.
--
--    3. Somewhere for "admin" to mean something. A Resonant flagged as an
--       admin may edit the editorial columns on any carrier; nobody else may
--       edit any of them.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Who may edit
-- ---------------------------------------------------------------------

alter table public.resonants
    add column if not exists is_admin boolean not null default false;

comment on column public.resonants.is_admin is
    'Site administrator. Grant by hand in SQL: update resonants set is_admin = true where email = ...';

create or replace function public.echo_is_admin()
returns boolean language sql stable as $$
    select coalesce(
        (select r.is_admin from public.resonants r
          where r.user_id = public.echo_current_user_id()),
        false);
$$;

-- Admins may change the editorial columns, and only those. The game-derived
-- columns stay read-only to everyone: they are rewritten by the next import.
drop policy if exists airlines_admin_update on public.airlines;
create policy airlines_admin_update on public.airlines
    for update to authenticated
    using (public.echo_is_admin())
    with check (public.echo_is_admin());

grant update (description_md, website_url, booking_url, logo_path,
              accent_color, is_published)
    on public.airlines to authenticated;

comment on policy airlines_admin_update on public.airlines is
    'Only an admin Resonant may edit a carrier. The column grant limits what can change even then.';

-- ---------------------------------------------------------------------
-- The generated marketing profile
--
-- Built from what the carrier actually operates. It reads as copy rather than
-- statistics because the shape of the sentence changes with the shape of the
-- airline: a two-aircraft regional and a 600-aircraft long-haul network should
-- not get the same paragraph.
-- ---------------------------------------------------------------------

-- Widebodies, by the model names the game actually uses.
create or replace function public.echo_is_widebody(p_model text)
returns boolean language sql immutable parallel safe as $$
    select p_model ~* '(747|777|787|A3(3|4|5|8)0|A350|A380|MD-11|IL-96|767|A300|A310)';
$$;

create or replace function public.echo_generate_profile(p_uid uuid)
returns text language plpgsql stable as $$
declare
    a           record;
    d           record;
    countries   integer;
    hub_list    text;
    top_model   text;
    wide        integer;
    longest     record;
    busiest     record;
    reach       text;
    fleet_line  text;
    out_text    text;
begin
    select * into a from public.mv_airline_directory where uid = p_uid;
    if not found then
        return null;
    end if;
    select * into d from public.divisions where division_code = a.division_code;

    -- how far the network spreads, in countries rather than airports
    select count(distinct ap.country_code) into countries
      from public.flights f
      cross join lateral (values (f.origin_iata), (f.destination_iata)) as x(iata)
      join public.airports ap on ap.iata_code = x.iata
     where f.airline_uid = p_uid and ap.country_code is not null;

    select count(*) into wide
      from public.aircraft ac
     where ac.airline_uid = p_uid
       and not ac.is_placeholder
       and public.echo_is_widebody(ac.aircraft_model);

    top_model := a.most_common_aircraft;

    select l.origin_iata, l.destination_iata, l.duration_minutes into longest
      from public.mv_leg_departures l
     where l.airline_uid = p_uid
     order by l.duration_minutes desc
     limit 1;

    select r.origin_iata, r.destination_iata, r.departures_per_week into busiest
      from public.v_routes r
     where r.airline_uid = p_uid
     order by r.departures_per_week desc
     limit 1;

    if a.hubs is not null and array_length(a.hubs, 1) > 0 then
        hub_list := array_to_string(a.hubs[1:least(array_length(a.hubs,1), 3)], ', ');
    end if;

    -- ---- sentence 1: who and where from ----
    out_text := coalesce(nullif(trim(a.airline_name), ''), 'This carrier')
        || ' is a member of Echo United Alliances, flying in the '
        || d.division_name || ' division';
    if a.airline_country is not null then
        out_text := out_text || ' under the flag of ' || a.airline_country;
    end if;
    out_text := out_text || '.';

    -- ---- sentence 2: the network ----
    if a.routes = 0 then
        out_text := out_text || ' It holds a fleet but has not yet filed a schedule.';
        return out_text;
    end if;

    reach := case
        when countries >= 40 then 'a genuinely global network'
        when countries >= 15 then 'a wide international network'
        when countries >= 5  then 'an international network'
        when countries = 1   then 'a domestic network'
        else 'a regional network'
    end;

    out_text := out_text || ' From '
        || coalesce(hub_list, 'its bases')
        || ' it operates ' || reach || ' of ' || a.routes || ' routes to '
        || a.destinations || ' destinations';
    if countries > 1 then
        out_text := out_text || ' across ' || countries || ' countries';
    end if;
    out_text := out_text || '.';

    -- ---- sentence 3: the fleet ----
    fleet_line := ' The fleet numbers ' || a.fleet_size || ' aircraft';
    if a.aircraft_types > 1 then
        fleet_line := fleet_line || ' across ' || a.aircraft_types || ' types';
    end if;
    if top_model is not null then
        fleet_line := fleet_line || ', built around the ' || top_model;
    end if;
    if wide > 0 and a.fleet_size > 0 then
        fleet_line := fleet_line || ', with ' || wide
            || case when wide = 1 then ' widebody' else ' widebodies' end
            || ' for the long-haul work';
    end if;
    out_text := out_text || fleet_line || '.';

    -- ---- sentence 4: something specific ----
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
$$;

comment on function public.echo_generate_profile(uuid) is
    'A written profile derived from what the carrier operates. Used only where airlines.description_md is null; a hand-written profile always wins.';

-- ---------------------------------------------------------------------
-- Timetable
-- ---------------------------------------------------------------------

create or replace function public.airline_timetable(
    p_uid uuid, p_airport text default null
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
       and (p_airport is null or p_airport = '' or l.origin_iata = upper(p_airport))
     order by l.origin_iata, l.departure_time;
$$;

comment on function public.airline_timetable(uuid, text) is
    'One row per scheduled service with the weekdays it operates. 0 = Monday.';

-- ---------------------------------------------------------------------
-- The globe: click an airport, see where it reaches
-- ---------------------------------------------------------------------

create or replace function public.airport_routes(p_iata text)
returns table (
    origin_iata      text,
    destination_iata text,
    origin_lat       double precision,
    origin_lon       double precision,
    dest_lat         double precision,
    dest_lon         double precision,
    division_code    text,
    accent_color     text,
    carriers         bigint,
    weekly_departures bigint,
    city_name        text
)
language sql stable parallel safe as $$
    -- Reads mv_route_adjacency, which already holds the totals and the
    -- dominant division per city pair, so this is an index range scan over
    -- 123k rows. Aggregating the 3.6M-row leg table per click instead
    -- measured 66 seconds at LHR, and 2.1 seconds even once set-based.
    select o.iata_code, d.iata_code,
           o.latitude, o.longitude, d.latitude, d.longitude,
           r.division_code,
           coalesce(dv.accent_color, '#A855F7'),
           r.carriers::bigint, r.weekly_departures::bigint, d.city_name
      from public.mv_route_adjacency r
      join public.airports o on o.iata_code = r.origin_iata
      join public.airports d on d.iata_code = r.destination_iata
      left join public.divisions dv on dv.division_code = r.division_code
     where r.origin_iata = upper(p_iata)
       and o.latitude is not null and d.latitude is not null
     order by r.weekly_departures desc
     limit 400;
$$;

comment on function public.airport_routes(text) is
    'Everywhere the alliance flies from one airport, with coordinates and the division colour. What the globe re-draws on a click.';

grant execute on function
    public.airline_timetable(uuid, text),
    public.airport_routes(text),
    public.echo_generate_profile(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------
-- Wire the generated profile into the directory the site reads
-- ---------------------------------------------------------------------

drop materialized view if exists public.mv_airline_directory cascade;
create materialized view public.mv_airline_directory as
select
    a.uid,
    a.division_code,
    d.division_name,
    coalesce(a.accent_color, d.accent_color)  as accent_color,
    a.airline_slug,
    a.carrier_code,
    a.airline_code,
    a.airline_name,
    a.airline_country,
    a.is_division_leader,
    a.website_url,
    a.booking_url,
    a.description_md,
    m.fleet_size,
    m.aircraft_types,
    m.most_common_aircraft,
    m.flight_pairs,
    m.routes,
    m.destinations,
    m.hub_count,
    m.hubs,
    m.cheapest_economy_usd,
    (m.fleet_size * 2 + m.routes)             as prominence,
    lower(coalesce(a.airline_name, '') || ' ' || coalesce(a.carrier_code, '') || ' '
          || coalesce(a.airline_code, '') || ' ' || coalesce(a.airline_country, '')
          || ' ' || d.division_name)          as search_blob
from public.airlines a
join public.divisions d on d.division_code = a.division_code
join public.v_airline_metrics m on m.airline_uid = a.uid
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

-- The generated profile is a function of the schedule, so it is computed on
-- read rather than stored: a re-import changes the network and the words
-- follow it. A hand-written description_md always wins.
create or replace view public.v_airline_profile
with (security_invoker = on) as
select d.*,
       coalesce(d.description_md, public.echo_generate_profile(d.uid)) as description,
       (d.description_md is not null)                                 as description_is_custom
from public.mv_airline_directory d;

comment on view public.v_airline_profile is
    'A carrier plus its profile text. Read this for one carrier; read mv_airline_directory for lists, where generating 590 paragraphs would be wasteful.';

grant select on public.mv_airline_directory to anon, authenticated;
grant select on public.v_airline_profile to anon, authenticated;

-- search_airlines returns the directory shape, so it has to be recreated
-- against the rebuilt materialised view.
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

grant execute on function public.search_airlines(text, text, text, integer, integer)
    to anon, authenticated;

-- airport_carriers joins the directory too.
create or replace function public.airport_carriers(p_iata text)
returns table (
    uid uuid, division_code text, division_name text, accent_color text,
    airline_slug text, carrier_code text, airline_name text,
    destinations_from_here bigint, is_hub boolean
)
language sql stable parallel safe as $$
    select d.uid, d.division_code, d.division_name, d.accent_color,
           d.airline_slug, d.carrier_code, d.airline_name,
           count(distinct l.destination_iata),
           exists (select 1 from public.airline_hubs h
                    where h.airline_uid = d.uid and h.airport_iata = upper(p_iata))
      from public.mv_leg_departures l
      join public.mv_airline_directory d on d.uid = l.airline_uid
     where l.origin_iata = upper(p_iata)
     group by d.uid, d.division_code, d.division_name, d.accent_color,
              d.airline_slug, d.carrier_code, d.airline_name
     order by count(distinct l.destination_iata) desc, d.airline_name;
$$;

grant execute on function public.airport_carriers(text) to anon, authenticated;

commit;

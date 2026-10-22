-- =====================================================================
--  Echo United Alliances -- the facts behind a carrier's profile
--
--  echo_generate_profile() (11_profiles_admin) writes a carrier's
--  description as English prose. The site now reads in eight languages,
--  and 676 descriptions times seven languages is not something anybody
--  translates by hand -- but the description is a template filled with
--  figures, so the figures are what travel. This returns them, and the
--  site writes the same sentences in the reader's language
--  (web/src/lib/profile.ts). English keeps using the generated text as is.
--
--  Every figure is computed exactly as echo_generate_profile computes it,
--  so the two versions of a description can never disagree.
--
--  Security definer, like the view that calls the generator: the sums it
--  reads from (flights, aircraft) are not readable row by row from the
--  site, and nothing here returns a row, only counts and three codes.
-- =====================================================================

begin;

create or replace function public.airline_profile_facts(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    a         record;
    d         record;
    countries integer;
    wide      integer;
    longest   record;
    busiest   record;
begin
    select * into a from public.mv_airline_directory where uid = p_uid;
    if not found then
        return null;
    end if;
    select * into d from public.divisions where division_code = a.division_code;

    select count(distinct ap.country_code) into countries
      from public.flights f
      cross join lateral (values (f.origin_iata), (f.destination_iata)) as x(iata)
      join public.airports ap on ap.iata_code = x.iata
     where f.airline_uid = p_uid and ap.country_code is not null;

    select count(*) into wide
      from public.aircraft ac
     where ac.airline_uid = p_uid and not ac.is_placeholder
       and public.echo_is_widebody(ac.aircraft_model);

    select l.origin_iata, l.destination_iata, l.duration_minutes into longest
      from public.mv_leg_departures l
     where l.airline_uid = p_uid
     order by l.duration_minutes desc limit 1;

    select r.origin_iata, r.destination_iata, r.departures_per_week into busiest
      from public.v_routes r
     where r.airline_uid = p_uid
     order by r.departures_per_week desc limit 1;

    return jsonb_build_object(
        'airline_name',   nullif(trim(a.airline_name), ''),
        'division_name',  d.division_name,
        'country_code',   a.airline_country,
        'hubs',           case when a.hubs is not null and array_length(a.hubs, 1) > 0
                               then to_jsonb(a.hubs[1:least(array_length(a.hubs, 1), 3)]) end,
        'routes',         a.routes,
        'destinations',   a.destinations,
        'countries',      countries,
        'fleet_size',     a.fleet_size,
        'aircraft_types', a.aircraft_types,
        'main_aircraft',  a.most_common_aircraft,
        'widebodies',     wide,
        'longest',        case when longest.origin_iata is not null then jsonb_build_object(
                              'from', longest.origin_iata, 'to', longest.destination_iata,
                              'minutes', longest.duration_minutes) end,
        'busiest',        case when busiest.origin_iata is not null then jsonb_build_object(
                              'from', busiest.origin_iata, 'to', busiest.destination_iata,
                              'weekly', busiest.departures_per_week) end
    );
end;
$$;

comment on function public.airline_profile_facts(uuid) is
    'The figures echo_generate_profile() writes a carrier''s description from, so the site can write it in another language.';

revoke all on function public.airline_profile_facts(uuid) from public;
grant execute on function public.airline_profile_facts(uuid) to anon, authenticated;

commit;

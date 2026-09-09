-- =====================================================================
--  Echo United Alliances -- admin edits to a carrier's name and blurb
--
--  An admin can correct two things about any member airline: what it is
--  called, and the paragraph describing it. Nothing else, on purpose --
--  fleet, routes, hubs and fares all come from the game and are rewritten by
--  the next import, so an edit to any of them would be a lie with a short
--  shelf life.
--
--  WHY A SEPARATE TABLE, AND WHY NO FOREIGN KEY
--
--  The obvious implementation is to write straight into public.airlines.
--  That silently loses every edit, because 02_load_from_csv.sql does
--
--      truncate ... public.airlines ... restart identity cascade
--
--  before re-copying the scrape. Anything an admin typed is gone at the next
--  data refresh, and nothing reports it -- the edit just quietly reverts
--  weeks later.
--
--  So edits live here, and this table has NO foreign key to airlines. It
--  would be the natural thing to add, and it is exactly wrong: TRUNCATE
--  CASCADE follows foreign keys, so the FK that looks like integrity is the
--  thing that would empty this table along with the one it points at.
--  airline_uid is the game's own identifier and is stable across scrapes, so
--  a plain uuid is enough to find the carrier again afterwards.
--
--  HOW AN EDIT REACHES THE PAGE
--
--  mv_airline_directory is where every carrier page and listing reads from,
--  and refreshing it takes 21 seconds -- far too long to sit inside an admin
--  clicking Save, and longer than the statement timeout a browser request
--  gets. So the override is applied in the thin read layer instead:
--  v_airline_directory_live coalesces it over the matview, and both readers
--  go through that. An edit is visible immediately, everywhere, with no
--  refresh at all.
--
--  echo_apply_airline_overrides() copies the overrides back into
--  public.airlines so the base table agrees too, and is called at the end of
--  this file -- which in a full deploy runs after the CSV load has wiped it.
-- =====================================================================

begin;

create table if not exists public.airline_overrides (
    -- Deliberately NOT a foreign key. See the header.
    airline_uid    uuid primary key,
    -- Null means "no override" -- the scraped value stands. That is how an
    -- admin reverts: clear the field rather than retype what the game says.
    airline_name   text check (airline_name is null or btrim(airline_name) <> ''),
    description_md text,
    updated_at     timestamptz not null default now(),
    updated_by     uuid
);

comment on table public.airline_overrides is
    'Admin edits to a carrier''s name and description. Survives the truncate-and-reload in 02_load_from_csv.sql, which is the entire reason it is not just columns on airlines. No foreign key on purpose: truncate cascade would follow it.';

comment on column public.airline_overrides.airline_name is
    'Null means the scraped name stands. Clearing this field is how an edit is undone.';

-- ---------------------------------------------------------------------
--  What everything reads
-- ---------------------------------------------------------------------

create or replace view public.v_airline_directory_live
with (security_invoker = on) as
select d.uid,
       d.division_code,
       d.division_name,
       d.accent_color,
       d.airline_slug,
       d.carrier_code,
       d.airline_code,
       coalesce(o.airline_name, d.airline_name)     as airline_name,
       d.airline_country,
       d.is_division_leader,
       d.website_url,
       d.booking_url,
       coalesce(o.description_md, d.description_md) as description_md,
       d.fleet_size,
       d.aircraft_types,
       d.most_common_aircraft,
       d.flight_pairs,
       d.routes,
       d.destinations,
       d.hub_count,
       d.hubs,
       d.cheapest_economy_usd,
       d.prominence,
       -- The search blob is lowercase name + code + country, and a renamed
       -- carrier has to be findable by its new name straight away.
       case when o.airline_name is null then d.search_blob
            else d.search_blob || ' ' || lower(o.airline_name) end as search_blob
  from public.mv_airline_directory d
  left join public.airline_overrides o on o.airline_uid = d.uid;

comment on view public.v_airline_directory_live is
    'mv_airline_directory with any admin override applied. Column order and types match the matview exactly so search_airlines can keep returning setof mv_airline_directory.';

grant select on public.v_airline_directory_live to anon, authenticated;

-- Same signature, same return type, one word different in the body: it reads
-- the live view rather than the matview underneath it.
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
      from public.v_airline_directory_live
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

-- The carrier page. Identical to the definition in 11_profiles_admin.sql
-- except for the relation it reads; that file cannot reference this one,
-- because this table does not exist yet when it runs.
create or replace view public.v_airline_profile
with (security_invoker = on) as
select d.*,
       coalesce(d.description_md, public.echo_generate_profile(d.uid)) as description,
       d.description_md is not null as description_is_custom
  from public.v_airline_directory_live d;

grant select on public.v_airline_profile to anon, authenticated;

-- ---------------------------------------------------------------------
--  Keeping the base table in step
-- ---------------------------------------------------------------------

create or replace function public.echo_apply_airline_overrides()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
    n integer;
begin
    update public.airlines a
       set airline_name   = coalesce(o.airline_name, a.airline_name),
           description_md = coalesce(o.description_md, a.description_md)
      from public.airline_overrides o
     where o.airline_uid = a.uid;
    get diagnostics n = row_count;
    return n;
end;
$$;

comment on function public.echo_apply_airline_overrides() is
    'Re-apply admin edits onto public.airlines after a CSV reload has replaced it. Reads do not depend on this -- v_airline_directory_live already coalesces -- but the base table should not disagree with the site.';

-- ---------------------------------------------------------------------
--  The one write an admin can make
-- ---------------------------------------------------------------------

create or replace function public.admin_update_airline(
    p_uid            uuid,
    p_airline_name   text default null,
    p_description_md text default null
)
returns setof public.v_airline_profile
language plpgsql volatile security definer set search_path = public as $$
declare
    v_name text := nullif(btrim(coalesce(p_airline_name, '')), '');
    v_desc text := nullif(btrim(coalesce(p_description_md, '')), '');
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may edit a carrier'
            using errcode = 'insufficient_privilege';
    end if;

    if not exists (select 1 from public.airlines where uid = p_uid) then
        raise exception 'No such carrier' using errcode = 'no_data_found';
    end if;

    if v_name is not null and length(v_name) > 80 then
        raise exception 'An airline name is at most 80 characters'
            using errcode = 'check_violation';
    end if;
    if v_desc is not null and length(v_desc) > 4000 then
        raise exception 'A description is at most 4000 characters'
            using errcode = 'check_violation';
    end if;

    -- An empty field means "drop the override", not "store an empty string",
    -- so clearing the box restores whatever the game says.
    insert into public.airline_overrides
                (airline_uid, airline_name, description_md, updated_at, updated_by)
         values (p_uid, v_name, v_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set airline_name   = excluded.airline_name,
           description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    delete from public.airline_overrides
     where airline_uid = p_uid
       and airline_name is null and description_md is null;

    -- Keep the base table in agreement. The site does not read it for this,
    -- but an export or a direct query should not show something different.
    update public.airlines a
       set airline_name   = coalesce(v_name, a.airline_name),
           description_md = v_desc
     where a.uid = p_uid;

    return query select * from public.v_airline_profile where uid = p_uid;
end;
$$;

comment on function public.admin_update_airline(uuid, text, text) is
    'Set or clear a carrier''s display name and description. Admin only. Everything else about an airline comes from the game and is rewritten by the next import, so nothing else is editable.';

grant execute on function public.admin_update_airline(uuid, text, text) to authenticated;

-- Nobody edits the override table directly from the browser; the RPC above is
-- the only way in, and it checks who is asking.
revoke all on public.airline_overrides from anon, authenticated;

commit;

-- In a full deploy this runs after 02 has truncated and reloaded airlines,
-- which is exactly when the overrides need putting back.
select public.echo_apply_airline_overrides();

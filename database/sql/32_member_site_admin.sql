-- =====================================================================
--  Echo United Alliances -- admins run the member websites
--
--  A carrier whose member built a website gets a "Visit ..." button in place
--  of "Contact airline for booking", and the button opens a notice before
--  the visitor leaves -- 24_member_sites.sql says why. Until now the only way
--  to change any of it was to edit that file and redeploy. These let an admin
--  do it from the site:
--
--    which website a carrier's page offers    admin_set_airline_site
--    a website's details and its notice       admin_save_member_site
--    retiring a website altogether            admin_delete_member_site
--    every website, for the editor            admin_member_sites
--
--  The notice is assembled from the website's own fields, so all of them are
--  editable, but the sentence written for that one site -- the embedding
--  text -- is data_note:
--
--      Visit {site_name}
--      {what data_grade means}      "Matches our data", "Only part of ..."
--      {data_note}
--      {site_name} {what kind means}. Checked against our data on {checked_on}.
--      The same site also sells {the other carriers linked to it}.
--      {alt_label}: {alt_url}
--
--  24 used to rewrite every website and link from its own lists on each
--  deploy. That would have undone an admin's edit the next time anybody
--  deployed, and its "exactly 18 links" guard would have stopped the deploy
--  outright the first time an admin added a nineteenth. It now seeds a new
--  database only; from then on these tables are the source of truth.
--
--  Every function here checks for an admin again on the server. The hidden
--  buttons are courtesy, not security.
-- =====================================================================

begin;

alter table public.member_sites
    add column if not exists updated_at timestamptz,
    add column if not exists updated_by uuid;

comment on column public.member_sites.updated_at is
    'When an admin last saved this website from the site. Null for a website nobody has edited since it was seeded.';
comment on column public.member_sites.updated_by is
    'The resonant who saved it. No foreign key, like airline_overrides.updated_by: an admin leaving must not take the record with them.';

-- ---------------------------------------------------------------------
--  Visitors read both tables
--
--  airline_site() runs with the visitor's own privileges, so the button on a
--  carrier's page depends on anon being able to read these two tables. That
--  used to rest on row level security simply being off here -- the one pair
--  of public tables 08_rls_policies.sql never reached. Anything that switched
--  it on, with no policy, would hide every button and nothing would error.
--  So it is on, with the same public read the game tables get in 08, and the
--  outcome no longer depends on what state anything else left it in. Writes
--  stay closed: anon and authenticated hold SELECT and nothing else, and the
--  functions below write as the owner.
-- ---------------------------------------------------------------------

alter table public.member_sites         enable row level security;
alter table public.member_site_airlines enable row level security;

drop policy if exists member_sites_public_read on public.member_sites;
create policy member_sites_public_read on public.member_sites
    for select to anon, authenticated using (true);

drop policy if exists member_site_airlines_public_read on public.member_site_airlines;
create policy member_site_airlines_public_read on public.member_site_airlines
    for select to anon, authenticated using (true);

grant select on public.member_sites, public.member_site_airlines to anon, authenticated;

-- ---------------------------------------------------------------------
--  The link beside the button reads live
--
--  website_url mirrors the website a carrier is linked to, and the carrier
--  page shows it as a bare "Website" link only when no member site is shown
--  (a bare link would step around the notice). v_airline_directory_live read
--  it from mv_airline_directory, which is rebuilt weekly -- so a website an
--  admin removed would have lingered as a bare link for up to a week, exactly
--  the route around the notice the rule exists to close. booking_url is the
--  same kind of editorial column and reads live for the same reason.
--
--  Same columns, same order, same types as 29_airline_division_moves.sql --
--  search_airlines returns "setof public.mv_airline_directory" and would
--  break on any drift. Still NOT security_invoker, for the reason 29 gives.
-- ---------------------------------------------------------------------

create or replace view public.v_airline_directory_live as
select d.uid,
       coalesce(o.division_code, d.division_code)   as division_code,
       coalesce(dv.division_name, d.division_name)  as division_name,
       coalesce(dv.accent_color, d.accent_color)    as accent_color,
       d.airline_slug,
       d.carrier_code,
       d.airline_code,
       coalesce(o.airline_name, d.airline_name)     as airline_name,
       d.airline_country,
       d.is_division_leader,
       al.website_url,
       al.booking_url,
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
       d.search_blob
         || coalesce(' ' || lower(o.airline_name), '')
         || coalesce(' ' || lower(dv.division_name), '')            as search_blob
  from public.mv_airline_directory d
  left join public.airlines al on al.uid = d.uid
  left join public.airline_overrides o on o.airline_uid = d.uid
  left join public.divisions dv on dv.division_code = o.division_code;

comment on view public.v_airline_directory_live is
    'mv_airline_directory with admin overrides applied: name, description and division, with the division''s name and colour following the move, and the website and booking links read live. Column order and types match the matview exactly so search_airlines can keep returning setof mv_airline_directory.';

-- ---------------------------------------------------------------------
--  Every website, for the editor
-- ---------------------------------------------------------------------

create or replace function public.admin_member_sites()
returns table (
    site_slug  text,
    site_name  text,
    url        text,
    alt_url    text,
    alt_label  text,
    kind       text,
    data_grade text,
    data_note  text,
    checked_on date,
    updated_at timestamptz,
    carriers   jsonb
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may manage member websites'
            using errcode = 'insufficient_privilege';
    end if;

    -- Names from public.airlines, which renames and division moves write
    -- through to, so the list matches the carrier pages it links to.
    return query
        select s.site_slug, s.site_name, s.url, s.alt_url, s.alt_label,
               s.kind, s.data_grade, s.data_note, s.checked_on, s.updated_at,
               coalesce((
                   select jsonb_agg(jsonb_build_object(
                              'uid',           a.uid,
                              'airline_name',  a.airline_name,
                              'carrier_code',  a.carrier_code,
                              'division_code', a.division_code,
                              'airline_slug',  a.airline_slug)
                            order by a.airline_name)
                     from public.member_site_airlines m
                     join public.airlines a on a.uid = m.airline_uid
                    where m.site_slug = s.site_slug
               ), '[]'::jsonb)
          from public.member_sites s
         order by lower(s.site_name);
end;
$$;

comment on function public.admin_member_sites() is
    'Every member website with the carriers it covers, for the admin editor.';

-- ---------------------------------------------------------------------
--  Create or edit a website
-- ---------------------------------------------------------------------

-- A slug nobody sees, from the name, unique. A name with no Latin letters in
-- it ("Советские") still gets one.
create or replace function public.echo_member_site_slug(p_name text)
returns text language plpgsql volatile set search_path = public as $$
declare
    v_base text := left(trim(both '-' from
                     regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 40);
    v_slug text;
    n      integer := 1;
begin
    if v_base = '' then
        v_base := 'site';
    end if;
    v_slug := v_base;
    while exists (select 1 from public.member_sites s where s.site_slug = v_slug) loop
        n := n + 1;
        v_slug := v_base || '-' || n;
    end loop;
    return v_slug;
end;
$$;

-- A website a traveller is sent to: https, a host with a dot in it, no spaces.
create or replace function public.echo_is_site_address(p_url text)
returns boolean language sql immutable parallel safe as $$
    select p_url ~* '^https://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?([/?#][^[:space:]]*)?$';
$$;

create or replace function public.admin_save_member_site(
    p_site_slug  text,              -- null creates a new website
    p_site_name  text,
    p_url        text,
    p_kind       text,
    p_data_grade text,
    p_data_note  text,
    p_alt_url    text default null,
    p_alt_label  text default null,
    p_checked_on date default null
)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
    v_slug  text := nullif(btrim(coalesce(p_site_slug, '')), '');
    v_name  text := nullif(btrim(coalesce(p_site_name, '')), '');
    v_url   text := nullif(btrim(coalesce(p_url, '')), '');
    v_kind  text := lower(nullif(btrim(coalesce(p_kind, '')), ''));
    v_grade text := lower(nullif(btrim(coalesce(p_data_grade, '')), ''));
    v_note  text := nullif(btrim(coalesce(p_data_note, '')), '');
    v_alt   text := nullif(btrim(coalesce(p_alt_url, '')), '');
    v_altl  text := nullif(btrim(coalesce(p_alt_label, '')), '');
    v_date  date := coalesce(p_checked_on, current_date);
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may edit a member website'
            using errcode = 'insufficient_privilege';
    end if;

    if v_name is null then
        raise exception 'Give the website a name.' using errcode = 'check_violation';
    end if;
    if length(v_name) > 80 then
        raise exception 'A website name is at most 80 characters.' using errcode = 'check_violation';
    end if;
    if v_url is null or length(v_url) > 500 or not public.echo_is_site_address(v_url) then
        raise exception 'The address has to be a full https:// link, like https://example.com/.'
            using errcode = 'check_violation';
    end if;
    if v_kind is null or v_kind not in ('booking', 'brochure', 'aggregator', 'account') then
        raise exception 'Say what kind of website it is.' using errcode = 'check_violation';
    end if;
    if v_grade is null or v_grade not in ('live', 'sample', 'illustrative', 'showcase', 'unverified') then
        raise exception 'Say how far its data can be trusted.' using errcode = 'check_violation';
    end if;
    if v_note is null then
        raise exception 'Write the notice visitors read before they leave for this website.'
            using errcode = 'check_violation';
    end if;
    if length(v_note) > 1000 then
        raise exception 'The notice is at most 1,000 characters.' using errcode = 'check_violation';
    end if;
    if (v_alt is null) <> (v_altl is null) then
        raise exception 'A second link needs both an address and a label, or neither.'
            using errcode = 'check_violation';
    end if;
    if v_alt is not null and (length(v_alt) > 500 or not public.echo_is_site_address(v_alt)) then
        raise exception 'The second link has to be a full https:// link too.'
            using errcode = 'check_violation';
    end if;
    if v_altl is not null and length(v_altl) > 40 then
        raise exception 'The second link''s label is at most 40 characters.'
            using errcode = 'check_violation';
    end if;
    if v_date > current_date then
        raise exception 'It cannot have been checked on a day that has not happened yet.'
            using errcode = 'check_violation';
    end if;

    if v_slug is null then
        v_slug := public.echo_member_site_slug(v_name);
        insert into public.member_sites
               (site_slug, site_name, url, alt_url, alt_label, kind, data_grade,
                data_note, checked_on, updated_at, updated_by)
        values (v_slug, v_name, v_url, v_alt, v_altl, v_kind, v_grade,
                v_note, v_date, now(), public.echo_current_resonant());
    else
        update public.member_sites s
           set site_name  = v_name,
               url        = v_url,
               alt_url    = v_alt,
               alt_label  = v_altl,
               kind       = v_kind,
               data_grade = v_grade,
               data_note  = v_note,
               checked_on = v_date,
               updated_at = now(),
               updated_by = public.echo_current_resonant()
         where s.site_slug = v_slug;
        if not found then
            raise exception 'There is no member website %.', v_slug
                using errcode = 'no_data_found';
        end if;

        -- The mirror follows the address to every carrier on the website.
        update public.airlines a
           set website_url = v_url
          from public.member_site_airlines m
         where m.site_slug = v_slug
           and m.airline_uid = a.uid
           and a.website_url is distinct from v_url;
    end if;

    return v_slug;
end;
$$;

comment on function public.admin_save_member_site(text, text, text, text, text, text, text, text, date) is
    'Create a member website (slug null) or edit one, including the notice visitors read before leaving for it. Every carrier linked to it shows the change at once.';

-- ---------------------------------------------------------------------
--  Which website a carrier's page offers
-- ---------------------------------------------------------------------

create or replace function public.admin_set_airline_site(
    p_uid       uuid,
    p_site_slug text        -- null or empty: no website, back to "Contact airline"
)
returns table (
    site_slug   text,
    site_name   text,
    url         text,
    alt_url     text,
    alt_label   text,
    kind        text,
    data_grade  text,
    data_note   text,
    checked_on  date,
    also_serves text[]
)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
    v_slug text := nullif(btrim(coalesce(p_site_slug, '')), '');
    v_url  text;
    v_old  text;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may change a carrier''s website'
            using errcode = 'insufficient_privilege';
    end if;

    if not exists (select 1 from public.airlines a where a.uid = p_uid) then
        raise exception 'No such carrier' using errcode = 'no_data_found';
    end if;

    if v_slug is not null then
        select s.url into v_url from public.member_sites s where s.site_slug = v_slug;
        if not found then
            raise exception 'There is no member website %.', v_slug
                using errcode = 'no_data_found';
        end if;
    end if;

    select s.url into v_old
      from public.member_site_airlines m
      join public.member_sites s on s.site_slug = m.site_slug
     where m.airline_uid = p_uid;

    -- One website per carrier (member_site_airlines_one_site), so linking it
    -- to a new one is moving it off the old one.
    delete from public.member_site_airlines m where m.airline_uid = p_uid;
    if v_slug is not null then
        insert into public.member_site_airlines (site_slug, airline_uid) values (v_slug, p_uid);
    end if;

    -- website_url is the mirror. Linking writes the new address; unlinking
    -- clears it only if it was the old website's, so an address somebody set
    -- by hand for a carrier with no member website is left alone.
    if v_slug is not null then
        update public.airlines a set website_url = v_url
         where a.uid = p_uid and a.website_url is distinct from v_url;
    else
        update public.airlines a set website_url = null
         where a.uid = p_uid and a.website_url = v_old;
    end if;

    return query select * from public.airline_site(p_uid);
end;
$$;

comment on function public.admin_set_airline_site(uuid, text) is
    'Link a carrier to a member website, move it to another, or take it off (null). Returns what the carrier page will now show, as airline_site does.';

-- ---------------------------------------------------------------------
--  Retiring a website
-- ---------------------------------------------------------------------

create or replace function public.admin_delete_member_site(p_site_slug text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
    v_url text;
    n     integer;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may remove a member website'
            using errcode = 'insufficient_privilege';
    end if;

    select s.url into v_url from public.member_sites s where s.site_slug = p_site_slug;
    if not found then
        raise exception 'There is no member website %.', p_site_slug
            using errcode = 'no_data_found';
    end if;

    update public.airlines a
       set website_url = null
      from public.member_site_airlines m
     where m.site_slug = p_site_slug
       and m.airline_uid = a.uid
       and a.website_url = v_url;

    select count(*) into n from public.member_site_airlines m where m.site_slug = p_site_slug;

    -- The links go with it: on delete cascade.
    delete from public.member_sites s where s.site_slug = p_site_slug;
    return n;
end;
$$;

comment on function public.admin_delete_member_site(text) is
    'Remove a member website. Every carrier it covered goes back to "Contact airline for booking". Returns how many that was.';

-- ---------------------------------------------------------------------
--  Who may call what
--
--  PostgreSQL grants EXECUTE on every new function to PUBLIC, and anon is a
--  member of PUBLIC -- so each of these is revoked explicitly, as 29 learnt.
-- ---------------------------------------------------------------------

revoke all on function public.admin_member_sites() from public, anon;
revoke all on function public.admin_save_member_site(text, text, text, text, text, text, text, text, date) from public, anon;
revoke all on function public.admin_set_airline_site(uuid, text) from public, anon;
revoke all on function public.admin_delete_member_site(text) from public, anon;
revoke all on function public.echo_member_site_slug(text) from public, anon, authenticated;

grant execute on function public.admin_member_sites() to authenticated;
grant execute on function public.admin_save_member_site(text, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.admin_set_airline_site(uuid, text) to authenticated;
grant execute on function public.admin_delete_member_site(text) to authenticated;

commit;

-- =====================================================================
--  Echo United Alliances -- moving a carrier between divisions
--
--  The scrape puts each airline in a division and is sometimes wrong about
--  it: a carrier transfers, or was filed under the wrong one to begin with.
--  Until now the only fix was an UPDATE in psql, which the next CSV reload
--  silently undid.
--
--  This rides on 26_airline_overrides: division_code becomes a third
--  overridable column beside airline_name and description_md, for the same
--  reason those are there -- 02_load_from_csv truncates public.airlines, so
--  anything typed straight into it has a shelf life of one data refresh.
--
--  WHAT UPDATES, AND WHEN
--
--  A division is not just a label on the airline; it is the colour its routes
--  are drawn in and a row in every per-division total. Those fall into three
--  groups, and it is worth being exact about which is which:
--
--   1. Immediately, through the read layer.
--      v_airline_directory_live coalesces the override, so the carrier page,
--      every listing, the directory, search, and the division filter all
--      change on the next read. mv_airline_directory itself is NOT refreshed
--      -- that takes 21 seconds, longer than the 15s statement timeout the
--      browser gets, which is the whole reason the coalescing view exists.
--
--   2. Immediately, because they were never materialised.
--      v_division_summary, v_routes, v_fleet, v_route_pairs, v_airline_metrics
--      and the rest read public.airlines directly, so the write-through below
--      is enough. Division carrier/aircraft/route totals are right at once.
--
--   3. On the next deploy: the three network matviews.
--      mv_network_arcs, mv_division_arcs and mv_route_adjacency each store a
--      division per city pair -- the dominant one, aggregated over every leg
--      flown. A single carrier moving can change that for any pair it flies,
--      and there is no way to patch it in a read layer without redoing the
--      aggregate. Refreshing all three is far too slow for a browser request,
--      so they are rebuilt by 20_division_network.sql on the next deploy, or
--      by calling echo_refresh_division_network() from psql. Until then the
--      map draws that carrier's routes in its old colour. Nothing is wrong,
--      only a rendering that is behind; admin_move_airline says so in what it
--      returns, so the UI can tell whoever made the move rather than leaving
--      them to notice.
--
--  WHAT IS DELIBERATELY NOT TOUCHED
--
--  is_division_leader. It comes from the game, and a carrier that led one
--  division does not thereby lead the one it moves to -- but neither is it
--  this function's business to decide it has stopped leading. The move
--  reports the flag instead, and the UI warns, because a person who knows the
--  alliance should answer that, not a default in a migration.
-- =====================================================================

begin;

-- No foreign key to divisions, for the same reason the table has none to
-- airlines: divisions is in the truncate list in 02_load_from_csv.sql, and
-- truncate cascade walks foreign keys. Validated in the function instead.
alter table public.airline_overrides
    add column if not exists division_code text;

-- Where the scrape had put it before the first move.
--
-- This is needed because the move writes through to airlines.division_code --
-- it has to, or every view that was never materialised still reports the old
-- division. That write destroys the only other record of where the carrier
-- came from, so without this column "move it back" cannot be told from "move
-- it somewhere new", the override row is never cleared, and a carrier the
-- GAME later moves stays pinned to a division an admin corrected months ago.
alter table public.airline_overrides
    add column if not exists scraped_division_code text;

comment on column public.airline_overrides.division_code is
    'Null means the scraped division stands. Set by admin_move_airline; re-applied to public.airlines after a CSV reload by echo_apply_airline_overrides.';

comment on column public.airline_overrides.scraped_division_code is
    'The division the scrape had this carrier in before the first move, kept because the move overwrites airlines.division_code. Moving back to it clears the override instead of pinning the carrier there for ever.';

-- ---------------------------------------------------------------------
--  The read layer
-- ---------------------------------------------------------------------

-- Same columns, same order, same types as before -- search_airlines still
-- returns "setof public.mv_airline_directory" and would break on any drift.
-- Still NOT security_invoker: airline_overrides is revoked from anon and
-- authenticated, and an invoker view over it returned 401 on every carrier
-- page the last time that was tried.
create or replace view public.v_airline_directory_live as
select d.uid,
       coalesce(o.division_code, d.division_code)   as division_code,
       coalesce(dv.division_name, d.division_name)  as division_name,
       -- All 602 carriers hold their division's colour in airlines.accent_color
       -- verbatim -- 19_division_colours writes it there -- so that column
       -- carries nothing of its own to preserve, and a moved carrier simply
       -- takes the new division's colour. A carrier's real identity colour is
       -- its livery brand_color, which lives in v_airline_accent and is
       -- untouched by any of this.
       coalesce(dv.accent_color, d.accent_color)    as accent_color,
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
       -- A renamed carrier has to be findable by its new name, and a moved one
       -- by its new division, straight away. Both are appended rather than
       -- replacing, so the old spelling keeps working for whoever learnt it.
       d.search_blob
         || coalesce(' ' || lower(o.airline_name), '')
         || coalesce(' ' || lower(dv.division_name), '')            as search_blob
  from public.mv_airline_directory d
  left join public.airline_overrides o on o.airline_uid = d.uid
  left join public.divisions dv on dv.division_code = o.division_code;

comment on view public.v_airline_directory_live is
    'mv_airline_directory with admin overrides applied: name, description and division, with the division''s name and colour following the move. Column order and types match the matview exactly so search_airlines can keep returning setof mv_airline_directory.';

-- ---------------------------------------------------------------------
--  Keeping public.airlines in step
-- ---------------------------------------------------------------------

-- Extended for division_code. Everything that is not materialised reads
-- public.airlines directly, so this is what makes the division totals, the
-- route views and the fleet views correct rather than only the carrier page.
create or replace function public.echo_apply_airline_overrides()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
    n integer;
begin
    update public.airlines a
       set airline_name   = coalesce(o.airline_name, a.airline_name),
           description_md = coalesce(o.description_md, a.description_md),
           division_code  = coalesce(o.division_code, a.division_code),
           -- The colour has to follow the division here too, or a reload puts
           -- the carrier back in the right division still painted as the one
           -- it left. Same guard as the move itself: only a colour that is
           -- still exactly the old division's is replaced.
           accent_color   = case
               when o.division_code is null then a.accent_color
               when upper(a.accent_color) = upper((select accent_color
                                                     from public.divisions
                                                    where division_code = a.division_code))
                    then dnew.accent_color
               else a.accent_color
           end
      from public.airline_overrides o
      left join public.divisions dnew on dnew.division_code = o.division_code
     where o.airline_uid = a.uid;
    get diagnostics n = row_count;
    return n;
end;
$$;

comment on function public.echo_apply_airline_overrides() is
    'Re-apply admin edits onto public.airlines after a CSV reload has replaced it, including any division move. Reads do not depend on this -- v_airline_directory_live already coalesces -- but the base table should not disagree with the site.';

-- ---------------------------------------------------------------------
--  The move
-- ---------------------------------------------------------------------

create or replace function public.admin_move_airline(
    p_uid           uuid,
    p_division_code text
)
returns table (
    uid               uuid,
    airline_name      text,
    division_code     text,
    division_name     text,
    accent_color      text,
    moved_from        text,
    is_division_leader boolean,
    network_stale     boolean
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_to       text := lower(nullif(btrim(coalesce(p_division_code, '')), ''));
    v_from     text;
    v_current  text;   -- what airlines.division_code says right now
    v_override text;   -- the override in force, if any
    v_scrape   text;   -- where the game had it before the first move
    v_leader   boolean;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may move a carrier'
            using errcode = 'insufficient_privilege';
    end if;

    select a.division_code, a.is_division_leader into v_current, v_leader
      from public.airlines a where a.uid = p_uid;
    if not found then
        raise exception 'No such carrier' using errcode = 'no_data_found';
    end if;

    select o.division_code, o.scraped_division_code into v_override, v_scrape
      from public.airline_overrides o where o.airline_uid = p_uid;

    -- Where it reads as being now, and where the game had it. On a first move
    -- those are the same, because nothing has overwritten airlines yet.
    v_from  := coalesce(v_override, v_current);
    v_scrape := coalesce(v_scrape, v_current);

    if v_to is null then
        raise exception 'Pick a division to move it to.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.divisions dv where dv.division_code = v_to) then
        raise exception 'There is no division called %.', v_to
            using errcode = 'foreign_key_violation';
    end if;
    if v_to = v_from then
        raise exception 'That carrier is already in %.', v_to
            using errcode = 'check_violation';
    end if;

    if v_to = v_scrape then
        -- Back where the game put it. The override has nothing left to say
        -- about divisions, and leaving it would keep overriding a value it now
        -- agrees with -- silently outranking the scrape if the game ever moves
        -- this carrier itself.
        update public.airline_overrides ao
           set division_code = null, scraped_division_code = null,
               updated_at = now(), updated_by = public.echo_current_resonant()
         where ao.airline_uid = p_uid;
    else
        insert into public.airline_overrides
                    (airline_uid, division_code, scraped_division_code, updated_at, updated_by)
             values (p_uid, v_to, v_scrape, now(), public.echo_current_resonant())
        on conflict (airline_uid) do update
           set division_code         = excluded.division_code,
               scraped_division_code = excluded.scraped_division_code,
               updated_at            = excluded.updated_at,
               updated_by            = excluded.updated_by;
    end if;

    delete from public.airline_overrides ao
     where ao.airline_uid = p_uid
       and ao.airline_name is null and ao.description_md is null
       and ao.division_code is null;

    update public.airlines a
       set division_code = v_to,
           accent_color  = case
               when upper(a.accent_color)
                    = upper((select dv.accent_color from public.divisions dv
                              where dv.division_code = v_from))
               then (select dv.accent_color from public.divisions dv
                      where dv.division_code = v_to)
               else a.accent_color
           end
     where a.uid = p_uid;

    return query
        select l.uid, l.airline_name, l.division_code, l.division_name, l.accent_color,
               v_from, l.is_division_leader,
               -- Always true: the three network matviews aggregate a division
               -- per city pair and cannot be corrected without rebuilding.
               true
          from public.v_airline_directory_live l
         where l.uid = p_uid;
end;
$$;

comment on function public.admin_move_airline(uuid, text) is
    'Move a carrier to another division. Everything except the three network matviews is correct immediately; those rebuild on the next deploy, which is what network_stale reports.';

grant execute on function public.admin_move_airline(uuid, text) to authenticated;
revoke all on function public.admin_move_airline(uuid, text) from public, anon;

-- ---------------------------------------------------------------------
--  Clearing an override without losing the division, and vice versa
-- ---------------------------------------------------------------------

-- 26 deleted the override row whenever name and description were both empty.
-- With a third column on the table that is now a data-loss bug: clearing a
-- carrier's name would silently send it back to its scraped division too.
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

    -- Note which columns are named: a division move stored on this row is
    -- left exactly as it was.
    insert into public.airline_overrides
                (airline_uid, airline_name, description_md, updated_at, updated_by)
         values (p_uid, v_name, v_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set airline_name   = excluded.airline_name,
           description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    delete from public.airline_overrides ao
     where ao.airline_uid = p_uid
       and ao.airline_name is null and ao.description_md is null
       and ao.division_code is null;

    update public.airlines a
       set airline_name   = coalesce(v_name, a.airline_name),
           description_md = v_desc
     where a.uid = p_uid;

    return query select * from public.v_airline_profile where uid = p_uid;
end;
$$;

-- 26 granted this to authenticated but never took away the EXECUTE that
-- PostgreSQL hands to PUBLIC on every new function, so anon could call it and
-- was stopped only by the admin check in the body. Correct, but a grant that
-- says something different from what is intended. "create or replace" keeps
-- existing grants, so recreating it above did not clear this either.
revoke all on function public.admin_update_airline(uuid, text, text) from public, anon;
grant execute on function public.admin_update_airline(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  Rebuilding the network colouring
-- ---------------------------------------------------------------------

-- Far too slow to call from a browser -- it is minutes of aggregation over
-- the leg table, against a 15 second statement timeout -- so it is not
-- granted to authenticated. Run it from psql after a batch of moves, or just
-- deploy: 20_division_network.sql rebuilds the same three.
create or replace function public.echo_refresh_division_network()
returns void language plpgsql volatile security definer set search_path = public as $$
begin
    refresh materialized view public.mv_network_arcs;
    refresh materialized view concurrently public.mv_division_arcs;
    refresh materialized view concurrently public.mv_route_adjacency;
end;
$$;

comment on function public.echo_refresh_division_network() is
    'Rebuild the three matviews that store a division per city pair, after a carrier has been moved. Not callable from the site: it runs far past the browser statement timeout.';

revoke all on function public.echo_refresh_division_network() from public, anon, authenticated;

commit;

-- Runs after 02 has reloaded airlines in a full deploy, which is exactly when
-- the moves need putting back.
select public.echo_apply_airline_overrides();

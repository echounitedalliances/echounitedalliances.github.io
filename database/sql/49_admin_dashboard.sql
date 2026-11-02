-- =====================================================================
--  Echo United Alliances -- the admin dashboard: members and the numbers
--
--  Three things admins could not do without opening psql: find a member by
--  name or email rather than already knowing their row, remove a member's
--  profile (never their sign-in -- see the note on admin_remove_resonant
--  below), and see how much is actually arriving: signups, and now support
--  tickets by category and status.
--
--  Promoting and demoting already exist (grant_admin / revoke_admin in
--  13_admin_grants.sql, both already granted to authenticated with their own
--  admin check inside) and are called unchanged from the new dashboard; this
--  file is only the browsing and the numbers around them. Editing or moving
--  a carrier is unchanged too -- admin_update_airline and admin_move_airline
--  (26_airline_overrides.sql, 29_airline_division_moves.sql) already do
--  that; the dashboard only adds a way to search for one without first
--  opening its page.
-- =====================================================================

begin;

create or replace function public.admin_resonants_list(
    p_query  text default null,
    p_limit  integer default 50,
    p_offset integer default 0
)
returns table (
    resonant_id   uuid,
    email         text,
    display_name  text,
    home_airport  text,
    home_division text,
    is_admin      boolean,
    joined_at     timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
    v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may browse members'
            using errcode = 'insufficient_privilege';
    end if;

    return query
        select r.resonant_id, r.email, r.display_name, r.home_airport, r.home_division,
               r.is_admin, r.joined_at
          from public.resonants r
         where v_query is null
            or r.email ilike '%' || v_query || '%'
            or r.display_name ilike '%' || v_query || '%'
         order by r.joined_at desc
         limit greatest(1, least(p_limit, 200))
        offset greatest(0, p_offset);
end;
$$;

comment on function public.admin_resonants_list(text, integer, integer) is
    'Every Resonance account, searchable by email or display name. Promoting or demoting one of these still goes through grant_admin / revoke_admin, unchanged.';

create or replace function public.admin_remove_resonant(
    p_resonant_id uuid,
    p_note        text default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_self   boolean;
    v_target public.resonants;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may remove a member'
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_target from public.resonants where resonant_id = p_resonant_id;
    if not found then
        raise exception 'No such member.' using errcode = 'no_data_found';
    end if;

    v_self := v_target.user_id = public.echo_current_user_id();
    if v_self then
        raise exception 'You cannot remove your own account from here.'
            using errcode = 'check_violation';
    end if;
    if v_target.is_admin then
        raise exception 'Demote % first; an admin is not removed this way.', v_target.email
            using errcode = 'check_violation';
    end if;

    delete from public.resonants where resonant_id = p_resonant_id;

    insert into public.admin_audit (actor_email, target_email, action, note)
    select r.email, v_target.email, 'REVOKE', coalesce(p_note, 'account removed from the admin dashboard')
      from public.resonants r where r.user_id = public.echo_current_user_id();
end;
$$;

comment on function public.admin_remove_resonant(uuid, text) is
    'Removes a member''s Resonance PROFILE only -- their Supabase sign-in is untouched, and signing in again creates a fresh, empty profile exactly as a first sign-in always has (see loadResonant in web/src/lib/auth.tsx). There is no way from the site to delete the sign-in itself. Refuses your own account, and refuses an admin, who must be demoted first.';

revoke all on function
    public.admin_resonants_list(text, integer, integer),
    public.admin_remove_resonant(uuid, text)
from public, anon;
grant execute on function
    public.admin_resonants_list(text, integer, integer),
    public.admin_remove_resonant(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------
--  The numbers
-- ---------------------------------------------------------------------

create or replace function public.admin_dashboard_stats()
returns table (
    total_resonants     bigint,
    total_admins        bigint,
    signups_last_30d     jsonb,
    tickets_by_status   jsonb,
    tickets_by_category jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may read the dashboard numbers'
            using errcode = 'insufficient_privilege';
    end if;

    return query
        select
            (select count(*) from public.resonants),
            (select count(*) from public.resonants where is_admin),
            (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', n) order by day), '[]'::jsonb)
               from (
                   select date_trunc('day', joined_at)::date as day, count(*) as n
                     from public.resonants
                    where joined_at >= now() - interval '30 days'
                    group by 1
               ) s),
            (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
               from (select status, count(*) as n from public.support_tickets group by 1) s),
            (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb)
               from (select category, count(*) as n from public.support_tickets group by 1) s);
end;
$$;

comment on function public.admin_dashboard_stats() is
    'Signups over the last 30 days and support-ticket volume, for the admin dashboard. Does not track visitor-count history -- the live count on the site reads Supabase Realtime Presence directly, which has never been logged anywhere, so there is nothing here to chart over time yet.';

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

commit;

-- =====================================================================
--  Echo United Alliances -- nobody makes themselves an admin
--
--  Reported 5 October 2026 by a penetration test. 08_rls_policies granted
--  `insert, update` on the whole of resonants to every signed-in user, and
--  the self-write policy only checks that the row is yours. is_admin is a
--  column of that row, so one request made you an admin:
--
--      PATCH /rest/v1/resonants?user_id=eq.<you>   {"is_admin": true}
--
--  (or the same in the insert that creates the row on first sign-in). An
--  account called "attacker" did exactly that the same afternoon; it changed
--  nothing an admin can change, and was deleted by hand when this applied.
--
--  Now:
--    * the client may write only the profile columns the site edits --
--      display_name, given_name, family_name, home_airport, home_division --
--      plus user_id/email/display_name when it creates its own row;
--    * a trigger refuses any change to is_admin from the site's roles and
--      sets it false on insert, should a later grant ever widen again.
--      grant_admin and revoke_admin are security definer, so they run as
--      the owner and still work;
--    * email on insert is the signed-in account's own, from the token, not
--      whatever the client sent -- grant_admin finds people by email;
--    * the email-matched admin bootstrap is gone. It existed to make the
--      first admin before there was one; there are admins now, and it kept
--      the owner's address in a public repository.
--
--  The booking tables had the same shape: insert/update (and delete on the
--  child tables) granted to authenticated, limited only to your own
--  bookings, which still let you rewrite your own fares, status or tickets.
--  The site never writes them directly -- every booking change goes through
--  the security definer functions in 10_booking_api and 35_account_bookings
--  -- so those grants are withdrawn and only reading stays.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Resonants: only the profile columns are writable
-- ---------------------------------------------------------------------

revoke insert, update on public.resonants from anon, authenticated;
grant insert (user_id, email, display_name) on public.resonants to authenticated;
grant update (display_name, given_name, family_name, home_airport, home_division)
    on public.resonants to authenticated;

-- The signed-in account's email, from the token; NULL off Supabase.
create or replace function public.echo_current_email()
returns text language plpgsql stable as $$
declare
    v text;
begin
    begin
        execute 'select auth.email()' into v;
    exception when others then
        v := null;
    end;
    return v;
end;
$$;

create or replace function public.echo_resonants_guard()
returns trigger language plpgsql as $$
begin
    -- The owner, the dashboard and the security definer functions run as
    -- other roles; only the site's own requests are held to this.
    if current_user not in ('anon', 'authenticated') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        new.is_admin := false;
        new.email := coalesce(public.echo_current_email(), new.email);
    elsif new.is_admin is distinct from old.is_admin then
        raise exception 'is_admin cannot be changed from the site; an admin uses grant_admin'
            using errcode = 'insufficient_privilege';
    end if;
    return new;
end;
$$;

drop trigger if exists resonants_guard on public.resonants;
create trigger resonants_guard
    before insert or update on public.resonants
    for each row execute function public.echo_resonants_guard();

-- ---------------------------------------------------------------------
-- The bootstrap is retired
-- ---------------------------------------------------------------------

drop trigger if exists resonants_admin_bootstrap on public.resonants;
drop function if exists public.echo_apply_admin_bootstrap();
drop table if exists public.admin_bootstrap;

-- ---------------------------------------------------------------------
-- Bookings are written only through the booking functions
-- ---------------------------------------------------------------------

revoke insert, update, delete on public.bookings,
                                 public.passengers,
                                 public.booking_segments,
                                 public.tickets
  from anon, authenticated;

drop policy if exists bookings_own_insert on public.bookings;
drop policy if exists bookings_own_update on public.bookings;

commit;

-- =====================================================================
--  Echo United Alliances -- Supabase-specific finishing
--
--  Everything before this file applies to any PostgreSQL 15+ instance. This
--  one handles the things that only matter behind Supabase's API, and each is
--  wrapped so the file still applies cleanly to a plain instance where the
--  role or extension does not exist.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Statement timeouts for the API roles
--
-- PostgREST runs queries as anon/authenticated, and Supabase caps them at a
-- few seconds by default. The two-stop search measures 82ms-1.1s depending on
-- the city pair, which fits, but a cold cache on the first query of the day
-- can be slower than the default allows. 15 seconds is generous enough to
-- never cut off a real search and short enough that nothing runs away.
-- ---------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'alter role anon set statement_timeout = ''15s''';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'alter role authenticated set statement_timeout = ''15s''';
    end if;
exception when insufficient_privilege then
    raise notice 'skipped statement_timeout: not permitted on this instance';
end
$$;

-- ---------------------------------------------------------------------
-- What the API is allowed to see
--
-- PostgREST exposes everything in the public schema that a role can select.
-- The tables below are the raw import: correct, but not what any page should
-- be reading, and exposing 1.6M fare rows to an anonymous client is a
-- needless invitation. The site reads the views and RPCs instead.
--
-- Read access stays for the things that are genuinely useful to a client;
-- the bulk tables are reachable only through the views that join them.
-- ---------------------------------------------------------------------
revoke select on public.flight_assignments from anon, authenticated;

comment on table public.flight_assignments is
    'Aircraft rostered onto a flight pair, with the four cabin fares as columns. Not exposed to the API directly - the site reads mv_leg_departures and the search RPCs.';

-- ---------------------------------------------------------------------
-- PostgREST schema cache
--
-- PostgREST caches the schema at startup. Without this notification a freshly
-- deployed function returns "Could not find the function in the schema cache"
-- until the API happens to restart, which looks exactly like a broken deploy.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- Outside the transaction: the notification only fires on commit, and a second
-- one after everything has settled costs nothing.
notify pgrst, 'reload schema';

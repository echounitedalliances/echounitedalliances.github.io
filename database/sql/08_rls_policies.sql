-- =====================================================================
--  Echo United Alliances -- row level security
--
--  The game data is public: anyone may read carriers, fleets and timetables,
--  and nobody may write them except the ETL, which connects as the owner and
--  is not subject to these policies.
--
--  Reservations are private. A Resonant sees their own bookings; a guest
--  reaches theirs only through find_booking(), which checks the PNR against a
--  passenger surname and runs as security definer.
--
--  This file is written to apply to a plain PostgreSQL instance as well as to
--  Supabase. Where it needs auth.uid() it uses a wrapper that returns NULL if
--  the auth schema is absent, so local testing does not need it.
-- =====================================================================

begin;

-- anon / authenticated exist on Supabase; create them locally so the grants
-- below apply cleanly either way.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
end
$$;

-- auth.uid() on Supabase; NULL anywhere else.
create or replace function public.echo_current_user_id()
returns uuid language plpgsql stable as $$
declare
    v uuid;
begin
    begin
        execute 'select auth.uid()' into v;
    exception when others then
        v := null;
    end;
    return v;
end;
$$;

comment on function public.echo_current_user_id() is
    'auth.uid() where Supabase provides it, NULL on a plain PostgreSQL instance so the same file applies to both.';

-- The Resonance row belonging to whoever is calling.
create or replace function public.echo_current_resonant()
returns uuid language sql stable as $$
    select r.resonant_id from public.resonants r
     where r.user_id = public.echo_current_user_id();
$$;

-- ---------------------------------------------------------------------
-- Public read on the game data
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

do $$
declare
    t text;
begin
    foreach t in array array[
        'divisions', 'airports', 'airlines', 'airline_hubs', 'airline_stats',
        'aircraft_models', 'cabin_classes', 'aircraft', 'flights',
        'flight_assignments', 'interline_agreements'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
        execute format(
            'create policy %I on public.%I for select to anon, authenticated using (true)',
            t || '_public_read', t);
        execute format('grant select on public.%I to anon, authenticated', t);
    end loop;
end
$$;

-- Views and materialised views carry no policies of their own; the views are
-- security_invoker so they inherit the policies of the tables underneath.
grant select on
    public.v_flight_legs, public.v_bookable_departures, public.v_routes,
    public.v_fleet, public.v_airline_metrics, public.v_airline_description_seed,
    public.v_stopover_itineraries, public.v_alliance_overview,
    public.v_aircraft_ratio_anomalies,
    public.mv_leg_departures, public.mv_route_adjacency,
    public.mv_airport_connectivity
to anon, authenticated;

-- ---------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------

alter table public.resonants        enable row level security;
alter table public.bookings         enable row level security;
alter table public.passengers       enable row level security;
alter table public.booking_segments enable row level security;
alter table public.tickets          enable row level security;
alter table public.departure_inventory enable row level security;

-- A Resonant reads and edits only their own membership row.
drop policy if exists resonants_self_read on public.resonants;
create policy resonants_self_read on public.resonants
    for select to authenticated
    using (user_id = public.echo_current_user_id());

drop policy if exists resonants_self_write on public.resonants;
create policy resonants_self_write on public.resonants
    for update to authenticated
    using (user_id = public.echo_current_user_id())
    with check (user_id = public.echo_current_user_id());

drop policy if exists resonants_self_insert on public.resonants;
create policy resonants_self_insert on public.resonants
    for insert to authenticated
    with check (user_id = public.echo_current_user_id());

grant select, insert, update on public.resonants to authenticated;

-- Bookings: a signed-in Resonant sees their own. Guests never select directly;
-- they go through find_booking(), which is security definer.
drop policy if exists bookings_own_read on public.bookings;
create policy bookings_own_read on public.bookings
    for select to authenticated
    using (resonant_id = public.echo_current_resonant());

drop policy if exists bookings_own_insert on public.bookings;
create policy bookings_own_insert on public.bookings
    for insert to authenticated
    with check (resonant_id is null or resonant_id = public.echo_current_resonant());

drop policy if exists bookings_own_update on public.bookings;
create policy bookings_own_update on public.bookings
    for update to authenticated
    using (resonant_id = public.echo_current_resonant())
    with check (resonant_id = public.echo_current_resonant());

grant select, insert, update on public.bookings to authenticated;

-- The child tables follow the booking.
do $$
declare
    t text;
begin
    foreach t in array array['passengers', 'booking_segments', 'tickets'] loop
        execute format('drop policy if exists %I on public.%I', t || '_via_booking', t);
        execute format($p$
            create policy %I on public.%I for all to authenticated
            using (exists (select 1 from public.bookings b
                            where b.booking_id = %I.booking_id
                              and b.resonant_id = public.echo_current_resonant()))
            with check (exists (select 1 from public.bookings b
                            where b.booking_id = %I.booking_id
                              and b.resonant_id = public.echo_current_resonant()))
        $p$, t || '_via_booking', t, t, t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end
$$;

-- Inventory is readable so the site can show "3 seats left", but never
-- writable from the client: only the triggers and the simulation touch it.
drop policy if exists departure_inventory_public_read on public.departure_inventory;
create policy departure_inventory_public_read on public.departure_inventory
    for select to anon, authenticated using (true);
grant select on public.departure_inventory to anon, authenticated;

-- ---------------------------------------------------------------------
-- The RPCs the site calls
-- ---------------------------------------------------------------------

grant execute on function
    public.search_flights(text, text, date, text, integer),
    public.search_itineraries(text, text, date, text, integer, integer, integer),
    public.find_booking(text, text),
    public.echo_available_seats(uuid, uuid, text, date, text)
to anon, authenticated;

-- Deliberately NOT granted to clients: echo_refresh_search() and
-- simulate_bookings() are maintenance, and run as the owner from a scheduled
-- job. Granting them would let anyone rebuild 3.6M rows on demand.
revoke all on function public.echo_refresh_search() from anon, authenticated;
revoke all on function public.simulate_bookings(integer) from anon, authenticated;

commit;

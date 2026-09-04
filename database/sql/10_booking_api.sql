-- =====================================================================
--  Echo United Alliances -- creating a booking from the website
--
--  The site lets people book without an account, so the write path cannot be
--  a plain insert: anon has no privileges on bookings, passengers or
--  booking_segments, and it should not get any. Instead there is one security
--  definer function that takes a whole reservation and writes it in a single
--  transaction.
--
--  That is also the correct shape regardless of privileges. A booking is three
--  inserts that must all succeed together, in order -- the inventory trigger
--  on booking_segments counts passengers to decide how many seats to take, so
--  passengers must exist before segments do.
-- =====================================================================

begin;

-- How many people may travel on one reservation.
create or replace function public.echo_max_party_size()
returns integer language sql immutable parallel safe as $$ select 9; $$;

/**
 * Create a reservation.
 *
 * p_passengers: [{"given_name":"Hai Dang","family_name":"Dang","passenger_type":"ADULT"}, ...]
 * p_segments:   [{"flight_id":"...","aircraft_id":"...","travel_date":"2026-09-10",
 *                 "direction":"OUTBOUND"}, ...]  -- in travel order
 *
 * Returns the finished booking in the same shape the manage-booking page reads.
 */
create or replace function public.create_booking(
    p_contact_email text,
    p_contact_name  text,
    p_cabin         text,
    p_passengers    jsonb,
    p_segments      jsonb
)
returns setof public.v_booking_details
language plpgsql volatile security definer set search_path = public as $$
declare
    v_booking uuid;
    v_cabin   text := upper(coalesce(p_cabin, 'ECONOMY'));
    v_pax     integer := coalesce(jsonb_array_length(p_passengers), 0);
    v_segs    integer := coalesce(jsonb_array_length(p_segments), 0);
    v_seg     jsonb;
    v_seq     integer := 0;
    v_free    integer;
    v_resonant uuid := public.echo_current_resonant();
begin
    -- ---- validate before writing anything -------------------------------
    if p_contact_email is null
       or p_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'A valid contact email is required'
            using errcode = 'check_violation';
    end if;

    if v_pax < 1 or v_pax > public.echo_max_party_size() then
        raise exception 'A booking must carry between 1 and % travellers',
            public.echo_max_party_size() using errcode = 'check_violation';
    end if;

    if v_segs < 1 or v_segs > 6 then
        raise exception 'A booking must have between 1 and 6 flights'
            using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.cabin_classes where cabin_code = v_cabin) then
        raise exception 'Unknown cabin %', v_cabin using errcode = 'check_violation';
    end if;

    -- Every traveller needs a name; the surname is how the booking is found later.
    if exists (
        select 1 from jsonb_array_elements(p_passengers) x
         where coalesce(trim(x->>'given_name'), '') = ''
            or coalesce(trim(x->>'family_name'), '') = ''
    ) then
        raise exception 'Every traveller needs a given name and a family name'
            using errcode = 'check_violation';
    end if;

    -- Refuse the whole booking if any leg cannot seat the party. The segment
    -- trigger would also stop an oversell, but failing here gives the site a
    -- message it can show instead of a constraint violation.
    for v_seg in select * from jsonb_array_elements(p_segments) loop
        v_free := public.echo_available_seats(
            (v_seg->>'flight_id')::uuid,
            (v_seg->>'aircraft_id')::uuid,
            coalesce(v_seg->>'direction', 'OUTBOUND'),
            (v_seg->>'travel_date')::date,
            v_cabin);
        if v_free < v_pax then
            raise exception 'Only % seats left in % on flight %',
                v_free, v_cabin, (v_seg->>'flight_id')
                using errcode = 'check_violation';
        end if;
    end loop;

    -- ---- write ----------------------------------------------------------
    insert into public.bookings (contact_email, contact_name, cabin_code, resonant_id)
    values (lower(trim(p_contact_email)),
            nullif(trim(coalesce(p_contact_name, '')), ''),
            v_cabin,
            v_resonant)
    returning booking_id into v_booking;

    insert into public.passengers
        (booking_id, passenger_seq, given_name, family_name, passenger_type)
    select v_booking,
           (ord)::smallint,
           trim(x->>'given_name'),
           trim(x->>'family_name'),
           coalesce(nullif(upper(x->>'passenger_type'), ''), 'ADULT')
      from jsonb_array_elements(p_passengers) with ordinality as t(x, ord);

    -- Segments last: the inventory trigger counts the passengers above.
    for v_seg in select * from jsonb_array_elements(p_segments) loop
        v_seq := v_seq + 1;
        insert into public.booking_segments
            (booking_id, segment_seq, flight_id, aircraft_id, direction,
             travel_date, cabin_code)
        values (v_booking, v_seq,
                (v_seg->>'flight_id')::uuid,
                (v_seg->>'aircraft_id')::uuid,
                coalesce(v_seg->>'direction', 'OUTBOUND'),
                (v_seg->>'travel_date')::date,
                v_cabin);
    end loop;

    return query select * from public.v_booking_details where booking_id = v_booking;
end;
$$;

comment on function public.create_booking(text, text, text, jsonb, jsonb) is
    'Write a whole reservation in one transaction. Security definer so a guest can book without any table privileges; every field is validated here.';

grant execute on function public.create_booking(text, text, text, jsonb, jsonb)
    to anon, authenticated;

-- Cancelling: the PNR and a surname are the credential, same as retrieval.
create or replace function public.cancel_booking(p_pnr text, p_family_name text)
returns setof public.v_booking_details
language plpgsql volatile security definer set search_path = public as $$
declare
    v_id uuid;
begin
    select b.booking_id into v_id
      from public.bookings b
     where b.pnr = upper(trim(p_pnr))
       and b.status <> 'CANCELLED'
       and exists (select 1 from public.passengers p
                    where p.booking_id = b.booking_id
                      and lower(p.family_name) = lower(trim(p_family_name)));
    if v_id is null then
        raise exception 'No live booking matches that reference and surname'
            using errcode = 'no_data_found';
    end if;

    -- Deleting the segments is what returns the seats: the release trigger
    -- fires on delete.
    delete from public.booking_segments where booking_id = v_id;
    update public.bookings
       set status = 'CANCELLED', cancelled_at = now()
     where booking_id = v_id;

    return query select * from public.v_booking_details where booking_id = v_id;
end;
$$;

comment on function public.cancel_booking(text, text) is
    'Cancel a reservation and return its seats to inventory.';

grant execute on function public.cancel_booking(text, text) to anon, authenticated;

commit;

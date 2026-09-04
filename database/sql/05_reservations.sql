-- =====================================================================
--  Echo United Alliances -- reservations
--
--  Resonance is the membership programme; a member is a Resonant. Signing in
--  is optional: a booking can be made as a guest and retrieved later with its
--  PNR and the contact surname, exactly as a real carrier's "manage booking"
--  page works.
--
--  A booking holds one or more SEGMENTS, in order. Nothing here assumes a
--  round trip, so a one-way, a return and a multi-city itinerary are all the
--  same shape -- which is what makes an interline itinerary across four
--  different Echo carriers a single reservation with a single PNR.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Resonance members
-- ---------------------------------------------------------------------

-- user_id is the Supabase auth user. It is deliberately NOT a foreign key to
-- auth.users: this file has to apply to a plain PostgreSQL instance for local
-- testing, where that schema does not exist. 08_rls_policies adds the
-- constraint that actually matters, which is that a Resonant may only read
-- and write their own row.
create table if not exists public.resonants (
    resonant_id   uuid primary key default gen_random_uuid(),
    user_id       uuid unique,
    email         text not null unique
                  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    display_name  text,
    given_name    text,
    family_name   text,
    home_airport  text references public.airports (iata_code),
    home_division text references public.divisions (division_code),
    joined_at     timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.resonants is
    'Resonance membership. A Resonant is an account holder; bookings may also be made without one.';

create index if not exists resonants_email_idx on public.resonants (lower(email));

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------

create table if not exists public.bookings (
    booking_id       uuid primary key default gen_random_uuid(),
    pnr              text not null unique check (pnr ~ '^[A-Z0-9]{6}$'),
    resonant_id      uuid references public.resonants (resonant_id) on delete set null,
    contact_email    text not null
                     check (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    contact_name     text,
    contact_phone    text,
    cabin_code       text references public.cabin_classes (cabin_code),
    status           text not null default 'CONFIRMED'
                     check (status in ('HELD', 'CONFIRMED', 'CANCELLED', 'FLOWN')),
    currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    total_amount_usd numeric(12,2) not null default 0 check (total_amount_usd >= 0),
    held_until       timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    cancelled_at     timestamptz,
    constraint bookings_cancel_time check (
        (status = 'CANCELLED') = (cancelled_at is not null)
    )
);

comment on table public.bookings is
    'One reservation, whatever its shape. Identified to the passenger by pnr; retrieved by pnr plus contact surname.';

create index if not exists bookings_email_idx    on public.bookings (lower(contact_email));
create index if not exists bookings_resonant_idx on public.bookings (resonant_id);
create index if not exists bookings_status_idx   on public.bookings (status);
create index if not exists bookings_created_idx  on public.bookings (created_at desc);

-- Six characters, no vowels (so it cannot spell anything) and no 0/1/I/O.
create or replace function public.echo_generate_pnr()
returns text language plpgsql volatile as $$
declare
    alphabet constant text := 'BCDFGHJKLMNPQRSTVWXYZ23456789';
    candidate text;
begin
    for _attempt in 1 .. 50 loop
        candidate := '';
        for _i in 1 .. 6 loop
            candidate := candidate ||
                substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        if not exists (select 1 from public.bookings b where b.pnr = candidate) then
            return candidate;
        end if;
    end loop;
    raise exception 'could not allocate a free PNR after 50 attempts';
end;
$$;

create or replace function public.echo_bookings_before_write()
returns trigger language plpgsql as $$
begin
    if tg_op = 'INSERT' and (new.pnr is null or new.pnr = '') then
        new.pnr := public.echo_generate_pnr();
    end if;
    new.contact_email := lower(trim(new.contact_email));
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists bookings_before_write on public.bookings;
create trigger bookings_before_write
    before insert or update on public.bookings
    for each row execute function public.echo_bookings_before_write();

-- ---------------------------------------------------------------------
-- Passengers
-- ---------------------------------------------------------------------

create table if not exists public.passengers (
    passenger_id    uuid primary key default gen_random_uuid(),
    booking_id      uuid not null references public.bookings (booking_id) on delete cascade,
    passenger_seq   smallint not null check (passenger_seq > 0),
    passenger_type  text not null default 'ADULT'
                    check (passenger_type in ('ADULT', 'CHILD', 'INFANT')),
    title           text,
    given_name      text not null,
    family_name     text not null,
    date_of_birth   date,
    resonant_id     uuid references public.resonants (resonant_id) on delete set null,
    unique (booking_id, passenger_seq)
);

comment on column public.passengers.resonant_id is
    'Set when a passenger on the booking is a Resonance member, which need not be the person who paid.';

create index if not exists passengers_booking_idx on public.passengers (booking_id);
create index if not exists passengers_name_idx    on public.passengers (lower(family_name));

-- ---------------------------------------------------------------------
-- Segments -- the flights themselves, in order
-- ---------------------------------------------------------------------

create table if not exists public.booking_segments (
    segment_id    uuid primary key default gen_random_uuid(),
    booking_id    uuid not null references public.bookings (booking_id) on delete cascade,
    segment_seq   smallint not null check (segment_seq > 0),

    flight_id     uuid not null references public.flights (flight_id),
    aircraft_id   uuid not null references public.aircraft (aircraft_id),
    direction     text not null check (direction in ('OUTBOUND', 'INBOUND')),
    travel_date   date not null,
    cabin_code    text not null references public.cabin_classes (cabin_code),

    -- denormalised so a booking still reads correctly after the game data is
    -- re-imported and a flight's times or price change underneath it
    marketing_carrier_code text,
    operating_airline_uid  uuid references public.airlines (uid),
    flight_designator      text,
    origin_iata            text references public.airports (iata_code),
    destination_iata       text references public.airports (iata_code),
    departure_time         time,
    arrival_time           time,
    arrival_days_after     smallint not null default 0,
    price_usd              integer not null default 0 check (price_usd >= 0),

    unique (booking_id, segment_seq)
);

comment on table public.booking_segments is
    'Flights on a booking, in travel order. Segments may be operated by different carriers in different divisions -- that is what makes it an interline itinerary.';
comment on column public.booking_segments.flight_designator is
    'Captured at booking time. The schedule is re-imported from the game and may change; the ticket must not.';

create index if not exists booking_segments_booking_idx on public.booking_segments (booking_id);
create index if not exists booking_segments_flight_idx
    on public.booking_segments (flight_id, aircraft_id, direction, travel_date, cabin_code);
create index if not exists booking_segments_date_idx on public.booking_segments (travel_date);

-- A segment must be on a day the flight actually operates.
create or replace function public.echo_flight_operates_on(
    p_flight_id uuid, p_aircraft_id uuid, p_direction text, p_date date
)
returns boolean language sql stable as $$
    select exists (
        select 1
          from public.v_bookable_departures d
         where d.flight_id = p_flight_id
           and d.aircraft_id = p_aircraft_id
           and d.direction = p_direction
           and public.echo_operates_on(d.departure_days_mask,
                                       (extract(isodow from p_date)::int - 1))
    );
$$;

create or replace function public.echo_segment_before_write()
returns trigger language plpgsql as $$
declare
    v_leg record;
begin
    if not public.echo_flight_operates_on(new.flight_id, new.aircraft_id,
                                          new.direction, new.travel_date) then
        raise exception 'flight % (% %) does not operate on %',
            new.flight_id, new.aircraft_id, new.direction, new.travel_date;
    end if;

    -- Fill the denormalised columns from the schedule as it stands right now.
    select d.carrier_code, d.airline_uid, d.flight_designator, d.origin_iata,
           d.destination_iata, d.departure_time, d.arrival_time,
           d.arrival_days_after_departure, d.price_usd
      into v_leg
      from public.v_bookable_departures d
     where d.flight_id = new.flight_id and d.aircraft_id = new.aircraft_id
       and d.direction = new.direction and d.cabin_code = new.cabin_code
       and public.echo_operates_on(d.departure_days_mask,
                                   (extract(isodow from new.travel_date)::int - 1))
     limit 1;

    if found then
        new.marketing_carrier_code := coalesce(new.marketing_carrier_code, v_leg.carrier_code);
        new.operating_airline_uid  := coalesce(new.operating_airline_uid, v_leg.airline_uid);
        new.flight_designator      := coalesce(new.flight_designator, v_leg.flight_designator);
        new.origin_iata            := coalesce(new.origin_iata, v_leg.origin_iata);
        new.destination_iata       := coalesce(new.destination_iata, v_leg.destination_iata);
        new.departure_time         := coalesce(new.departure_time, v_leg.departure_time);
        new.arrival_time           := coalesce(new.arrival_time, v_leg.arrival_time);
        new.arrival_days_after     := coalesce(new.arrival_days_after,
                                               v_leg.arrival_days_after_departure);
        if new.price_usd = 0 then
            new.price_usd := v_leg.price_usd;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists booking_segments_before_write on public.booking_segments;
create trigger booking_segments_before_write
    before insert or update on public.booking_segments
    for each row execute function public.echo_segment_before_write();

-- ---------------------------------------------------------------------
-- Tickets -- one per passenger per segment
-- ---------------------------------------------------------------------

create table if not exists public.tickets (
    ticket_id     uuid primary key default gen_random_uuid(),
    booking_id    uuid not null references public.bookings (booking_id) on delete cascade,
    passenger_id  uuid not null references public.passengers (passenger_id) on delete cascade,
    segment_id    uuid not null references public.booking_segments (segment_id) on delete cascade,
    ticket_number text unique,
    fare_usd      numeric(10,2) not null default 0 check (fare_usd >= 0),
    status        text not null default 'ISSUED'
                  check (status in ('ISSUED', 'CHECKED_IN', 'FLOWN', 'REFUNDED', 'VOID')),
    issued_at     timestamptz not null default now(),
    unique (passenger_id, segment_id)
);

create index if not exists tickets_booking_idx on public.tickets (booking_id);

-- ---------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------

create or replace function public.echo_recalculate_booking_total(p_booking_id uuid)
returns void language sql volatile as $$
    update public.bookings b
       set total_amount_usd = coalesce((
               select sum(s.price_usd)::numeric * greatest(
                          (select count(*) from public.passengers p
                            where p.booking_id = b.booking_id), 1)
                 from public.booking_segments s
                where s.booking_id = b.booking_id), 0),
           updated_at = now()
     where b.booking_id = p_booking_id;
$$;

comment on function public.echo_recalculate_booking_total(uuid) is
    'Segment fares times passengers. Infants are charged as adults here; change this one function if that should differ.';

create or replace function public.echo_touch_booking_total()
returns trigger language plpgsql as $$
begin
    perform public.echo_recalculate_booking_total(
        coalesce(new.booking_id, old.booking_id));
    return null;
end;
$$;

drop trigger if exists booking_segments_touch_total on public.booking_segments;
create trigger booking_segments_touch_total
    after insert or update or delete on public.booking_segments
    for each row execute function public.echo_touch_booking_total();

drop trigger if exists passengers_touch_total on public.passengers;
create trigger passengers_touch_total
    after insert or update or delete on public.passengers
    for each row execute function public.echo_touch_booking_total();

-- ---------------------------------------------------------------------
-- Reading a booking back
-- ---------------------------------------------------------------------

create or replace view public.v_booking_details
with (security_invoker = on) as
select
    b.booking_id, b.pnr, b.status, b.total_amount_usd, b.currency,
    b.contact_email, b.contact_name, b.created_at, b.resonant_id,
    (select count(*) from public.passengers p where p.booking_id = b.booking_id)
        as passenger_count,
    (select jsonb_agg(jsonb_build_object(
                'seq', p.passenger_seq, 'type', p.passenger_type,
                'given_name', p.given_name, 'family_name', p.family_name)
             order by p.passenger_seq)
       from public.passengers p where p.booking_id = b.booking_id) as passengers,
    (select jsonb_agg(jsonb_build_object(
                'seq', s.segment_seq, 'designator', s.flight_designator,
                'carrier', s.marketing_carrier_code,
                'origin', s.origin_iata, 'destination', s.destination_iata,
                'travel_date', s.travel_date,
                'departure_time', to_char(s.departure_time, 'HH24:MI'),
                'arrival_time', to_char(s.arrival_time, 'HH24:MI'),
                'arrival_days_after', s.arrival_days_after,
                'cabin', s.cabin_code, 'price_usd', s.price_usd)
             order by s.segment_seq)
       from public.booking_segments s where s.booking_id = b.booking_id) as segments,
    (select array_agg(distinct a.division_code)
       from public.booking_segments s
       join public.airlines a on a.uid = s.operating_airline_uid
      where s.booking_id = b.booking_id) as divisions
from public.bookings b;

comment on view public.v_booking_details is
    'A whole reservation in one row, passengers and segments as JSON. What the confirmation page and manage-booking page read.';

-- Retrieve a booking without an account: PNR plus the contact surname, which
-- is how every airline does it. Security definer so it can be granted to
-- anonymous users while the bookings table itself stays locked down.
create or replace function public.find_booking(p_pnr text, p_family_name text)
returns setof public.v_booking_details
language sql stable security definer set search_path = public as $$
    select d.*
      from public.v_booking_details d
     where d.pnr = upper(trim(p_pnr))
       and exists (
           select 1 from public.passengers p
            where p.booking_id = d.booking_id
              and lower(p.family_name) = lower(trim(p_family_name))
       );
$$;

comment on function public.find_booking(text, text) is
    'Manage-booking lookup for guests: PNR plus any passenger surname on it.';

commit;

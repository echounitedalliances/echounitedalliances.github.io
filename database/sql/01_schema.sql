-- =====================================================================
--  Echo United Alliances -- core schema
--  Target: Supabase (PostgreSQL 15+), schema "public"
--
--  Run the files in numeric order:
--    01_schema             tables, keys, indexes            (this file)
--    02_load_from_csv      the exported data
--    03_airports_backfill  real-world airport detail
--    04_views              directional legs, search
--    05_reservations       Resonance accounts, bookings, tickets
--    06_demand_simulation  self-filling departures
--    07_connections        adjacency graph, 0-3 stop search, multi-city
--    08_rls_policies       row level security and the public RPCs
--
--  Every table here is derived from divisions/<division>/members.json and
--  divisions/<division>/members/<airline>/{info,flights,aircrafts}.json by
--  database/scripts/build_database.py. See database/README.md for the mapping.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Reference / lookup tables
-- ---------------------------------------------------------------------

-- The eight divisions of Echo United Alliances. Proxima's roster was exported
-- as the game's alliance object and carries real alliance metadata; the other
-- seven were exported as plain member lists, so their descriptive columns are
-- null until an alliance-form export exists for them.
create table if not exists public.divisions (
    division_code        text primary key check (division_code ~ '^[a-z]+$'),
    division_name        text not null,
    sort_order           smallint not null unique,
    alliance_uid         uuid,
    alliance_name        text,
    alliance_description text,
    alliance_type        text,
    alliance_logo        text,
    alliance_logo_color  text check (alliance_logo_color ~ '^#[0-9A-Fa-f]{6}$'),
    created_time         timestamptz,
    leader_uid           uuid,
    -- Site theming. The alliance runs a dark purple identity; each division
    -- gets one accent so 590 carriers stay visually sorted.
    accent_color         text check (accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.divisions is
    'The eight member divisions. division_code doubles as the first URL segment, e.g. /proxima.';

-- Every airport that appears anywhere in the exports. The exports carry IATA
-- codes only, so the descriptive columns start out NULL and 03_airports_backfill
-- fills them without touching any other table.
create table if not exists public.airports (
    iata_code           text primary key check (iata_code ~ '^[A-Z]{3}$'),
    airport_name        text,
    city_name           text,
    country_code        text check (country_code ~ '^[A-Z]{2}$'),
    timezone            text,                       -- IANA name, e.g. 'Asia/Ho_Chi_Minh'
    utc_offset_minutes  integer check (utc_offset_minutes between -840 and 840),
    offset_source       text,
    latitude            double precision check (latitude between -90 and 90),
    longitude           double precision check (longitude between -180 and 180)
);

comment on column public.airports.utc_offset_minutes is
    'Minutes east of UTC. Needed to render arrival times in local time -- every daily timestamp in this database is local to the *departure* airport.';

-- ---------------------------------------------------------------------
-- Carriers
-- ---------------------------------------------------------------------

-- 590 carriers. The game's own airlineCode is NOT unique across the alliance:
-- 136 codes are shared and seven different airlines are called "Emirates" with
-- code EK. airline_code is therefore kept verbatim for display and a separate
-- carrier_code carries the uniqueness a booking engine needs.
create table if not exists public.airlines (
    uid                       uuid primary key,
    division_code             text not null references public.divisions (division_code),

    airline_code              text check (airline_code ~ '^[A-Z0-9]{2}$'),
    carrier_code              text not null unique check (carrier_code ~ '^[A-Z0-9]{2,6}$'),
    airline_name              text,
    airline_slug              text not null,
    airline_country           text check (airline_country ~ '^[A-Z]{2}$'),

    airline_handle            text,      -- source "airlineId", e.g. 'pour-village-local'
    flagship_aircraft_model   text,
    extra_special_livery_slot integer,
    version_string            text,
    claim_profit_time         timestamptz,
    is_division_leader        boolean not null default false,

    -- Editorial / site fields. Not from the game: maintained by hand.
    website_url               text check (website_url is null or website_url ~ '^https?://'),
    booking_url               text check (booking_url is null or booking_url ~ '^https?://'),
    description_md            text,
    accent_color              text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
    logo_path                 text,
    is_published              boolean not null default true
);

comment on table public.airlines is
    'Carriers. uid is the TAS game identifier and the parent key for fleet, flights and hubs.';
comment on column public.airlines.airline_code is
    'The in-game IATA code exactly as exported. Shared by up to seven carriers -- never use it as a key.';
comment on column public.airlines.carrier_code is
    'Globally unique designator built by build_database.py: the game code where it is unique, else the code plus a division tag, else plus an ordinal. Use this in flight designators.';
comment on column public.airlines.airline_slug is
    'URL segment, unique within a division: /<division_code>/<airline_slug>.';
comment on column public.airlines.booking_url is
    'Where "Book with this airline" sends the user. NULL means the site shows "Contact airline for booking" instead.';
comment on column public.airlines.description_md is
    'Hand-editable blurb shown on the carrier profile. Seeded from data by 04_views'' v_airline_description_seed; edit freely, nothing overwrites it.';

-- One slug per division is what the router needs; the slug alone may repeat
-- across divisions (two unrelated "Altara"s, for instance).
create unique index if not exists airlines_division_slug_key
    on public.airlines (division_code, airline_slug);
create index if not exists airlines_division_idx on public.airlines (division_code);
create index if not exists airlines_code_idx     on public.airlines (airline_code);
create index if not exists airlines_name_idx     on public.airlines (lower(airline_name));

-- Hubs. A flight may only start or end at a hub of its operator, unless it is
-- the second leg of a stopover. Proxima's roster carried no hubAirports, so its
-- hubs are derived from fleet bases -- hub_source records which.
create table if not exists public.airline_hubs (
    airline_uid  uuid not null references public.airlines (uid) on delete cascade,
    airport_iata text not null references public.airports (iata_code),
    is_major_hub boolean not null default false,
    hub_source   text not null default 'roster'
                 check (hub_source in ('roster', 'derived_from_fleet')),
    primary key (airline_uid, airport_iata)
);

create index if not exists airline_hubs_airport_idx on public.airline_hubs (airport_iata);
create unique index if not exists airline_hubs_one_major_key
    on public.airline_hubs (airline_uid) where is_major_hub;

-- Headline numbers reported by the game. Only Aegis exported members_stats.json,
-- so this table is sparse by design; v_airline_metrics computes the same figures
-- from the schedule for everyone else.
-- An airline's livery: the colours it paints its aircraft, and which tail mark
-- it wears. The game has no logo image to download -- this IS the brand, and
-- it is far more specific than the eight division accents.
create table if not exists public.airline_liveries (
    airline_uid     uuid primary key references public.airlines (uid) on delete cascade,
    livery_type     text,
    -- the first colour in the livery that reads as a brand rather than as
    -- paint; null where the airline flies white throughout
    brand_color     text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
    tail_color      text,
    fuselage_color  text,
    winglet_color   text,
    engine_color    text,
    tail_logo_type  text,
    tail_logo_color text
);

comment on table public.airline_liveries is
    'Per-carrier livery from player_livery_config. brand_color is the accent the site paints a carrier with; null means it flies white and the division colour stands in.';

create table if not exists public.airline_stats (
    airline_uid             uuid primary key references public.airlines (uid) on delete cascade,
    num_aircraft            integer check (num_aircraft >= 0),
    num_routes              integer check (num_routes  >= 0),
    num_flights             integer check (num_flights >= 0),
    flagship_aircraft_model text,
    major_hub_iata          text references public.airports (iata_code),
    last_online_time        timestamptz
);

-- ---------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------

create table if not exists public.aircraft_models (
    aircraft_model text primary key,
    manufacturer   text
);

comment on table public.aircraft_models is
    'Distinct aircraftModel values. manufacturer is the leading token of the model name.';

-- Fixed four-cabin ladder used by the whole game.
create table if not exists public.cabin_classes (
    cabin_code        text primary key,
    cabin_name        text not null,
    sort_order        smallint not null unique,
    source_key_prefix text not null unique
);

create table if not exists public.aircraft (
    aircraft_id            uuid primary key,
    airline_uid            uuid not null references public.airlines (uid) on delete cascade,
    aircraft_model         text not null references public.aircraft_models (aircraft_model),
    registration           text not null,
    delivery_date          timestamptz,
    hub_airport_iata       text references public.airports (iata_code),

    -- cabin split. 134 of 153,661 exported airframes do not sum to 1.0, so this
    -- is validated by a view rather than a constraint that would reject them.
    eco_ratio              double precision check (eco_ratio      between 0 and 1),
    prem_eco_ratio         double precision check (prem_eco_ratio between 0 and 1),
    biz_ratio              double precision check (biz_ratio      between 0 and 1),
    first_ratio            double precision check (first_ratio    between 0 and 1),

    eco_product            text,
    prem_eco_product       text,
    biz_product            text,
    first_product          text,
    eco_config_type        text,
    eco_pitch              smallint check (eco_pitch      >= 0),
    prem_eco_pitch         smallint check (prem_eco_pitch >= 0),
    biz_pitch              smallint check (biz_pitch      >= 0),
    first_pitch            smallint check (first_pitch    >= 0),

    engine_option          text,
    winglet_option         text,
    eyemask_option         text,
    background_image_index integer,
    weekly_flight_time     integer,

    -- True for airframes that are rostered onto a flight but absent from every
    -- fleet export -- sold or retired after the schedule was filed. Their seats
    -- are still sellable, so they get a stand-in row rather than being dropped.
    is_placeholder         boolean not null default false
);

comment on column public.aircraft.registration is
    'Tail number as exported. NOT a key: 27,116 airframes share a registration with a plane at another carrier, and 171 registrations are even reused inside a single fleet (231 duplicate airframes across 33 carriers). aircraft_id is the only identity.';

-- Registration is display-only: it is never a lookup key on this site, and an
-- index on it measured 8.7MB for zero scans. aircraft_airline_idx below covers
-- the fleet listing.
create index if not exists aircraft_airline_idx on public.aircraft (airline_uid);
create index if not exists aircraft_model_idx   on public.aircraft (aircraft_model);
create index if not exists aircraft_hub_idx     on public.aircraft (hub_airport_iata);

-- ---------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------

-- A row here is a *flight pair*: one outbound leg origin -> destination and one
-- inbound leg destination -> origin, sold under two flight numbers. Directional
-- legs for the booking engine live in v_flight_legs.
create table if not exists public.flights (
    flight_id                 uuid primary key,
    airline_uid               uuid not null references public.airlines (uid) on delete cascade,

    -- The game does not hold to the real-world 1-9999: 24,247 legs exceed it,
    -- the highest is 100006, and two carriers filed a leg numbered 0.
    outbound_flight_number    integer not null check (outbound_flight_number between 0 and 999999),
    inbound_flight_number     integer not null check (inbound_flight_number  between 0 and 999999),
    flight_string             text,
    origin_iata               text not null references public.airports (iata_code),
    destination_iata          text not null references public.airports (iata_code),

    -- Local clock at origin_iata, normalised to one day, plus the signed number
    -- of days the raw export placed it away from the reference day.
    departure_daily_seconds     integer not null check (departure_daily_seconds between 0 and 86399),
    departure_day_offset        smallint not null default 0 check (departure_day_offset between -2 and 3),
    departure_daily_seconds_raw integer not null,

    outbound_duration_minutes integer not null check (outbound_duration_minutes > 0),
    inbound_duration_minutes  integer not null check (inbound_duration_minutes  > 0),
    -- QUARTER HOURS, not minutes: ground time is 60 + this * 15.
    -- Named _minutes once, which is how every return leg on the 8.6%
    -- of flights with a non-zero offset came out wrong.
    turnaround_offset_slots numeric(12,6) not null default 0,

    is_stopover               boolean not null default false,
    child_stopover_flight_id  uuid,

    constraint flights_endpoints_differ check (origin_iata <> destination_iata),
    constraint flights_child_requires_stopover check (
        child_stopover_flight_id is null or is_stopover
    ),
    constraint flights_no_self_child check (child_stopover_flight_id is distinct from flight_id),
    constraint flights_child_fkey foreign key (child_stopover_flight_id)
        references public.flights (flight_id)
        deferrable initially deferred
);

comment on column public.flights.departure_daily_seconds is
    'Outbound departure, seconds after local midnight at origin_iata, always 0-86399.';
comment on column public.flights.departure_day_offset is
    'Days the raw export placed this departure away from the reference day. 1,935 flights are non-zero -- stopover legs spilling onto the next or previous day.';
comment on column public.flights.departure_daily_seconds_raw is
    'The exported departureDailyTimestamp verbatim, range -47400 to 209700. Kept so the normalisation is always reversible.';
comment on column public.flights.flight_string is
    'Raw route label from the export. Its two ends are not consistently ordered -- use origin_iata / destination_iata.';

-- Players can and do file the same number twice on the same city pair (33
-- cases), so that tuple could never be unique. It is not indexed either: no
-- page looks a flight up by number, and the index measured 22MB.
create index if not exists flights_origin_dest_idx  on public.flights (origin_iata, destination_iata);
create index if not exists flights_dest_origin_idx  on public.flights (destination_iata, origin_iata);
create index if not exists flights_airline_idx      on public.flights (airline_uid);
create index if not exists flights_child_idx
    on public.flights (child_stopover_flight_id) where child_stopover_flight_id is not null;

-- Which airframe works a flight pair. Several may share one pair, each covering
-- different weekdays; the export has up to seven on a single flight.
-- Migration for databases built before the turnaround unit was understood.
-- `create table if not exists` leaves an existing table alone, so a rename has
-- to be spelled out or the loader fails against yesterday's schema.
do $$
begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'flights'
                  and column_name = 'turnaround_offset_minutes') then
        alter table public.flights
            rename column turnaround_offset_minutes to turnaround_offset_slots;
    end if;
end $$;

create table if not exists public.flight_assignments (
    flight_id               uuid not null references public.flights (flight_id) on delete cascade,
    aircraft_id             uuid not null references public.aircraft (aircraft_id) on delete cascade,
    operating_days_per_week smallint not null default 0 check (operating_days_per_week between 0 and 7),
    -- The operating weekdays as a 7-bit mask, bit 0 = Monday. This replaces a
    -- row per day: as a table that was 1.8M rows and 235MB of index for what
    -- fits in one smallint.
    operating_days_mask     smallint not null default 0 check (operating_days_mask between 0 and 127),
    flight_profit           integer,

    -- The four cabins, as columns. The game's cabin ladder is fixed and always
    -- four wide, so a child table bought nothing and cost 1.64M rows and
    -- 266MB. price is whole US dollars; seats_per_departure is what to sell
    -- against; weekly_seats is the exported *Pax figure verbatim, which pools
    -- the whole week AND both directions.
    eco_price             integer not null default 0 check (eco_price      >= 0),
    prem_eco_price        integer not null default 0 check (prem_eco_price >= 0),
    biz_price             integer not null default 0 check (biz_price      >= 0),
    first_price           integer not null default 0 check (first_price    >= 0),
    eco_seats             integer not null default 0 check (eco_seats      >= 0),
    prem_eco_seats        integer not null default 0 check (prem_eco_seats >= 0),
    biz_seats             integer not null default 0 check (biz_seats      >= 0),
    first_seats           integer not null default 0 check (first_seats    >= 0),
    eco_weekly_seats      integer not null default 0,
    prem_eco_weekly_seats integer not null default 0,
    biz_weekly_seats      integer not null default 0,
    first_weekly_seats    integer not null default 0,

    primary key (flight_id, aircraft_id)
);

create index if not exists flight_assignments_aircraft_idx on public.flight_assignments (aircraft_id);

-- ---------------------------------------------------------------------
-- Interline
-- ---------------------------------------------------------------------

-- The Echo exports carry no codeshare rows, so alliance interline is a rule we
-- state rather than data we received: by default every published carrier will
-- interline with every other, and exceptions are recorded here.
create table if not exists public.interline_agreements (
    from_airline_uid uuid not null references public.airlines (uid) on delete cascade,
    to_airline_uid   uuid not null references public.airlines (uid) on delete cascade,
    is_allowed       boolean not null default true,
    note             text,
    primary key (from_airline_uid, to_airline_uid),
    constraint interline_distinct_carriers check (from_airline_uid <> to_airline_uid)
);

comment on table public.interline_agreements is
    'Exceptions to alliance-wide interline. An absent row means allowed; insert with is_allowed = false to block a pairing.';

commit;

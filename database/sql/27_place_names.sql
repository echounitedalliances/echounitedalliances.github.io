-- =====================================================================
--  Echo United Alliances -- what to call a place
--
--  city_name arrives from OurAirports' `municipality`, which answers a
--  different question than the one a traveller asks. It is the administrative
--  unit the runway sits in, so the board read
--
--      Paris (Roissy-en-France, Val-d'Oise)      for CDG
--      Honolulu, Oahu                            for HNL
--      Hanoi (Soc Son)                           for HAN
--      Sydney (Mascot)                           for SYD
--      Spata-Artemida                            for ATH
--      Sepang                                    for KUL
--
--  Two different faults there, and they need two different fixes.
--
--  The first is punctuation: a real city with an administrative tail on it.
--  205 airports have one, and stripping anything after a bracket, comma or
--  slash fixes all of them at once.
--
--  The second is not fixable by rule. ATH's municipality really is
--  Spata-Artemida and KUL's really is Sepang -- the airport simply sits in
--  the next town along, and everyone calls it Athens and Kuala Lumpur. No
--  string operation gets there, because the correct answer is not in the
--  data: "Charles de Gaulle International Airport" contains no "Paris"
--  either, and inferring the city from the airport name would rename CDG
--  after a general. So those are a hand-curated list, seeded below with the
--  ones a traveller is most likely to meet, and extended by adding a row.
--
--  Then disambiguation. "Rome" for both FCO and CIA is no use in a
--  destination column, so an airport that shares its city with another the
--  alliance serves carries its code: Rome (FCO), Rome (CIA), London (LHR).
--  Everywhere else stays the bare city, because "Singapore (SIN)" is worse
--  than "Singapore".
--
--  Cleaned in place, in public.airports, rather than layered over the top:
--  every reader already goes through that column, and 02 only loads IATA
--  codes -- the names come from 03_airports_backfill, which runs before this
--  file. The raw value is kept in municipality so nothing is lost.
-- =====================================================================

begin;

-- Keep what OurAirports actually said, once.
alter table public.airports add column if not exists municipality text;
alter table public.airports add column if not exists place_label text;

comment on column public.airports.municipality is
    'The raw OurAirports municipality. city_name is the cleaned, traveller-facing version of this.';
comment on column public.airports.place_label is
    'city_name, plus the IATA code when another served airport shares the city. What a destination column should print.';

update public.airports
   set municipality = city_name
 where municipality is null and city_name is not null;

-- ---------------------------------------------------------------------
--  Corrections that no rule can derive
-- ---------------------------------------------------------------------

-- No foreign key to airports on purpose: 02_load_from_csv truncates that
-- table with CASCADE, which would follow the key and empty this too.
create table if not exists public.airport_city_overrides (
    iata_code text primary key,
    city_name text not null,
    note      text
);

comment on table public.airport_city_overrides is
    'Airports whose municipality is not what the place is called. Hand-curated: the correct answer is not derivable from the data. Add a row to extend it.';

insert into public.airport_city_overrides (iata_code, city_name, note) values
    ('ATH', 'Athens',        'municipality is Spata-Artemida, the next town'),
    ('KUL', 'Kuala Lumpur',  'municipality is Sepang'),
    ('BRU', 'Brussels',      'municipality is Zaventem'),
    ('MXP', 'Milan',         'municipality is Ferno'),
    ('EDI', 'Edinburgh',     'municipality is Ingliston'),
    ('NGO', 'Nagoya',        'municipality is Tokoname'),
    ('DPS', 'Denpasar',      'municipality is Kuta'),
    ('KNO', 'Medan',         'municipality is Beringin'),
    ('ISB', 'Islamabad',     'municipality is Attock'),
    ('MCT', 'Muscat',        'municipality reads Muscat/Seeb'),
    ('CEB', 'Cebu City',     'municipality reads Cebu City/Lapu-Lapu City'),
    ('FRA', 'Frankfurt',     'municipality reads Frankfurt am Main'),
    -- Milan's other two and Tokyo's second read as the towns they sit in,
    -- which splits them off from the city they serve and defeats the
    -- disambiguation below: LIN showed as Segrate rather than Milan (LIN).
    ('LIN', 'Milan',         'municipality is Segrate'),
    ('BGY', 'Milan',         'municipality is Orio al Serio'),
    ('NRT', 'Tokyo',         'municipality is Narita'),
    ('LYS', 'Lyon',          'municipality is Colombier-Saugnieu'),
    ('MFM', 'Macau',         'municipality is Nossa Senhora do Carmo'),
    -- Hahn's municipality reads "Frankfurt am Main", 120km from Frankfurt.
    -- Naming it after the city it is not near is how a traveller ends up at
    -- the wrong airport, so it gets the name everyone actually uses.
    ('HHN', 'Frankfurt Hahn', 'municipality claims Frankfurt am Main; it is 120km away')
on conflict (iata_code) do update
   set city_name = excluded.city_name, note = excluded.note;

grant select on public.airport_city_overrides to anon, authenticated;

-- ---------------------------------------------------------------------
--  The rule the other 2,170 follow
-- ---------------------------------------------------------------------

create or replace function public.echo_clean_city(p_name text)
returns text language sql immutable parallel safe as $$
    -- Anything after a bracket, a comma or a slash is the administrative
    -- tail, not the name of the place.
    select nullif(btrim(
        split_part(
            split_part(regexp_replace(coalesce(p_name, ''), '\s*\(.*$', ''), ',', 1),
        '/', 1)), '');
$$;

comment on function public.echo_clean_city(text) is
    'Strip the administrative tail off a municipality: "Paris (Roissy-en-France, Val-d''Oise)" becomes "Paris".';

update public.airports a
   set city_name = coalesce(o.city_name, public.echo_clean_city(a.municipality), a.city_name)
  from (select iata_code from public.airports) x
  left join public.airport_city_overrides o on o.iata_code = x.iata_code
 where x.iata_code = a.iata_code;

-- ---------------------------------------------------------------------
--  Telling two airports in one city apart
-- ---------------------------------------------------------------------

with served as (
    -- Only airports the alliance actually flies to matter here: a city pair
    -- that shares a name with an unserved strip does not need disambiguating.
    select distinct origin_iata as iata from public.mv_leg_departures
    union
    select distinct destination_iata from public.mv_leg_departures
),
shared as (
    select a.city_name, a.country_code
      from public.airports a
      join served s on s.iata = a.iata_code
     where a.city_name is not null
     group by a.city_name, a.country_code
    having count(*) > 1
)
update public.airports a
   set place_label = case
         when sh.city_name is not null then a.city_name || ' (' || a.iata_code || ')'
         else a.city_name
       end
  from (select iata_code, city_name, country_code from public.airports) x
  left join shared sh
    on sh.city_name = x.city_name and sh.country_code = x.country_code
 where x.iata_code = a.iata_code;

commit;

-- The airport matviews carry city_name, so the cleaned names only reach the
-- board and the maps once they are rebuilt.
refresh materialized view public.mv_airport_directory;
refresh materialized view public.mv_network_nodes;

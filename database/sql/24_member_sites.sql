-- =====================================================================
--  Echo United Alliances -- member airlines' own websites
--
--  Several members have built their own sites, and a few built one site for
--  a whole group of their airlines. Where that exists it should be reachable
--  from the carrier's page here, in place of the "Contact airline for
--  booking" placeholder.
--
--  Two things make this a pair of tables rather than a column:
--
--    one site, many airlines   the TerraLink Group site sells six carriers
--                              from one search box, and SwissLux's app
--                              covers both SwissLux and SwissLux Private. A
--                              column on airlines would store that URL six
--                              times and let the six copies drift.
--    the site is the subject   its name, what it can do, and how far its
--                              data can be trusted are facts about the SITE.
--                              They belong next to the URL.
--
--  data_grade is the honest part, and it is why this is worth storing at all.
--  These sites are hobby projects at very different stages: some read the same
--  live schedule this site does, some publish a handful of sample routes, and
--  some generate their results outright. A traveller clicking through deserves
--  to know which before they act on a fare. Each grade below was checked by
--  hand against our own data on checked_on -- MEMBER-SITES.md records what
--  the check was in each case.
--
--    live          schedules and fares trace to the live game data
--    sample        real, but only a small slice of the network is published
--    illustrative  results are generated; treat times and fares as decoration
--    showcase      a design rather than a booking site: nothing to book, and
--                  so nothing that can be right or wrong about a fare
--    unverified    sign-in required, so we could not check it
--
--  airlines.website_url is kept in step at the bottom, because it is the
--  field the admin form already edits and mv_airline_directory already
--  carries. That column is a mirror.
--
--  Since 22 September 2026 admins edit the websites, the links and each
--  notice from the site itself (32_member_site_admin.sql), so the lists below
--  only SEED a database that has never had a member website. Re-running this
--  file on the live database changes nothing an admin has set.
-- =====================================================================

begin;

create table if not exists public.member_sites (
    site_slug  text primary key,
    site_name  text not null,
    url        text not null check (url ~ '^https://'),
    -- A second address worth offering: a superseded site kept alive, or a
    -- companion service the same member runs.
    alt_url    text check (alt_url is null or alt_url ~ '^https://'),
    alt_label  text,
    kind       text not null check (kind in ('booking', 'brochure', 'aggregator', 'account')),
    data_grade text not null check (data_grade in ('live', 'sample', 'illustrative', 'unverified')),
    -- One sentence, addressed to a traveller about to click through.
    data_note  text not null,
    checked_on date not null,
    constraint member_sites_alt_labelled
        check ((alt_url is null) = (alt_label is null))
);

-- 'showcase' was added after the table existed, and CREATE TABLE IF NOT
-- EXISTS will not revisit a constraint on a table that is already there.
alter table public.member_sites drop constraint if exists member_sites_data_grade_check;
alter table public.member_sites add constraint member_sites_data_grade_check
    check (data_grade in ('live', 'sample', 'illustrative', 'showcase', 'unverified'));

comment on table public.member_sites is
    'Websites members built for their own airlines, with an honest note on how far each one''s schedule and fare data can be trusted. One row per site: a group site that sells several carriers is still one row.';

create table if not exists public.member_site_airlines (
    site_slug   text not null references public.member_sites(site_slug) on delete cascade,
    airline_uid uuid not null references public.airlines(uid) on delete cascade,
    primary key (site_slug, airline_uid)
);

comment on table public.member_site_airlines is
    'Which carriers each member site covers. A carrier appears at most once -- if two sites ever claim the same airline, the second insert is the thing to question.';

create unique index if not exists member_site_airlines_one_site
    on public.member_site_airlines (airline_uid);

grant select on public.member_sites, public.member_site_airlines to anon, authenticated;

-- ---------------------------------------------------------------------
--  The sites as last checked, on 2026-09-24, against that day's scrape.
--  MEMBER-SITES.md records what each check compared. American Express
--  Air's site was dropped that day: flyamex.base44.app no longer exists.
--
--  Seeded into a new database only. This used to upsert on every run, and
--  once admins could edit these rows that would have quietly put the file's
--  wording back over theirs the next time anybody deployed.
-- ---------------------------------------------------------------------

create temp table member_sites_seed on commit drop as
    select not exists (select 1 from public.member_sites) as seeding;

insert into public.member_sites
    (site_slug, site_name, url, alt_url, alt_label, kind, data_grade, data_note, checked_on)
select v.* from (values
    ('karination', 'KarinationGroup', 'https://flykarination.github.io/sales',
     null, null, 'booking', 'live',
     'It sells Karination and FORZA, and marks which one operates each flight. It reads the same game schedule we do: all 1,508 of Karination''s routes match ours at the same lowest economy fare, fastest time and days of the week, and FORZA''s match too, though 28 of FORZA''s newest routes are not on it yet.',
     date '2026-09-24'),

    -- The Starliner Group site until 22 September 2026, when it became
    -- TerraLink Group at a new address. The slug nobody sees stayed.
    ('starliner', 'TerraLink Group', 'https://flyterralink.netlify.app/',
     null, null, 'booking', 'live',
     'It sells six of our carriers from one search: Starliner, ASTRA, Meridian, Velora, Essequibo Air and AmeriGo. It reads the same game schedule we do, and its fares, departure times and days match ours flight for flight, though its copy is a little older: about 150 Essequibo Air and AmeriGo flights are not on it yet. Check two things here before you book: a flight flown by more than one aircraft can show only some of its days, so a daily flight may look weekly, and return times on routes with a stop can be hours out.',
     date '2026-09-24'),

    ('explora', 'Explora Journeys', 'https://explorajourneysva.softr.app/',
     null, null, 'brochure', 'live',
     'Its route table matches ours: the same 246 routes, at the same weekly frequencies. There is no booking engine on it, so come back here to actually book.',
     date '2026-09-24'),

    ('sovietskyie', 'Sovietskyie', 'https://sites.google.com/view/sovietskyie',
     null, null, 'booking', 'sample',
     'Its new flight booker is a beta and covers just one of Sovietskyie''s 302 routes, Vladivostok–Yakutsk. There it matches ours — the same three flights, times, days and aircraft, with fares in roubles near our economy prices — but the site itself warns not to enter personal details yet. Its fleet page names the same aircraft types we hold, at an older count of 235 to our 270.',
     date '2026-09-24'),

    ('bula-air', 'Bula Air', 'https://kariy4.github.io/Bula-Air/pages/index.html',
     null, null, 'booking', 'sample',
     'Its booking flow now carries about 190 Bula Air flights copied from this site''s timetable, mostly out of Auckland, but from an older copy: about half have since been dropped, many departure times are 30 to 90 minutes early, and every flight is shown as daily when most are not. Check the flight and its days here before you book.',
     date '2026-09-24'),

    ('swisslux', 'SwissLux Group', 'https://lacnka.github.io/swisslux',
     null, null, 'account', 'unverified',
     'It asks you to sign in before it shows anything, so we have not been able to check its schedules against ours.',
     date '2026-09-24'),

    ('dream-island', 'Dream Island Air', 'https://dream-island-air.base44.app/',
     null, null, 'account', 'unverified',
     'It asks you to sign in before it shows anything, so we have not been able to check its schedules against ours.',
     date '2026-09-24'),

    ('britannia', 'Britannia Group', 'https://flybritanniagroup.base44.app/',
     null, null, 'booking', 'illustrative',
     'It sells Fly Empire and Soleado, but every search result is generated on the spot: departure times, journey times, flight numbers and fares are all worked out from the distance flown, not read from any schedule, and which airline you are shown depends only on the region. Read it as a showcase and book here.',
     date '2026-09-24'),

    ('bookgo', 'Book & Go', 'https://bookgo-chi.vercel.app/',
     'https://vafeed.vercel.app/', 'VAFeed newsfeed', 'aggregator', 'illustrative',
     'A polished multi-airline search whose results are generated fresh on each query rather than read from any schedule; even journey times are picked at random, whatever the route. Treat its times and fares as decoration.',
     date '2026-09-24'),

    ('airfluff', 'AirFluff Airlines', 'https://airfluff-airlines-copy-54d2ba54.base44.app/',
     null, null, 'booking', 'illustrative',
     'It offers 17 routes from Frankfurt, 16 of them real AirFluff routes out of the 185 we hold, but every result is generated: flight numbers, departure times, journey times and fares are made up, and some flights are shown as cancelled or sold out at random. Its own footer calls it a fictional company for demonstration.',
     date '2026-09-24'),

    ('vaultera', 'Vaultera', 'https://dome-record-86929245.figma.site/',
     null, null, 'booking', 'illustrative',
     'Its search now returns flights, but each one is generated from the distance between the two airports: times, flight numbers and fares are invented. Its popular routes quote fares well below ours, Las Vegas–Tokyo from $699 against our $994, and two of them, to Paris and Singapore, are not flown at all. Its hub list is right: all 15 it marks are Vaultera hubs.',
     date '2026-09-24')
) as v(site_slug, site_name, url, alt_url, alt_label, kind, data_grade, data_note, checked_on)
where (select seeding from member_sites_seed);

-- ---------------------------------------------------------------------
--  Who each site covers.
--
--  Named by airline_slug rather than uid so this file stays readable and
--  survives a rebuild. The join is on (division_code, airline_slug) because
--  airline_slug alone is not unique across divisions.
-- ---------------------------------------------------------------------

with claim(site_slug, division_code, airline_slug) as (values
    -- Two carriers, and the site does not advertise it: the brand is
    -- Karination throughout and the footer reads "KX · A member of Echo
    -- Aegis", but ask its timetable for a FORZA route and it returns Z4
    -- services at FORZA's fares. Its own destination list gives it away --
    -- the cheapest fares are quoted "from HPH / VCL / BMV / CAH", which are
    -- FORZA hubs, not Karination's five.
    ('karination',   'aegis',   'karination'),
    ('karination',   'proxima', 'forza'),
    -- The old Starliner Group site sold only the first three; Meridian by
    -- STRLNR carried the button by the member's decision. TerraLink Group
    -- sells all four, and Essequibo Air and AmeriGo besides, which got the
    -- button on 22 September 2026. That AmeriGo is Elysium's (AG, out of
    -- ORD and JFK), not Rhea's "AmeriGo!", which shares its slug.
    -- Starliner itself moved from Rhea to Kyra in the 16 September 2026
    -- scrape. Alone in Kyra, it no longer needs the uid suffix it wore in Rhea.
    ('starliner',    'kyra',    'starliner'),
    ('starliner',    'rhea',    'astra_by_starliner'),
    ('starliner',    'rhea',    'velora_by_strlinr'),
    ('starliner',    'elysium', 'meridian_by_strlnr'),
    ('starliner',    'elysium', 'essequibo_air'),
    ('starliner',    'elysium', 'amerigo'),
    ('explora',      'kyra',    'explora_journeys'),
    ('sovietskyie',  'proxima', 'советские'),
    ('bula-air',     'proxima', 'bula_air'),
    -- SwissLux moved from Aegis to Kyra in the 24 September 2026 scrape, and
    -- SwissLux Private left the alliance, taking its button with it.
    ('swisslux',     'kyra',    'swisslux'),
    ('dream-island', 'vilis',   'dream_island_air'),
    -- Britannia Group sells two brands, which is only visible by searching a
    -- route each one serves: LHR-JFK returns Fly Empire, LHR-EDI returns
    -- Soleado. Both are ours, so both carry the button.
    ('britannia',    'kyra',    'fly_empire'),
    ('britannia',    'elion',   'soleado'),
    -- "CAS - flyhop": Book & Go is the group's booking product. flyhop
    -- renamed itself Fun Airways in the 16 September 2026 scrape, and Fun
    -- Airways became FUN! Canada in the 24 September one; same uid.
    ('bookgo',       'proxima', 'fun_canada'),
    ('airfluff',     'aura',    'airfluff_airlines'),
    ('vaultera',     'proxima', 'vaultera')
)
insert into public.member_site_airlines (site_slug, airline_uid)
select c.site_slug, a.uid
  from claim c
  join public.airlines a
    on a.division_code = c.division_code
   and a.airline_slug  = c.airline_slug
 where (select seeding from member_sites_seed)
on conflict (site_slug, airline_uid) do nothing;

-- Every claim above must have matched an airline. A silent miss here would
-- surface months later as a carrier that never grew its button. Only when
-- seeding: after that the count is whatever the admins have made it.
do $guard$
declare
    n integer;
begin
    select count(*) into n from public.member_site_airlines;
    if (select seeding from member_sites_seed) and n <> 18 then
        raise exception
            'member_site_airlines has % rows, expected 18 -- an airline_slug in this file no longer matches a carrier', n;
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
--  Mirror onto airlines.website_url, which the directory already carries.
-- ---------------------------------------------------------------------

update public.airlines a
   set website_url = s.url
  from public.member_site_airlines msa
  join public.member_sites s on s.site_slug = msa.site_slug
 where msa.airline_uid = a.uid
   and a.website_url is distinct from s.url;

-- ---------------------------------------------------------------------
--  What the airline page asks for.
-- ---------------------------------------------------------------------

create or replace function public.airline_site(p_uid uuid)
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
language sql stable parallel safe as $fn$
    select s.site_slug, s.site_name, s.url, s.alt_url, s.alt_label,
           s.kind, s.data_grade, s.data_note, s.checked_on,
           -- The other carriers on the same site, so a group site can say so.
           coalesce((
               select array_agg(o.airline_name order by o.airline_name)
                 from public.member_site_airlines m2
                 join public.airlines o on o.uid = m2.airline_uid
                where m2.site_slug = s.site_slug
                  and m2.airline_uid <> p_uid
           ), '{}'::text[])
      from public.member_site_airlines msa
      join public.member_sites s on s.site_slug = msa.site_slug
     where msa.airline_uid = p_uid;
$fn$;

comment on function public.airline_site(uuid) is
    'The member-built website covering this carrier, if there is one, with the honest note on how far its data can be trusted and the other carriers the same site sells.';

grant execute on function public.airline_site(uuid) to anon, authenticated;

commit;

-- website_url lives in the materialised directory, so it has to be rebuilt
-- before the change is visible anywhere the directory is read.
refresh materialized view public.mv_airline_directory;

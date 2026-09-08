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
--    one site, many airlines   the Starliner Group site sells Starliner,
--                              ASTRA and Velora from one search box, and
--                              SwissLux's app covers both SwissLux and
--                              SwissLux Private. A column on airlines would
--                              store that URL three times and let the three
--                              copies drift.
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
--    unverified    sign-in required, so we could not check it
--
--  airlines.website_url is kept in step at the bottom, because it is the
--  field the admin form already edits and mv_airline_directory already
--  carries. This file is the source of truth; that column is a mirror.
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
--  The sites, as checked on 2026-09-08.
-- ---------------------------------------------------------------------

insert into public.member_sites
    (site_slug, site_name, url, alt_url, alt_label, kind, data_grade, data_note, checked_on)
values
    ('karination', 'Karination', 'https://flykarination.github.io/sales',
     null, null, 'booking', 'live',
     'Its network and fares match ours: 766 routes to 481 destinations from five Vietnamese hubs, priced at the real lowest one-way economy fare.',
     date '2026-09-08'),

    ('starliner', 'Starliner Group', 'https://chai-debug-create.github.io/Tas',
     null, null, 'booking', 'live',
     'One search box for Starliner, ASTRA and Velora, and its 1,024 routes and daily frequencies match ours exactly. Its headline fare sits between our economy and business prices rather than equalling either.',
     date '2026-09-08'),

    ('explora', 'Explora Journeys', 'https://explorajourneysva.softr.app/',
     null, null, 'brochure', 'live',
     'Its published route table matches ours. There is no booking engine on it, so come back here to actually book.',
     date '2026-09-08'),

    ('sovietskyie', 'Sovietskyie', 'https://sites.google.com/view/sovietskyie',
     null, null, 'brochure', 'live',
     'Fleet and network pages that match ours closely — it lists the same 71 Sukhoi Superjets we hold. Booking there is a request form answered by hand, not an instant confirmation.',
     date '2026-09-08'),

    ('bula-air', 'Bula Air', 'https://kariy4.github.io/Bula-Air/pages/index.html',
     null, null, 'booking', 'sample',
     'A full booking flow with real seat maps, but only four sample routes from Nadi are loaded into it. Bula Air actually serves 81 destinations from Nadi — the rest are only here.',
     date '2026-09-08'),

    ('swisslux', 'SwissLux Group', 'https://lacnka.github.io/swisslux',
     null, null, 'account', 'unverified',
     'Covers SwissLux and SwissLux Private, and asks you to sign in before it shows anything, so we have not been able to check its schedules against ours.',
     date '2026-09-08'),

    ('dream-island', 'Dream Island Air', 'https://dream-island-air.base44.app/',
     'https://temp-wahoumdaqshifhimthou.webadorside.com/', 'Older site',
     'account', 'unverified',
     'The current site asks you to sign in before it shows anything, so we have not been able to check its schedules against ours.',
     date '2026-09-08'),

    ('britannia', 'Britannia Group', 'https://flybritanniagroup.base44.app/',
     null, null, 'booking', 'illustrative',
     'It sells two of ours, Fly Empire and Soleado, depending on the route you search. Its results carry real Fly Empire flight numbers attached to the wrong routes, with invented durations. Read it as a showcase and book here.',
     date '2026-09-08'),

    ('bookgo', 'Book & Go', 'https://bookgo-chi.vercel.app/',
     'https://vafeed.vercel.app/', 'VAFeed newsfeed',
     'aggregator', 'illustrative',
     'A polished multi-airline search whose results are generated fresh on each query rather than read from any schedule. Treat its times and fares as decoration.',
     date '2026-09-08'),

    ('airfluff', 'AirFluff Airlines', 'https://airfluff-airlines-copy-54d2ba54.base44.app/',
     null, null, 'booking', 'illustrative',
     'It flies our real routes with our real block times, but invents the flight numbers, departure times and fares around them — and says so itself in its own footer.',
     date '2026-09-08'),

    ('amex', 'American Express Air', 'https://flyamex.base44.app/',
     null, null, 'booking', 'sample',
     'Every destination it sells is one American Express Air really serves, but it publishes 47 of the 87 it reaches from JFK, and its journey times are its own estimates — it quotes 7h00 to London where the filed block time is 6h10.',
     date '2026-09-08')
on conflict (site_slug) do update set
    site_name  = excluded.site_name,
    url        = excluded.url,
    alt_url    = excluded.alt_url,
    alt_label  = excluded.alt_label,
    kind       = excluded.kind,
    data_grade = excluded.data_grade,
    data_note  = excluded.data_note,
    checked_on = excluded.checked_on;

-- ---------------------------------------------------------------------
--  Who each site covers.
--
--  Named by airline_slug rather than uid so this file stays readable and
--  survives a rebuild. The join is on (division_code, airline_slug) because
--  airline_slug alone is not unique across divisions.
-- ---------------------------------------------------------------------

with claim(site_slug, division_code, airline_slug) as (values
    ('karination',   'aegis',   'karination'),
    -- The site's own airline picker offers the first three. Meridian by
    -- STRLNR is not in it, but it is the same member's airline and carries
    -- the button by their decision -- which is why the note below names the
    -- three that are actually sellable there.
    ('starliner',    'rhea',    'starliner_480c930c'),
    ('starliner',    'rhea',    'astra_by_starliner'),
    ('starliner',    'rhea',    'velora_by_strlinr'),
    ('starliner',    'elysium', 'meridian_by_strlnr'),
    ('explora',      'kyra',    'explora_journeys'),
    ('sovietskyie',  'proxima', 'советские'),
    ('bula-air',     'proxima', 'bula_air'),
    ('swisslux',     'aegis',   'swisslux'),
    ('swisslux',     'vilis',   'swisslux_private'),
    ('dream-island', 'vilis',   'dream_island_air'),
    -- Britannia Group sells two brands, which is only visible by searching a
    -- route each one serves: LHR-JFK returns Fly Empire, LHR-EDI returns
    -- Soleado. Both are ours, so both carry the button.
    ('britannia',    'kyra',    'fly_empire'),
    ('britannia',    'elion',   'soleado'),
    ('amex',         'aura',    'american_express'),
    -- "CAS - flyhop": Book & Go is the group's booking product.
    ('bookgo',       'proxima', 'flyhop'),
    ('airfluff',     'aura',    'airfluff_airlines')
)
insert into public.member_site_airlines (site_slug, airline_uid)
select c.site_slug, a.uid
  from claim c
  join public.airlines a
    on a.division_code = c.division_code
   and a.airline_slug  = c.airline_slug
on conflict (site_slug, airline_uid) do nothing;

-- Every claim above must have matched an airline. A silent miss here would
-- surface months later as a carrier that never grew its button.
do $guard$
declare
    n integer;
begin
    select count(*) into n from public.member_site_airlines;
    if n <> 16 then
        raise exception
            'member_site_airlines has % rows, expected 16 -- an airline_slug in this file no longer matches a carrier', n;
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

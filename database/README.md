# Echo United Alliances — database

The TAS exports under `divisions/` turned into a relational database a booking
site can run on. Built for Supabase (PostgreSQL 15+); developed and verified
against PostgreSQL 17.

The original JSON is untouched — `divisions/<division>/members/<airline>/` stays
the source of truth, and everything here is regenerated from it.

---

## What is in it

| | |
|---|---:|
| Divisions | 8 |
| Carriers | 590 |
| Airports | 2,187 |
| Aircraft | 153,688 |
| Flight pairs | 341,710 |
| Aircraft assignments | 411,027 |
| Operating days | 1,806,119 |
| Fares (leg × cabin) | 1,644,108 |
| Sellable weekly departures | 3,603,332 |
| Directional routes | 123,080 |

---

## Layout

```
database/
  README.md                  this file
  connection.txt             ** THE ONE FILE YOU EDIT ** -- your Supabase
                             project. Gitignored; holds no password.
  csv/                       12 tables, ready to load (regenerated, not committed)
  reference/
    airports_reference.json  merged open airport data, committed so the
                             backfill is reproducible without network access
  sql/                       01 .. 10, run in numeric order
  scripts/
    save_password.ps1        once: password -> psql's credential store
    write_web_env.py         connection.txt -> web/.env.local
    build_database.py        divisions/*.json -> csv/          (re-run any time)
    backfill_airports.py     open datasets    -> sql/03_...    (--refresh to re-fetch)
    deploy.ps1               the whole thing, with psql
  reports/
    build_report.md          row counts and every data condition handled
    airport_backfill_report.md   what the airport backfill resolved
```

---

## Deploying

### One-time setup

**1. Fill in `database/connection.txt`.** It is the only file you edit. Four
lines for the database, two for the API — every value comes from your Supabase
dashboard, and the file says exactly which page each one is on. Your project's
*name* is irrelevant; only the project *ref* matters, and it is inside the
values you paste.

**2. Store the database password.**

```powershell
.\database\scripts\save_password.ps1
```

Masked prompt. The password goes into `%APPDATA%\postgresql\pgpass.conf`,
psql's own credential store, locked to your Windows account — never into this
repository, never onto a command line, never into shell history. The script
also sets `ECHO_DB_URL` for your account, without the password in it.

**3. Point the website at the same project.**

```powershell
python database/scripts/write_web_env.py
```

Copies the two API values from `connection.txt` into `web/.env.local`, so the
two halves cannot drift apart.

### Deploying

```powershell
python database/scripts/build_database.py    # JSON -> csv/  (only after a re-scrape)
.\database\scripts\deploy.ps1
```

No arguments: it builds the connection string from `connection.txt` and takes
the password from pgpass.conf.

Run the files **in order**, and if you re-run one by hand, re-run everything
after it too. `07_connections.sql` drops `mv_route_adjacency` with `cascade`,
which takes `mv_network_arcs`, `mv_network_nodes`, `mv_airport_directory`,
`mv_airport_connectivity` and `search_airports()` with it -- all created in
`09_site_api.sql`. The deploy script always runs the whole chain, so this only
matters when you are applying a single file. Run it from the repository root — the CSVs are
read by relative path with psql's client-side `\copy`, so no server-side file
access is needed.

The load is ~4.4M rows and takes a few minutes over the network (2m20s to a
local instance). Everything is re-runnable: `02` truncates first, and the
materialised views are rebuilt at the end by `echo_refresh_search()`.

Use the **session pooler** host, which is what `connection.txt` asks for. The
direct host `db.<ref>.supabase.co` publishes only an AAAA record, so psql
cannot resolve it on an IPv4-only network.

---

## The files

| file | what it does |
|---|---|
| `01_schema.sql` | tables, keys, indexes |
| `02_load_from_csv.sql` | the exported data, plus division accent colours |
| `03_airports_backfill.sql` | real airport names, cities, coordinates, timezones |
| `04_views.sql` | directional legs, the search surface, showcase views |
| `05_reservations.sql` | Resonance accounts, bookings, passengers, segments, tickets |
| `06_inventory.sql` | seat inventory, background demand, decrement triggers |
| `07_connections.sql` | the route graph and `search_itineraries()` |
| `08_rls_policies.sql` | row level security and the public RPCs |
| `09_site_api.sql` | the shapes the website reads: division summaries, the carrier directory, airport search, the globe |
| `10_booking_api.sql` | `create_booking()` and `cancel_booking()` for guests |

---

## The two things the site calls

```sql
-- nonstop legs on a date, cheapest first
select * from public.search_flights('LHR', 'JFK', date '2026-09-10', 'ECONOMY', 1);

-- nonstop to two stops, across every carrier in the alliance
select * from public.search_itineraries('SGN', 'LIM', date '2026-09-10',
                                        'ECONOMY', 1, 2, 50);
```

`search_itineraries` returns one row per itinerary with the legs as a JSON
array, so a single round trip gives the frontend everything a result card needs.

Retrieving a booking without an account:

```sql
select * from public.find_booking('DWVVZW', 'Dang');
```

---

## Things about this data worth knowing

Every one of these is handled; they are recorded because they are surprising.

**Airline codes are not unique.** 590 carriers share 321 codes. Seven different
airlines are called "Emirates" with code EK, three of them inside Elysium
alone. `airline_code` is kept verbatim for display; `carrier_code` is the
generated unique designator (`EK`, then `EKAU`, then `EKEY1`) and is what
flight numbers are built from. Never key on `airline_code`.

**Registrations are not unique either** — not across the alliance (27,116
airframes share one) and not even within a single fleet (171 registrations are
reused inside one carrier, 231 duplicate airframes across 33 carriers).
`aircraft_id` is the only identity.

**Flight numbers run past 9999.** 24,247 legs exceed the real-world limit, the
highest is 100006, and two carriers filed a leg numbered 0.

**Departure times fall outside the day.** `departureDailyTimestamp` ranges from
−47,400 to 209,700 seconds. It is split into `departure_daily_seconds` (always
0–86399) plus a signed `departure_day_offset`, with the original kept in
`departure_daily_seconds_raw` so the normalisation is reversible.

**27 aircraft are rostered onto flights but exist in no fleet** — sold or
retired after the schedule was filed. They get placeholder airframes
(`is_placeholder = true`) so their 112 assignments keep their sellable seats.

**Cabin ratios are floats.** 134 airframes do not sum to 1.0 (see
`v_aircraft_ratio_anomalies`), and 16 individual ratios carried noise just
outside [0,1] — the worst was −1.37e-17 — and were snapped to the boundary.

**611 fares were exported as floats** and are rounded half-up to whole dollars.

**`liveryConfigId` is not a UUID** on 860 airframes (`alliance_<uuid>`). The
column is dropped; it is not needed.

**Hubs are missing for Proxima.** Its roster was exported in the game's
alliance-object form, which carries no `hubAirports`. Proxima's hubs are
derived from the base airports of its fleet and marked
`hub_source = 'derived_from_fleet'`. Member stats exist only for Aegis;
`v_airline_metrics` computes the same figures from the schedule for everyone.

**Three airlines have no usable name**, including one in Vilis whose name is
literally `/`. They get `unknown_<uid8>` slugs.

---

## Search performance, and why it is built this way

Measured on the full data set, local PostgreSQL 17:

| search | time |
|---|---:|
| nonstop LHR–JFK | 106 ms |
| 1 stop SGN–LIM | 54 ms |
| 2 stops SGN–LIM | 82 ms |
| 2 stops LHR–AKL business, 2 seats | 753 ms |
| 2 stops JFK–SYD | 1.1 s |

Three decisions carry all of that, and each replaced something that did not
work:

1. **Settle the connecting airports first, from the route graph.** Airports the
   origin reaches that also fly into the destination is a savagely restrictive
   test, and it costs two indexed lookups. This is the idea from the
   KarinationGroup database (`13_connections.sql` there), scaled up.

2. **Bound leg scans by both endpoints.** Scanning by origin alone and
   filtering the destination afterwards returns 12,538 legs for a single
   weekday at DXB, and two-stop search then did not finish inside 90 seconds.

3. **Put the candidate legs in an indexed temp table, not a CTE.** A CTE has no
   indexes and no statistics, so the three- and four-way self-joins degenerate
   into repeated sequential scans — 23 seconds on a 946-row set. With indexes
   the same joins are lookups: 82 ms.

Search is capped at **two stops**. Three worked but ranged from 2 s to 45 s
depending on how well connected the city pair is, which is not something to put
in front of a user. Re-adding it means another via level and another join in
`07_connections.sql`.

Connecting points are the highest-traffic `echo_max_vias()` candidates
(default 12), so results beyond nonstop are a strong heuristic rather than a
provably exhaustive enumeration — the same trade every real engine makes.

---

## Refreshing after a new scrape

```powershell
python divisions/scrape_members.py --division proxima --force   # per division
python database/scripts/build_database.py
.\database\scripts\deploy.ps1 -ConnectionString $env:ECHO_DB_URL
```

Bookings survive: `booking_segments` denormalises the designator, times and
price at the moment of sale, so a reservation still reads correctly after the
schedule underneath it changes.

---

## Not committed

`database/csv/` is 393 MB and regenerates from the JSON in about 40 seconds, so
it is gitignored. `database/reference/.cache/` holds the raw open datasets and
is ignored too; `airports_reference.json` beside it is the merged extract and
**is** committed, so the airport backfill works without network access.

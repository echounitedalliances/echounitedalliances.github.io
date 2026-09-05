# Echo United Alliances

The website for Echo United Alliances, a virtual airline group in
**The Airline Simulator** — eight divisions, 590 member carriers, one network.

Live at **https://echounitedalliances.github.io**

---

## What the site does today

### The alliance

**About** (`/about`). The slogan, and the board — which is currently the eight
division leaders, listed by the name and Discord handle they go by rather than
by airline, since several of them own more than one. The roster is in
`web/src/lib/alliance.ts`; division names, order and colours come from the
database, so the page follows a rename without being edited.

**Our activities** (`/activities`). FFA sales, the discount aircraft market
and the recurring events, each with the facts down the side. All of it happens
on Discord — the page says so once rather than in every section.

**Home.** The headline figures, then a live departure board, then the eight
divisions, the network drawn flat, and a carrier spotlight.

**Divisions** (`/divisions`). Eight cards, four across and two down, in group
order: Kyra, Aegis, Elysium, Proxima, Rhea, Vilis, Elion, Aura. Kyra is badged
*Main division* and Elysium *Realism alliance*. Each opens a division page with
its roster — sortable by prominence, name or fleet size — and a map of what the
division flies.

**Airlines** (`/airlines`). All 590 carriers, filtered by name, division or
country, 60 at a time. 85 countries are represented.

**A page for every carrier.** A written profile, the fleet by type, every route,
a route map, and a timetable by day of week. The profile is generated from what
the airline actually flies — nobody was going to hand-write 590 — and can be
overwritten; the generated text never lands on top of a written one.

**A page for every airport** (`/airports/:iata`). Which members serve it, which
treat it as a hub, and how far each of them reaches from there.

**Network** (`/network`). The whole alliance drawn at once with the busiest
airports beside it. Pick an airport and the map shows only what it reaches,
each route coloured by whichever division flies it most.

### The departure board

A split-flap board of what leaves next, **in the viewer's own timezone**. The
airport is chosen from that timezone — a viewer in Vietnam gets Ho Chi Minh
City, one in New York gets JFK — and chips switch it between the six busiest
hubs. It refetches once a minute, recounts the countdowns every fifteen
seconds, and ticks a wall clock every second.

It is DOM and CSS, not WebGL: the flaps animate while they settle and then stop
completely. This replaced a spinning globe that never fully loaded and made a
laptop stutter.

### Booking, across every carrier at once

**Search.** Origin and destination by typeahead over 2,187 airports, a date, one
of four cabins, one to six travellers, and a stop limit.

**One query, 590 airlines.** `search_itineraries()` returns nonstop through
two-stop journeys across the whole group, so a trip no single member flies end
to end is still one search, one booking and one reference. Typically 44–73 ms.
Results sort by price, duration or stops.

**Real inventory.** Seats are tracked per departure and cabin, against a
deliberately gentle background demand simulation — enough that a
341,710-flight network does not look untouched, never enough to sell out. A
real booking always takes simulated seats back before it refuses anyone.

**A real PNR.** Passenger details, a mock checkout, and a reference that works.
The whole reservation goes through one security-definer function, because the
three writes it makes have to succeed together.

**Manage a booking** (`/trips`) with the PNR and a passenger surname — no
account, the way every airline does it — and cancel it from there. On a
Resonance account the trips list sorts by first departure, last arrival, or
booking date.

### Resonance

Sign in with an email and password, held by Supabase Auth and never by this
project. Forgotten passwords are reset over email — the one place email still
appears, and the only way back into an account nobody can sign into. A Resonant
gets a profile — display name, home airport, home division — and every trip on
the account in one place. Booking without an account still works.

### Underneath

The site is static and talks straight to Supabase from the browser, which is
what lets it live on GitHub Pages with no server. Row level security is the
protection: the publishable key in the bundle authorises nothing, reservations
return 401 to an anonymous reader, and every write goes through a
security-definer function. Each division carries its own accent colour, taken
from its own chevron. It works down to a phone — where the board scrolls
sideways inside its own frame rather than dragging the page with it.

---

## What is not built yet

A lot. In rough order of how much is already there to build on:

- **Admin editing.** `echo_is_admin()` exists and Resonance shows an Admin
  badge, but there is no editor behind it. Overwriting a carrier profile means
  writing the row by hand.
- **Resonance is membership, not a programme.** No status tiers, no benefits,
  nothing earned by flying.
- **Search is one-way and single-date.** No return journeys, no multi-city, no
  flexible dates, no round-the-world.
- **Three carriers have no usable name** — two carry none at all and one is
  called `/`. They currently show as their uid stub and need labels chosen by
  hand.
- **Nothing syncs with the game.** The data is a point-in-time export; refreshing
  it means re-running the scraper with a fresh token and redeploying.
- **Some folder names are not ASCII** (`divisions/vilis/龙凤航空/`). Fine in this
  repository, awkward in some tooling.

---

## What this repository holds

```
divisions/          the alliance rosters, and the scraper that fetches them
  <division>/
    members.json    who is in the division  (committed)
    members/        per-airline flights, fleet and info  (NOT committed - 574MB)
  scrape_members.py

database/           the JSON turned into a relational database
  sql/              01 .. 16, run in numeric order
  scripts/          ETL, airport backfill, deploy, credential handling
  reference/        merged open airport data
  connection.txt    your Supabase project  (NOT committed - see below)

web/                the site: Vite + React + Tailwind, static, no server
socials/            logos, liveries and photography
```

Two things are deliberately not committed: the **574MB of scraped per-airline
JSON**, which regenerates from the game API in about 90 seconds, and
**`database/connection.txt`**, which names your Supabase project. Neither
contains anything the site needs at runtime.

---

## The short version

```bash
# 1. fetch the alliance data from the game (needs a fresh API token)
python divisions/scrape_members.py --division proxima

# 2. turn it into CSV
python database/scripts/build_database.py
```

```powershell
# 3. one-time: tell it which Supabase project, and store the password
#    (fill in database/connection.txt first)
.\database\scripts\save_password.ps1

# 4. deploy the database
.\database\scripts\deploy.ps1
```

```bash
# 5. run the site
python database/scripts/write_web_env.py    # connection.txt -> web/.env.local
npm --prefix web install
npm --prefix web run dev
```

Full detail in [`database/README.md`](database/README.md) and
[`web/README.md`](web/README.md).

---

## How it is put together

**The data is a game export.** Player-run airlines in The Airline Simulator,
pulled from the game's own Supabase backend. It is messy in ways worth knowing
about — airline codes are not unique, seven different carriers are called
"Emirates", flight numbers run past 99999, and tail numbers repeat even inside
one fleet. Every one of those is handled; `database/README.md` lists them.

**The database is Postgres, sized to fit.** 341,710 flights and 153,688
aircraft, in **432 MB** — small enough for a Supabase free project. Getting
there meant storing operating days as a 7-bit mask rather than a row per day,
folding the four fixed cabins into columns, and keeping only the indexes that
are actually scanned.

---

## Deploying the site

The build is committed at the repository root and a push publishes it:

```bash
npm --prefix web run publish     # builds and copies index.html + assets/ to the root
git add -A && git commit -m "..." && git push
```

The workflow ([`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml))
only uploads those files. It does **not** build.

That is deliberate. It used to build in CI with the Supabase values coming from
repository variables -- and an unset variable substitutes an *empty string*, so
it produced a bundle with no credentials, deployed it, and served a blank white
page over a working site. Building locally means the values come from
`web/.env.local`, where they either work or visibly do not, and what ships is
what was reviewed.

`npm --prefix web run publish` is the only way to update the live site. Editing
`index.html` or `assets/` by hand will be overwritten.

---

## Joining Echo

Every division requires an application **in two places**: in The Airline
Simulator itself, and on the Echo Alliances Discord. One without the other will
not be actioned.

**https://discord.gg/E6ZccFNWnd**

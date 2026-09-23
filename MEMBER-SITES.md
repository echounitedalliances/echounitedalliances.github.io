# Member websites

Eleven member websites are reachable from their carriers' pages here, each
behind a notice that says what the traveller is walking into.

This file records **what each site does** and **whether its schedules and fares
are real**, compared by hand against our own database. The latest check was on
**24 September 2026**, against that day's scrape. The grades below are what the
site shows travellers; the evidence is what was actually compared.

---

## The short version

| Site | Airline(s) | What it does | Data |
|---|---|---|---|
| [KarinationGroup](https://flykarination.github.io/sales) | Karination, FORZA | Full booking search | ✅ **Live** |
| [TerraLink Group](https://flyterralink.netlify.app/) | Starliner, ASTRA by Starliner, Velora by STRLINR, Meridian by STRLNR, Essequibo Air, AmeriGo | Group booking search | ✅ **Live** |
| [Explora Journeys](https://explorajourneysva.softr.app/) | Explora Journeys | Route table, no booking | ✅ **Live** |
| [Sovietskyie](https://sites.google.com/view/sovietskyie) | Советские | Brochure and loyalty tiers; a beta booker for one route | ⚠️ **Sample only** |
| [Bula Air](https://kariy4.github.io/Bula-Air/pages/index.html) | Bula Air | Booking flow on an old copy of our timetable | ⚠️ **Sample only** |
| [SwissLux Group](https://lacnka.github.io/swisslux) | SwissLux | Account-gated app | ❔ **Unverified** |
| [Dream Island Air](https://dream-island-air.base44.app/) | Dream Island Air | Account-gated app | ❔ **Unverified** |
| [Britannia Group](https://flybritanniagroup.base44.app/) | Fly Empire, Soleado | Booking search, generated results | ❌ **Illustrative** |
| [Book & Go](https://bookgo-chi.vercel.app/) | FUN! Canada, once flyhop ("CAS") | Multi-airline search + newsfeed | ❌ **Illustrative** |
| [AirFluff](https://airfluff-airlines-copy-54d2ba54.base44.app/) | AirFluff Airlines | Booking search, generated results | ❌ **Illustrative** |
| [Vaultera](https://dome-record-86929245.figma.site/) | Vaultera | Designed site, generated search | ❌ **Illustrative** |

**Three sites can be trusted for schedules and fares. Two publish real data for
only part of the network, four generate their results, and two would not let us
look.**

American Express Air's site is gone: on 24 September 2026
`flyamex.base44.app` answered "App not found" on every path, so its button and
notice were removed and the carrier's page says "Contact airline for booking"
again. If the member publishes a new address, add it back from the admin editor.

---

## Live — matches our data

### KarinationGroup

The site reads its own copy of the game schedule from its own database, through
a public `v_routes` view that its pages query with the key they ship. The check
read the same view and compared it route by route, in both directions:

| | Site | Ours |
|---|---|---|
| Karination routes | 1,508 | 1,508, the same ones |
| — fastest time, lowest economy fare, days served | identical on all 1,508 | |
| FORZA routes | 1,008 | 1,036: all of the site's, plus 28 newer |
| — fastest time, lowest economy fare | identical on all 1,008 | |

On 88 routes the site shows no business fare where our route summary lists
one: those cabins carry a price but no seats, and the site is right not to
quote them.

It now sells FORZA openly: a FORZA flight is marked *"operated by FORZA, a
KarinationGroup member of Echo Proxima"*, so the 8 September warning that FORZA
searches came back as Z4 flights under Karination branding is obsolete. It also
sells **Sonder** (SD), a group airline outside the alliance. The "766 routes ·
481 destinations" on its home page is hand-written copy. Its footer: *"A
fictional airline in a fictional world."*

### TerraLink Group

*Checked 22 and 24 September 2026.* The Starliner Group site
(`chai-debug-create.github.io/Tas`) became TerraLink Group. One search sells
**six** carriers, all of them ours: **Starliner** (Kyra), **ASTRA by Starliner**
and **Velora by STRLINR** (Rhea), and **Meridian by STRLNR**, **Essequibo Air**
and **AmeriGo** (Elysium). Essequibo Air and AmeriGo got the button on
22 September 2026, by the owner's decision; that AmeriGo is Elysium's (AG, out
of ORD and JFK), not Rhea's "AmeriGo!". Not to be confused with **TerraLink
Airways** (Kyra, TL), a separate carrier the site does not sell.

Its accounts and bookings now run on TerraLink's own Supabase project, with
TerraClub points and confirmation emails: a booking there is TerraLink's, and
holds no seat here.

The whole timetable ships inside the page (`DATA.flights`, keyed on the game's
own aircraft ids), so each check compared all of it:

| | Site | Ours (24 September scrape) |
|---|---|---|
| Services on file | 2,078 | 2,261 aircraft assignments |
| Matched by aircraft, route and flight number | 2,047 | |
| Departure, block times, return flight number, turnaround, weekdays, fares in all four cabins | identical on all 2,047 | |
| Ours that the site lacks | | 159 flights: Essequibo Air 103, AmeriGo 50, Starliner 6 |

On 22 September its copy was the newer one; now ours is.

Between the two checks it rewrote how it works times out, and two of the three
faults flagged on 22 September are fixed:

- **Weekdays**: it now reads the game's day 0 as Monday, as we do.
- **Arrivals**: legs are now worked in UTC and shown on each airport's own
  clock. It applies summer time, which our clocks leave out, so some times
  differ from ours by an hour; which the game uses is an open question, not a
  TerraLink fault.
- **Return flights**: now the game's rule — the distance-based ground time plus
  the airline's own turnaround, then the inbound block time. On every route
  without a stop the result is ours exactly.

Still wrong:

- **A flight flown by several aircraft shows only one aircraft's days.** 49
  services (21 Starliner, 28 Meridian): SR 999 San Francisco → Helsinki flies
  daily on two aircraft and shows once a week.
- **Routes with a stop** (75 of them): the way back uses a fixed 60 minutes at
  the stop, and adds the turnaround in minutes where the game counts quarter
  hours. None of those return legs match ours, and 43 are out by an hour or
  more.

Velora's entry fare there is its premium economy fare, which is right: Velora
has no economy seats on any aircraft.

The grade stays **live**: every fare and filed time is the game's own. The
notice points travellers at the two faults.

### Explora Journeys

A Softr site — Home, Aircraft, Routes — with no booking engine. Its route
table has **246** records and we hold exactly **246** Explora routes. The
site's data service returns at most 100 records a request, so 100 were
compared in detail: every one is a route Explora flies, with the **same weekly
frequency on all 100** and the same aircraft types on 99 (ZRH–LAX leaves out
its Boeing 787-10).

---

## Sample only — real, but only part of the network

### Sovietskyie

A Google Site — Home, Fleet, Flights, Hotels, and a **Red Star** loyalty
programme with Silver, Gold and Premier tiers. Tagline "The people's airline";
its footer names Echo United Alliances.

Its Fleet page now claims **235** aircraft — 149 Airbus, 19 Boeing, 67 Sukhoi —
and names exactly the types we hold: A320-200, A320neo, A321-100, A321neo,
A321LR, A350-900, A350-1000, Boeing 777-300 and the Superjet 100-95LR. We hold
**270** (166, 25 and 79). Same fleet, an older count.

"Book Flights Now" no longer opens a Google Form. It leads to a flight booker
embedded in the page, headed *"THIS FLIGHT BOOKER IS IN BETA, AND ISSUES WILL
OCCUR. DO NOT ENTER YOUR PERSONAL DATA!"* It covers **one route of 302**,
Vladivostok–Yakutsk, and on it is exact: flights 5313/5314, 5315/5316 and
5317/5318, with our departure and arrival times both ways, our weekdays (daily;
Mondays only; Friday to Sunday) and our aircraft (RA-32116, RA-32124). Fares are
in roubles and roughly track ours: outbound economy at about 91 ₽ to the dollar
(32,500 ₽ against our $357), return and business lower. It asks for a name and
passport number, makes up an "SU-" reference, and sends nothing anywhere.
Hotels are still booked by Google Form.

### Bula Air

A five-step flow — Search → Flights → Passengers → Seats → Review — with genuine
per-aircraft seat maps, reading `data/routes.json`, `fleet.json` and
`bookings.json`.

`routes.json` no longer holds four sample routes. It holds **193 flights copied
from this site's own timetable** — they carry our generated designators
(`BLPX1 …`) — 116 of them out of Auckland. Against the 24 September timetable:

- **112 rows no longer appear in it**, and 96 of their flight numbers are no
  longer flown at all (Adelaide–Hamilton Island, for one).
- **47 of the 81 that remain depart exactly 30, 60 or 90 minutes early**: our
  return times from before the turnaround correction of 22 September. The copy
  predates it.
- **Every row's days read `MTWTFSS`**: the day letters were copied without
  which of them are lit, so every flight shows as daily. 63 of the 81 are not.
- Aircraft and fares match on the rows that remain.

We hold 1,168 timetable lines for Bula Air.

---

## Illustrative — do not quote these fares

### Britannia Group → Fly Empire and Soleado

Search results are now generated outright. A seeded random generator, keyed on
origin, destination and date, makes five options per search: a departure
between 06:00 and 19:15, a block time from the distance with random spread, a
stop on some long routes, a price in pounds from the distance, and a flight
number of the brand's code plus a random number. The brand is picked by
region — **Soleado** (SOL) for short European hops, **Fly Empire** (FEM) for
anything from the UK, **Dragonair** (DGN) for China and **Senegalair** (SEN)
for Senegal and the Canaries. Nothing is read from any schedule; even the real
Fly Empire flight numbers seen on 8 September are gone. A booking is saved to
the site's own backend with the name and email typed in.

Its Dragonair looks like ours: **港龍航空 BG DRAGONAIR** (DR, Aura), which has
no button. Whether to link it is the owner's decision.

### Book & Go ("CAS" — flyhop)

The carrier is the same airline under a third name: flyhop became Fun
Airways on 16 September 2026 and FUN! Canada on 24 September. Its button
follows the airline, not the name.

A genuinely polished OTA-style search: one-way/round-trip, sort by price,
duration or departure, filter by full-service vs low-cost. The member also runs
**[VAFeed](https://vafeed.vercel.app/)**, a community newsfeed, which is linked
from the same notice.

Unchanged on 24 September: results come from a global
`generateFictionalFlights()` that calls `randomInt(5, 8)` for how many to show,
picks airlines at random, and gives each a random departure and a random 2 to 6
hour journey, whatever the route. The interface is real; the flights are not.

### AirFluff Airlines

Frankfurt-based. Its results come from a function that takes the two airports
and the date: journey time is distance ÷ 850 km/h + 30 minutes, the flight
number is `AFL` plus a hash of the two codes, departure times come from a fixed
list (06:40, 08:50, 11:25…), fares from the distance with random jitter; and
at random some results are marked cancelled (8%, with a reason) or sold out.
The 8 September check's "exact 50-minute block time" on FRA–ZRH was that
formula landing on the real figure.

Routes are Frankfurt to 17 airports, plus SFO–IST and HNL–SFO. 16 of the 17 are
real AirFluff routes from Frankfurt (Leipzig is not), of the 185 we hold. Its
own footer: *"a fictional company for demonstration"*.

### Vaultera

A Figma-built site. Since 10 September its search returns flights, all
generated from the distance between the two airports: 3 to 9 departures at
fixed clock times, a journey time of distance ÷ 480 km/h + 30 minutes, `VT`
flight numbers from a hash, and three fare tiers from the distance.

Its six "popular routes" are the same kind of figure:

| From Las Vegas | Site | Ours |
|---|---|---|
| Tokyo HND | 11h 20m, from $699 | 11h 10m, from $994 |
| Honolulu | 5h 40m, from $199 | 5h 50m, from $629 |
| London LHR | 10h 10m, from $619 | 9h 20m, from $846 |
| Miami | 4h 20m, from $149 | 4h 10m, from $434 |
| Paris CDG, Singapore | from $649 and $799 | not flown |

What it does publish about the network is right. Its hub count now comes from
its own list — "15 hubs" — and all 15 are Vaultera hubs in our data; we now
hold a 16th, Hong Kong. "250+ destinations" (we hold 481). Graded
**illustrative** on 24 September, from *showcase*: there is now a search, and
it invents what it returns.

---

## Unverified — sign-in required

### SwissLux Group

Unchanged since 8 September: "One App. Every Journey." — a Supabase-backed app
that shows a Log In / Create Account wall and nothing else until you have an
account. I don't create accounts on members' sites, so this is genuinely
unchecked rather than judged.

Covers **SwissLux** (Kyra since the 24 September 2026 scrape). Its code still
names **SwissLux Private**, which left the alliance that week; the notice no
longer does.

### Dream Island Air

Unchanged: the base44 app is account-gated. The member's older Webador site,
offered as a second link since 8 September, is gone — its domain no longer
exists — so the link was removed on 24 September.

---

## How this is wired

- **`database/sql/24_member_sites.sql`** — `member_sites` (one row per site)
  and `member_site_airlines` (which carriers it covers). A group site is one
  row joined to several airlines, so a URL is never stored twice. Since
  22 September 2026 it only **seeds a new database**: on a database that
  already has sites it changes nothing, so a redeploy can never put the
  file's wording back over an admin's.
- **`database/sql/32_member_site_admin.sql`** — what admins edit through:
  `admin_set_airline_site` (which site a carrier offers), `admin_save_member_site`
  (a site's details and its notice), `admin_delete_member_site`, and
  `admin_member_sites` (the list). Each checks for an admin on the server.
- **`airline_site(uid)`** — what the airline page calls. Also returns the
  other carriers on the same site, which is where "The same site also sells
  Starliner and Velora by STRLINR" comes from. It runs with the visitor's own
  privileges, so both tables carry an explicit public read policy: with row
  level security switched on and no policy, every button disappears silently
  — which is what happened on the live site until 22 September 2026.
  `verify.ps1` now fails if a visitor sees fewer links than exist.
- **`airlines.website_url`** is mirrored from the same source so the directory
  stays consistent. The bare "Website ↗" link is hidden whenever the notice
  button is showing, so nothing routes around the notice.

### To add or change a site

As an admin, signed in:

- **On a carrier's page**, *Change website* (or *Add a website*) picks which
  site that carrier offers — an existing one, a new one, or none — and edits
  it, with a preview of exactly the notice a traveller will read.
- **On your account page**, *Member websites* lists every site with the
  carriers it covers. Edit a site's details and its embedding text there,
  link or unlink carriers, add a site, or remove one.

A site's details belong to the site, so editing a group site changes the
notice on every carrier it covers; the editor says which.

### To re-check a grade

Grades are dated on purpose: they record a comparison someone made on a day,
not a live check. Re-compare, then update the embedding text and the
*Checked against our data on* date together.

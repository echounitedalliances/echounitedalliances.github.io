# Member websites

Eleven members have built their own sites. Each one is now reachable from its
carrier's page here, behind a notice that says what the traveller is walking
into.

This file records **what each site does** and **whether its schedules and fares
are real**, checked by hand against our own database on **8 September 2026**
(TerraLink Group, which replaced the Starliner Group site, on **22 September
2026**). The grades below are what the site shows travellers; the evidence is
what I actually compared.

---

## The short version

| Site | Airline(s) | What it does | Data |
|---|---|---|---|
| [Karination](https://flykarination.github.io/sales) | Karination | Full booking search | ✅ **Live** |
| [TerraLink Group](https://flyterralink.netlify.app/) | Starliner, ASTRA by Starliner, Velora by STRLINR, Meridian by STRLNR, Essequibo Air, AmeriGo | Group booking search | ✅ **Live** |
| [Explora Journeys](https://explorajourneysva.softr.app/) | Explora Journeys | Route table, no booking | ✅ **Live** |
| [Sovietskyie](https://sites.google.com/view/sovietskyie) | Советские | Brochure + loyalty tiers, booking by form | ✅ **Live** |
| [Bula Air](https://kariy4.github.io/Bula-Air/pages/index.html) | Bula Air | Full 5-step booking with seat maps | ⚠️ **Sample only** |
| [SwissLux Group](https://lacnka.github.io/swisslux) | SwissLux, SwissLux Private | Account-gated app | ❔ **Unverified** |
| [Dream Island Air](https://dream-island-air.base44.app/) | Dream Island Air | Account-gated app | ❔ **Unverified** |
| [Britannia Group](https://flybritanniagroup.base44.app/) | Fly Empire, Soleado | Booking search | ❌ **Illustrative** |
| [Book & Go](https://bookgo-chi.vercel.app/) | flyhop ("CAS") | Multi-airline search + newsfeed | ❌ **Illustrative** |
| [AirFluff](https://airfluff-airlines-copy-54d2ba54.base44.app/) | AirFluff Airlines | Booking search | ❌ **Illustrative** |
| [American Express Air](https://flyamex.base44.app/) | American express | Booking search | ⚠️ **Sample only** |

**Four sites can be trusted for schedules and fares. Three cannot, and say so
to varying degrees. Two publish only part of the network, and two would not
let us look.**

---

## Live — matches our data

### Karination

Vietnamese full-service carrier, and the most complete member site of the ten.
A real booking widget (return / one-way / multi-city, four cabins), a
destinations map, check-in, Manage Booking, and its own RainbowOne loyalty
programme.

Its own headline figures are **766 routes · 481 destinations · 717 aircraft ·
5 hubs**. We hold **755 routes · 480 destinations · 712 aircraft**, out of
CXR, DAD, HAN, PQC and SGN — the same five. The gap is a few days of fleet
growth, not a different dataset. Fares are described on the site as "lowest
one-way Economy fare on each route", which is what they are.

*It covers Karination only,* and this was re-checked specifically. Its
timetable returns nothing but KX flights; asking for a route it does not serve
answers **"Karination does not fly LHR to JFK. Try one of our hubs"** rather
than offering a sibling carrier; RainbowOne earns miles "on every Karination
flight"; and the footer reads "KX · A member of Echo Aegis". There is no
second brand on the site to attach.

Velaris KX is not sold there and did not get the button: despite the shared
"KX", the two are **separate groups under different owners** who happened to
pick the same code for their group.

### TerraLink Group

*Checked 22 September 2026.* The Starliner Group site
(`chai-debug-create.github.io/Tas`) became TerraLink Group, and the same four
carriers now link here instead. One search sells **six** carriers, all of them
ours: **Starliner** (Kyra), **ASTRA by Starliner** and **Velora by STRLINR**
(Rhea), and **Meridian by STRLNR**, **Essequibo Air** and **AmeriGo** (Elysium).
Round trip / one way, four cabins, connections, a route map, fleet pages, flight
status and a TerraClub loyalty scheme; bookings are demos that hold no seat.
Meridian is now actually sellable there, which it was not on the old site.
Essequibo Air and AmeriGo got the button too on 22 September 2026, by the
owner's decision. That AmeriGo is Elysium's (AG, out of ORD and JFK), not
Rhea's "AmeriGo!".

Not to be confused with **TerraLink Airways** (Kyra, TL), a separate carrier
the site does not sell.

The whole timetable ships inside the page, keyed on the game's own aircraft
ids, so this check compared all of it rather than spot checks:

| | Site | Ours (16 September scrape) |
|---|---|---|
| Services on file | 2,079 | 1,969 |
| Matched to ours by aircraft, route and flight number | 1,845 | |
| Fares on those, all four cabins | identical | |
| Departure time and block time on those | identical | |
| Home-page fares, 8 popular routes and 8 deals | all equal our cheapest economy | |

Every difference in the data runs the same way — **its copy is newer than
ours**:

- **Starliner:** 497 aircraft to our 405, every one of ours plus 92 more, and
  101 services we do not have yet.
- **AmeriGo** swapped 31 aircraft since our scrape; 122 of the 123 flights that
  moved keep our exact times and fares.
- **Essequibo Air:** six aircraft newer than ours.
- **ASTRA** (58), **Meridian** (189) and **Velora** (38): fleets identical,
  registration for registration.

Velora's entry fare there is its premium economy fare, which is right: Velora
has no economy seats on any aircraft. That also explains the old site's
"mid-cabin" fares — HYD→BLR at $221 and HYD→CDG at $1,889 are exactly Velora's
premium economy prices.

What it gets wrong is in how it presents the data, not the data itself:

- **Return flights are its own estimate.** The data holds one leg per route,
  the filed one, which leaves a hub on 98% of routes. The site builds the way
  back itself: flight number +1 (right on all of them), the outbound block time
  (wrong on 81%), and a departure 90 minutes after landing on the *origin's*
  clock. Only 5% of return departures match ours; 31% are more than two hours
  out.
- **Arrival times stay on the departure airport's clock**, so they are out by
  the time difference on the 69% of routes that cross one. Houston → Salt Lake
  City lands at 15:00 there and 14:00 here.
- **Weekdays run one day early** on every flight that does not operate daily
  — 616 of the 1,845. It reads the game's day 0 as Sunday; our loader reads it
  as Monday, and the game agrees with us. SR 1203 Houston → Salt Lake City is
  filed as day 4 with no midnight rollover: a Thursday there, a Friday here,
  and a Friday in the game itself (checked by the owner, 22 September 2026).
- **A flight shared by two or three aircraft shows one aircraft's days.** 41
  services (28 Meridian, 13 Starliner): Meridian's daily IAH→MUC appears once a
  week.

The grade stays **live**: every fare and every filed time is the game's own, in
a fresher copy than ours. The notice tells travellers to check times and days
here before booking.

### Explora Journeys

A Softr-built site: brand pages plus a real route table that matches ours.
There is no booking engine, so the button leads to information, and the notice
says to come back here to book.

### Sovietskyie

A Google Site — Home, Fleet, Flights, Hotels, and a **Red Star** loyalty
programme with Silver, Gold and Premier tiers. Tagline "The people's airline",
and its footer names Echo United Alliances.

Its Fleet page claims 222 aircraft: 151 Airbus and 71 Sukhoi. We hold 207:
136 Airbus and **exactly 71 Sukhoi Superjet 100-95LRs**. Same fleet, ours a
little older.

"Book Flights Now" opens a **Google Form** — a request answered by hand, not
an instant confirmation. Worth knowing before clicking, so the notice says it.

---

## Sample only

### Bula Air

The best-engineered small site of the ten, and the one whose grade is most
likely to be misread. A five-step flow — Search → Flights → Passengers →
Seats → Review — with genuine per-aircraft seat maps (A350-900 in 3-3-3
economy, 2-3-2 premium, 1-2-1 business, "Apartment Suites" in first).

It is honest code: it reads `routes.json`, `fleet.json` and `bookings.json`,
and its only four uses of `Math.random` are the 12% of seats drawn as occupied
and the booking reference. **Nothing about the flights is fabricated.**

The catch is inventory. `routes.json` holds **four routes**, all from Nadi —
AKL, SYD, LAX, HNL — each with a field named `sampleFare`. All four are real
and the near fares are close (AKL $420 vs our $409, SYD $510 vs $498; LAX and
HNL drift further). But Bula Air actually serves **81 destinations from Nadi**
and 135 routes overall. A traveller who searched there and found nothing would
wrongly conclude the route does not exist.

### American Express Air

A JFK-based luxury carrier with a Leaflet route map, lounges, a fleet page and
a five-cabin booking flow. The home page teases six destinations; the booking
page carries **47**, each with a block time.

Every one of those 47 is a route American Express Air genuinely serves. Two
things stop it being a *live* grade:

- it reaches **87 destinations from JFK**, so roughly half the network is
  missing from the picker;
- the block times are its own estimates, consistently a little longer than the
  filed ones — LHR 7h00 against our 6h10, ZRH 8h15 against 7h00, CDG 7h10
  against 6h30. LAX is exact at 5h10, so it is an approximation that sometimes
  lands rather than a copy.

Its stated fleet of 60 also sits well under the 192 aircraft we hold.

---

## Illustrative — do not quote these fares

### Britannia Group → Fly Empire and Soleado

**Two brands, and only a search reveals it.** Nothing on the home page, the
Deals page or the nav names a second airline — LHR–JFK returns Fly Empire
(FEM) on every row, which is why the first pass recorded one carrier. LHR–EDI
returns four **Soleado** (SOL) services and one Fly Empire. Soleado is ours too
(SO, Elion, 430 routes), so both carriers now carry the button.

The lesson for the next group site: read the *results*, on more than one kind
of route, not the marketing.

Search results are branded Fly Empire on the long-haul routes. The flight numbers are real
Fly Empire numbers — 360, 517, 667, 903, 955 — but they are **attached to the
wrong routes**: 360 is really LHR–SIN, 517 LHR–ORD, 667 LHR–LAX, 903 LHR–JFK,
955 LHR–DXB. Durations are invented too, where ours are a constant 450 minutes.

Recognisable parts, reassembled. A showcase, not a timetable.

### Book & Go ("CAS" — flyhop)

A genuinely polished OTA-style search: one-way/round-trip, sort by price,
duration or departure, filter by full-service vs low-cost. The member also runs
**[VAFeed](https://vafeed.vercel.app/)**, a community newsfeed, which is linked
from the same notice.

Its results come from a global `generateFictionalFlights()` that calls
`randomInt(5, 8)` for how many to show and generates times and prices to match.
Nothing is read from any schedule. The interface is real; the flights are not.

### AirFluff Airlines

Frankfurt-based, and the most interesting near-miss. Searching FRA→ZRH returns
a real AirFluff route with our exact 50-minute block time and the right
aircraft family — but at 06:40 for €72 as "AFL 660", where we hold 06:30 for
€110 and **no flight numbered 660 anywhere in AirFluff's timetable**.

Real skeleton, invented flesh. Its own footer settles it: it calls itself
*"a fictional airline"* and *"a fictional company for demonstration"*.

---

## Unverified — sign-in required

### SwissLux Group

"One App. Every Journey." — a Supabase-backed app that shows a Log In / Create
Account wall and nothing else until you have an account. I don't create
accounts on members' sites, so this is genuinely unchecked rather than judged.

Covers **SwissLux** (Aegis) and **SwissLux Private** (Vilis).

### Dream Island Air

Same situation: the current base44 app is account-gated. The member's
**[older site](https://temp-wahoumdaqshifhimthou.webadorside.com/)** is still
up and is offered as a secondary link in the notice.

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

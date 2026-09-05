# Echo United Alliances

The website for Echo United Alliances, a virtual airline group in
**The Airline Simulator** — eight divisions, 590 member carriers, one network.

Live at **https://echounitedalliances.github.io**

---

## What this repository holds

```
divisions/          the alliance rosters, and the scraper that fetches them
  <division>/
    members.json    who is in the division  (committed)
    members/        per-airline flights, fleet and info  (NOT committed - 574MB)
  scrape_members.py

database/           the JSON turned into a relational database
  sql/              01 .. 14, run in numeric order
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
aircraft, in **419 MB** — small enough for a Supabase free project. Getting
there meant storing operating days as a 7-bit mask rather than a row per day,
folding the four fixed cabins into columns, and keeping only the indexes that
are actually scanned.

**The site is static.** It talks straight to Supabase from the browser, which
is what lets it live on GitHub Pages with no server. Row level security is what
protects the data; the publishable key in the bundle authorises nothing.

**Search crosses every carrier.** One query returns nonstop through two-stop
itineraries across all 590 airlines, so a journey no single member flies is
still one booking and one reference. It runs in 44–73 ms typically.

---

## Deploying the site

Pushing to `main` builds and publishes automatically
([`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml)).

**Settings → Pages → Source must be set to "GitHub Actions".** While it is
left on "Deploy from a branch", GitHub's own Jekyll builder publishes this
README over the top of the site and the app never appears.

Then in **Settings → Secrets and variables → Actions → Variables** add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` |

Both are *variables*, not secrets, on purpose: they are compiled into a public
JavaScript bundle and are meant to be. The workflow works out the base path
from the repository name, so a `<name>.github.io` site needs nothing else.

---

## Joining Echo

Every division requires an application **in two places**: in The Airline
Simulator itself, and on the Echo Alliances Discord. One without the other will
not be actioned.

**https://discord.gg/E6ZccFNWnd**

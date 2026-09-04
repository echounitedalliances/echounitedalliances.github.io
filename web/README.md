# Echo United Alliances — website

A static React build that talks straight to Supabase. No server, no API layer
of its own: every page is one indexed read behind the publishable key, which is
what makes it deployable to GitHub Pages.

## Run it locally

```bash
cp .env.example .env.local     # fill in the two values from Supabase → API
npm install
npm run dev
```

## Pages

| route | what it is |
|---|---|
| `/` | Identity, the globe, the eight divisions, then search |
| `/divisions` | All eight, with their own figures |
| `/d/:code` | A division: its roster and its network lit on the globe |
| `/d/:code/:slug` | A carrier: route map, hubs, fleet, busiest routes |
| `/airlines` | All 590, filterable by division and country |
| `/airports/:iata` | Every alliance carrier serving one airport |
| `/network` | The whole network, filterable by division |
| `/search` | Cross-carrier results, up to two stops |
| `/book` | Passengers, mock checkout, real PNR |
| `/trips` | Retrieve a booking with a PNR and a surname |

## Two things that are deliberate

**HashRouter, not BrowserRouter.** GitHub Pages has no server to rewrite
unknown paths back to `index.html`, so `/d/kyra/emirates` would 404 on refresh.
The hash keeps every route client-side.

**The booking write is one RPC.** A guest has no privileges on `bookings`,
`passengers` or `booking_segments`, and should not get any. `create_booking()`
is security definer, validates every field, and writes all three in one
transaction — which it has to anyway, because the inventory trigger on
segments counts the passengers inserted before it.

## The globe

`src/components/Globe.tsx` draws the network in three buffers — arcs as one
`LineSegments` with vertex colours, airports as one `Points` cloud, the sphere
itself — so the scene is three draw calls no matter how much network is loaded.
Arcs draw themselves on via a shader uniform rather than by rebuilding the
buffer each frame. The data is `mv_network_arcs` and `mv_network_nodes`: the
busiest 1,200 city pairs with coordinates already attached, because 123,080
routes will not render in a browser.

## Deploying to GitHub Pages

`.github/workflows/deploy-web.yml` builds and publishes on every push to `main`
that touches `web/`. Before the first run, in the repository:

1. **Settings → Pages → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `PAGES_BASE` — only for a user/organisation site served from the domain
     root; set it to `/`. A project site needs no value, the workflow derives
     `/<repo>/` from the repository name.

Both Supabase values are repository *variables*, not secrets, on purpose: they
are compiled into a public JavaScript bundle and are meant to be. The
publishable key identifies the project; it authorises nothing. What protects
the data is the row level security in `database/sql/08_rls_policies.sql`.

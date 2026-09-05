# Merging lacnka/echotesting

**Nothing has been merged.** This is the survey: what each side built, what to
take, what to leave, and the one decision to make first.

Updated 6 September 2026 · their repo: <https://github.com/lacnka/echotesting>

---

## At a glance

| | |
|---|---|
| **Decide first** | Where the application form sends data — a secret is otherwise published in the bundle |
| **Take from them** | The application form · Discord online count · live visitor count |
| **Take from us** | The country-filter fix — ours now covers three traps, theirs one |
| **Never take** | `23928a9` — it rewrites asset paths for *their* URL and breaks ours |
| **Will conflict** | `web/src/App.tsx` (trivial) · `web/src/pages/Home.tsx` (one line) |

The trees are identical up to **`64a79c3` "Add password sign-in to Resonance"**.
Everything below happened after it: **12 commits theirs, 8 ours**.

---

## 1. Decide this before merging anything

**Where should the application form send data?**

Their form posts to a Discord webhook held in `VITE_DISCORD_APPLY_WEBHOOK_URL`.
That is a **secret compiled into a public bundle** — anyone who opens devtools
can read it and post to the applications channel themselves, under the
alliance's own webhook, so it looks official.

Their code says so plainly and treats it as an accepted trade. That is a
reasonable position, but it is yours to take, not theirs.

> **Checked: nothing is exposed today.** Their committed bundle and their live
> deployed bundle both contain zero webhook URLs — the variable was never set
> on a build. The risk is entirely prospective: the first build made with it set
> publishes it.

| Option | Effort | What you get |
|---|---|---|
| **A. Accept it** | none | Works today. Worst case is channel spam under your own webhook; the fix is to regenerate it. |
| **B. Supabase table** ⭐ | ~an hour | No secret in the bundle. Applications become durable rows you can query and mark handled, instead of chat scrollback. Reuses infrastructure you already run. |
| **C. Proxy** (Worker / Edge Function) | ~an hour | Keeps Discord as the destination, hides the secret, adds a moving part to maintain. |

**B is what I would do.** Settle it first: it substantially rewrites
`web/src/lib/discord.ts`, and redirecting the form once is easier than merging
it and rewriting it after.

---

## 2. Take from them

### The in-site application form — the most valuable thing on their branch

`web/src/components/Join.tsx` · `web/src/lib/discord.ts`

Collects **airline name, tag, division, notes**. The Join panel becomes a real
choice (`method: 'discord' | 'website'`) rather than Discord-only, and the copy
in `site.ts` presents the two as equals instead of hiding the form.

It takes divisions as a prop — `<Join divisions={divisions} />` — so the
dropdown comes from the database.

It removes a step from the one funnel the site exists to serve. Take it, once
§1 is settled.

### Discord online count

`web/src/lib/discordWidget.ts`

Reads `presence_count` from Discord's **public Server Widget** JSON. No auth, no
bot, CORS already open, and it renders nothing if the widget is switched off.

*One change on the way in:* the guild ID is hardcoded in the module. It is
public, so that is not a leak — but it belongs in `site.ts` beside the invite
link, not buried in a lib file.

### Live visitor count

`web/src/lib/presence.ts`

Supabase Realtime Presence — every tab joins one channel and counts the others.
No backend, consistent with the rest of the architecture.

*Two things to settle on the way in:*

- **It counts open tabs, not people.** Their own comment says so. One person
  with three tabs reads as three, and the badge says "N on site". A visibly
  wrong number is worse than no number — decide the wording.
- **It is the site's first always-on WebSocket.** Worth checking the free
  tier's concurrent-connection limit before this ships.

---

## 3. Take ours instead

### The country filter — ours supersedes theirs

Their `eb76bca` fixes one trap: filtering to a country with a single carrier
collapsed the chip row and took the clear button with it.

We have since fixed that **and two more**, plus one we introduced and caught:

1. Single-carrier country unmounted the row — *their bug, also fixed here*
2. **Zero results** removed the row entirely, and the empty state then advised
   clearing filters it had just removed the controls for
3. The search box never followed the URL, so Back left stale text that the next
   keystroke wrote straight back
4. `Clear all` cleared everything, then the 220 ms debounce fired and rebuilt
   the query from a stale snapshot, restoring division and country

> **This changes the merge.** Their fix touches the same six lines we rewrote,
> so `eb76bca` will now **conflict rather than apply cleanly**. Resolve it by
> keeping ours.

---

## 4. Never take

### `23928a9` "Fix asset paths for a GitHub Pages project page"

It rewrites built `index.html` and `404.html` from `/assets/…` to
`/echotesting/assets/…`. Correct for a **project page**
(`lacnka.github.io/echotesting/`), wrong for our **organisation page**
(`echounitedalliances.github.io`), where the base is `/`.

This is deployment configuration, not a feature, and it only ever touches built
output. The safe rule for the whole merge:

> **Merge source. Never merge `index.html`, `404.html`, `assets/` or `brand/`.**
> Republish with `npm --prefix web run publish` afterwards.

`brand/` is new since the fork — the logo and favicons. Both publish paths had
to learn about it, so confirm it survives the merge or the site deploys with no
icon and no wordmark.

---

## 5. The two collisions

### `web/src/App.tsx` — trivial

Both sides deleted the same block: the conic-gradient square that stood in for a
logo. We replaced it with `<EchoMark />`; they replaced it with `<OnlineBadge />`
and `<SiteVisitorBadge />`.

**Keep all three** — mark on the left, badges on the right.

Two notes. They also tried their own logomark in `f217427` and reverted it in
`ba813ae`; ours supersedes both and those two commits can be ignored. And our
nav is now six items plus Discord and the account chip, folding into a menu
below 1024px — **their badges need to go into that menu or hide below `lg`**, or
the header overflows. That overflow once made the whole site scroll sideways on
a phone.

### `web/src/pages/Home.tsx` — one line

`<Join />` becomes `<Join divisions={divisions} />`. Take theirs; `divisions` is
already in scope.

---

## 6. What we have that they do not

For their side of the merge:

- **Pages** — About, Our activities, and the alliance roster in `lib/alliance.ts`
- **Identity** — the new division palette (`19_division_colours.sql`, plus the
  two materialised views that cache it), the Echo wing as a CSS mask
  (`EchoMark`), `brand/` and the favicons
- **Motion** — the arrival animation, and the wing loading state
- **Booking** — trip sorting, search sorting by departure and arrival,
  `v_route_pairs` (undirected city pairs), `search_places` (city-grouped
  airport typeahead)
- **Auth** — password-only sign-in; they forked before the email link was
  removed, so their tree still shows a sign-in method that no longer exists
- **Fixes** — the mobile header, and the four filter traps in §3

---

## 7. Suggested order

1. **Settle §1.** Everything else is cheaper once it is decided.
2. Merge nothing from `Directory.tsx` — keep ours, drop `eb76bca`.
3. Merge `discordWidget.ts` and `presence.ts` — new files, no conflicts. Then
   fix the "on site" wording and place the badges in the mobile menu.
4. Merge the application form last; §1 decides what it looks like.
5. Resolve `App.tsx` by hand. Take their one-line `Home.tsx`.
6. Republish from source. Do not take their built output.

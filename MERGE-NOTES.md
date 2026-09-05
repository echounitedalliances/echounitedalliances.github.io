# Merging lacnka/echotesting

Prepared 6 September 2026. **Nothing here has been merged.** This is a survey of
what each side built after the fork, what will collide, and what must not be
brought across.

Their repo: <https://github.com/lacnka/echotesting> · live at
<https://lacnka.github.io/echotesting/>

---

## Where the histories split

```
64a79c3  Add password sign-in to Resonance, alongside the email link
```

Both trees are identical up to that commit. Everything below is after it, so
this is the base any merge starts from.

| | commits since the fork | source files touched |
|---|---|---|
| **ours** (`echounitedalliances`) | 6 | 27 |
| **theirs** (`lacnka/echotesting`) | 12 | 9 |

They forked before the email-link removal, so their tree still has
`signInWithOtp` and the Email-link tab. That is not a conflict — we deleted
those files' contents, they never touched them — but their branch will still
*show* a sign-in method that no longer exists on ours.

---

## What they built that we do not have

### 1. In-site application form — worth taking

`web/src/components/Join.tsx`, `web/src/lib/discord.ts`

A form beside the Join panel collecting **airline name, tag, division and
notes**, posted to a Discord webhook as an embed. The Join panel becomes a
two-way choice (`method: 'discord' | 'website'`) rather than Discord only, and
the copy in `site.ts` was rewritten to present them as equal routes instead of
treating the form as a hidden extra.

It takes `divisions` as a prop now — `<Join divisions={divisions} />` — so the
division dropdown is populated from the database rather than hardcoded.

**This is the most valuable thing on their branch.** It removes a step from the
one funnel the site exists to serve.

### 2. Discord online count — worth taking, with a caveat

`web/src/lib/discordWidget.ts`

Reads `presence_count` from Discord's **public Server Widget** JSON. No auth, no
bot, CORS already open, and it degrades to rendering nothing if the widget is
switched off. Shown in the header and on the Join panel.

Caveat: the guild ID is hardcoded in the module. Fine, it is public — but it
belongs in `site.ts` with the invite link, not buried in a lib file.

### 3. Live visitor count — take it, but read the label

`web/src/lib/presence.ts`

Supabase Realtime Presence: every tab joins one channel and counts the others.
No backend, consistent with the rest of the architecture.

It counts **open tabs, not people** — their own comment says so. One person with
three tabs reads as three. The badge says "N on site", which slightly oversells
it; "N tabs open" is honest but weak. Worth deciding on the wording before this
ships, because a visibly wrong number is worse than no number.

Also unmeasured: this holds a WebSocket open for the life of the page, which is
the first always-on connection the site would have. Free-tier Realtime has
concurrent-connection limits worth checking before launch.

### 4. Country filter fix — **we have this bug too**

`web/src/pages/Directory.tsx:140`

```tsx
{countries.length > 1 && (        // ours, today
```

Filter to a country with only one carrier and `countries.length` drops to 1, so
the whole row unmounts — **including the button that clears the filter**. You
are stuck until you edit the URL. Their fix changes the guard to
`(country || countries.length > 1)` and makes the two branches a proper ternary.

I have deliberately **not** fixed this on our side. Fixing it independently
would put a conflicting edit in the same six lines and make their commit harder
to take. Take theirs.

---

## What we built that they do not have

For their side of the merge: About and Our activities pages, the alliance
roster in `lib/alliance.ts`, the new division palette (`19_division_colours.sql`
plus the matview refreshes), the Echo wing as a CSS mask (`EchoMark`), the
arrival animation, `brand/` and the favicons, trip sorting, search sorting by
departure and arrival, `v_route_pairs`, `search_places`, password-only sign-in,
and the mobile header.

---

## Collisions

Only two files were edited on both sides.

### `web/src/App.tsx` — will conflict, trivially

Both sides deleted the same block: the conic-gradient square that stood in for
a logo. We replaced it with `<EchoMark />`; they replaced it with
`<OnlineBadge />` and `<SiteVisitorBadge />`.

**Resolution: keep all three.** The mark on the left, the badges on the right.
Note they also tried a logomark of their own in `f217427` and reverted it in
`ba813ae` — ours supersedes both, and their two reverting commits can be ignored.

Our nav is also six items now plus Discord and the account chip, and it folds
into a menu below 1024px. Their badges need to go into the mobile menu or be
hidden below `lg`, or the header will overflow again — that overflow made the
whole site scroll sideways on a phone once already.

### `web/src/pages/Home.tsx` — one line

`<Join />` becomes `<Join divisions={divisions} />`. Take theirs; `divisions` is
already in scope on our Home.

---

## Do **not** merge

### `23928a9` "Fix asset paths for a GitHub Pages project page"

It rewrites the built `index.html` and `404.html` from `/assets/…` to
`/echotesting/assets/…`. That is correct for a **project page**
(`lacnka.github.io/echotesting/`) and wrong for our **organisation page**
(`echounitedalliances.github.io`), where the base is `/`.

This is deployment configuration, not a feature. It only ever touches built
output, so the safe rule is: **merge source, never merge `index.html`,
`404.html` or `assets/`** — republish those with `npm --prefix web run publish`
after the merge instead.

Our `brand/` directory is new since the fork and both publish paths had to learn
it. Whoever merges must confirm `brand/` survives, or the site deploys with no
icon and no wordmark.

---

## One decision to make first

`VITE_DISCORD_APPLY_WEBHOOK_URL` is a **secret that ends up in the public
bundle**. Their own comment is straight about it: anyone who opens devtools can
read it and post to the applications channel directly.

I checked — **nothing is exposed today**. The committed bundle and the live
deployed bundle both contain zero webhook URLs, because the variable was never
set on a build. The risk is entirely prospective: the first build made with it
set publishes it.

Three options, in order of effort:

1. **Accept it** as they propose. There is no account or table behind the
   webhook; worst case is channel spam, and the fix is to regenerate it. Cheap,
   and reversible — but the spam would be posted under the alliance's own
   webhook, so it would *look* official.
2. **Put the form behind Supabase instead** — an `applications` table with an
   insert-only RLS policy for `anon`, and a division lead reads it from the
   site. No secret in the bundle, applications are durable and queryable rather
   than living in a chat scrollback, and it reuses infrastructure that already
   exists. This is what I would do.
3. **A tiny proxy** (Cloudflare Worker, Supabase Edge Function) holding the
   webhook server-side. Keeps Discord as the destination, adds a moving part.

This is worth settling **before** the merge, because option 2 changes
`discord.ts` substantially and it is easier to redirect the form once than to
merge it and rewrite it after.

---

## Suggested order

1. Decide the webhook question above.
2. Merge their `Directory.tsx` fix on its own — smallest, entirely safe.
3. Merge `discordWidget.ts` and `presence.ts` (new files, no conflicts), then
   settle the "on site" wording and where the badges live on mobile.
4. Merge the application form last, since it is the piece the webhook decision
   changes.
5. Resolve `App.tsx` by hand, take their one-line `Home.tsx`.
6. Republish from source; do not take their built output.

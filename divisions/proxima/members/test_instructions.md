# Moved

This guide now lives at **[`divisions/API.md`](../../API.md)**.

It used to sit here, inside `divisions/proxima/members/` — a directory the
scrapers delete and rewrite. On 7 September 2026 a re-scrape removed it, and it
had to be recovered from git. It is out of harm's way now.

The bearer token does not belong in either file: put it in `divisions/.token`,
which is gitignored, or export `TAS_JWT`.

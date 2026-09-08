/**
 * The alliance news feed.
 *
 * The stories come from VAFeed, the community newsfeed a member runs. VAFeed
 * has no API and no RSS — it is server-rendered HTML — but it does not hold
 * its own articles either: it reads them live from a public Google Sheet
 * through opensheet, and that endpoint sends permissive CORS headers.
 *
 * So this reads the SAME source VAFeed reads, rather than scraping VAFeed's
 * pages. Two things follow, and both are why it is worth doing this way:
 *
 *   nothing to keep in sync. There is no scraper, no cron, no copy of the
 *   articles in our database going stale. A story published to the sheet is
 *   on this page the next time somebody loads it.
 *   nothing breaks when VAFeed is restyled. An HTML scraper would break the
 *   first time they changed a class name.
 *
 * The cost is that we depend on a third-party endpoint at read time, so the
 * page has to degrade honestly when it is unreachable — see News.tsx.
 *
 * SECURITY: every field here is written by whoever can edit that spreadsheet,
 * and `content` is raw HTML. It is sanitised below before it goes anywhere
 * near the DOM. Treat all of it as untrusted input, because it is.
 */

const FEED_URL =
  'https://opensheet.elk.sh/1PQUdcLnApn9QnB1uNLrgZvC-7pZRs3TP2YzFXTeAmO0/Sheet1'

/** Where the stories come from, credited on the page. */
export const NEWS_SOURCE = {
  name: 'VAFeed',
  url: 'https://vafeed.vercel.app/',
}

export type Article = {
  id: string
  title: string
  category: string
  /** As printed on the source, e.g. "04 Sep 2026". */
  date: string
  /** Parsed from date for sorting; null when it will not parse. */
  time: number | null
  summary: string
  /** Sanitised HTML, safe to inject. Empty when the story had no body. */
  html: string
  emoji: string
  imageUrl: string | null
  featured: boolean
}

/* ------------------------------------------------------------------ */
/*  Sanitising                                                         */
/* ------------------------------------------------------------------ */

/**
 * An allowlist, not a blocklist.
 *
 * Anything not named here is unwrapped — its text is kept, the element goes.
 * That is the safe direction to fail: a story using an unexpected tag loses
 * its formatting, rather than a story using an unexpected tag getting to run.
 *
 * Note that stripping <script> is not enough on its own. innerHTML never
 * executes injected <script>, but it very much executes <img onerror=…>, so
 * ALL attributes are dropped except href on a link, and that only when it
 * points somewhere over http(s).
 */
const ALLOWED = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SPAN',
  'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'H2', 'H3', 'H4', 'A',
])

/** Tags whose text content should go too, not just their markup. */
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'])

function clean(node: Node, out: Node, doc: Document): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ''))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const el = child as Element
    if (DROP_ENTIRELY.has(el.tagName)) continue

    if (!ALLOWED.has(el.tagName)) {
      // Unwrap: keep what it said, discard what it was.
      clean(el, out, doc)
      continue
    }

    const safe = doc.createElement(el.tagName.toLowerCase())
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? ''
      if (/^https?:\/\//i.test(href)) {
        safe.setAttribute('href', href)
        safe.setAttribute('target', '_blank')
        safe.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    }
    clean(el, safe, doc)
    out.appendChild(safe)
  }
}

export function sanitize(html: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const out = doc.createElement('div')
    clean(doc.body, out, doc)
    return out.innerHTML
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/*  Loading                                                            */
/* ------------------------------------------------------------------ */

/** Spreadsheet cells arrive as strings, including the booleans. */
function truthy(v: unknown): boolean {
  return String(v ?? '').trim().toUpperCase() === 'TRUE'
}

function httpsOnly(url: unknown): string | null {
  const s = String(url ?? '').trim()
  return /^https:\/\//i.test(s) ? s : null
}

function parseDate(s: string): number | null {
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

type Row = Record<string, unknown>

export async function loadNews(signal?: AbortSignal): Promise<Article[]> {
  const res = await fetch(FEED_URL, { signal })
  if (!res.ok) throw new Error(`The news feed answered ${res.status}.`)
  const rows = (await res.json()) as Row[]
  if (!Array.isArray(rows)) throw new Error('The news feed returned something unexpected.')

  return rows
    .map((r, i): Article => {
      const date = String(r.date ?? '').trim()
      return {
        id: String(r.id ?? `row-${i}`),
        title: String(r.title ?? '').trim(),
        category: String(r.category ?? '').trim(),
        date,
        time: parseDate(date),
        summary: String(r.summary ?? '').trim(),
        html: sanitize(String(r.content ?? '')),
        emoji: String(r.image ?? '').trim() || '📰',
        imageUrl: httpsOnly(r.imageUrl),
        featured: truthy(r.isFeatured),
      }
    })
    .filter((a) => a.title)
    // Newest first, and anything with an unparseable date sinks rather than
    // floating to the top on a NaN comparison.
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
}

/** The categories present in a set of stories, for the filter row. */
export function categoriesOf(articles: Article[]): string[] {
  return [...new Set(articles.map((a) => a.category).filter(Boolean))].sort()
}

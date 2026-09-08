import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { Loading } from '../components/ui'
import { categoriesOf, loadNews, NEWS_SOURCE, type Article } from '../lib/news'

/**
 * The alliance news page.
 *
 * The stories are VAFeed's — a member runs it, and it is where this community
 * already publishes. Rather than ask anybody to post twice, this reads the
 * same live source VAFeed does, so a story is here as soon as it is there.
 * See lib/news.ts for why that is a shared Google Sheet and not a scraper.
 *
 * What this page adds is our typography and our palette. VAFeed is blue on
 * white in Plus Jakarta Sans; this is the alliance's purple, black and white
 * in our own faces, so a reader arriving from the network map does not feel
 * they have been handed off to somewhere else.
 *
 * The credit at the top is not decoration. These are somebody else's words
 * and somebody else's work, and the page says so before it shows any of it.
 */
export default function News() {
  const [articles, setArticles] = useState<Article[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState<Article | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        setArticles(await loadNews(ac.signal))
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message)
      }
    })()
    return () => ac.abort()
  }, [])

  const categories = useMemo(() => (articles ? categoriesOf(articles) : []), [articles])
  const shown = useMemo(
    () => (articles ?? []).filter((a) => !category || a.category === category),
    [articles, category],
  )

  const featured = shown.find((a) => a.featured)
  const rest = shown.filter((a) => a !== featured)

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">Newsroom</p>
      <h1 className="display mt-3 text-[clamp(34px,5vw,58px)]">Across the network</h1>
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">
        New routes, deliveries, network changes and the occasional farewell — what
        the alliance's carriers have been doing lately.
      </p>
      <p className="mt-4 text-[12px] text-ink-faint">
        Reported by{' '}
        <a
          href={NEWS_SOURCE.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan underline underline-offset-2"
        >
          {NEWS_SOURCE.name} ↗
        </a>
        , the community newsroom run by one of our members. Stories appear here as
        soon as they are published there.
      </p>

      {error && (
        <div className="panel mt-10 p-8">
          <h2 className="display text-xl">The newsroom is not answering</h2>
          <p className="mt-2 max-w-[62ch] text-ink-dim">
            Stories are read live from {NEWS_SOURCE.name} rather than stored here, so
            when that source is unreachable this page has nothing to show rather than
            something out of date. {error}
          </p>
          <a
            href={NEWS_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono mt-5 inline-block text-[11px] uppercase tracking-[0.14em] text-cyan"
          >
            Read it on {NEWS_SOURCE.name} ↗
          </a>
        </div>
      )}

      {!error && articles === null && <Loading label="Fetching the newsroom" />}

      {articles !== null && !error && (
        <>
          {categories.length > 1 && (
            <div className="mt-9 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`mono border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  category === ''
                    ? 'border-[color:var(--color-cyan)] text-cyan'
                    : 'border-edge-soft text-ink-faint hover:text-ink-dim'
                }`}
              >
                All stories
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`mono border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                    category === c
                      ? 'border-[color:var(--color-cyan)] text-cyan'
                      : 'border-edge-soft text-ink-faint hover:text-ink-dim'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="panel mt-8 p-10 text-center text-ink-dim">
              Nothing filed under that heading yet.
            </div>
          ) : (
            <>
              {featured && (
                <button
                  type="button"
                  onClick={() => setOpen(featured)}
                  className="panel lift group mt-8 block w-full overflow-hidden p-0 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="block h-[3px] w-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                  <span className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
                    <span className="block min-w-0">
                      <span className="mono flex flex-wrap items-center gap-2.5 text-[10px] uppercase tracking-[0.14em]">
                        <span className="bg-accent px-2 py-0.5 text-[#0B0713]">Headline</span>
                        {featured.category && (
                          <span className="text-ink-faint">{featured.category}</span>
                        )}
                        <span className="text-ink-faint">{featured.date}</span>
                      </span>
                      <span className="display mt-3 block text-[clamp(22px,3vw,34px)] leading-tight">
                        {featured.title}
                      </span>
                      <span className="mt-3 block max-w-[62ch] text-ink-dim">
                        {featured.summary}
                      </span>
                      <span className="mono mt-4 inline-block text-[11px] uppercase tracking-[0.14em] text-cyan">
                        Read the story →
                      </span>
                    </span>
                    <Thumb article={featured} size={132} />
                  </span>
                </button>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setOpen(a)}
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    className="panel lift rise flex flex-col p-5 text-left"
                  >
                    <span className="mono flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      {a.category && <span className="text-cyan">{a.category}</span>}
                      <span>{a.date}</span>
                    </span>
                    <span className="mt-3 flex items-start gap-3">
                      <Thumb article={a} size={44} />
                      <span className="display min-w-0 flex-1 text-lg leading-snug">
                        {a.title}
                      </span>
                    </span>
                    <span className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-dim">
                      {a.summary}
                    </span>
                    <span className="mono mt-4 border-t border-edge-soft pt-3 text-[10px] uppercase tracking-[0.14em] text-cyan">
                      Read more →
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {open && (
        <Modal wide title={open.title} onClose={() => setOpen(null)} labelledBy="story-title">
          <p className="mono -mt-2 mb-4 flex flex-wrap items-center gap-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {open.category && <span className="text-cyan">{open.category}</span>}
            <span>{open.date}</span>
          </p>

          {open.imageUrl && (
            <img
              src={open.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="mb-5 max-h-64 w-full border border-edge-soft object-cover"
            />
          )}

          <p className="mb-4 text-ink">{open.summary}</p>

          {open.html ? (
            // Sanitised in lib/news.ts: allowlisted tags only, every attribute
            // stripped bar a safe href. The source is a spreadsheet anyone with
            // edit access can change, so this is not optional.
            <div
              className="news-body text-ink-dim"
              dangerouslySetInnerHTML={{ __html: open.html }}
            />
          ) : (
            <p className="text-ink-faint">
              This story has no body text on the source feed.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-edge-soft pt-5">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90"
            >
              Close
            </button>
            <a
              href={NEWS_SOURCE.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
            >
              Read on {NEWS_SOURCE.name} ↗
            </a>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** The story's picture, or its emoji when it has none. */
function Thumb({ article, size }: { article: Article; size: number }) {
  if (article.imageUrl) {
    return (
      <img
        src={article.imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className="shrink-0 border border-edge-soft object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="grid shrink-0 place-items-center border border-edge-soft bg-surface-2"
    >
      {article.emoji}
    </span>
  )
}

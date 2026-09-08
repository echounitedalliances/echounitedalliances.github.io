import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import FareCalendar from '../components/FareCalendar'
import SearchPanel from '../components/SearchPanel'
import { Loading, NotConfigured } from '../components/ui'
import { isConfigured } from '../lib/supabase'
import { useCarrierCount } from '../lib/carriers'
import type { Itinerary } from '../lib/types'
import { duration, num, shortDate, usd } from '../lib/format'
import { itineraryArrival, itineraryDeparture } from '../lib/trips'
import {
  CONNECTION_LIMIT,
  searchDepth,
  decodeJourney,
  encodeJourney,
  journeyIsValid,
  journeyTotal,
  legLabel,
  searchJourney,
} from '../lib/journey'

/**
 * Cards rendered per leg before "show the rest".
 *
 * Nonstops are no longer capped by the search, and a dense pair returns far
 * more than anyone expects: SGN-SIN has 257 nonstop departures on one date,
 * LHR-JFK 539. Every one of them is a real option and all of them are here,
 * sorted and filtered as a whole -- this only governs how many are painted at
 * once, because 539 cards laid out on arrival is a page nobody can scroll.
 */
const PAGE = 60

/**
 * Depth is a tier, and each tier is its own list with its own "show more".
 *
 * Sorting everything together buried the point: on a route with 250 nonstops
 * the connecting options were either invisible or, if a sort brought them up,
 * mixed in with no way to tell how many of each kind existed. Nonstop first,
 * always, then each connecting depth under its own heading.
 */
/**
 * How many of a connecting depth to show before "show more".
 *
 * Matches echo_tier_limit() in 07_connections.sql. If the two drift the page
 * still works -- it just offers a "show more" that returns nothing new, or
 * hides rows it already has.
 */
const TIER_TEASER = 10

const TIERS = [
  { depth: 0, label: 'Nonstop', adjective: 'nonstop' },
  { depth: 1, label: 'One stop', adjective: 'one-stop' },
  { depth: 2, label: 'Two stops', adjective: 'two-stop' },
]

type Sort = 'price' | 'duration' | 'stops' | 'departure' | 'arrival'

const SORTS: { key: Sort; label: string }[] = [
  { key: 'price', label: 'Price' },
  { key: 'duration', label: 'Duration' },
  { key: 'stops', label: 'Stops' },
  { key: 'departure', label: 'Departs' },
  { key: 'arrival', label: 'Arrives' },
]

function LegRow({ leg, last }: { leg: Itinerary['legs'][number]; last: boolean }) {
  const dayShift =
    leg.arrival_date !== leg.departure_date
      ? Math.round(
          (new Date(leg.arrival_date).getTime() - new Date(leg.departure_date).getTime()) /
            86400000,
        )
      : 0
  return (
    <div className={`grid grid-cols-[auto_1fr] gap-3 ${last ? '' : 'pb-3'}`}>
      <div className="mono w-[76px] shrink-0 text-[11px] text-ink-faint">
        {leg.designator}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="mono text-ink">
          {leg.departure_time} {leg.origin}
        </span>
        <span className="text-ink-faint">→</span>
        <span className="mono text-ink">
          {leg.arrival_time} {leg.destination}
          {dayShift > 0 && <sup className="ml-0.5 text-cyan">+{dayShift}</sup>}
        </span>
        <span className="mono text-[11px] text-ink-faint">{duration(leg.duration_minutes)}</span>
        {/* Who is flying it. On an interline itinerary each leg can be a
            different carrier, and the designator prefix alone does not say
            which -- nobody reads "BTKY2" as Fly Empire. */}
        {leg.airline_name && (
          <span className="text-[11px] text-ink-dim">{leg.airline_name}</span>
        )}
        {leg.aircraft_model && (
          <span className="text-[11px] text-ink-faint">{leg.aircraft_model}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Results for a journey of one leg or several.
 *
 * A one-way, a return and a multi-city differ only in how many legs there are,
 * so this renders one picker per leg and books whatever has been chosen. The
 * one-way path is unchanged from when this page only did one-ways: with a
 * single leg, choosing a flight goes straight to the booking page. With more
 * than one there is something still to choose, so choosing selects, and the
 * summary at the bottom carries on once every leg is settled.
 */
export default function SearchResults() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const q = useMemo(() => decodeJourney(params), [params])
  const key = params.toString()

  const [results, setResults] = useState<(Itinerary[] | null)[] | null>(null)
  const [errors, setErrors] = useState<(string | null)[]>([])
  const [picks, setPicks] = useState<(Itinerary | null)[]>([])
  const [sort, setSort] = useState<Sort>('price')
  const [interlineOnly, setInterlineOnly] = useState(false)
  const carrierCount = useCarrierCount()
  /** How many NONSTOP cards each leg is painting; connections page from the server. */
  const [reveal, setReveal] = useState<number[]>([])
  /** "leg:depth" while a show-more is in flight, and once a depth is spent. */
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({})
  const [spent, setSpent] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!isConfigured || !journeyIsValid(q)) return
    const signal = { aborted: false }
    setResults(null)
    setErrors([])
    setPicks(q.legs.map(() => null))
    setReveal(q.legs.map(() => PAGE))
    setLoadingMore({})
    setSpent({})
    void (async () => {
      const { results: r, errors: e } = await searchJourney(q, signal)
      if (signal.aborted) return
      setResults(r)
      setErrors(e)
    })()
    return () => {
      signal.aborted = true
    }
    // The URL is the query. Depending on the decoded object would re-run on
    // every render, because decodeJourney returns a new object each time.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const ordered = useMemo(() => {
    if (!results) return null
    const price = (a: Itinerary, b: Itinerary) => a.total_price_usd - b.total_price_usd
    return results.map((rows) => {
      if (!rows) return null
      let r = rows
      if (interlineOnly) r = r.filter((x) => x.is_interline)
      const c = [...r]
      // Ties break on price throughout: two flights leaving at the same minute
      // are otherwise ordered by whatever the server happened to return.
      if (sort === 'duration') c.sort((a, b) => a.total_minutes - b.total_minutes || price(a, b))
      else if (sort === 'stops') c.sort((a, b) => a.stops - b.stops || price(a, b))
      else if (sort === 'departure')
        c.sort((a, b) => itineraryDeparture(a) - itineraryDeparture(b) || price(a, b))
      else if (sort === 'arrival')
        c.sort((a, b) => itineraryArrival(a) - itineraryArrival(b) || price(a, b))
      else c.sort(price)
      return c
    })
  }, [results, sort, interlineOnly])

  useEffect(() => {
    setReveal((r) => r.map(() => PAGE))
  }, [sort, interlineOnly])

  const appendTo = (legIndex: number, rows: Itinerary[]) => {
    if (rows.length === 0) return
    setResults((prev) => {
      if (!prev) return prev
      return prev.map((cur, n) => (n === legIndex ? [...(cur ?? []), ...rows] : cur))
    })
  }

  /**
   * The two-stop tier, fetched after the first results are on screen.
   *
   * The initial search deliberately does not build two-stop routings when
   * there is anything shallower to offer: it is far and away the most
   * expensive thing this search can do, and on the densest pairs the
   * unbounded version used to exhaust the database's temp space outright.
   * Asking for a few separately, once the page has already painted, keeps
   * that cost off the critical path.
   */
  useEffect(() => {
    if (!results || q.stops < 2) return
    let dead = false
    void (async () => {
      for (let n = 0; n < q.legs.length; n++) {
        const rows = results[n]
        if (!rows || rows.some((x) => x.stops === 2)) continue
        try {
          const more = await searchDepth(q, q.legs[n], 2, 0, TIER_TEASER)
          if (dead) return
          appendTo(n, more)
          if (more.length < TIER_TEASER) setSpent((e) => ({ ...e, [`${n}:2`]: true }))
        } catch {
          // A depth that will not load is not worth an error on a page that
          // already has flights on it.
          if (!dead) setSpent((e) => ({ ...e, [`${n}:2`]: true }))
        }
      }
    })()
    return () => {
      dead = true
    }
    // Once per set of results, not on every append.
  }, [results === null, key]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async (legIndex: number, depth: number) => {
    const tag = `${legIndex}:${depth}`
    if (loadingMore[tag]) return
    setLoadingMore((m) => ({ ...m, [tag]: true }))
    const have = (results?.[legIndex] ?? []).filter((x) => x.stops === depth).length
    try {
      const rows = await searchDepth(q, q.legs[legIndex], depth, have)
      appendTo(legIndex, rows)
      if (rows.length < CONNECTION_LIMIT) setSpent((e) => ({ ...e, [tag]: true }))
    } catch {
      setSpent((e) => ({ ...e, [tag]: true }))
    } finally {
      setLoadingMore((m) => ({ ...m, [tag]: false }))
    }
  }

  const single = q.legs.length === 1
  const total = journeyTotal(picks)

  const hold = (chosen: (Itinerary | null)[]) => {
    sessionStorage.setItem(
      'echo.itinerary',
      JSON.stringify({
        picks: chosen,
        legs: q.legs,
        trip: q.trip,
        cabin: q.cabin,
        pax: q.pax,
      }),
    )
    nav('/book')
  }

  const choose = (i: number, it: Itinerary) => {
    if (single) {
      hold([it])
      return
    }
    setPicks((p) => p.map((x, n) => (n === i ? it : x)))
    // Move them to whatever is still undecided.
    const next = picks.findIndex((x, n) => n !== i && x === null)
    if (next >= 0) {
      document.getElementById(`leg-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /** Re-run the journey with one leg moved to another date. */
  const moveLeg = (i: number, date: string) => {
    const legs = q.legs.map((l, n) => (n === i ? { ...l, date } : l))
    nav(`/search?${encodeJourney({ ...q, legs }).toString()}`)
  }

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-7 sm:px-5 sm:py-10">
      <SearchPanel compact initial={q} />

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="display text-3xl">
            {q.legs[0]?.from} <span className="text-ink-faint">→</span> {q.legs[0]?.to}
            {q.trip === 'return' && (
              <span className="text-ink-faint"> → {q.legs[0]?.from}</span>
            )}
            {q.trip === 'multi' && q.legs.length > 1 && (
              <span className="text-ink-faint"> +{q.legs.length - 1} more</span>
            )}
          </h1>
          <p className="mono mt-1 text-[12px] text-ink-faint">
            {q.legs[0]?.date && shortDate(q.legs[0].date)} ·{' '}
            {q.cabin.replace('_', ' ').toLowerCase()} · {q.pax}{' '}
            {q.pax === 1 ? 'traveller' : 'travellers'}
          </p>
        </div>
        <div className="mono flex flex-wrap gap-1 text-[11px] uppercase tracking-[0.1em]">
          {SORTS.map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              aria-pressed={sort === o.key}
              className={`border px-2.5 py-1 transition-colors ${
                sort === o.key
                  ? 'border-[color:var(--color-accent)] text-ink'
                  : 'border-edge-soft text-ink-faint hover:text-ink-dim'
              }`}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => setInterlineOnly((v) => !v)}
            aria-pressed={interlineOnly}
            className={`border px-2.5 py-1 transition-colors ${
              interlineOnly
                ? 'border-[color:var(--color-cyan)] text-cyan'
                : 'border-edge-soft text-ink-faint hover:text-ink-dim'
            }`}
          >
            Interline only
          </button>
        </div>
      </div>

      {!journeyIsValid(q) && (
        <div className="panel mt-6 p-8 text-center text-ink-dim">
          That search is missing something. Pick an origin, a destination and a date.
        </div>
      )}

      {journeyIsValid(q) && ordered === null && (
        <Loading
          label={
            single
              ? `Searching ${num(carrierCount)} carriers`
              : `Searching ${num(carrierCount)} carriers · ${q.legs.length} flights`
          }
        />
      )}

      {ordered?.map((rows, i) => {
        const leg = q.legs[i]
        const picked = picks[i]
        return (
          <section key={i} id={`leg-${i}`} className="mt-10 scroll-mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge-soft pb-2">
              <h2 className="display text-xl">
                <span className="eyebrow mr-3 text-cyan">{legLabel(q, i)}</span>
                {leg.from} <span className="text-ink-faint">→</span> {leg.to}
              </h2>
              <p className="mono text-[12px] text-ink-faint">
                {shortDate(leg.date)}
                {rows && ` · ${num(rows.length)} itineraries`}
              </p>
            </div>

            {errors[i] && (
              <div className="panel mt-4 border-l-2 border-l-[color:var(--color-warn)] p-4 text-ink-dim">
                This flight could not be searched: {errors[i]}
              </div>
            )}

            {rows && rows.length === 0 && (
              <div className="panel mt-4 p-8 text-center">
                <p className="text-ink">Nothing flies that on {shortDate(leg.date)}.</p>
                <p className="mt-2 text-ink-dim">
                  Try another date below, allow more stops, or check the airports are
                  ones the alliance serves.
                </p>
                <Link to="/network" className="mono mt-4 inline-block text-cyan">
                  Explore the network →
                </Link>
              </div>
            )}

            {rows && TIERS.filter((t) => t.depth <= q.stops).map((tier) => {
              const tierRows = rows.filter((x) => x.stops === tier.depth)
              // A depth with nothing in it and nothing left to ask for is not
              // an empty section worth drawing.
              if (tierRows.length === 0 && (tier.depth === 0 || spent[`${i}:${tier.depth}`])) {
                return null
              }
              // Nonstops are all here already and page in the browser;
              // connections page from the server.
              const shownN = tier.depth === 0 ? (reveal[i] ?? PAGE) : tierRows.length
              const tag = `${i}:${tier.depth}`
              return (
              <div key={tier.depth} className="mt-6">
                <div className="flex items-baseline gap-3">
                  <p className="eyebrow text-cyan">{tier.label}</p>
                  <p className="mono text-[11px] text-ink-faint">
                    {tierRows.length === 0
                      ? 'none found yet'
                      : `${num(tierRows.length)}${tier.depth > 0 && !spent[tag] ? '+' : ''}`}
                  </p>
                </div>

                <div className="mt-3 flex flex-col gap-3">
              {tierRows.slice(0, shownN).map((it, n) => {
                const chosen = picked === it
                return (
                  <article
                    key={`${it.legs.map((l) => l.flight_id).join('-')}-${n}`}
                    className={`panel lift rise grid gap-5 p-5 md:grid-cols-[1fr_auto] ${
                      chosen ? 'border-[color:var(--color-accent)]' : ''
                    }`}
                    style={{ animationDelay: `${Math.min(n, 12) * 30}ms` }}
                  >
                    <div className="min-w-0">
                      <div className="mono mb-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
                        <span className="text-ink-dim">
                          {it.stops === 0
                            ? 'Nonstop'
                            : `${it.stops} stop${it.stops > 1 ? 's' : ''}`}
                        </span>
                        {it.via.length > 0 && (
                          <span className="text-ink-faint">via {it.via.join(' · ')}</span>
                        )}
                        {it.is_interline && (
                          <span className="border border-[color:var(--color-cyan)] px-2 py-0.5 text-cyan">
                            Interline
                          </span>
                        )}
                        {Array.from(new Set(it.divisions)).map((d) => (
                          <Link
                            key={d}
                            to={`/d/${d}`}
                            className="text-ink-faint hover:text-ink-dim"
                          >
                            {d}
                          </Link>
                        ))}
                      </div>
                      <div className="flex flex-col gap-1">
                        {it.legs.map((leg2, li) => (
                          <LegRow
                            key={leg2.flight_id + li}
                            leg={leg2}
                            last={li === it.legs.length - 1}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-edge-soft pt-4 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
                      <div className="md:text-right">
                        <div className="mono text-2xl text-ink">{usd(it.total_price_usd)}</div>
                        <div className="mono text-[11px] text-ink-faint">
                          {q.pax > 1
                            ? `per traveller · ${duration(it.total_minutes)}`
                            : duration(it.total_minutes)}
                        </div>
                      </div>
                      <button onClick={() => choose(i, it)} className="btn btn-book">
                        {single ? 'Select' : chosen ? 'Chosen ✓' : 'Choose'}
                      </button>
                    </div>
                  </article>
                )
              })}
                </div>

                {tier.depth === 0 && tierRows.length > shownN && (
                  <button
                    type="button"
                    onClick={() => setReveal((r) => r.map((v, n) => (n === i ? tierRows.length : v)))}
                    className="mono mt-3 w-full border border-edge py-3 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:border-accent hover:text-ink"
                  >
                    Show the other {num(tierRows.length - shownN)} nonstop · {num(tierRows.length)} in all
                  </button>
                )}

                {tier.depth > 0 && !spent[tag] && (
                  <button
                    type="button"
                    disabled={loadingMore[tag]}
                    onClick={() => void loadMore(i, tier.depth)}
                    className="mono mt-3 w-full border border-edge py-3 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
                  >
                    {loadingMore[tag]
                      ? 'Searching…'
                      : tierRows.length === 0
                        ? `Look for ${tier.adjective} routings`
                        : `Show more ${tier.adjective} flights`}
                  </button>
                )}
              </div>
              )
            })}

            <FareCalendar
              from={leg.from}
              to={leg.to}
              date={leg.date}
              cabin={q.cabin}
              pax={q.pax}
              onPick={(d) => moveLeg(i, d)}
            />
          </section>
        )
      })}

      {/* The running total, once there is more than one thing to decide. */}
      {!single && ordered && (
        <div className="sticky bottom-0 z-30 mt-10 border-t border-edge bg-[color:var(--color-ground)] py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.12em]">
              {q.legs.map((l, i) => (
                <span key={i} className={picks[i] ? 'text-ink' : 'text-ink-faint'}>
                  {legLabel(q, i)}: {picks[i] ? usd(picks[i]!.total_price_usd) : 'not chosen'}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4">
              {total != null && (
                <div className="text-right">
                  <div className="mono text-2xl text-ink">{usd(total)}</div>
                  <div className="mono text-[11px] text-ink-faint">
                    {q.pax > 1 ? 'per traveller, all flights' : 'all flights'}
                  </div>
                </div>
              )}
              <button
                onClick={() => hold(picks)}
                disabled={total == null}
                className="btn btn-book disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

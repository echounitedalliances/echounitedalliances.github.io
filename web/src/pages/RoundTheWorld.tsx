import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AirportField from '../components/AirportField'
import { NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import { CABINS } from '../lib/types'
import { dateInDays, num, usd } from '../lib/format'
import { encodeJourney, MAX_LEGS } from '../lib/journey'

type Hop = {
  seq: number
  from: string
  from_city: string | null
  to: string
  to_city: string | null
  km: number
  nonstop: boolean
  cheapest_usd: number | null
  carriers: string[]
  carrier_count: number
}

type Quote = {
  ok: boolean
  problems: string[]
  direction: 'EAST' | 'WEST' | null
  total_km: number
  longitude_turn: number
  countries: number
  band_code: string | null
  band_name: string | null
  fare_usd: number | null
  segments_usd: number | null
  hops: Hop[]
}

/**
 * The round-the-world planner.
 *
 * A round-the-world fare is not a search result, it is a product with rules,
 * so this is a planner rather than a search box: you name the cities, and the
 * alliance says whether that is a circumnavigation and what it costs.
 *
 * The fare comes from the mileage band, not from adding the flights up — that
 * is what a real one does, and it is the whole point of buying it. So the
 * planner shows both numbers together and lets you judge: the banded fare, and
 * what the same hops would cost bought separately. On a short three-stop loop
 * the segments can win, and the page says so rather than hiding it.
 *
 * Picking actual flights is the multi-city search, which already books any
 * number of legs under one PNR. The planner hands off to it.
 */
export default function RoundTheWorld() {
  const nav = useNavigate()
  const [stops, setStops] = useState<string[]>(['LHR', 'DXB', 'SIN', 'SYD', 'LAX'])
  const [cabin, setCabin] = useState('ECONOMY')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filled = stops.filter((s) => s.length === 3)

  const run = useCallback(async () => {
    if (!isConfigured || filled.length < 3) {
      setQuote(null)
      return
    }
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('rtw_quote', {
      p_stops: filled,
      p_cabin: cabin,
    })
    setBusy(false)
    if (e) {
      setError(e.message)
      setQuote(null)
      return
    }
    setQuote(((data as Quote[]) ?? [])[0] ?? null)
  }, [filled.join(','), cabin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void run()
  }, [run])

  const setStop = (i: number, v: string) =>
    setStops((s) => s.map((x, n) => (n === i ? v.toUpperCase() : x)))
  const addStop = () => setStops((s) => (s.length >= 7 ? s : [...s, '']))
  const dropStop = (i: number) =>
    setStops((s) => (s.length <= 3 ? s : s.filter((_, n) => n !== i)))

  /**
   * Hand the loop to the multi-city search, one hop per leg, spaced a week
   * apart as a starting point. Multi-city tops out at five flights, so a
   * longer tour goes over in its first five and the rest is booked after.
   */
  const bookIt = () => {
    if (!quote?.ok) return
    const legs = quote.hops.slice(0, MAX_LEGS).map((h, i) => ({
      from: h.from,
      to: h.to,
      date: dateInDays(14 + i * 7),
    }))
    nav(
      `/search?${encodeJourney({
        trip: 'multi',
        legs,
        cabin,
        pax: 1,
        stops: 2,
      }).toString()}`,
    )
  }

  if (!isConfigured) return <NotConfigured />

  const turn = quote ? Math.abs(quote.longitude_turn) : 0

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">Round the world</p>
      <h1 className="display mt-3 text-[clamp(34px,5vw,58px)]">One fare, one direction</h1>
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">
        Keep going the same way until you are home again, on any of the alliance's
        602 carriers. The fare is set by how far round you go — not by how many
        times you stop.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="panel p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <p className="eyebrow text-ink-faint">Your stops, in order</p>
              <div className="w-44">
                <label htmlFor="rtw-cabin" className="eyebrow mb-1.5 block text-ink-faint">
                  Cabin
                </label>
                <select
                  id="rtw-cabin"
                  value={cabin}
                  onChange={(e) => setCabin(e.target.value)}
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                >
                  {CABINS.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {stops.map((s, i) => (
                <div key={i} className="flex items-end gap-3">
                  <span className="mono w-6 shrink-0 pb-3 text-[11px] text-ink-faint">
                    {i + 1}
                  </span>
                  <AirportField
                    id={`rtw-${i}`}
                    label={i === 0 ? 'Start and finish' : `Stop ${i + 1}`}
                    value={s}
                    onChange={(v) => setStop(i, v)}
                    placeholder="City or airport"
                  />
                  <button
                    type="button"
                    onClick={() => dropStop(i)}
                    disabled={stops.length <= 3}
                    aria-label={`Remove stop ${i + 1}`}
                    className="mono h-[42px] shrink-0 border border-edge-soft px-3 text-[11px] text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
              {stops.length < 7 && (
                <button
                  type="button"
                  onClick={addStop}
                  className="mono self-start text-[11px] uppercase tracking-[0.12em] text-cyan"
                >
                  + Add a stop
                </button>
              )}
            </div>
            <p className="mt-4 text-[12px] text-ink-faint">
              The tour closes itself: after your last stop you fly home to{' '}
              {filled[0] || 'your first city'}.
            </p>
          </div>

          {error && (
            <div className="panel mt-4 border-l-2 border-l-[color:var(--color-warn)] p-4 text-ink-dim">
              The quote could not be worked out: {error}
            </div>
          )}

          {quote && quote.problems.length > 0 && (
            <div className="panel mt-4 border-l-2 border-l-[color:var(--color-warn)] p-5">
              <p className="eyebrow mb-2 text-warn">Not a round-the-world fare yet</p>
              <ul className="flex flex-col gap-2">
                {quote.problems.map((p) => (
                  <li key={p} className="text-sm leading-relaxed text-ink-dim">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quote && quote.hops.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow mb-3 text-ink-faint">The route</p>
              <div className="flex flex-col gap-2">
                {quote.hops.map((h) => (
                  <div
                    key={h.seq}
                    className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
                  >
                    <span className="mono w-6 shrink-0 text-[11px] text-ink-faint">
                      {h.seq}
                    </span>
                    <span className="mono min-w-0 flex-1 text-sm text-ink">
                      {h.from} <span className="text-ink-faint">→</span> {h.to}
                      <span className="ml-2 text-[12px] text-ink-faint">
                        {h.to_city}
                      </span>
                    </span>
                    <span className="mono text-[12px] text-ink-faint">
                      {num(h.km)} km
                    </span>
                    {h.nonstop ? (
                      <span className="mono text-[11px] text-good">
                        {h.carrier_count} {h.carrier_count === 1 ? 'carrier' : 'carriers'}
                        {h.cheapest_usd != null && ` · from ${usd(h.cheapest_usd)}`}
                      </span>
                    ) : (
                      <span className="mono text-[11px] text-warn">connection needed</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-ink-faint">
                A hop marked “connection needed” has no nonstop between those two
                airports — it is still part of the fare, you will just change planes on
                the way. Carrier counts are the members flying that hop nonstop today.
              </p>
            </div>
          )}
        </div>

        {/* the quote */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-5">
            {filled.length < 3 ? (
              <p className="text-ink-dim">
                Name at least three cities and the alliance will price the loop.
              </p>
            ) : (
              <>
                <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  {busy ? 'Working it out…' : quote?.band_name ? `${quote.band_name} band` : 'Quote'}
                </div>

                {quote?.fare_usd != null && (
                  <div className="mt-1">
                    <span className="mono text-4xl text-ink">{usd(quote.fare_usd)}</span>
                    <span className="mono ml-2 text-[12px] text-ink-faint">per traveller</span>
                  </div>
                )}

                <dl className="mt-5 flex flex-col gap-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Distance</dt>
                    <dd className="mono text-ink">{num(quote?.total_km ?? 0)} km</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Direction</dt>
                    <dd className="mono text-ink">
                      {quote?.direction === 'EAST'
                        ? 'Eastbound'
                        : quote?.direction === 'WEST'
                          ? 'Westbound'
                          : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Around the globe</dt>
                    <dd className={`mono ${turn >= 320 && turn <= 400 ? 'text-good' : 'text-warn'}`}>
                      {turn}° of 360°
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Countries</dt>
                    <dd className="mono text-ink">{quote?.countries ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Stops</dt>
                    <dd className="mono text-ink">{quote?.hops.length ?? 0} flights</dd>
                  </div>
                </dl>

                {/* The honest comparison. */}
                {quote?.fare_usd != null && (
                  <div className="mt-5 border-t border-edge pt-4">
                    {quote.segments_usd == null ? (
                      <p className="text-[12px] leading-relaxed text-ink-faint">
                        At least one hop has no nonstop, so there is no like-for-like
                        price to compare this against.
                      </p>
                    ) : quote.segments_usd > quote.fare_usd ? (
                      <p className="text-[13px] leading-relaxed text-ink-dim">
                        Bought as separate flights these hops come to{' '}
                        <span className="mono text-ink">{usd(quote.segments_usd)}</span>. The
                        round-the-world fare saves{' '}
                        <span className="mono text-good">
                          {usd(quote.segments_usd - quote.fare_usd)}
                        </span>
                        .
                      </p>
                    ) : (
                      <p className="text-[13px] leading-relaxed text-ink-dim">
                        Bought as separate flights these hops come to{' '}
                        <span className="mono text-ink">{usd(quote.segments_usd)}</span>, which
                        is <span className="mono text-warn">less</span> than the round-the-world
                        fare. Add stops, or fly it as a multi-city instead.
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={bookIt}
                  disabled={!quote?.ok}
                  className="btn btn-book mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Choose flights
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                  Takes you to the multi-city search with the first{' '}
                  {Math.min(quote?.hops.length ?? 0, MAX_LEGS)} hops filled in, a week
                  apart. Change the dates there.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

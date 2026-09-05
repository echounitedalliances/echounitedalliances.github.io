import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import SearchPanel from '../components/SearchPanel'
import { Loading, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { Itinerary } from '../lib/types'
import { duration, num, shortDate, usd } from '../lib/format'

type Sort = 'price' | 'duration' | 'stops'

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
        {leg.aircraft_model && (
          <span className="text-[11px] text-ink-faint">{leg.aircraft_model}</span>
        )}
      </div>
    </div>
  )
}

export default function SearchResults() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const from = (params.get('from') ?? '').toUpperCase()
  const to = (params.get('to') ?? '').toUpperCase()
  const date = params.get('date') ?? ''
  const cabin = params.get('cabin') ?? 'ECONOMY'
  const pax = Number(params.get('pax') ?? 1)
  const stops = Number(params.get('stops') ?? 2)

  const [rows, setRows] = useState<Itinerary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('price')
  const [interlineOnly, setInterlineOnly] = useState(false)

  useEffect(() => {
    if (!isConfigured || !from || !to || !date) return
    let cancelled = false
    setRows(null)
    setError(null)
    void (async () => {
      const { data, error } = await supabase.rpc('search_itineraries', {
        p_origin: from,
        p_destination: to,
        p_travel_date: date,
        p_cabin: cabin,
        p_seats: pax,
        p_max_stops: stops,
        p_limit: 60,
      })
      if (cancelled) return
      if (error) setError(error.message)
      setRows((data as Itinerary[]) ?? [])
    })()
    return () => { cancelled = true }
  }, [from, to, date, cabin, pax, stops])

  const shown = useMemo(() => {
    if (!rows) return null
    let r = rows
    if (interlineOnly) r = r.filter((x) => x.is_interline)
    const c = [...r]
    if (sort === 'duration') c.sort((a, b) => a.total_minutes - b.total_minutes)
    else if (sort === 'stops') c.sort((a, b) => a.stops - b.stops || a.total_price_usd - b.total_price_usd)
    else c.sort((a, b) => a.total_price_usd - b.total_price_usd)
    return c
  }, [rows, sort, interlineOnly])

  const select = (it: Itinerary) => {
    sessionStorage.setItem('echo.itinerary', JSON.stringify({ it, cabin, pax }))
    nav('/book')
  }

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10">
      <SearchPanel compact />

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="display text-3xl">
            {from} <span className="text-ink-faint">→</span> {to}
          </h1>
          <p className="mono mt-1 text-[12px] text-ink-faint">
            {date && shortDate(date)} · {cabin.replace('_', ' ').toLowerCase()} ·{' '}
            {pax} {pax === 1 ? 'traveller' : 'travellers'}
          </p>
        </div>
        <div className="mono flex flex-wrap gap-1 text-[11px] uppercase tracking-[0.1em]">
          {(['price', 'duration', 'stops'] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`border px-2.5 py-1 transition-colors ${
                sort === s ? 'border-[color:var(--color-accent)] text-ink' : 'border-edge-soft text-ink-faint hover:text-ink-dim'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setInterlineOnly((v) => !v)}
            className={`border px-2.5 py-1 transition-colors ${
              interlineOnly ? 'border-[color:var(--color-cyan)] text-cyan' : 'border-edge-soft text-ink-faint hover:text-ink-dim'
            }`}
          >
            Interline only
          </button>
        </div>
      </div>

      {error && (
        <div className="panel mt-6 border-l-2 border-l-[color:var(--color-warn)] p-4 text-ink-dim">
          The search could not run: {error}
        </div>
      )}

      {shown === null ? (
        <Loading label="Searching 590 carriers" />
      ) : shown.length === 0 ? (
        <div className="panel mt-6 p-10 text-center">
          <p className="text-lg text-ink">Nothing flies that on {shortDate(date)}.</p>
          <p className="mt-2 text-ink-dim">
            Try another date, allow more stops, or check the airports are ones the
            alliance serves.
          </p>
          <Link to="/network" className="mono mt-5 inline-block text-cyan">
            Explore the network →
          </Link>
        </div>
      ) : (
        <>
          <p className="mono mt-6 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            {num(shown.length)} itineraries
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {shown.map((it, i) => (
              <article
                key={`${it.legs.map((l) => l.flight_id).join('-')}-${i}`}
                className="panel lift rise grid gap-5 p-5 md:grid-cols-[1fr_auto]"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div className="min-w-0">
                  <div className="mono mb-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
                    <span className="text-ink-dim">
                      {it.stops === 0 ? 'Nonstop' : `${it.stops} stop${it.stops > 1 ? 's' : ''}`}
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
                      <Link key={d} to={`/d/${d}`} className="text-ink-faint hover:text-ink-dim">
                        {d}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    {it.legs.map((leg, li) => (
                      <LegRow key={leg.flight_id + li} leg={leg} last={li === it.legs.length - 1} />
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-edge-soft pt-4 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <div className="md:text-right">
                    <div className="mono text-2xl text-ink">{usd(it.total_price_usd)}</div>
                    <div className="mono text-[11px] text-ink-faint">
                      {pax > 1 ? `per traveller · ${duration(it.total_minutes)}` : duration(it.total_minutes)}
                    </div>
                  </div>
                  <button
                    onClick={() => select(it)}
                    className="btn btn-book"
                  >
                    Select
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

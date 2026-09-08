import { useEffect, useState } from 'react'
import { isConfigured, supabase } from '../lib/supabase'
import { usd } from '../lib/format'

type Day = { travel_date: string; cheapest_usd: number; nonstop: boolean }

/**
 * Cheaper days either side of the one being looked at.
 *
 * It loads AFTER the results and never blocks them. fare_calendar() answers in
 * well under a second for most pairs but takes a few for the very busiest, and
 * a price strip is not worth making anyone wait for — so the results render,
 * and this appears underneath when it is ready.
 *
 * It quotes the same numbers the search does, deliberately: it considers the
 * same connecting airports search_itineraries considers, capped the same way.
 * A calendar that advertised a fare the search then could not find would send
 * people to a day that has nothing on it.
 *
 * It stops at one connection, so a day whose only routing needs two shows no
 * price rather than a wrong one. Those days are drawn, just empty.
 */
export default function FareCalendar({
  from,
  to,
  date,
  cabin,
  pax,
  onPick,
  /** Days either side of `date`. Seven days total by default. */
  span = 3,
}: {
  from: string
  to: string
  date: string
  cabin: string
  pax: number
  onPick: (date: string) => void
  span?: number
}) {
  const [days, setDays] = useState<Day[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isConfigured || !from || !to || !date) return
    let dead = false
    setDays(null)
    setFailed(false)

    // Start `span` days earlier, but never in the past.
    const start = new Date(`${date}T00:00:00`)
    start.setDate(start.getDate() - span)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const from_ = start < today ? today : start

    void (async () => {
      const { data, error } = await supabase.rpc('fare_calendar', {
        p_origin: from,
        p_destination: to,
        p_from: from_.toISOString().slice(0, 10),
        p_days: span * 2 + 1,
        p_cabin: cabin,
        p_seats: pax,
      })
      if (dead) return
      if (error) {
        setFailed(true)
        return
      }
      setDays((data as Day[]) ?? [])
    })()

    return () => {
      dead = true
    }
  }, [from, to, date, cabin, pax, span])

  if (failed || (days && days.length === 0)) return null

  // The window we asked for, so an empty day still gets a column.
  const start = new Date(`${date}T00:00:00`)
  start.setDate(start.getDate() - span)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const first = start < today ? today : start
  const window = Array.from({ length: span * 2 + 1 }, (_, i) => {
    const d = new Date(first)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const byDate = new Map((days ?? []).map((d) => [d.travel_date, d]))
  const prices = (days ?? []).map((d) => d.cheapest_usd)
  const best = prices.length ? Math.min(...prices) : null

  return (
    <section className="mt-6" aria-label="Fares on nearby days">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="eyebrow text-ink-faint">Nearby days</p>
        {days === null && (
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            Checking…
          </p>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {window.map((d) => {
          const row = byDate.get(d)
          const isToday = d === date
          const isBest = row != null && best != null && row.cheapest_usd === best
          const day = new Date(`${d}T00:00:00`)
          return (
            <button
              key={d}
              type="button"
              disabled={isToday || !row}
              onClick={() => onPick(d)}
              aria-current={isToday ? 'date' : undefined}
              className={`flex min-w-[86px] flex-1 flex-col items-center gap-1 border px-2 py-2.5 transition-colors ${
                isToday
                  ? 'border-[color:var(--color-accent)] bg-surface-2'
                  : row
                    ? 'border-edge-soft hover:border-accent'
                    : 'border-edge-soft opacity-45'
              }`}
            >
              <span className="mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                {day.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
                {day.getDate()}
              </span>
              {days === null ? (
                <span className="mono text-[13px] text-ink-faint">·</span>
              ) : row ? (
                <span
                  className={`mono text-[13px] ${isBest ? 'text-good' : 'text-ink'}`}
                >
                  {usd(row.cheapest_usd)}
                </span>
              ) : (
                <span className="mono text-[11px] text-ink-faint">—</span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Cheapest fare per day over nonstop and one-connection journeys. A day with no
        price has nothing under two stops — search it to be sure.
      </p>
    </section>
  )
}

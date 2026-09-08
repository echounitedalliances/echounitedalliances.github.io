import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AirportField from './AirportField'
import { CABINS } from '../lib/types'
import { dateInDays } from '../lib/format'
import { encodeJourney, MAX_LEGS, type LegQuery, type TripType } from '../lib/journey'

/**
 * The alliance search: one way, return, or up to five flights in a row.
 *
 * All three build the same JourneyQuery and hand it to the same results page,
 * because the difference between them is how many legs there are and nothing
 * else. Switching tabs keeps what you have already typed — changing your mind
 * about a return should not cost you the cities.
 */

const TABS: { key: TripType; label: string }[] = [
  { key: 'oneway', label: 'One way' },
  { key: 'return', label: 'Return' },
  { key: 'multi', label: 'Multi-city' },
]

export default function SearchPanel({
  compact = false,
  initial,
}: {
  compact?: boolean
  /** Prefill, when the results page re-renders the panel above its own results. */
  initial?: { trip: TripType; legs: LegQuery[]; cabin: string; pax: number; stops: number }
}) {
  const nav = useNavigate()
  const [trip, setTrip] = useState<TripType>(initial?.trip ?? 'oneway')
  const [from, setFrom] = useState(initial?.legs[0]?.from ?? '')
  const [to, setTo] = useState(initial?.legs[0]?.to ?? '')
  const [date, setDate] = useState(initial?.legs[0]?.date ?? dateInDays(14))
  const [ret, setRet] = useState(
    initial?.trip === 'return' ? (initial.legs[1]?.date ?? dateInDays(21)) : dateInDays(21),
  )
  const [cabin, setCabin] = useState(initial?.cabin ?? 'ECONOMY')
  const [pax, setPax] = useState(initial?.pax ?? 1)
  const [stops, setStops] = useState(initial?.stops ?? 2)

  /** Only used by the multi-city tab; seeded from the simple fields. */
  const [legs, setLegs] = useState<LegQuery[]>(
    initial?.trip === 'multi' && initial.legs.length >= 2
      ? initial.legs
      : [
          { from: initial?.legs[0]?.from ?? '', to: initial?.legs[0]?.to ?? '', date: dateInDays(14) },
          { from: initial?.legs[0]?.to ?? '', to: '', date: dateInDays(21) },
        ],
  )

  const setLeg = (i: number, patch: Partial<LegQuery>) =>
    setLegs((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)))

  const addLeg = () =>
    setLegs((ls) =>
      ls.length >= MAX_LEGS
        ? ls
        : [...ls, { from: ls[ls.length - 1].to, to: '', date: ls[ls.length - 1].date }],
    )

  const dropLeg = (i: number) => setLegs((ls) => (ls.length <= 2 ? ls : ls.filter((_, n) => n !== i)))

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const q =
      trip === 'multi'
        ? { trip, legs, cabin, pax, stops }
        : {
            trip,
            legs:
              trip === 'return'
                ? [{ from, to, date }, { from: to, to: from, date: ret }]
                : [{ from, to, date }],
            cabin,
            pax,
            stops,
          }
    if (q.legs.some((l) => l.from.length !== 3 || l.to.length !== 3 || !l.date)) return
    nav(`/search?${encodeJourney(q).toString()}`)
  }

  const field =
    'mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent'

  return (
    <form onSubmit={go} className={`panel ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTrip(t.key)}
            aria-pressed={trip === t.key}
            className={`mono border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              trip === t.key
                ? 'border-[color:var(--color-accent)] text-ink'
                : 'border-edge-soft text-ink-faint hover:text-ink-dim'
            }`}
          >
            {t.label}
          </button>
        ))}
        <Link
          to="/rtw"
          className="mono ml-auto text-[11px] uppercase tracking-[0.12em] text-cyan"
        >
          Round the world →
        </Link>
      </div>

      {trip === 'multi' ? (
        <div className="flex flex-col gap-3">
          {legs.map((l, i) => (
            <div key={i} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <AirportField
                id={`mc-from-${i}`}
                label="From"
                value={l.from}
                onChange={(v) => setLeg(i, { from: v })}
                placeholder="City or airport"
              />
              <AirportField
                id={`mc-to-${i}`}
                label="To"
                value={l.to}
                onChange={(v) => setLeg(i, { to: v })}
                placeholder="City or airport"
              />
              <div className="sm:w-44">
                <label htmlFor={`mc-date-${i}`} className="eyebrow mb-1.5 block text-ink-faint">
                  Departing
                </label>
                <input
                  id={`mc-date-${i}`}
                  type="date"
                  value={l.date}
                  min={i === 0 ? dateInDays(0) : legs[i - 1].date}
                  onChange={(e) => setLeg(i, { date: e.target.value })}
                  className={field}
                />
              </div>
              <button
                type="button"
                onClick={() => dropLeg(i)}
                disabled={legs.length <= 2}
                aria-label={`Remove flight ${i + 1}`}
                className="mono h-[42px] shrink-0 border border-edge-soft px-3 text-[11px] text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
          {legs.length < MAX_LEGS && (
            <button
              type="button"
              onClick={addLeg}
              className="mono self-start text-[11px] uppercase tracking-[0.12em] text-cyan"
            >
              + Add another flight
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <AirportField id="sp-from" label="From" value={from} onChange={setFrom} placeholder="City or airport" />
          <AirportField id="sp-to" label="To" value={to} onChange={setTo} placeholder="City or airport" />
          <div className="sm:w-44">
            <label className="eyebrow mb-1.5 block text-ink-faint">Departing</label>
            <input
              type="date"
              value={date}
              min={dateInDays(0)}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>
          {trip === 'return' && (
            <div className="sm:w-44">
              <label className="eyebrow mb-1.5 block text-ink-faint">Returning</label>
              <input
                type="date"
                value={ret}
                min={date || dateInDays(0)}
                onChange={(e) => setRet(e.target.value)}
                className={field}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-52">
          <label className="eyebrow mb-1.5 block text-ink-faint">Cabin</label>
          <select value={cabin} onChange={(e) => setCabin(e.target.value)} className={`${field} font-sans`}>
            {CABINS.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-32">
          <label className="eyebrow mb-1.5 block text-ink-faint">Travellers</label>
          <select value={pax} onChange={(e) => setPax(Number(e.target.value))} className={`${field} font-sans`}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-40">
          <label className="eyebrow mb-1.5 block text-ink-faint">Stops</label>
          <select value={stops} onChange={(e) => setStops(Number(e.target.value))} className={`${field} font-sans`}>
            <option value={0}>Nonstop only</option>
            <option value={1}>Up to 1 stop</option>
            <option value={2}>Up to 2 stops</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary sm:ml-auto sm:h-[42px]">
          Search trips
        </button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AirportField from './AirportField'
import { CABINS } from '../lib/types'
import { dateInDays } from '../lib/format'

/**
 * The alliance search. Origin, destination, date, cabin, passengers, stops —
 * everything search_itineraries() takes, and nothing it does not.
 */
export default function SearchPanel({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState(dateInDays(14))
  const [cabin, setCabin] = useState('ECONOMY')
  const [pax, setPax] = useState(1)
  const [stops, setStops] = useState(2)

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    if (from.length !== 3 || to.length !== 3) return
    const p = new URLSearchParams({
      from, to, date, cabin,
      pax: String(pax),
      stops: String(stops),
    })
    nav(`/search?${p.toString()}`)
  }

  return (
    <form onSubmit={go} className={`panel ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
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
            className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-52">
          <label className="eyebrow mb-1.5 block text-ink-faint">Cabin</label>
          <select
            value={cabin}
            onChange={(e) => setCabin(e.target.value)}
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          >
            {CABINS.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-32">
          <label className="eyebrow mb-1.5 block text-ink-faint">Travellers</label>
          <select
            value={pax}
            onChange={(e) => setPax(Number(e.target.value))}
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-40">
          <label className="eyebrow mb-1.5 block text-ink-faint">Stops</label>
          <select
            value={stops}
            onChange={(e) => setStops(Number(e.target.value))}
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          >
            <option value={0}>Nonstop only</option>
            <option value={1}>Up to 1 stop</option>
            <option value={2}>Up to 2 stops</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={from.length !== 3 || to.length !== 3}
          className="btn btn-book ml-auto w-full sm:w-auto"
        >
          Search the alliance
        </button>
      </div>
    </form>
  )
}

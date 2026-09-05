import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AirportRow } from '../lib/types'
import { CABINS } from '../lib/types'
import { dateInDays } from '../lib/format'

/** Airport field with typeahead against search_airports(). */
function AirportField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [q, setQ] = useState(value)
  const [hits, setHits] = useState<AirportRow[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => setQ(value), [value])

  useEffect(() => {
    if (q.length < 2 || q === value) {
      setHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airports', { p_query: q, p_limit: 7 })
      if (!cancelled) setHits((data as AirportRow[]) ?? [])
    }, 160)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, value])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const pick = (a: AirportRow) => {
    onChange(a.iata_code)
    setQ(a.iata_code)
    setOpen(false)
  }

  return (
    <div className="relative flex-1" ref={box}>
      <label className="eyebrow mb-1.5 block text-ink-faint">{label}</label>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value.toUpperCase())
          setOpen(true)
          if (e.target.value.length === 3) onChange(e.target.value.toUpperCase())
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        maxLength={40}
        className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-lg tracking-[0.06em] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />
      {open && hits.length > 0 && (
        <ul className="panel absolute z-30 mt-1 max-h-72 w-full overflow-auto py-1">
          {hits.map((a) => (
            <li key={a.iata_code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="mono w-9 shrink-0 text-cyan">{a.iata_code}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {a.city_name ?? a.airport_name ?? '—'}
                </span>
                <span className="mono shrink-0 text-[11px] text-ink-faint">
                  {a.country_code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

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
        <AirportField label="From" value={from} onChange={setFrom} placeholder="City or code" />
        <AirportField label="To" value={to} onChange={setTo} placeholder="City or code" />
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

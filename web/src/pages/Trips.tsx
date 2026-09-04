import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { BookingDetails } from '../lib/types'
import { shortDate, usd } from '../lib/format'

/**
 * Manage booking. No account needed: find_booking() is security definer and
 * checks the PNR against a passenger surname, which is how every airline does
 * it. Signing in is for keeping a list, not for reaching one booking.
 */
export default function Trips() {
  const [params] = useSearchParams()
  const [pnr, setPnr] = useState(params.get('pnr') ?? '')
  const [surname, setSurname] = useState('')
  const [booking, setBooking] = useState<BookingDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const p = params.get('pnr')
    if (p) setPnr(p)
  }, [params])

  const find = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    setBooking(null)
    const { data, error } = await supabase.rpc('find_booking', {
      p_pnr: pnr.trim().toUpperCase(),
      p_family_name: surname.trim(),
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    const rows = (data as BookingDetails[]) ?? []
    if (rows.length === 0) {
      setMsg('No booking matches that reference and surname.')
      return
    }
    setBooking(rows[0])
  }

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[860px] px-5 py-14">
      <p className="eyebrow text-cyan">Manage booking</p>
      <h1 className="display mt-3 text-[clamp(36px,5vw,56px)]">Find your trip</h1>
      <p className="mt-4 max-w-[58ch] text-ink-dim">
        Enter the six-character reference from your confirmation and the family
        name of anyone travelling on it.
      </p>

      <form
        onSubmit={find}
        className="panel mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <label className="block flex-1">
          <span className="eyebrow mb-1.5 block text-ink-faint">Booking reference</span>
          <input
            value={pnr}
            onChange={(e) => setPnr(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ABC123"
            className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-lg tracking-[0.2em] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
        </label>
        <label className="block flex-1">
          <span className="eyebrow mb-1.5 block text-ink-faint">Family name</span>
          <input
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={pnr.length !== 6 || !surname.trim() || busy}
          className="mono px-6 py-3 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] disabled:opacity-35"
          style={{ background: 'var(--color-cyan)' }}
        >
          {busy ? 'Looking…' : 'Retrieve'}
        </button>
      </form>

      {msg && <p className="panel mt-4 p-4 text-ink-dim">{msg}</p>}

      {booking && (
        <article className="panel mt-6 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Reference
              </div>
              <div className="mono text-3xl tracking-[0.24em] text-cyan">{booking.pnr}</div>
            </div>
            <div className="text-right">
              <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                {booking.status.toLowerCase()}
              </div>
              <div className="mono text-2xl text-ink">
                {usd(Number(booking.total_amount_usd))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Travellers
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(booking.passengers ?? []).map((p) => (
                <li key={p.seq} className="border border-edge-soft px-3 py-1 text-sm text-ink">
                  {p.given_name} {p.family_name}
                  <span className="mono ml-2 text-[10px] uppercase text-ink-faint">{p.type}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Flights
            </h2>
            <div className="mt-2 flex flex-col">
              {(booking.segments ?? []).map((s) => (
                <div key={s.seq} className="border-t border-edge-soft py-3 first:border-0">
                  <div className="mono flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-cyan">{s.designator}</span>
                    <span className="text-ink">
                      {s.departure_time} {s.origin} &rarr; {s.arrival_time} {s.destination}
                      {s.arrival_days_after > 0 && (
                        <sup className="ml-0.5 text-cyan">+{s.arrival_days_after}</sup>
                      )}
                    </span>
                    <span className="text-[12px] text-ink-faint">{shortDate(s.travel_date)}</span>
                    <span className="ml-auto text-[12px] text-ink-faint">
                      {s.cabin.replace('_', ' ').toLowerCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {booking.divisions && booking.divisions.length > 1 && (
            <p className="mono mt-5 text-[11px] text-ink-faint">
              This itinerary crosses {booking.divisions.length} divisions:{' '}
              {booking.divisions.join(', ')}
            </p>
          )}

          <Link
            to="/"
            className="mono mt-6 inline-block text-[11px] uppercase tracking-[0.14em] text-cyan"
          >
            &larr; Back to Echo
          </Link>
        </article>
      )}
    </div>
  )
}

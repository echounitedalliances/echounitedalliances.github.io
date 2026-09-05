import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { Itinerary } from '../lib/types'
import { duration, shortDate, usd } from '../lib/format'

type Held = { it: Itinerary; cabin: string; pax: number }
type Passenger = { given_name: string; family_name: string; passenger_type: string }

/**
 * Passenger details, a mock checkout, and a real PNR.
 *
 * The whole reservation goes through create_booking(), one security definer
 * RPC. A guest has no privileges on the booking tables and should not get any,
 * and the three writes it makes have to succeed together in order anyway.
 */
export default function Book() {
  const nav = useNavigate()
  const [held, setHeld] = useState<Held | null>(null)
  const [pax, setPax] = useState<Passenger[]>([])
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pnr, setPnr] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('echo.itinerary')
    if (!raw) return
    const parsed = JSON.parse(raw) as Held
    setHeld(parsed)
    setPax(
      Array.from({ length: parsed.pax }, () => ({
        given_name: '',
        family_name: '',
        passenger_type: 'ADULT',
      })),
    )
  }, [])

  if (!isConfigured) return <NotConfigured />

  if (!held) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-24 text-center">
        <h1 className="display text-4xl">No itinerary selected</h1>
        <p className="mt-3 text-ink-dim">Search the alliance and pick a flight first.</p>
        <Link to="/" className="mono mt-6 inline-block text-cyan">← Start a search</Link>
      </div>
    )
  }

  const { it, cabin } = held
  const total = it.total_price_usd * pax.length
  const complete =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    pax.every((p) => p.given_name.trim() && p.family_name.trim())

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      // One RPC, not three inserts: a guest has no privileges on the booking
      // tables, and the three writes have to succeed together anyway.
      const { data, error } = await supabase.rpc('create_booking', {
        p_contact_email: email.trim(),
        p_contact_name: contact.trim() || `${pax[0].given_name} ${pax[0].family_name}`,
        p_cabin: cabin,
        p_passengers: pax.map((p) => ({
          given_name: p.given_name.trim(),
          family_name: p.family_name.trim(),
          passenger_type: p.passenger_type,
        })),
        p_segments: it.legs.map((leg) => ({
          flight_id: leg.flight_id,
          aircraft_id: leg.aircraft_id,
          direction: leg.direction,
          travel_date: leg.departure_date,
        })),
      })
      if (error) throw new Error(error.message)
      const rows = (data as { pnr: string }[]) ?? []
      if (rows.length === 0) throw new Error('The booking was not created.')
      sessionStorage.removeItem('echo.itinerary')
      setPnr(rows[0].pnr)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The booking could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (pnr) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-20 text-center">
        <p className="eyebrow text-cyan">Confirmed</p>
        <h1 className="display mt-4 text-[clamp(38px,6vw,64px)]">You are booked</h1>
        <p className="mt-4 text-ink-dim">
          Keep this reference. It retrieves the booking with any passenger surname.
        </p>
        <div
          className="mono mx-auto mt-8 inline-block px-8 py-5 text-4xl tracking-[0.3em] text-[#0B0713]"
          style={{ background: 'var(--color-cyan)' }}
        >
          {pnr}
        </div>
        <div className="mt-10 flex justify-center gap-3">
          <button
            onClick={() => nav(`/trips?pnr=${pnr}`)}
            className="btn btn-primary"
          >
            View the booking
          </button>
          <Link
            to="/"
            className="btn btn-ghost"
          >
            Back to Echo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-12 lg:grid-cols-[1fr_360px]">
      <div>
        <p className="eyebrow text-cyan">Step 2 of 2</p>
        <h1 className="display mt-3 text-4xl">Who is travelling?</h1>

        <div className="mt-7 flex flex-col gap-4">
          {pax.map((p, i) => (
            <div key={i} className="panel p-4">
              <div className="mono mb-3 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Traveller {i + 1}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px]">
                <label className="block">
                  <span className="eyebrow mb-1.5 block text-ink-faint">Given name</span>
                  <input
                    value={p.given_name}
                    onChange={(e) => {
                      const c = [...pax]; c[i] = { ...p, given_name: e.target.value }; setPax(c)
                    }}
                    className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1.5 block text-ink-faint">Family name</span>
                  <input
                    value={p.family_name}
                    onChange={(e) => {
                      const c = [...pax]; c[i] = { ...p, family_name: e.target.value }; setPax(c)
                    }}
                    className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow mb-1.5 block text-ink-faint">Type</span>
                  <select
                    value={p.passenger_type}
                    onChange={(e) => {
                      const c = [...pax]; c[i] = { ...p, passenger_type: e.target.value }; setPax(c)
                    }}
                    className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                  >
                    <option value="ADULT">Adult</option>
                    <option value="CHILD">Child</option>
                    <option value="INFANT">Infant</option>
                  </select>
                </label>
              </div>
            </div>
          ))}

          <div className="panel p-4">
            <div className="mono mb-3 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Contact
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">Name on the booking</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="panel mt-4 border-l-2 border-l-[color:var(--color-warn)] p-4 text-ink-dim">
            {error}
          </div>
        )}

        <div className="panel mt-4 border-l-2 border-l-[color:var(--color-accent)] p-4">
          <p className="text-sm text-ink-dim">
            <strong className="font-medium text-ink">This is a mock checkout.</strong> No
            payment is taken and no card details are collected — the booking is written
            straight to the alliance database and seats come out of inventory.
          </p>
        </div>

        <button
          onClick={confirm}
          disabled={!complete || busy}
          className="btn btn-book mt-5 w-full py-4"
        >
          {busy ? 'Confirming…' : `Confirm booking · ${usd(total)}`}
        </button>
      </div>

      {/* itinerary summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="panel p-5">
          <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Your itinerary
          </div>
          <div className="mono mt-1 text-lg text-ink">
            {it.legs[0].origin} → {it.legs[it.legs.length - 1].destination}
          </div>
          <div className="mono mt-0.5 text-[12px] text-ink-faint">
            {shortDate(it.legs[0].departure_date)} ·{' '}
            {it.stops === 0 ? 'Nonstop' : `${it.stops} stop${it.stops > 1 ? 's' : ''}`} ·{' '}
            {duration(it.total_minutes)}
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {it.legs.map((leg, i) => (
              <div key={leg.flight_id + i} className="border-t border-edge-soft pt-3 first:border-0 first:pt-0">
                <div className="mono flex justify-between text-[11px] text-ink-faint">
                  <span>{leg.designator}</span>
                  <span>{leg.division}</span>
                </div>
                <div className="mono mt-1 text-sm text-ink">
                  {leg.departure_time} {leg.origin} → {leg.arrival_time} {leg.destination}
                </div>
                {leg.aircraft_model && (
                  <div className="text-[11px] text-ink-faint">{leg.aircraft_model}</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-edge pt-4">
            <div className="flex justify-between text-sm text-ink-dim">
              <span>{cabin.replace('_', ' ').toLowerCase()} × {pax.length}</span>
              <span className="mono">{usd(it.total_price_usd)} each</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-ink">Total</span>
              <span className="mono text-2xl text-ink">{usd(total)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

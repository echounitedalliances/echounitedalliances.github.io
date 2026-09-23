import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loading } from './ui'
import { supabase } from '../lib/supabase'
import type { BookingDetails } from '../lib/types'
import { shortDate, usd } from '../lib/format'
import { TRIP_SORTS, bookedAt, tripArrival, tripDeparture } from '../lib/trips'
import type { TripSort } from '../lib/trips'

/**
 * The bookings kept on a Resonance account, and what can be done with them.
 *
 * The list is v_booking_details, whose row level security returns each
 * account its own bookings and nothing else. Everything that changes one goes
 * through a function that reads the account from the session
 * (35_account_bookings.sql), so no id typed or tampered with here can reach
 * anybody else's:
 *
 *   add a booking    one made as a guest, by its reference and a surname
 *   cancel           the account stands in for the surname
 *   remove           off the list; the booking itself stands and can be
 *                    found, or added back, with its reference
 *
 * Cancelling and removing each ask first. A cancellation cannot be undone.
 */

type Pending = { id: string; action: 'cancel' | 'remove' }

const cabinLabel = (c: string) => c.replace(/_/g, ' ').toLowerCase()

export default function AccountTrips() {
  const [trips, setTrips] = useState<BookingDetails[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sort, setSort] = useState<TripSort>('departure')
  const [newestFirst, setNewestFirst] = useState(false)

  const [open, setOpen] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null)

  const [adding, setAdding] = useState(false)
  const [ref, setRef] = useState('')
  const [surname, setSurname] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('v_booking_details')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setLoadError(error.message)
      setTrips((data as BookingDetails[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Derived, not stored: re-sorting a list you already have should not mean
  // asking the server for it again.
  const ordered = useMemo(() => {
    if (!trips) return null
    const key =
      sort === 'departure' ? tripDeparture : sort === 'arrival' ? tripArrival : bookedAt
    return [...trips].sort((a, b) => (newestFirst ? key(b) - key(a) : key(a) - key(b)))
  }, [trips, sort, newestFirst])

  const replace = (row: BookingDetails) =>
    setTrips((list) => {
      const rest = (list ?? []).filter((t) => t.booking_id !== row.booking_id)
      return [row, ...rest]
    })

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const act = async ({ id, action }: Pending) => {
    setBusy(true)
    setCardError(null)
    try {
      if (action === 'cancel') {
        const { data, error } = await supabase.rpc('cancel_my_booking', { p_booking_id: id })
        if (error) throw new Error(error.message)
        const row = ((data as BookingDetails[]) ?? [])[0]
        if (row) replace(row)
      } else {
        const { error } = await supabase.rpc('remove_booking_from_account', { p_booking_id: id })
        if (error) throw new Error(error.message)
        setTrips((list) => (list ?? []).filter((t) => t.booking_id !== id))
      }
      setPending(null)
    } catch (e) {
      setCardError({ id, message: e instanceof Error ? e.message : 'That did not work.' })
    } finally {
      setBusy(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setAddError(null)
    setAdded(null)
    try {
      const { data, error } = await supabase.rpc('add_booking_to_account', {
        p_pnr: ref.trim().toUpperCase(),
        p_family_name: surname.trim(),
      })
      if (error) throw new Error(error.message)
      const row = ((data as BookingDetails[]) ?? [])[0]
      if (!row) throw new Error('The booking was not returned.')
      replace(row)
      setAdded(row.pnr)
      setRef('')
      setSurname('')
      setAdding(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'The booking could not be added.')
    } finally {
      setBusy(false)
    }
  }

  const addForm = (
    <form onSubmit={add} className="panel mt-4 p-5">
      <p className="text-sm text-ink-dim">
        Booked as a guest, or on another device? Add it with the six-character reference
        and the family name of anyone travelling on it.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="eyebrow mb-1.5 block text-ink-faint">Booking reference</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value.toUpperCase())}
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
          disabled={ref.trim().length !== 6 || !surname.trim() || busy}
          className="btn btn-primary"
        >
          {busy ? 'Adding…' : 'Add to my trips'}
        </button>
      </div>
      {addError && (
        <p className="mt-3 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {addError}
        </p>
      )}
    </form>
  )

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="display text-2xl">Your trips</h2>
        <div className="flex flex-wrap items-center gap-2">
          {trips && trips.length > 1 && (
            <>
              <span className="mono mr-1 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                Sort by
              </span>
              {TRIP_SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSort(o.key)}
                  aria-pressed={sort === o.key}
                  className={`chip ${sort === o.key ? 'chip-on' : ''}`}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNewestFirst((v) => !v)}
                aria-label={newestFirst ? 'Showing latest first' : 'Showing earliest first'}
                className="chip"
                title={newestFirst ? 'Latest first' : 'Earliest first'}
              >
                {newestFirst ? 'Latest ↓' : 'Earliest ↑'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v)
              setAddError(null)
            }}
            aria-expanded={adding}
            className="btn btn-ghost"
          >
            {adding ? 'Close' : 'Add a booking'}
          </button>
        </div>
      </div>

      {adding && addForm}

      {added && (
        <p className="mono mt-4 text-[11px] uppercase tracking-[0.12em] text-good">
          {added} is on your account now
        </p>
      )}

      {loadError && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {loadError}
        </p>
      )}

      {trips === null ? (
        <Loading />
      ) : trips.length === 0 ? (
        <div className="panel mt-4 p-8 text-center">
          <p className="text-ink-dim">Nothing booked on this account yet.</p>
          <p className="mt-2 text-sm text-ink-faint">
            Book while signed in to keep a trip here, or add one you made as a guest.
          </p>
          <Link to="/" className="mono mt-4 inline-block text-cyan">
            Search the alliance →
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {(ordered ?? []).map((t) => {
            const segs = t.segments ?? []
            const pax = t.passengers ?? []
            const cancelled = t.status.toUpperCase() === 'CANCELLED'
            const isOpen = open.has(t.booking_id)
            const asking = pending?.id === t.booking_id ? pending.action : null
            const err = cardError?.id === t.booking_id ? cardError.message : null
            return (
              <article key={t.booking_id} className="panel p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="mono text-2xl tracking-[0.2em] text-cyan">{t.pnr}</div>
                  <div
                    className={`mono text-[11px] uppercase tracking-[0.12em] ${
                      cancelled ? 'text-danger' : 'text-ink-faint'
                    }`}
                  >
                    {t.status.toLowerCase()} · {usd(Number(t.total_amount_usd))} ·{' '}
                    {pax.length} {pax.length === 1 ? 'traveller' : 'travellers'}
                  </div>
                </div>

                {segs.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-faint">
                    {cancelled
                      ? 'Cancelled. The flights have been released back to the airlines.'
                      : 'No flights on this booking.'}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-1">
                    {segs.map((s) => (
                      <div key={s.seq} className="mono text-sm text-ink-dim">
                        <span className="text-cyan">{s.designator}</span> {s.departure_time}{' '}
                        {s.origin} &rarr; {s.arrival_time} {s.destination}
                        {s.arrival_days_after > 0 && (
                          <sup className="ml-0.5 text-cyan">+{s.arrival_days_after}</sup>
                        )}
                        <span className="ml-3 text-ink-faint">{shortDate(s.travel_date)}</span>
                        {isOpen && (
                          <span className="ml-3 text-ink-faint">
                            {cabinLabel(s.cabin)} · {usd(s.price_usd)} each
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && (
                  <div className="mt-4 grid gap-4 border-t border-edge-soft pt-4 sm:grid-cols-2">
                    <div>
                      <p className="eyebrow mb-1.5 text-ink-faint">Travellers</p>
                      <ul className="flex flex-col gap-1 text-sm text-ink">
                        {pax.map((p) => (
                          <li key={p.seq}>
                            {p.given_name} {p.family_name}
                            <span className="mono ml-2 text-[10px] uppercase text-ink-faint">
                              {p.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="eyebrow mb-1.5 text-ink-faint">Booking</p>
                      <p className="text-sm text-ink-dim">
                        Booked {shortDate(t.created_at.slice(0, 10))}
                        <br />
                        Contact {t.contact_name ? `${t.contact_name}, ` : ''}
                        {t.contact_email}
                      </p>
                      {t.divisions && t.divisions.length > 1 && (
                        <p className="mono mt-2 text-[11px] text-ink-faint">
                          Crosses {t.divisions.length} divisions: {t.divisions.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {asking === 'cancel' ? (
                  <div className="panel mt-4 border-danger/45 p-4">
                    <p className="text-sm text-ink">
                      Cancel <span className="mono text-cyan">{t.pnr}</span> for {pax.length}{' '}
                      {pax.length === 1 ? 'traveller' : 'travellers'}?
                    </p>
                    <p className="mt-1.5 text-[13px] text-ink-faint">
                      This cannot be undone. The seats go back on sale immediately.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void act({ id: t.booking_id, action: 'cancel' })}
                        disabled={busy}
                        className="btn btn-danger"
                      >
                        {busy ? 'Cancelling…' : 'Yes, cancel this booking'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending(null)}
                        disabled={busy}
                        className="btn btn-ghost"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : asking === 'remove' ? (
                  <div className="panel mt-4 p-4">
                    <p className="text-sm text-ink">
                      Take <span className="mono text-cyan">{t.pnr}</span> off your account?
                    </p>
                    <p className="mt-1.5 text-[13px] text-ink-faint">
                      {cancelled
                        ? 'It only leaves this list.'
                        : 'The booking is not cancelled: it still stands, and its reference and a traveller’s surname still find it — or add it back here.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void act({ id: t.booking_id, action: 'remove' })}
                        disabled={busy}
                        className="btn btn-primary"
                      >
                        {busy ? 'Removing…' : 'Remove from my account'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending(null)}
                        disabled={busy}
                        className="btn btn-ghost"
                      >
                        Keep it here
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge-soft pt-4">
                    <button
                      type="button"
                      onClick={() => toggle(t.booking_id)}
                      aria-expanded={isOpen}
                      className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
                    >
                      {isOpen ? 'Hide details' : 'Details'}
                    </button>
                    {!cancelled && (
                      <button
                        type="button"
                        onClick={() => {
                          setPending({ id: t.booking_id, action: 'cancel' })
                          setCardError(null)
                        }}
                        className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-danger"
                      >
                        Cancel booking
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPending({ id: t.booking_id, action: 'remove' })
                        setCardError(null)
                      }}
                      className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink"
                    >
                      Remove from account
                    </button>
                  </div>
                )}

                {err && (
                  <p className="mt-3 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
                    {err}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NotConfigured } from '../components/ui'
import Modal from '../components/Modal'
import { SignIn } from '../components/ResonanceAuth'
import { isConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { BookingDetails, Itinerary } from '../lib/types'
import { duration, shortDate, usd } from '../lib/format'

/**
 * What the results page handed over. `picks` is one chosen itinerary per leg
 * of the journey: one for a one-way, two for a return, up to five for a
 * multi-city. They are booked together, under one PNR.
 */
type Held = {
  picks: Itinerary[]
  legs: { from: string; to: string; date: string }[]
  trip: string
  cabin: string
  pax: number
}

/** The shape this page used to be handed, before journeys had more than one leg. */
type LegacyHeld = { it: Itinerary; cabin: string; pax: number }
type Passenger = { given_name: string; family_name: string; passenger_type: string }

/**
 * Passenger details, a mock checkout, and a real PNR.
 *
 * The whole reservation goes through create_booking(), one security definer
 * RPC. A guest has no privileges on the booking tables and should not get any,
 * and the three writes it makes have to succeed together in order anyway.
 *
 * Signed in, the traveller chooses whether the trip is kept on their Resonance
 * account, where "Your trips" lists and manages it. The account is always the
 * one signed in: create_booking reads it from the session and only takes a
 * yes or no from here. Signed out, they can sign in without leaving the page
 * -- nothing typed is lost -- or add the booking to an account afterwards.
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
  const { user, resonant } = useAuth()
  const [saveToAccount, setSaveToAccount] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  /** Whether the finished booking is kept on the account. */
  const [onAccount, setOnAccount] = useState(false)
  const [savingAfter, setSavingAfter] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Signing in from the dialog is what closes it: the session arriving is the
  // only signal that it worked.
  useEffect(() => {
    if (resonant) setSigningIn(false)
  }, [resonant])

  // The account's address is the likeliest contact; typing over it still wins.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email || '')
  }, [user])

  useEffect(() => {
    const raw = sessionStorage.getItem('echo.itinerary')
    if (!raw) return
    const stored = JSON.parse(raw) as Held | LegacyHeld
    // Somebody mid-booking when this deployed has the old single-itinerary
    // shape sitting in their tab. Carry it forward rather than losing it.
    const parsed: Held =
      'picks' in stored
        ? stored
        : {
            picks: [stored.it],
            legs: [
              {
                from: stored.it.legs[0].origin,
                to: stored.it.legs[stored.it.legs.length - 1].destination,
                date: stored.it.legs[0].departure_date,
              },
            ],
            trip: 'oneway',
            cabin: stored.cabin,
            pax: stored.pax,
          }
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

  const { picks, cabin } = held
  /** Every flight of every leg, in the order they will be flown. */
  const allLegs = picks.flatMap((p) => p.legs)
  const perTraveller = picks.reduce((sum, p) => sum + p.total_price_usd, 0)
  const total = perTraveller * pax.length
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
        // One PNR for the whole journey: create_booking already takes a
        // segment list, so a return or a multi-city is the same call with
        // more of them.
        p_segments: allLegs.map((leg) => ({
          flight_id: leg.flight_id,
          aircraft_id: leg.aircraft_id,
          direction: leg.direction,
          travel_date: leg.departure_date,
        })),
        p_save_to_account: Boolean(resonant) && saveToAccount,
      })
      if (error) throw new Error(error.message)
      const rows = (data as BookingDetails[]) ?? []
      if (rows.length === 0) throw new Error('The booking was not created.')
      sessionStorage.removeItem('echo.itinerary')
      setOnAccount(Boolean(rows[0].resonant_id))
      setPnr(rows[0].pnr)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The booking could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  /** Keep the finished booking on the account, if it was booked without. */
  const saveAfter = async () => {
    if (!pnr) return
    setSavingAfter(true)
    setSaveError(null)
    const { error } = await supabase.rpc('add_booking_to_account', {
      p_pnr: pnr,
      p_family_name: pax[0]?.family_name.trim() ?? '',
    })
    setSavingAfter(false)
    if (error) setSaveError(error.message)
    else setOnAccount(true)
  }

  const signInDialog = signingIn && (
    <Modal title="Sign in to Resonance" onClose={() => setSigningIn(false)}>
      <p className="mb-2 text-sm text-ink-dim">
        {pnr
          ? 'Once you are signed in, you can keep this booking on your account.'
          : 'Everything you have typed stays as it is. Once you are signed in, you can keep this trip on your account.'}
      </p>
      <SignIn />
    </Modal>
  )

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
        <div className="mx-auto mt-8 max-w-[480px] text-sm text-ink-dim">
          {onAccount ? (
            <p>
              Kept on your Resonance account: it is under{' '}
              <Link to="/resonance" className="text-cyan underline underline-offset-2">
                Your trips
              </Link>
              , where you can see it in full or cancel it.
            </p>
          ) : resonant ? (
            <div className="flex flex-col items-center gap-2">
              <p>Not kept on your Resonance account.</p>
              <button
                type="button"
                onClick={() => void saveAfter()}
                disabled={savingAfter}
                className="btn btn-ghost"
              >
                {savingAfter ? 'Saving…' : 'Keep it on my account'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p>Have a Resonance account? Keep this booking with your other trips.</p>
              <button type="button" onClick={() => setSigningIn(true)} className="btn btn-ghost">
                Sign in
              </button>
            </div>
          )}
          {saveError && (
            <p className="mt-2 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-left text-danger">
              {saveError}
            </p>
          )}
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
        {signInDialog}
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-8 sm:px-5 sm:py-12 lg:grid-cols-[1fr_360px]">
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

          <div className="panel p-4">
            <div className="mono mb-3 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Resonance
            </div>
            {resonant ? (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={saveToAccount}
                  onChange={(e) => setSaveToAccount(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[color:var(--color-accent)]"
                />
                <span>
                  <span className="block text-sm text-ink">Keep this trip on my Resonance account</span>
                  <span className="mt-0.5 block text-[12px] text-ink-faint">
                    Signed in as {user?.email}. It will be under Your trips, where you can see
                    it in full, cancel it, or take it off the account later.
                  </span>
                </span>
              </label>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-[46ch] text-sm text-ink-dim">
                  Have a Resonance account? Sign in to keep this trip with your others.
                  Nothing you have typed is lost, and you can also add it later with its
                  reference.
                </p>
                <button type="button" onClick={() => setSigningIn(true)} className="btn btn-ghost">
                  Sign in
                </button>
              </div>
            )}
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
        {signInDialog}
      </div>

      {/* itinerary summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="panel p-5">
          <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Your itinerary
          </div>
          <div className="mono mt-1 text-lg text-ink">
            {allLegs[0].origin} → {allLegs[allLegs.length - 1].destination}
          </div>
          <div className="mono mt-0.5 text-[12px] text-ink-faint">
            {shortDate(allLegs[0].departure_date)}
            {picks.length > 1 && ` · ${picks.length} flights`}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {picks.map((p, pi) => (
              <div key={pi}>
                {picks.length > 1 && (
                  <div className="mono mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan">
                    {held.trip === 'return'
                      ? pi === 0
                        ? 'Outbound'
                        : 'Return'
                      : `Flight ${pi + 1}`}
                    <span className="ml-2 text-ink-faint">
                      {p.stops === 0 ? 'Nonstop' : `${p.stops} stop${p.stops > 1 ? 's' : ''}`} ·{' '}
                      {duration(p.total_minutes)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  {p.legs.map((leg, i) => (
                    <div
                      key={leg.flight_id + i}
                      className="border-t border-edge-soft pt-3 first:border-0 first:pt-0"
                    >
                      <div className="mono flex justify-between text-[11px] text-ink-faint">
                        <span>{leg.designator}</span>
                        <span>{leg.division}</span>
                      </div>
                      <div className="mono mt-1 text-sm text-ink">
                        {leg.departure_time} {leg.origin} → {leg.arrival_time} {leg.destination}
                      </div>
                      {leg.airline_name && (
                        <div className="text-[11px] text-ink-dim">{leg.airline_name}</div>
                      )}
                      {leg.aircraft_model && (
                        <div className="text-[11px] text-ink-faint">{leg.aircraft_model}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-edge pt-4">
            <div className="flex justify-between text-sm text-ink-dim">
              <span className="capitalize">{cabin.replace(/_/g, ' ').toLowerCase()} × {pax.length}</span>
              <span className="mono">{usd(perTraveller)} each</span>
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

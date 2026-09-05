import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loading, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { AirportRow, BookingDetails, Division } from '../lib/types'
import { shortDate, usd } from '../lib/format'

/**
 * Resonance: sign in, keep a profile, and see every trip on the account.
 *
 * There is no password anywhere in this flow. Supabase sends a one-time link;
 * the site only ever holds the session that comes back.
 */
export default function Resonance() {
  const { ready, user, resonant, signIn, signOut, refreshResonant } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [trips, setTrips] = useState<BookingDetails[] | null>(null)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [airportQuery, setAirportQuery] = useState('')
  const [airportHits, setAirportHits] = useState<AirportRow[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isConfigured || !resonant) return
    void (async () => {
      const [t, d] = await Promise.all([
        supabase
          .from('v_booking_details')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('v_division_summary').select('*').order('sort_order'),
      ])
      setTrips((t.data as BookingDetails[]) ?? [])
      setDivisions((d.data as Division[]) ?? [])
    })()
  }, [resonant])

  useEffect(() => {
    if (airportQuery.length < 2) {
      setAirportHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airports', {
        p_query: airportQuery,
        p_limit: 6,
      })
      if (!cancelled) setAirportHits((data as AirportRow[]) ?? [])
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [airportQuery])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email)
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  const saveProfile = async (patch: Record<string, string | null>) => {
    if (!resonant) return
    setSaved(false)
    const { error } = await supabase
      .from('resonants')
      .update(patch)
      .eq('resonant_id', resonant.resonant_id)
    if (!error) {
      await refreshResonant()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError(error.message)
    }
  }

  if (!isConfigured) return <NotConfigured />
  if (!ready) return <Loading label="Checking your session" />

  // ---------------------------------------------------------------- signed out
  if (!user) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16">
        <p className="eyebrow text-cyan">Resonance</p>
        <h1 className="display mt-3 text-[clamp(36px,5vw,56px)]">
          The alliance, remembered
        </h1>
        <p className="mt-4 max-w-[58ch] text-lg text-ink-dim">
          A Resonance account keeps your trips together across all 590 carriers,
          and remembers where you fly from. It is optional — you can search and
          book without one.
        </p>

        {sent ? (
          <div className="panel mt-8 border-l-2 border-l-[color:var(--color-cyan)] p-6">
            <h2 className="display text-2xl">Check your email</h2>
            <p className="mt-2 text-ink-dim">
              A sign-in link is on its way to{' '}
              <span className="mono text-ink">{email}</span>. It opens this page
              signed in. No password, nothing to remember.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mono mt-4 text-[11px] uppercase tracking-[0.14em] text-cyan"
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="panel mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="eyebrow mb-1.5 block text-ink-faint">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
              className="mono px-6 py-3 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] disabled:opacity-35"
              style={{ background: 'var(--color-cyan)' }}
            >
              {busy ? 'Sending…' : 'Send a sign-in link'}
            </button>
          </form>
        )}

        {error && <p className="panel mt-4 p-4 text-ink-dim">{error}</p>}

        <p className="mono mt-6 text-[11px] text-ink-faint">
          Already booked without an account? Retrieve it with your reference on{' '}
          <Link to="/trips" className="text-cyan">
            manage booking
          </Link>
          .
        </p>
      </div>
    )
  }

  // ----------------------------------------------------------------- signed in
  return (
    <div className="mx-auto max-w-[980px] px-5 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-cyan">Resonance</p>
          <h1 className="display mt-3 text-[clamp(30px,4vw,46px)]">
            {resonant?.display_name || user.email}
          </h1>
          <p className="mono mt-1 text-[12px] text-ink-faint">
            {user.email}
            {resonant?.is_admin && (
              <span className="ml-3 border border-edge px-2 py-0.5 uppercase tracking-[0.12em] text-warn">
                Admin
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void signOut()}
          className="mono border border-edge px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-dim hover:border-accent hover:text-ink"
        >
          Sign out
        </button>
      </div>

      {!resonant ? (
        <Loading label="Setting up your membership" />
      ) : (
        <>
          <section className="panel mt-8 p-5">
            <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Your details
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">Display name</span>
                <input
                  defaultValue={resonant.display_name ?? ''}
                  onBlur={(e) => void saveProfile({ display_name: e.target.value || null })}
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">Home division</span>
                <select
                  defaultValue={resonant.home_division ?? ''}
                  onChange={(e) => void saveProfile({ home_division: e.target.value || null })}
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                >
                  <option value="">No preference</option>
                  {divisions.map((d) => (
                    <option key={d.division_code} value={d.division_code}>
                      {d.division_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative block">
                <span className="eyebrow mb-1.5 block text-ink-faint">
                  Home airport{' '}
                  {resonant.home_airport && (
                    <span className="mono text-cyan">{resonant.home_airport}</span>
                  )}
                </span>
                <input
                  value={airportQuery}
                  onChange={(e) => setAirportQuery(e.target.value)}
                  placeholder="City or code"
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
                {airportHits.length > 0 && (
                  <ul className="panel absolute z-30 mt-1 max-h-64 w-full overflow-auto py-1">
                    {airportHits.map((a) => (
                      <li key={a.iata_code}>
                        <button
                          type="button"
                          onClick={() => {
                            void saveProfile({ home_airport: a.iata_code })
                            setAirportQuery('')
                            setAirportHits([])
                          }}
                          className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="mono w-9 text-cyan">{a.iata_code}</span>
                          <span className="truncate text-sm text-ink">
                            {a.city_name ?? a.airport_name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
            </div>
            {saved && (
              <p className="mono mt-3 text-[11px] uppercase tracking-[0.12em] text-good">
                Saved
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="display text-2xl">Your trips</h2>
            {trips === null ? (
              <Loading />
            ) : trips.length === 0 ? (
              <div className="panel mt-4 p-8 text-center">
                <p className="text-ink-dim">
                  Nothing booked on this account yet.
                </p>
                <Link to="/" className="mono mt-4 inline-block text-cyan">
                  Search the alliance →
                </Link>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {trips.map((t) => (
                  <article key={t.booking_id} className="panel p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="mono text-2xl tracking-[0.2em] text-cyan">{t.pnr}</div>
                      <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                        {t.status.toLowerCase()} · {usd(Number(t.total_amount_usd))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-1">
                      {(t.segments ?? []).map((s) => (
                        <div key={s.seq} className="mono text-sm text-ink-dim">
                          <span className="text-cyan">{s.designator}</span>{' '}
                          {s.departure_time} {s.origin} &rarr; {s.arrival_time}{' '}
                          {s.destination}
                          <span className="ml-3 text-ink-faint">
                            {shortDate(s.travel_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

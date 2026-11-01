import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loading, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PasswordCard, SignIn } from '../components/ResonanceAuth'
import AdminApplyModal from '../components/AdminApplyModal'
import AdminApplications from '../components/AdminApplications'
import AdminMemberSites from '../components/AdminMemberSites'
import type { AirportRow, Airline, Division } from '../lib/types'
import { useSneakPeek } from '../lib/sneakPeek'
import { useT } from '../lib/i18n'

/**
 * Resonance: sign in, keep a profile, and see every trip on the account.
 *
 * Sign-in is a password; the one-time email link that used to sit beside it
 * is gone. Email survives only as password reset, which is the sole way back
 * into an account nobody can sign into. The form lives in
 * components/ResonanceAuth; the site only ever holds the session.
 */
export default function Resonance() {
  const { ready, user, resonant, recovering, endRecovery, signOut, refreshResonant } = useAuth()
  const { unlocked: claimAirlineUnlocked } = useSneakPeek()
  const [error, setError] = useState<string | null>(null)
  const tr = useT()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [airportQuery, setAirportQuery] = useState('')
  const [airportHits, setAirportHits] = useState<AirportRow[]>([])
  const [airlineQuery, setAirlineQuery] = useState('')
  const [airlineHits, setAirlineHits] = useState<Airline[]>([])
  const [claimedAirline, setClaimedAirline] = useState<Airline | null>(null)
  const [saved, setSaved] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)

  useEffect(() => {
    if (!isConfigured || !resonant) return
    void (async () => {
      const d = await supabase.from('v_division_summary').select('*').order('sort_order')
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

  useEffect(() => {
    if (airlineQuery.length < 2) {
      setAirlineHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airlines', {
        p_query: airlineQuery,
        p_division: null,
        p_country: null,
        p_limit: 6,
        p_offset: 0,
      })
      if (!cancelled) setAirlineHits((data as Airline[]) ?? [])
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [airlineQuery])

  // Resolves the uid on the Resonant row into something displayable -- the
  // row itself only ever carries the id, not the airline's name.
  useEffect(() => {
    if (!resonant?.claimed_airline_uid) {
      setClaimedAirline(null)
      return
    }
    let cancelled = false
    void supabase
      .from('mv_airline_directory')
      .select('uid, airline_name, division_name, carrier_code')
      .eq('uid', resonant.claimed_airline_uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setClaimedAirline((data as Airline | null) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [resonant?.claimed_airline_uid])

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
      setError(tr(error.message))
    }
  }

  if (!isConfigured) return <NotConfigured />
  if (!ready) return <Loading label="Checking your session" />

  // ---------------------------------------------------------------- signed out
  if (!user) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-9 sm:px-5 sm:py-16">
        <p className="eyebrow text-cyan">Resonance</p>
        <h1 className="display mt-3 text-[clamp(36px,5vw,56px)]">
          {tr('The alliance, remembered')}
        </h1>
        <p className="mt-4 max-w-[58ch] text-lg text-ink-dim">
          {tr('A Resonance account remembers your home division and airport, and is how the alliance’s admins sign in to look after the site. It is optional: everything on the site is open without one.')}
        </p>

        <SignIn />
      </div>
    )
  }

  // ----------------------------------------------------------------- signed in
  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-5 sm:py-14">
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
                {tr('Admin')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void signOut()}
          className="btn btn-ghost"
        >
          {tr('Sign out')}
        </button>
      </div>

      {recovering && (
        <div className="mt-8">
          <PasswordCard highlight />
          <button
            onClick={endRecovery}
            className="mono mt-3 text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
          >
            {tr('Skip for now')}
          </button>
        </div>
      )}

      {!resonant ? (
        <Loading label="Setting up your membership" />
      ) : (
        <>
          <section className="panel mt-8 p-5">
            <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              {tr('Your details')}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">{tr('Display name')}</span>
                <input
                  defaultValue={resonant.display_name ?? ''}
                  onBlur={(e) => void saveProfile({ display_name: e.target.value || null })}
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="eyebrow mb-1.5 block text-ink-faint">{tr('Home division')}</span>
                <select
                  defaultValue={resonant.home_division ?? ''}
                  onChange={(e) => void saveProfile({ home_division: e.target.value || null })}
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                >
                  <option value="">{tr('No preference')}</option>
                  {divisions.map((d) => (
                    <option key={d.division_code} value={d.division_code}>
                      {d.division_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative block">
                <span className="eyebrow mb-1.5 block text-ink-faint">
                  {tr('Home airport')}{' '}
                  {resonant.home_airport && (
                    <span className="mono text-cyan">{resonant.home_airport}</span>
                  )}
                </span>
                <input
                  value={airportQuery}
                  onChange={(e) => setAirportQuery(e.target.value)}
                  placeholder={tr('City or code')}
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
              {claimAirlineUnlocked && (
                <label className="relative block">
                  <span className="eyebrow mb-1.5 block text-ink-faint">
                    {tr('Your airline')}{' '}
                    {claimedAirline && (
                      <span className="mono text-cyan">{claimedAirline.airline_name}</span>
                    )}
                  </span>
                  <input
                    value={airlineQuery}
                    onChange={(e) => setAirlineQuery(e.target.value)}
                    placeholder={tr('Airline name or code')}
                    className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                  />
                  {airlineHits.length > 0 && (
                    <ul className="panel absolute z-30 mt-1 max-h-64 w-full overflow-auto py-1">
                      {airlineHits.map((a) => (
                        <li key={a.uid}>
                          <button
                            type="button"
                            onClick={() => {
                              void saveProfile({ claimed_airline_uid: a.uid })
                              setAirlineQuery('')
                              setAirlineHits([])
                            }}
                            className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2"
                          >
                            <span className="mono w-14 shrink-0 text-cyan">{a.carrier_code}</span>
                            <span className="truncate text-sm text-ink">{a.airline_name}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{a.division_name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {claimedAirline && (
                    <button
                      type="button"
                      onClick={() => void saveProfile({ claimed_airline_uid: null })}
                      className="mono mt-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
                    >
                      {tr('Clear')}
                    </button>
                  )}
                </label>
              )}
            </div>
            {saved && (
              <p className="mono mt-3 text-[11px] uppercase tracking-[0.12em] text-good">
                {tr('Saved')}
              </p>
            )}
          </section>

          {/* Both render nothing at all unless this account is an admin. */}
          <AdminApplications />
          <AdminMemberSites />

          {/* Not shown twice: while recovering it is already at the top. */}
          {!recovering && <PasswordCard />}

          {!resonant.is_admin && (
            <section className="panel mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  {tr('Board')}
                </h2>
                <p className="mt-2 max-w-[54ch] text-sm text-ink-dim">
                  {tr('Interested in helping run the alliance? Apply for admin, and it goes straight to the board on Discord.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminModal(true)}
                className="btn btn-ghost"
              >
                {tr('Apply for admin')}
              </button>
            </section>
          )}

        </>
      )}

      {showAdminModal && (
        <AdminApplyModal
          createAccount={false}
          initialEmail={user.email ?? ''}
          onClose={() => setShowAdminModal(false)}
        />
      )}
    </div>
  )
}

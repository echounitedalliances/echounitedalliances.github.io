import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tapError, tapSuccess } from '../lib/haptics'
import { useT } from '../lib/i18n'
import type { ClaimableAirline, MyAirlineClaim as MyClaim } from '../lib/types'

/**
 * Claiming an airline, and -- once approved -- keeping each one's name and
 * description up to date. An account can hold more than one at a time
 * (60_airline_claims_multiple_per_account.sql): resonants.claimed_airline_uid
 * is gone, and "holding an airline" now just means an approved row in
 * airline_claims, so this component tracks a list of them rather than one.
 *
 * Three independent things can be true at once -- one or more held
 * airlines, one or more still waiting on review, and the search box to ask
 * for another -- so unlike the single-claim version this does not switch
 * between mutually exclusive views. Only "verify with Discord first"
 * (55_claims_require_discord_verification.sql) and "sign in" take over the
 * whole panel, since nothing below either is reachable without them.
 */
export default function MyAirlineClaim() {
  const { resonant, signInWithDiscord } = useAuth()
  const t = useT()
  const verified = !!resonant?.discord_role_verified_at

  const [claims, setClaims] = useState<MyClaim[] | null>(null)
  const [claimsLoaded, setClaimsLoaded] = useState(false)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ClaimableAirline[]>([])
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSent, setRequestSent] = useState(false)

  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  const loadClaims = async () => {
    const { data } = await supabase.rpc('my_airline_claims')
    setClaims((data as MyClaim[]) ?? [])
    setClaimsLoaded(true)
  }

  useEffect(() => {
    void loadClaims()
  }, [resonant?.resonant_id])

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_airlines_claimable', {
        p_query: query.trim(),
        p_division: null,
        p_country: null,
        p_limit: 6,
        p_offset: 0,
      })
      if (error) console.warn('search_airlines_claimable failed; the dropdown will show nothing.', error)
      if (!cancelled) setHits((data as ClaimableAirline[]) ?? [])
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (!claimsLoaded || !claims) return null

  const held = claims.filter((c) => c.status === 'approved')
  const pending = claims.filter((c) => c.status === 'pending')
  // Already ordered approved-first, pending-next, then by submitted_at
  // desc (my_airline_claims()) -- the first non-held, non-waiting row is
  // the most recent thing worth a one-line notice about.
  const closedRecent = claims.find((c) => c.status !== 'approved' && c.status !== 'pending')

  const request = async (uid: string) => {
    setRequesting(true)
    setRequestError(null)
    try {
      const { error } = await supabase.rpc('request_airline_claim', { p_airline_uid: uid })
      if (error) throw new Error(error.message)
      tapSuccess()
      setQuery('')
      setHits([])
      setRequestSent(true)
      setTimeout(() => setRequestSent(false), 2500)
      await loadClaims()
    } catch (e) {
      tapError()
      setRequestError(e instanceof Error ? e.message : t('That could not be sent.'))
    } finally {
      setRequesting(false)
    }
  }

  const startEdit = (uid: string) => {
    setEditingUid(uid)
    setName('')
    setDescription('')
    setEditError(null)
    setEditSaved(false)
  }

  const release = async (uid: string) => {
    // Not a direct table update: there is no column to write any more --
    // only a security definer function can move the claim row itself.
    // See 60_airline_claims_multiple_per_account.sql.
    const { error } = await supabase.rpc('release_claimed_airline', { p_airline_uid: uid })
    if (!error) {
      tapSuccess()
      if (editingUid === uid) setEditingUid(null)
      await loadClaims()
    } else {
      tapError()
    }
  }

  const saveEdit = async (e: React.FormEvent, uid: string) => {
    e.preventDefault()
    setEditBusy(true)
    setEditError(null)
    try {
      const { error } = await supabase.rpc('update_claimed_airline', {
        p_airline_uid: uid,
        p_airline_name: name.trim() || null,
        p_description_md: description.trim() || null,
      })
      if (error) throw new Error(error.message)
      tapSuccess()
      setEditSaved(true)
      setTimeout(() => setEditSaved(false), 2500)
    } catch (e) {
      tapError()
      setEditError(e instanceof Error ? e.message : t('That could not be saved.'))
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <section className="panel mt-4 p-5">
      <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {t('Your airlines')}
      </h2>

      {!verified ? (
        <>
          <p className="mt-2 max-w-[58ch] text-sm text-ink-dim">
            {t('Claiming an airline needs the Resonant role on the EUA Discord server, so an admin can trust it is really you. Sign in with Discord to verify your account first.')}
          </p>
          <button
            type="button"
            onClick={() => void signInWithDiscord()}
            className="btn btn-ghost mt-3"
          >
            {t('Sign in with Discord')}
          </button>
        </>
      ) : (
        <>
          {held.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {held.map((c) => {
                const label = c.airline_name ?? c.carrier_code ?? t('this airline')
                const open = editingUid === c.airline_uid
                return (
                  <li key={c.claim_id} className="border border-edge p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-ink">{label}</span>
                      {c.carrier_code && (
                        <span className="mono text-[11px] text-cyan">{c.carrier_code}</span>
                      )}
                    </div>
                    {!open ? (
                      <button
                        type="button"
                        onClick={() => startEdit(c.airline_uid)}
                        className="mono mt-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
                      >
                        {t('Edit or release')}
                      </button>
                    ) : (
                      <form
                        onSubmit={(e) => void saveEdit(e, c.airline_uid)}
                        className="mt-3 flex flex-col gap-3"
                      >
                        <label className="block">
                          <span className="eyebrow mb-1.5 block text-ink-faint">
                            {t('Airline name')}
                          </span>
                          <input
                            value={name}
                            maxLength={80}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={label}
                            className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                          />
                        </label>
                        <label className="block">
                          <span className="eyebrow mb-1.5 block text-ink-faint">
                            {t('Description')}
                          </span>
                          <textarea
                            value={description}
                            maxLength={4000}
                            rows={5}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('Leave empty to keep it as is')}
                            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                          />
                        </label>
                        {editError && <p className="text-[12px] text-danger">{editError}</p>}
                        {editSaved && (
                          <p className="mono text-[11px] uppercase tracking-[0.12em] text-good">
                            {t('Saved')}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4">
                          <button
                            type="submit"
                            disabled={editBusy || (!name.trim() && !description.trim())}
                            className="btn btn-primary"
                          >
                            {editBusy ? t('Saving…') : t('Save changes')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUid(null)}
                            className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
                          >
                            {t('Done')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void release(c.airline_uid)}
                            className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-danger"
                          >
                            {t('Release this airline')}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {pending.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {pending.map((c) => (
                <li key={c.claim_id} className="text-sm text-ink-dim">
                  {t('Your claim for {airline} is waiting on an admin to review it.', {
                    airline: c.airline_name ?? c.carrier_code ?? t('this airline'),
                  })}
                </li>
              ))}
            </ul>
          )}

          {closedRecent && (
            <p className="mt-4 text-[12px] text-ink-faint">
              {closedRecent.status === 'rejected' &&
                t('Your last claim, for {airline}, was turned down.', {
                  airline: closedRecent.airline_name ?? closedRecent.carrier_code ?? t('an airline'),
                })}
              {closedRecent.status === 'withdrawn' &&
                t('Your claim for {airline} was withdrawn.', {
                  airline: closedRecent.airline_name ?? closedRecent.carrier_code ?? t('an airline'),
                })}
              {closedRecent.status === 'superseded' &&
                t('Your hold on {airline} was given to a different account.', {
                  airline: closedRecent.airline_name ?? closedRecent.carrier_code ?? t('an airline'),
                })}
              {closedRecent.decision_note && <> {closedRecent.decision_note}</>}
            </p>
          )}

          <div className="mt-4">
            <p className="max-w-[58ch] text-sm text-ink-dim">
              {t('If you fly for an alliance member, ask to hold its page here. An admin reviews every request before it takes effect. You can hold more than one.')}
            </p>
            {requestSent && (
              <p className="mono mt-3 text-[11px] uppercase tracking-[0.12em] text-good">
                {t('Sent -- you will see it here once an admin decides.')}
              </p>
            )}
            <div className="relative mt-3 max-w-sm">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Airline name or code')}
                className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
              {hits.length > 0 && (
                <ul className="panel absolute z-30 mt-1 max-h-64 w-full overflow-auto py-1">
                  {hits.map((a) => (
                    <li key={a.uid}>
                      <button
                        type="button"
                        disabled={requesting || a.claimed}
                        onClick={() => void request(a.uid)}
                        className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span className="mono w-14 shrink-0 text-cyan">{a.carrier_code}</span>
                        <span className="truncate text-sm text-ink">{a.airline_name}</span>
                        {a.claimed && (
                          <span className="mono shrink-0 border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                            {t('Claimed')}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{a.division_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {requestError && <p className="mt-2 text-[12px] text-danger">{requestError}</p>}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tapError, tapSuccess } from '../lib/haptics'
import { useT } from '../lib/i18n'
import type { Airline, MyAirlineClaim as MyClaim } from '../lib/types'

/**
 * Claiming an airline, and -- once that is approved -- keeping its name and
 * description up to date.
 *
 * Claiming used to write resonants.claimed_airline_uid directly, the
 * moment a Resonant picked a carrier: self-reported, no review, the same as
 * a home airport. 54_airline_claims.sql put a queue in front of that
 * instead, so this component now has three things to show depending on
 * where the account's one claim (if any) stands: a search box when there is
 * none, a pending notice while an admin has not decided yet, or -- once
 * approved -- the held airline and a small form to edit it, the one thing
 * holding it is actually for.
 */
export default function MyAirlineClaim() {
  const { resonant, refreshResonant } = useAuth()
  const t = useT()

  const [claim, setClaim] = useState<MyClaim | null>(null)
  const [claimLoaded, setClaimLoaded] = useState(false)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Airline[]>([])
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSent, setRequestSent] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  const loadClaim = async () => {
    const { data } = await supabase.rpc('my_airline_claim')
    const rows = (data as MyClaim[]) ?? []
    setClaim(rows[0] ?? null)
    setClaimLoaded(true)
  }

  useEffect(() => {
    void loadClaim()
  }, [resonant?.claimed_airline_uid])

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airlines', {
        p_query: query.trim(),
        p_division: null,
        p_country: null,
        p_limit: 6,
        p_offset: 0,
      })
      if (!cancelled) setHits((data as Airline[]) ?? [])
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (!claimLoaded) return null

  const held = resonant?.claimed_airline_uid

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
      await loadClaim()
    } catch (e) {
      tapError()
      setRequestError(e instanceof Error ? e.message : t('That could not be sent.'))
    } finally {
      setRequesting(false)
    }
  }

  const release = async () => {
    if (!resonant) return
    const { error } = await supabase
      .from('resonants')
      .update({ claimed_airline_uid: null })
      .eq('resonant_id', resonant.resonant_id)
    if (!error) {
      tapSuccess()
      await refreshResonant()
      setClaim(null)
    } else {
      tapError()
    }
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditBusy(true)
    setEditError(null)
    try {
      const { error } = await supabase.rpc('update_claimed_airline', {
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
        {t('Your airline')}
      </h2>

      {held ? (
        <>
          <p className="mt-2 text-sm text-ink-dim">
            {t('You hold {airline}. Update its name or description below; everything else comes from the weekly import.', {
              airline: claim?.airline_name ?? claim?.carrier_code ?? t('this airline'),
            })}
          </p>
          <form onSubmit={saveEdit} className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="eyebrow mb-1.5 block text-ink-faint">{t('Airline name')}</span>
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder={claim?.airline_name ?? t('Leave empty to keep it as is')}
                className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block text-ink-faint">{t('Description')}</span>
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
              <p className="mono text-[11px] uppercase tracking-[0.12em] text-good">{t('Saved')}</p>
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
                onClick={() => void release()}
                className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-danger"
              >
                {t('Release this airline')}
              </button>
            </div>
          </form>
        </>
      ) : claim?.status === 'pending' ? (
        <p className="mt-2 text-sm text-ink-dim">
          {t('Your claim for {airline} is waiting on an admin to review it.', {
            airline: claim.airline_name ?? claim.carrier_code ?? t('this airline'),
          })}
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-[58ch] text-sm text-ink-dim">
            {t('If you fly for an alliance member, ask to hold its page here. An admin reviews every request before it takes effect.')}
          </p>
          {claim?.status === 'rejected' && (
            <p className="mt-2 text-[12px] text-ink-faint">
              {t('Your last claim, for {airline}, was turned down.', {
                airline: claim.airline_name ?? claim.carrier_code ?? t('an airline'),
              })}
              {claim.decision_note && <> {claim.decision_note}</>}
            </p>
          )}
          {requestSent ? (
            <p className="mono mt-3 text-[11px] uppercase tracking-[0.12em] text-good">
              {t('Sent -- you will see it here once an admin decides.')}
            </p>
          ) : (
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
                        disabled={requesting}
                        onClick={() => void request(a.uid)}
                        className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                      >
                        <span className="mono w-14 shrink-0 text-cyan">{a.carrier_code}</span>
                        <span className="truncate text-sm text-ink">{a.airline_name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{a.division_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {requestError && <p className="mt-2 text-[12px] text-danger">{requestError}</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}

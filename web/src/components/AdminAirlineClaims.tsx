import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import Pager, { usePaged } from './Pager'
import type { AdminAirlineClaim } from '../lib/types'

/**
 * The airline-claim inbox: the review step admin_decide_airline_claim adds
 * in front of resonants.claimed_airline_uid (54_airline_claims.sql). Same
 * inbox shape as AdminApplications.tsx -- the two problems are the same
 * shape -- with one extra thing to check before approving: whether a
 * different account already holds this airline, which the list itself
 * flags rather than letting an admin find out by approving over it.
 */
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_TONE: Record<AdminAirlineClaim['status'], string> = {
  pending: 'text-warn',
  approved: 'text-good',
  rejected: 'text-ink-faint',
  withdrawn: 'text-ink-faint',
}

export default function AdminAirlineClaims() {
  const { resonant } = useAuth()
  const [rows, setRows] = useState<AdminAirlineClaim[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deciding, setDeciding] = useState<{ id: number; approve: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = resonant?.is_admin ?? false

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_airline_claims_list', {
      p_status: showAll ? 'all' : 'pending',
    })
    if (e) {
      setError(e.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as AdminAirlineClaim[]) ?? [])
  }, [showAll])

  useEffect(() => {
    if (!isAdmin) return
    void load()
  }, [isAdmin, load])

  const paged = usePaged(rows ?? [])

  // Hooks above this line, always.
  if (!isAdmin) return null

  const pendingCount = (rows ?? []).filter((r) => r.status === 'pending').length

  const decide = async (id: number, approve: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('admin_decide_airline_claim', {
        p_claim_id: id,
        p_approve: approve,
        p_note: note.trim() || null,
      })
      if (e) throw new Error(e.message)
      setDeciding(null)
      setNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Airline claims
          {pendingCount > 0 && (
            <span className="ml-3 border border-[color:var(--color-warn)] px-2 py-0.5 text-warn">
              {pendingCount} waiting
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-pressed={showAll}
          className={`chip ${showAll ? 'chip-on' : ''}`}
        >
          {showAll ? 'All' : 'Waiting only'}
        </button>
      </div>

      {error && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rows === null ? (
        <Loading label="Reading the queue" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-dim">
          {showAll ? 'Nobody has claimed an airline yet.' : 'Nothing waiting to be read.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {paged.slice.map((c) => {
              const open = deciding?.id === c.claim_id
              return (
                <li key={c.claim_id} className="border border-edge p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <span className="text-ink">{c.display_name ?? c.email}</span>
                      {c.display_name && (
                        <span className="mono ml-2 text-[12px] text-ink-faint">{c.email}</span>
                      )}
                    </div>
                    <span
                      className={`mono text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <p className="mono mt-1.5 text-[11px] text-ink-faint">
                    Claims{' '}
                    <span className="text-cyan">
                      {c.airline_name ?? c.carrier_code ?? 'an unknown carrier'}
                    </span>
                    {c.carrier_code && c.airline_name && <> ({c.carrier_code})</>}
                    {c.division_name && <> · {c.division_name}</>}
                    {' · '}{when(c.submitted_at)}
                  </p>

                  {c.already_held_by_someone_else && c.status === 'pending' && (
                    <p className="mt-2 text-[12px] text-warn">
                      A different account already holds this airline. Approving moves it to this
                      one.
                    </p>
                  )}

                  {c.status !== 'pending' && c.decided_at && (
                    <p className="mono mt-2 text-[11px] text-ink-faint">
                      {c.status === 'approved' ? 'Approved' : 'Turned down'} {when(c.decided_at)}
                      {c.decided_by && <> by {c.decided_by}</>}
                      {c.decision_note && <> · {c.decision_note}</>}
                    </p>
                  )}

                  {c.status === 'pending' && !open && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeciding({ id: c.claim_id, approve: true })
                          setNote('')
                        }}
                        className="mono border border-[color:var(--color-good)] px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-good transition-colors hover:bg-[color:var(--color-good)] hover:text-[#050505]"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeciding({ id: c.claim_id, approve: false })
                          setNote('')
                        }}
                        className="mono border border-edge px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:border-[color:var(--color-danger)] hover:text-danger"
                      >
                        Turn down
                      </button>
                    </div>
                  )}

                  {open && (
                    <div className="mt-3 border-l-2 border-l-[color:var(--color-accent)] pl-4">
                      <p className="text-sm leading-relaxed text-ink-dim">
                        {deciding.approve ? (
                          <>
                            Approving sets {c.display_name ?? c.email} as the Resonant operator of{' '}
                            {c.airline_name ?? c.carrier_code}, shown on the carrier's own page and
                            lets them edit its name and description from here on.
                          </>
                        ) : (
                          <>Turning this down leaves the airline unclaimed.</>
                        )}
                      </p>
                      <label className="mt-3 block">
                        <span className="eyebrow mb-1.5 block text-ink-faint">
                          Note (optional, kept on the record)
                        </span>
                        <input
                          value={note}
                          autoFocus
                          maxLength={200}
                          onChange={(e) => setNote(e.target.value)}
                          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide(c.claim_id, deciding.approve)}
                          className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#050505] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy
                            ? 'Saving…'
                            : deciding.approve
                              ? 'Yes, approve the claim'
                              : 'Yes, turn it down'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeciding(null)}
                          className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <Pager paged={paged} label="claims" />
        </>
      )}
    </section>
  )
}

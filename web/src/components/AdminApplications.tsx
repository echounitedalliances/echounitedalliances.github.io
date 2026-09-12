import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import Pager, { usePaged } from './Pager'

/**
 * The admin inbox, and the form that fills it.
 *
 * Promoting somebody used to mean opening psql and running an UPDATE, which
 * meant two things: only the person with database access could do it, and
 * there was no list anywhere of who had asked. A request that nobody actioned
 * looked exactly like a request that had been turned down.
 *
 * Applying itself lives in AdminApplyModal, which predates this and already
 * reaches people at signup as well as from their account. This is only the
 * other end: the queue that modal now files into, and the two buttons that
 * empty it.
 *
 * Deciding takes two clicks on purpose. This hands over the ability to edit
 * every carrier in the alliance and to promote further admins, which is not a
 * thing to do by brushing against a button.
 */

type Application = {
  application_id: number
  email: string
  discord: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  source: 'site' | 'relayed'
  relayed_by: string | null
  submitted_at: string
  decided_at: string | null
  decided_by: string | null
  decision_note: string | null
  display_name: string | null
  has_account: boolean
  is_admin: boolean
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

const STATUS_TONE: Record<Application['status'], string> = {
  pending: 'text-warn',
  approved: 'text-good',
  rejected: 'text-ink-faint',
  withdrawn: 'text-ink-faint',
}

export default function AdminApplications() {
  const { resonant } = useAuth()
  const [rows, setRows] = useState<Application[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which row is mid-decision, and which way. Null means nothing is pending a
  // confirmation.
  const [deciding, setDeciding] = useState<{ id: number; approve: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const [logging, setLogging] = useState(false)
  const [logEmail, setLogEmail] = useState('')
  const [logDiscord, setLogDiscord] = useState('')
  const [logReason, setLogReason] = useState('')

  const isAdmin = resonant?.is_admin ?? false

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_applications_list', {
      p_status: showAll ? 'all' : 'pending',
    })
    if (error) {
      setError(error.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as Application[]) ?? [])
  }, [showAll])

  useEffect(() => {
    if (!isAdmin) return
    void load()
  }, [isAdmin, load])

  const paged = usePaged(rows ?? [])

  // Hooks above this line, always: an early return placed before them changes
  // the hook order between renders and React tears the page down.
  if (!isAdmin) return null

  const pendingCount = (rows ?? []).filter((r) => r.status === 'pending').length

  const decide = async (id: number, approve: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('decide_admin_application', {
        p_application_id: id,
        p_approve: approve,
        p_note: note.trim() || null,
      })
      if (error) throw new Error(error.message)
      setDeciding(null)
      setNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const record = async () => {
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('record_admin_application', {
        p_email: logEmail.trim(),
        p_discord: logDiscord.trim() || null,
        p_reason: logReason.trim() || null,
      })
      if (error) throw new Error(error.message)
      setLogEmail('')
      setLogDiscord('')
      setLogReason('')
      setLogging(false)
      if (!showAll) await load()
      else setShowAll(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The application could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Admin applications
          {pendingCount > 0 && (
            <span className="ml-3 border border-[color:var(--color-warn)] px-2 py-0.5 text-warn">
              {pendingCount} waiting
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            className={`chip ${showAll ? 'chip-on' : ''}`}
          >
            {showAll ? 'All' : 'Waiting only'}
          </button>
          <button
            type="button"
            onClick={() => setLogging((v) => !v)}
            aria-expanded={logging}
            className="chip"
          >
            Log one from Discord
          </button>
        </div>
      </div>

      {logging && (
        <div className="mt-4 border-l-2 border-l-[color:var(--color-accent)] pl-4">
          <p className="text-sm leading-relaxed text-ink-dim">
            For a request that came through a division leader or a ticket rather
            than through this page. The address has to match their Resonance
            account, because that is what the approval promotes.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow mb-1.5 block text-ink-faint">Email</span>
              <input
                value={logEmail}
                onChange={(e) => setLogEmail(e.target.value)}
                placeholder="name@example.com"
                className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block text-ink-faint">Discord handle</span>
              <input
                value={logDiscord}
                onChange={(e) => setLogDiscord(e.target.value)}
                placeholder="Optional"
                className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="eyebrow mb-1.5 block text-ink-faint">Note</span>
            <input
              value={logReason}
              onChange={(e) => setLogReason(e.target.value)}
              placeholder="Who passed it on, and anything they said"
              className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !logEmail.trim()}
              onClick={() => void record()}
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add to the queue'}
            </button>
            <button
              type="button"
              onClick={() => setLogging(false)}
              className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rows === null ? (
        <Loading label="Reading the queue" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-dim">
          {showAll ? 'Nobody has applied yet.' : 'Nothing waiting to be read.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {paged.slice.map((a) => {
              const open = deciding?.id === a.application_id
              return (
                <li key={a.application_id} className="border border-edge p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <span className="text-ink">{a.display_name ?? a.email}</span>
                      {a.display_name && (
                        <span className="mono ml-2 text-[12px] text-ink-faint">{a.email}</span>
                      )}
                    </div>
                    <span
                      className={`mono text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[a.status]}`}
                    >
                      {a.status}
                    </span>
                  </div>

                  <p className="mono mt-1.5 text-[11px] text-ink-faint">
                    {a.discord && <>Discord {a.discord} · </>}
                    {a.source === 'relayed' ? 'Relayed' : 'Applied here'} {when(a.submitted_at)}
                    {a.relayed_by && <> by {a.relayed_by}</>}
                  </p>

                  {a.reason && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-dim">{a.reason}</p>
                  )}

                  {a.status !== 'pending' && a.decided_at && (
                    <p className="mono mt-2 text-[11px] text-ink-faint">
                      {a.status === 'approved' ? 'Approved' : 'Turned down'} {when(a.decided_at)}
                      {a.decided_by && <> by {a.decided_by}</>}
                      {a.decision_note && <> · {a.decision_note}</>}
                    </p>
                  )}

                  {a.status === 'pending' && !a.has_account && (
                    <p className="mt-2 text-[12px] text-warn">
                      No Resonance account on this address yet. They have to sign
                      in once before this can be approved.
                    </p>
                  )}
                  {a.status === 'pending' && a.is_admin && (
                    <p className="mt-2 text-[12px] text-ink-faint">
                      This account is already an admin.
                    </p>
                  )}

                  {a.status === 'pending' && !open && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!a.has_account}
                        onClick={() => {
                          setDeciding({ id: a.application_id, approve: true })
                          setNote('')
                        }}
                        className="mono border border-[color:var(--color-good)] px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-good transition-colors hover:bg-[color:var(--color-good)] hover:text-[#0B0713] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-good"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeciding({ id: a.application_id, approve: false })
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
                            Approving gives {a.display_name ?? a.email} the run of
                            the alliance: they can rename and rewrite any carrier,
                            and promote or demote other admins, including you.
                          </>
                        ) : (
                          <>Turning this down leaves the account exactly as it is.</>
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
                          onClick={() => void decide(a.application_id, deciding.approve)}
                          className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy
                            ? 'Saving…'
                            : deciding.approve
                              ? 'Yes, make them an admin'
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
          <Pager paged={paged} label="applications" />
        </>
      )}
    </section>
  )
}

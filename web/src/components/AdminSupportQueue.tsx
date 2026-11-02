import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import Pager, { usePaged } from './Pager'
import type { AdminTicket, TicketStatus } from '../lib/types'

/**
 * The support inbox: every bug report and suggestion sent through /support,
 * read the same way the admin-applications queue already is (see
 * AdminApplications.tsx -- this is the same inbox shape wearing a different
 * category list). Admin screens are the one part of the site left in
 * English on purpose (web/src/lib/i18n.tsx explains why), so this has no
 * translation calls at all.
 */
const CATEGORY_LABEL: Record<AdminTicket['category'], string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
  account: 'Account',
  other: 'Other',
}

const STATUS_TONE: Record<TicketStatus, string> = {
  open: 'text-warn',
  in_progress: 'text-cyan',
  resolved: 'text-good',
  closed: 'text-ink-faint',
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export default function AdminSupportQueue() {
  const { resonant } = useAuth()
  const [rows, setRows] = useState<AdminTicket[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<number | null>(null)
  const [draftStatus, setDraftStatus] = useState<TicketStatus>('open')
  const [draftReply, setDraftReply] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = resonant?.is_admin ?? false

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_support_tickets_list', {
      p_status: showAll ? 'all' : 'open',
    })
    if (e) {
      setError(e.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as AdminTicket[]) ?? [])
  }, [showAll])

  useEffect(() => {
    if (!isAdmin) return
    void load()
  }, [isAdmin, load])

  const paged = usePaged(rows ?? [])

  // Hooks above this line, always.
  if (!isAdmin) return null

  const openCount = (rows ?? []).filter((r) => r.status === 'open').length

  const start = (t: AdminTicket) => {
    setEditing(t.ticket_id)
    setDraftStatus(t.status)
    setDraftReply(t.reply ?? '')
    setDraftNote(t.admin_note ?? '')
  }

  const save = async (ticketId: number) => {
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('admin_update_support_ticket', {
        p_ticket_id: ticketId,
        p_status: draftStatus,
        p_reply: draftReply.trim() || null,
        p_admin_note: draftNote.trim() || null,
      })
      if (e) throw new Error(e.message)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The ticket could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Support tickets
          {openCount > 0 && (
            <span className="ml-3 border border-[color:var(--color-warn)] px-2 py-0.5 text-warn">
              {openCount} open
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-pressed={showAll}
          className={`chip ${showAll ? 'chip-on' : ''}`}
        >
          {showAll ? 'All' : 'Open only'}
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
          {showAll ? 'Nothing has ever been sent.' : 'Nothing open right now.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {paged.slice.map((ticket) => {
              const open = editing === ticket.ticket_id
              return (
                <li key={ticket.ticket_id} className="border border-edge p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <span className="mono mr-2 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                        {CATEGORY_LABEL[ticket.category]}
                      </span>
                      <span className="text-ink">{ticket.subject}</span>
                    </div>
                    <span
                      className={`mono text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[ticket.status]}`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="mono mt-1.5 text-[11px] text-ink-faint">
                    {ticket.display_name ?? ticket.email ?? 'Anonymous'} · {when(ticket.submitted_at)}
                    {ticket.page_url && (
                      <>
                        {' · '}
                        <span className="break-all">{ticket.page_url}</span>
                      </>
                    )}
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
                    {ticket.message}
                  </p>

                  {ticket.browser_info && (
                    <p className="mono mt-1.5 break-all text-[11px] text-ink-faint">
                      {ticket.browser_info}
                    </p>
                  )}

                  {ticket.admin_note && !open && (
                    <p className="mt-2 border-l-2 border-l-edge pl-3 text-[12px] text-ink-faint">
                      Note: {ticket.admin_note}
                    </p>
                  )}
                  {ticket.reply && !open && (
                    <p className="mt-2 border-l-2 border-l-[color:var(--color-accent)] pl-3 text-[12px] text-ink-dim">
                      Reply sent: {ticket.reply}
                    </p>
                  )}

                  {!open ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => start(ticket)}
                        className="mono border border-edge px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
                      >
                        Update
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 border-l-2 border-l-[color:var(--color-accent)] pl-4">
                      <label className="block">
                        <span className="eyebrow mb-1.5 block text-ink-faint">Status</span>
                        <select
                          value={draftStatus}
                          onChange={(e) => setDraftStatus(e.target.value as TicketStatus)}
                          className="w-full border border-edge bg-ground-2 px-3 py-2 text-ink outline-none focus:border-accent sm:w-auto"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </label>

                      <label className="mt-3 block">
                        <span className="eyebrow mb-1.5 block text-ink-faint">
                          Reply (the submitter can read this back, if they are signed in)
                        </span>
                        <textarea
                          value={draftReply}
                          rows={3}
                          onChange={(e) => setDraftReply(e.target.value)}
                          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                        />
                      </label>

                      <label className="mt-3 block">
                        <span className="eyebrow mb-1.5 block text-ink-faint">
                          Internal note (never shown to the submitter)
                        </span>
                        <input
                          value={draftNote}
                          onChange={(e) => setDraftNote(e.target.value)}
                          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                        />
                      </label>

                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void save(ticket.ticket_id)}
                          className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#050505] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
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
          <Pager paged={paged} label="tickets" />
        </>
      )}
    </section>
  )
}

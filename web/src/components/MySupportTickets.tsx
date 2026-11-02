import { useEffect, useState } from 'react'
import { myTickets } from '../lib/support'
import type { MyTicket, TicketStatus } from '../lib/types'
import { useT } from '../lib/i18n'

/**
 * A signed-in Resonant's own support tickets, so checking on a bug report
 * means opening this page rather than asking someone to look it up. Renders
 * nothing at all if there is nothing to show -- the same rule the admin
 * dashboard's own sections follow, and there is nothing worth a panel just
 * to say "you have not sent one yet".
 */
const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_TONE: Record<TicketStatus, string> = {
  open: 'text-warn',
  in_progress: 'text-cyan',
  resolved: 'text-good',
  closed: 'text-ink-faint',
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function MySupportTickets() {
  const t = useT()
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void myTickets()
      .then((rows) => {
        if (!cancelled) setTickets(rows)
      })
      .catch(() => {
        // Nothing to show is the same as nothing to say here.
        if (!cancelled) setTickets([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!tickets || tickets.length === 0) return null

  return (
    <section className="panel mt-4 p-5">
      <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {t('Your support tickets')}
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {tickets.map((ticket) => (
          <li key={ticket.ticket_id} className="border border-edge p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-ink">{ticket.subject}</span>
              <span
                className={`mono text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[ticket.status]}`}
              >
                {t(STATUS_LABEL[ticket.status])}
              </span>
            </div>
            <p className="mono mt-1.5 text-[11px] text-ink-faint">{when(ticket.submitted_at)}</p>
            {ticket.reply && (
              <p className="mt-2 border-l-2 border-l-[color:var(--color-accent)] pl-3 text-sm leading-relaxed text-ink-dim">
                {ticket.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import type { DashboardStats } from '../lib/types'

/**
 * The dashboard's numbers: how many members there are, how many of them
 * admins, signups over the last 30 days, and support tickets by status and
 * category.
 *
 * No charting library -- the bars are divs sized by their own share of the
 * busiest day, which is the same amount of code a dependency would cost for
 * four numbers nobody is going to zoom or hover.
 *
 * Deliberately missing: a history of the live visitor count. That number
 * (useSiteVisitorCount, App.tsx) reads Supabase Realtime Presence directly
 * and has never been written anywhere, so there is nothing to chart yet --
 * it would need its own periodic snapshot, which is a separate piece of
 * infrastructure, not a query away.
 */
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
  account: 'Account',
  other: 'Other',
}

function Bars({ data, labels }: { data: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(labels).map(([key, label]) => [label, data[key] ?? 0] as const)
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {entries.map(([label, n]) => (
        <li key={label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[12px] text-ink-faint">{label}</span>
          <div className="h-2 flex-1 bg-ground-2">
            <div
              className="h-2 bg-accent"
              style={{ width: `${max === 0 ? 0 : (n / max) * 100}%` }}
            />
          </div>
          <span className="mono w-8 shrink-0 text-right text-[12px] text-ink-faint">{n}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AdminStats() {
  const { resonant } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = resonant?.is_admin ?? false

  useEffect(() => {
    if (!isAdmin) return
    void supabase.rpc('admin_dashboard_stats').then(({ data, error: e }) => {
      if (e) {
        setError(e.message)
        return
      }
      setStats(((data as DashboardStats[]) ?? [])[0] ?? null)
    })
  }, [isAdmin])

  if (!isAdmin) return null
  if (error) {
    return (
      <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
        {error}
      </p>
    )
  }
  if (!stats) return <Loading label="Reading the numbers" />

  const signupsMax = Math.max(1, ...stats.signups_last_30d.map((d) => d.count))

  return (
    <section className="panel mt-4 p-5">
      <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">The numbers</h2>

      <div className="mt-4 flex flex-wrap gap-8">
        <div>
          <div className="mono text-2xl text-ink">{stats.total_resonants}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.09em] text-ink-faint">
            Resonance accounts
          </div>
        </div>
        <div>
          <div className="mono text-2xl text-ink">{stats.total_admins}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.09em] text-ink-faint">Admins</div>
        </div>
      </div>

      <p className="mono mt-6 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        Signups, last 30 days
      </p>
      {stats.signups_last_30d.length === 0 ? (
        <p className="mt-2 text-sm text-ink-dim">No new accounts in the last 30 days.</p>
      ) : (
        <div className="mt-3 flex h-20 items-end gap-0.5">
          {stats.signups_last_30d.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.count}`}
              className="flex-1 bg-accent"
              style={{ height: `${(d.count / signupsMax) * 100}%`, minHeight: 2 }}
            />
          ))}
        </div>
      )}

      <p className="mono mt-6 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        Support tickets by status
      </p>
      <Bars data={stats.tickets_by_status} labels={STATUS_LABEL} />

      <p className="mono mt-6 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        Support tickets by category
      </p>
      <Bars data={stats.tickets_by_category} labels={CATEGORY_LABEL} />
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isConfigured, supabase } from '../lib/supabase'
import type { Division } from '../lib/types'
import { accentOf, num } from '../lib/format'
import { Loading, NotConfigured } from '../components/ui'

export default function Divisions() {
  const [rows, setRows] = useState<Division[] | null>(null)

  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setRows((data as Division[]) ?? []))
  }, [])

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-14">
      <p className="eyebrow text-cyan">The group</p>
      <h1 className="display mt-3 text-[clamp(36px,5vw,58px)]">Eight divisions</h1>
      <p className="mt-4 max-w-[64ch] text-lg text-ink-dim">
        Echo United Alliances is a multi-alliance group: each division runs its
        own roster and its own leadership, and members fly under one network.
      </p>

      {rows === null ? (
        <Loading />
      ) : (
        <div className="mt-10 flex flex-col gap-3">
          {rows.map((d, i) => {
            const accent = accentOf(d)
            return (
              <Link
                key={d.division_code}
                to={`/d/${d.division_code}`}
                className="panel rise group grid gap-5 p-6 transition-colors hover:border-[color:var(--color-accent)] md:grid-cols-[minmax(0,1fr)_auto]"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-8 w-1"
                      style={{ background: accent }}
                      aria-hidden="true"
                    />
                    <h2 className="display text-3xl" style={{ color: accent }}>
                      {d.division_name}
                    </h2>
                    {d.division_code === 'proxima' && (
                      <span className="mono border border-edge px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                        Home division
                      </span>
                    )}
                  </div>
                  {d.alliance_description ? (
                    <p className="mt-3 max-w-[68ch] whitespace-pre-line text-ink-dim">
                      {d.alliance_description}
                    </p>
                  ) : (
                    <p className="mt-3 max-w-[68ch] text-ink-faint">
                      {num(d.carriers)} member carriers flying {num(d.routes)} routes
                      to {num(d.destinations)} destinations.
                    </p>
                  )}
                  {d.top_hubs && d.top_hubs.length > 0 && (
                    <div className="mono mt-4 flex flex-wrap gap-2">
                      {d.top_hubs.map((h) => (
                        <Link
                          key={h}
                          to={`/airports/${h}`}
                          className="border border-edge-soft px-2 py-0.5 text-[11px] text-ink-dim transition-colors hover:border-accent hover:text-ink"
                        >
                          {h}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 self-start md:grid-cols-1 md:text-right">
                  {[
                    ['Carriers', d.carriers],
                    ['Aircraft', d.aircraft],
                    ['Routes', d.routes],
                    ['Destinations', d.destinations],
                  ].map(([label, v]) => (
                    <div key={label as string}>
                      <dd className="mono text-xl text-ink">{num(Number(v))}</dd>
                      <dt className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                        {label}
                      </dt>
                    </div>
                  ))}
                </dl>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import type { AdminResonant } from '../lib/types'

/**
 * Every Resonance account, searchable, with promoting, demoting and removing
 * in one place rather than needing psql for any of them.
 *
 * Promoting and demoting call grant_admin / revoke_admin unchanged
 * (13_admin_grants.sql) -- the same functions the admin-applications queue
 * already calls -- so the rules there still hold: you cannot touch your own
 * admin, and the last admin cannot be removed.
 *
 * "Remove" deletes only the Resonance PROFILE (admin_remove_resonant,
 * 49_admin_dashboard.sql) -- display name, home division and airport, claimed
 * airline, admin flag. It does not delete their Supabase sign-in, which this
 * site has no way to do; signing in again just creates a fresh, empty
 * profile, the same way a first sign-in always has. An admin must be
 * demoted before they can be removed.
 */
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function AdminMembers() {
  const { resonant: me } = useAuth()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<AdminResonant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const isAdmin = me?.is_admin ?? false

  const load = useCallback(async (q: string) => {
    const { data, error: e } = await supabase.rpc('admin_resonants_list', {
      p_query: q.trim() || null,
      p_limit: 50,
      p_offset: 0,
    })
    if (e) {
      setError(e.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as AdminResonant[]) ?? [])
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    void load('')
  }, [isAdmin, load])

  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(() => void load(query), 220)
    return () => clearTimeout(t)
  }, [query, isAdmin, load])

  // Hooks above this line, always.
  if (!isAdmin) return null

  const setAdmin = async (r: AdminResonant, make: boolean) => {
    setBusyId(r.resonant_id)
    setError(null)
    try {
      const { error: e } = await supabase.rpc(make ? 'grant_admin' : 'revoke_admin', {
        p_email: r.email,
        p_note: 'from the admin dashboard',
      })
      if (e) throw new Error(e.message)
      await load(query)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (r: AdminResonant) => {
    setBusyId(r.resonant_id)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('admin_remove_resonant', {
        p_resonant_id: r.resonant_id,
      })
      if (e) throw new Error(e.message)
      setRemoving(null)
      await load(query)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That account could not be removed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Members{rows && <span className="ml-3 text-ink-dim">{rows.length}</span>}
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="w-full max-w-xs border border-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
      </div>

      {error && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rows === null ? (
        <Loading label="Searching members" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-dim">No matching account.</p>
      ) : (
        <ul className="mt-4 border-t border-edge-soft">
          {rows.map((r) => {
            const busy = busyId === r.resonant_id
            const self = r.resonant_id === me?.resonant_id
            return (
              <li key={r.resonant_id} className="border-b border-edge-soft py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <span className="text-ink">{r.display_name ?? r.email}</span>
                    <span className="mono ml-2 text-[12px] text-ink-faint">{r.email}</span>
                    {r.is_admin && (
                      <span className="ml-2 border border-[color:var(--color-warn)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-warn">
                        Admin
                      </span>
                    )}
                  </div>
                  <span className="mono text-[11px] text-ink-faint">
                    Joined {when(r.joined_at)}
                    {r.home_division && <> · {r.home_division}</>}
                    {r.home_airport && <> · {r.home_airport}</>}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {self ? (
                    <span className="text-[12px] text-ink-faint">That is you.</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setAdmin(r, !r.is_admin)}
                        className="mono border border-edge px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
                      >
                        {r.is_admin ? 'Demote' : 'Promote to admin'}
                      </button>

                      {r.is_admin ? (
                        <span className="text-[12px] text-ink-faint">Demote before removing.</span>
                      ) : removing === r.resonant_id ? (
                        <>
                          <span className="text-[12px] text-ink-dim">Remove this profile?</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(r)}
                            className="mono border border-[color:var(--color-danger)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-danger transition-colors hover:bg-[color:var(--color-danger)] hover:text-[#050505] disabled:opacity-50"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(null)}
                            className="mono px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRemoving(r.resonant_id)}
                          className="mono px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-danger"
                        >
                          Remove…
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

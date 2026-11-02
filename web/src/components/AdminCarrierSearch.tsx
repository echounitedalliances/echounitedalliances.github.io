import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AdminAirlineEdit from './AdminAirlineEdit'
import { divisionPath } from '../lib/alliance'
import type { Airline } from '../lib/types'

/**
 * Finding any carrier to edit, without first opening its page.
 *
 * AdminAirlineEdit already does the editing -- name, description, division
 * -- from the carrier's own page (see that file for why only those three).
 * This is only the other way in: search_airlines (26_airline_overrides.sql),
 * the same RPC the Resonance "claim your airline" field and the member-sites
 * admin's carrier search already call, so results here are the real
 * Airline shape AdminAirlineEdit expects, not a trimmed-down copy of it.
 */
export default function AdminCarrierSearch() {
  const { resonant } = useAuth()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Airline[]>([])

  const isAdmin = resonant?.is_admin ?? false

  useEffect(() => {
    if (!isAdmin || query.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airlines', {
        p_query: query.trim(),
        p_division: null,
        p_country: null,
        p_limit: 10,
        p_offset: 0,
      })
      if (!cancelled) setHits((data as Airline[]) ?? [])
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, isAdmin])

  if (!isAdmin) return null

  return (
    <section className="panel mt-4 p-5">
      <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">Edit a carrier</h2>
      <p className="mt-2 max-w-[62ch] text-sm text-ink-dim">
        Find any carrier by name or code to change its name, description or division.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Carrier name or code"
        className="mt-3 w-full max-w-sm border border-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      {hits.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {hits.map((a) => (
            <li
              key={a.uid}
              className="flex flex-wrap items-center gap-3 border border-edge px-3 py-2.5"
            >
              <span className="mono w-14 shrink-0 text-cyan">{a.carrier_code}</span>
              <Link
                to={divisionPath(a.division_code, a.airline_slug)}
                className="min-w-0 flex-1 truncate text-sm text-ink hover:underline"
              >
                {a.airline_name ?? a.carrier_code}
              </Link>
              <span className="shrink-0 text-[11px] text-ink-faint">{a.division_name}</span>
              <AdminAirlineEdit
                airline={a}
                onSaved={(updated) =>
                  setHits((prev) => prev.map((h) => (h.uid === updated.uid ? updated : h)))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AirlineCard, Loading, NotConfigured } from '../components/ui'
import CountryField from '../components/CountryField'
import { isConfigured, supabase } from '../lib/supabase'
import type { Airline, Division } from '../lib/types'
import { accentOf, num } from '../lib/format'

const PAGE = 60

/** All 590 carriers, filterable. The heavy lifting is search_airlines(). */
export default function Directory() {
  const [params, setParams] = useSearchParams()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [rows, setRows] = useState<Airline[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  const q = params.get('q') ?? ''
  const division = params.get('division') ?? ''
  const country = params.get('country') ?? ''
  const [draft, setDraft] = useState(q)

  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setDivisions((data as Division[]) ?? []))
  }, [])

  // The box follows the URL when the URL changes from anywhere else -- the
  // Back button, or Clear all. Without this the input keeps text the user has
  // already cleared, and the next keystroke writes the stale value back.
  useEffect(() => setDraft(q), [q])

  // Debounce the free-text box into the URL, so the filters are shareable.
  // What the URL says right now, readable from inside a pending timeout.
  const qRef = useRef(q)
  useEffect(() => {
    qRef.current = q
  }, [q])

  useEffect(() => {
    const t = setTimeout(() => {
      // The debounce exists to push a CHANGE from the box into the URL. If the
      // box already says what the URL says, there is nothing to push -- and
      // writing anyway is what made Clear all fail: it cleared every filter,
      // then this fired 220ms later and rebuilt the query from a stale
      // snapshot, putting division and country back.
      if (draft === qRef.current) return
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (draft) next.set('q', draft)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    setRows(null)
    void (async () => {
      const { data } = await supabase.rpc('search_airlines', {
        p_query: q || null,
        p_division: division || null,
        p_country: country || null,
        p_limit: PAGE,
        p_offset: 0,
      })
      if (cancelled) return
      const list = (data as Airline[]) ?? []
      setRows(list)
      setMore(list.length === PAGE)
    })()
    return () => { cancelled = true }
  }, [q, division, country])

  const loadMore = async () => {
    if (!rows || busy) return
    setBusy(true)
    const { data } = await supabase.rpc('search_airlines', {
      p_query: q || null,
      p_division: division || null,
      p_country: country || null,
      p_limit: PAGE,
      p_offset: rows.length,
    })
    const list = (data as Airline[]) ?? []
    setRows([...rows, ...list])
    setMore(list.length === PAGE)
    setBusy(false)
  }

  const setFilter = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const clearAll = () => {
    setDraft('')
    setParams(new URLSearchParams())
  }

  /**
   * Every filter currently narrowing the list, each with its own way off.
   *
   * This is built from the FILTERS, never from the results. The country chips
   * used to be built from the rows that came back, so filtering down to a
   * country with one carrier collapsed the list to a single entry and the
   * whole row -- clear button included -- unmounted. Filtering down to NO
   * results removed it entirely, and the empty state then advised clearing
   * filters it had just taken the controls away for.
   */
  const active = [
    q ? { key: 'q', label: `“${q}”`, off: () => { setDraft(''); setFilter('q', '') } } : null,
    division
      ? {
          key: 'division',
          label:
            divisions.find((d) => d.division_code === division)?.division_name ?? division,
          off: () => setFilter('division', ''),
        }
      : null,
    country ? { key: 'country', label: country, off: () => setFilter('country', '') } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null)

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">The carriers</p>
      <h1 className="display mt-3 text-[clamp(36px,5vw,58px)]">Every airline in Echo</h1>
      <p className="mt-4 max-w-[62ch] text-lg text-ink-dim">
        590 member carriers across eight divisions. Filter by division or
        country, or search by name or code.
      </p>

      <div className="panel mt-8 p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by airline name, code or country…"
          className="w-full border border-edge bg-ground-2 px-4 py-3 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <div className="mono mt-3 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.1em]">
          <button
            onClick={() => setFilter('division', '')}
            className={`border px-2.5 py-1 transition-colors ${
              division === '' ? 'border-[color:var(--color-accent)] text-ink' : 'border-edge-soft text-ink-faint hover:text-ink-dim'
            }`}
          >
            All divisions
          </button>
          {divisions.map((d) => {
            const accent = accentOf(d)
            const on = division === d.division_code
            return (
              <button
                key={d.division_code}
                onClick={() => setFilter('division', on ? '' : d.division_code)}
                className="border px-2.5 py-1 transition-colors"
                style={{
                  borderColor: on ? accent : 'var(--color-edge-soft)',
                  color: on ? accent : 'var(--color-ink-faint)',
                }}
              >
                {d.division_name}
              </button>
            )
          })}
        </div>
        {(country || countries.length > 1) && (
          <div className="mono mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {country ? (
              <button
                onClick={clearAll}
                className="ml-1 uppercase tracking-[0.12em] text-ink-faint underline-offset-4 hover:text-ink hover:underline"
              >
                Clear all
              </button>
            ) : (
              countries.map(([c, n]) => (
                <button
                  key={c}
                  onClick={() => setFilter('country', c)}
                  className="border border-edge-soft px-2 py-0.5 text-ink-faint transition-colors hover:text-ink-dim"
                >
                  {c} <span className="text-ink-faint">{n}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="text-ink-dim">No carrier matches that.</p>
          {active.length > 0 && (
            <button onClick={clearAll} className="btn btn-ghost mt-4">
              Clear {active.length === 1 ? 'the filter' : 'all filters'}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mono mt-6 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            {num(rows.length)}{more ? '+' : ''} carriers
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((a) => <AirlineCard key={a.uid} a={a} />)}
          </div>
          {more && (
            <div className="mt-8 text-center">
              <button
                onClick={loadMore}
                disabled={busy}
                className="btn btn-ghost"
              >
                {busy ? 'Loading…' : 'Load more carriers'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

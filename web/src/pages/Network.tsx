import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RouteMap from '../components/RouteMap'
import { Loading, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { AirportRoute, AirportRow, Arc, Division, NetworkNode } from '../lib/types'
import { accentOf, num } from '../lib/format'

/** The whole alliance drawn at once, with the busiest airports beside it. */
export default function NetworkPage() {
  const [arcs, setArcs] = useState<Arc[]>([])
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [busiest, setBusiest] = useState<AirportRow[]>([])
  const [focus, setFocus] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // When an airport is picked the globe shows only what it reaches, coloured
  // by whichever division flies each route most.
  const [pinned, setPinned] = useState<string | null>(null)
  const [fanned, setFanned] = useState<Arc[] | null>(null)

  const pickAirport = async (iata: string) => {
    setPinned(iata)
    setFanned(null)
    const { data } = await supabase.rpc('airport_routes', { p_iata: iata })
    setFanned(
      ((data as AirportRoute[]) ?? []).map((r) => ({
        origin_iata: r.origin_iata,
        destination_iata: r.destination_iata,
        division_code: r.division_code,
        weekly_departures: Number(r.weekly_departures),
        carriers: Number(r.carriers),
        origin_lat: r.origin_lat,
        origin_lon: r.origin_lon,
        dest_lat: r.dest_lat,
        dest_lon: r.dest_lon,
        accent_color: r.accent_color,
      })),
    )
  }

  useEffect(() => {
    if (!isConfigured) return
    void (async () => {
      const [a, n, d, b] = await Promise.all([
        supabase
          .from('mv_network_arcs')
          .select('*')
          .order('weekly_departures', { ascending: false })
          .limit(1200),
        supabase.from('mv_network_nodes').select('*').limit(900),
        supabase.from('v_division_summary').select('*').order('sort_order'),
        supabase
          .from('mv_airport_directory')
          .select('*')
          .order('weekly_departures', { ascending: false })
          .limit(25),
      ])
      setArcs((a.data as Arc[]) ?? [])
      setNodes((n.data as NetworkNode[]) ?? [])
      setDivisions((d.data as Division[]) ?? [])
      setBusiest((b.data as AirportRow[]) ?? [])
      setReady(true)
    })()
  }, [])

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12">
      <p className="eyebrow text-cyan">Network</p>
      <h1 className="display mt-3 text-[clamp(36px,5vw,58px)]">The alliance, drawn</h1>
      <p className="mt-4 max-w-[64ch] text-lg text-ink-dim">
        The 1,200 busiest city pairs Echo flies, coloured by the division that
        operates them. Drag to turn the globe; pick a division to light only its
        routes.
      </p>

      {pinned && (
        <div className="panel mt-6 flex flex-wrap items-center gap-4 p-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
              Fanned out from
            </div>
            <div className="mono text-xl text-cyan">{pinned}</div>
          </div>
          <div className="mono text-[12px] text-ink-dim">
            {fanned === null ? 'loading…' : `${fanned.length} destinations`}
          </div>
          <div className="ml-auto flex gap-2">
            <Link
              to={`/airports/${pinned}`}
              className="mono border border-edge px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-ink hover:border-accent"
            >
              Carriers here
            </Link>
            <button
              onClick={() => { setPinned(null); setFanned(null) }}
              className="mono border border-edge px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
            >
              Show whole network
            </button>
          </div>
        </div>
      )}

      <div className="mono mt-7 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.1em]">
        <button
          onClick={() => setFocus(null)}
          className={`border px-2.5 py-1 transition-colors ${
            focus === null
              ? 'border-[color:var(--color-accent)] text-ink'
              : 'border-edge-soft text-ink-faint hover:text-ink-dim'
          }`}
        >
          Whole alliance
        </button>
        {divisions.map((d) => {
          const accent = accentOf(d)
          const on = focus === d.division_code
          return (
            <button
              key={d.division_code}
              onClick={() => setFocus(on ? null : d.division_code)}
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

      {!ready ? (
        <Loading label="Drawing the network" />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          <RouteMap
            arcs={pinned && fanned ? fanned : arcs}
            nodes={nodes}
            highlightDivision={pinned ? null : focus}
            focusedAirport={pinned}
            onPickAirport={pickAirport}
            className="w-full"
            
          />
          <div>
            <h2 className="display text-2xl">Busiest airports</h2>
            <p className="mt-1 text-ink-faint">By weekly alliance departures</p>
            <div className="panel mt-4 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    {['', 'City', 'Carriers', 'Weekly'].map((h) => (
                      <th
                        key={h}
                        className="mono px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {busiest.map((a) => (
                    <tr key={a.iata_code} className="border-t border-edge-soft">
                      <td className="mono px-3 py-2">
                        <Link to={`/airports/${a.iata_code}`} className="text-cyan">
                          {a.iata_code}
                        </Link>
                      </td>
                      <td className="truncate px-3 py-2 text-ink">{a.city_name ?? '—'}</td>
                      <td className="mono px-3 py-2 text-ink-dim">{num(a.carriers)}</td>
                      <td className="mono px-3 py-2 text-ink-dim">
                        {num(a.weekly_departures)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

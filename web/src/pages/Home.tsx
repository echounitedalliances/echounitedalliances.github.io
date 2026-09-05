import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RouteMap from '../components/RouteMap'
import SplitFlap from '../components/SplitFlap'
import type { BoardRow } from '../components/SplitFlap'
import SearchPanel from '../components/SearchPanel'
import Join from '../components/Join'
import { AirlineCard, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { Airline, Arc, BoardDeparture, Division, NetworkNode } from '../lib/types'
import { accentOf, num } from '../lib/format'

/**
 * Identity, then the divisions, then the search — in that order, because this
 * is a page about an alliance that happens to sell tickets, not a booking site
 * that happens to have members.
 */
export default function Home() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [arcs, setArcs] = useState<Arc[]>([])
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [spotlight, setSpotlight] = useState<Airline[]>([])
  const [board, setBoard] = useState<BoardRow[]>([])

  useEffect(() => {
    if (!isConfigured) return
    void (async () => {
      const [d, a, n, s, b] = await Promise.all([
        supabase.from('v_division_summary').select('*').order('sort_order'),
        supabase.from('mv_network_arcs').select('*').order('weekly_departures', { ascending: false }).limit(900),
        supabase.from('mv_network_nodes').select('*').limit(700),
        supabase.rpc('search_airlines', { p_limit: 6, p_offset: 0 }),
        supabase.rpc('board_departures', { p_limit: 8 }),
      ])
      setDivisions((d.data as Division[]) ?? [])
      setArcs((a.data as Arc[]) ?? [])
      setNodes((n.data as NetworkNode[]) ?? [])
      setSpotlight((s.data as Airline[]) ?? [])
      setBoard(
        ((b.data as BoardDeparture[]) ?? []).map((r) => ({
          time: r.departure_time,
          flight: r.flight_designator,
          destination: r.destination_city,
          carrier: r.airline_name ?? r.carrier_code,
          status: 'BOARDING',
          accent: r.accent_color,
        })),
      )
    })()
  }, [])

  const totals = divisions.reduce(
    (acc, d) => ({
      carriers: acc.carriers + Number(d.carriers),
      aircraft: acc.aircraft + Number(d.aircraft),
      routes: acc.routes + Number(d.routes),
    }),
    { carriers: 0, aircraft: 0, routes: 0 },
  )

  if (!isConfigured) return <NotConfigured />

  return (
    <>
      {/* ---------- identity ---------- */}
      <section className="aurora relative overflow-hidden border-b border-edge-soft">
        <div className="mx-auto grid max-w-[1180px] items-center gap-8 px-5 pt-14 pb-12 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="rise">
            <p className="eyebrow text-cyan">Echo United Alliances</p>
            <h1 className="display mt-4 text-[clamp(44px,7vw,82px)]">
              Eight divisions.
              <br />
              <span style={{ color: 'var(--color-accent)' }}>590 airlines.</span>
              <br />
              One network.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-ink-dim">
              The largest alliance group in The Airline Simulator, drawn in full
              for the first time — every carrier, every hub, and every route
              they fly between them.
            </p>

            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
              {[
                ['Carriers', totals.carriers],
                ['Aircraft', totals.aircraft],
                ['Routes', totals.routes],
                ['Airports', 2187],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="mono text-2xl text-ink">{num(value as number)}</div>
                  <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/divisions" className="btn btn-primary">
                Meet the divisions
              </Link>
              <Link to="/airlines" className="btn btn-ghost">
                All 590 carriers
              </Link>
            </div>
          </div>

          <div className="relative">
            {board.length > 0 ? (
              <SplitFlap rows={board} />
            ) : (
              <div className="board">
                <div className="mono py-16 text-center text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                  Reading the board…
                </div>
              </div>
            )}
            <p className="mono mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              Live departures from the alliance schedule
            </p>
          </div>
        </div>
      </section>

      {/* ---------- the divisions ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="display text-3xl">The divisions</h2>
          <Link to="/divisions" className="mono text-[11px] uppercase tracking-[0.14em] text-cyan">
            All eight →
          </Link>
        </div>
        <p className="mt-2 max-w-[62ch] text-ink-dim">
          Each division is an alliance in its own right. Together they form Echo.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {divisions.map((d, i) => {
            const accent = accentOf(d)
            return (
              <Link
                key={d.division_code}
                to={`/d/${d.division_code}`}
                className="panel lift rise group relative overflow-hidden p-5"
                style={{ animationDelay: `${i * 45}ms`, ['--card-accent' as string]: accent }}
              >
                <span
                  className="absolute inset-x-0 top-0 h-[2px]"
                  style={{ background: accent }}
                />
                <div className="display text-2xl" style={{ color: accent }}>
                  {d.division_name}
                </div>
                <div className="mono mt-3 space-y-1 text-[11px] text-ink-dim">
                  <div>{num(d.carriers)} carriers</div>
                  <div>{num(d.aircraft)} aircraft</div>
                  <div>{num(d.routes)} routes</div>
                </div>
                {d.top_hubs && d.top_hubs.length > 0 && (
                  <div className="mono mt-3 truncate text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    {d.top_hubs.slice(0, 4).join(' · ')}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </section>

      {/* ---------- the network, as a flat map ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="display text-3xl">Where Echo flies</h2>
          <Link to="/network" className="mono text-[11px] uppercase tracking-[0.14em] text-cyan">
            Explore the network →
          </Link>
        </div>
        <p className="mt-2 max-w-[62ch] text-ink-dim">
          The busiest city pairs the alliance operates, coloured by division.
        </p>
        <div className="panel mt-6 overflow-hidden">
          <RouteMap arcs={arcs} nodes={nodes} className="w-full" maxArcs={320} />
        </div>
      </section>

      {/* ---------- join: the expected path is site -> Discord ---------- */}
      <Join />

      {/* ---------- search ---------- */}
      <section className="border-y border-edge-soft bg-ground-2">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <h2 className="display text-3xl">Fly the whole alliance</h2>
          <p className="mt-2 max-w-[62ch] text-ink-dim">
            One search across all 590 carriers. Connections are built across
            divisions, so a journey no single airline flies is still one
            itinerary and one booking reference.
          </p>
          <div className="mt-6">
            <SearchPanel />
          </div>
        </div>
      </section>

      {/* ---------- spotlight ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="display text-3xl">Carriers in the group</h2>
          <Link to="/airlines" className="mono text-[11px] uppercase tracking-[0.14em] text-cyan">
            Browse all →
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spotlight.map((a) => (
            <AirlineCard key={a.uid} a={a} />
          ))}
        </div>
      </section>
    </>
  )
}

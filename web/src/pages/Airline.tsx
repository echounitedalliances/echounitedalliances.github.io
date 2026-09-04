import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RouteMap from '../components/RouteMap'
import { Loading, Mark, NotConfigured } from '../components/ui'
import { isConfigured, supabase } from '../lib/supabase'
import type { Airline, Arc, FleetRow, NetworkNode, RouteRow, TimetableRow } from '../lib/types'
import { accentOf, duration, flag, num, usd } from '../lib/format'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function AirlinePage() {
  const { code = '', slug = '' } = useParams()
  const [a, setA] = useState<Airline | null>(null)
  const [fleet, setFleet] = useState<FleetRow[]>([])
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [arcs, setArcs] = useState<Arc[]>([])
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [missing, setMissing] = useState(false)
  const [timetable, setTimetable] = useState<TimetableRow[] | null>(null)
  const [ttAirport, setTtAirport] = useState<string>('')

  useEffect(() => {
    if (!isConfigured) return
    setA(null)
    setMissing(false)
    void (async () => {
      const { data } = await supabase
        .from('v_airline_profile')
        .select('*')
        .eq('division_code', code)
        .eq('airline_slug', slug)
        .maybeSingle()
      const air = data as Airline | null
      if (!air) {
        setMissing(true)
        return
      }
      setA(air)

      const [f, r, t] = await Promise.all([
        supabase
          .from('v_fleet')
          .select('aircraft_model, manufacturer, aircraft_count')
          .eq('airline_uid', air.uid)
          .order('aircraft_count', { ascending: false }),
        supabase
          .from('v_routes')
          .select('origin_iata, destination_iata, departures_per_week, fastest_minutes, cheapest_economy_usd')
          .eq('airline_uid', air.uid)
          .order('departures_per_week', { ascending: false })
          .limit(400),
        supabase.rpc('airline_timetable', { p_uid: air.uid, p_airport: null }),
      ])
      setTimetable((t.data as TimetableRow[]) ?? [])
      const routeRows = (r.data as RouteRow[]) ?? []
      setFleet((f.data as FleetRow[]) ?? [])
      setRoutes(routeRows)

      // Draw this carrier's own network: look up the coordinates for the
      // airports it actually touches, then build arcs from its routes.
      const codes = Array.from(
        new Set(routeRows.flatMap((x) => [x.origin_iata, x.destination_iata])),
      ).slice(0, 400)
      if (codes.length) {
        const { data: pts } = await supabase
          .from('mv_airport_directory')
          .select('iata_code, city_name, country_code, latitude, longitude, weekly_departures, carriers, hub_for')
          .in('iata_code', codes)
        const byCode = new Map(
          ((pts as NetworkNode[]) ?? []).map((p) => [p.iata_code, p]),
        )
        setNodes(Array.from(byCode.values()).filter((p) => p.latitude != null))
        const accent = accentOf(air)
        setArcs(
          routeRows
            .map((x) => {
              const o = byCode.get(x.origin_iata)
              const d = byCode.get(x.destination_iata)
              if (!o || !d || o.latitude == null || d.latitude == null) return null
              return {
                origin_iata: x.origin_iata,
                destination_iata: x.destination_iata,
                division_code: air.division_code,
                weekly_departures: x.departures_per_week,
                carriers: 1,
                origin_lat: o.latitude,
                origin_lon: o.longitude,
                dest_lat: d.latitude,
                dest_lon: d.longitude,
                accent_color: accent,
              } as Arc
            })
            .filter(Boolean) as Arc[],
        )
      }
    })()
  }, [code, slug])

  if (!isConfigured) return <NotConfigured />
  if (missing) {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-24 text-center">
        <h1 className="display text-4xl">No such carrier</h1>
        <Link to="/airlines" className="mono mt-6 inline-block text-cyan">
          ← All carriers
        </Link>
      </div>
    )
  }
  if (!a) return <Loading label="Loading carrier" />

  const accent = accentOf(a)
  const named = a.airline_name?.trim()
  const shown = (timetable ?? []).filter(
    (t) => !ttAirport || t.origin_iata === ttAirport,
  )

  return (
    <div>
      <section className="relative overflow-hidden border-b border-edge-soft">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(700px 320px at 80% 25%, ${accent}18, transparent 70%)` }}
        />
        <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <Link
              to={`/d/${a.division_code}`}
              className="mono text-[11px] uppercase tracking-[0.14em]"
              style={{ color: accent }}
            >
              ← {a.division_name} division
            </Link>

            <div className="mt-5 flex items-start gap-4">
              <Mark airline={a} size={62} />
              <div className="min-w-0">
                <h1 className="display text-[clamp(32px,4.6vw,52px)]">
                  {named || 'Unnamed carrier'}
                </h1>
                <div className="mono mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-faint">
                  <span style={{ color: accent }}>{a.carrier_code}</span>
                  {a.airline_code && a.airline_code !== a.carrier_code && (
                    <span>in-game code {a.airline_code}</span>
                  )}
                  {a.airline_country && (
                    <span>{flag(a.airline_country)} {a.airline_country}</span>
                  )}
                  {a.is_division_leader && (
                    <span className="border border-edge px-2 py-0.5 uppercase tracking-[0.12em]">
                      Division leader
                    </span>
                  )}
                </div>
              </div>
            </div>

            {a.description && (
              <p className="mt-5 max-w-[62ch] text-lg text-ink-dim">{a.description}</p>
            )}

            <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              {[
                ['Aircraft', num(a.fleet_size)],
                ['Types', num(a.aircraft_types)],
                ['Routes', num(a.routes)],
                ['Destinations', num(a.destinations)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="mono text-2xl" style={{ color: accent }}>{v}</div>
                  <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">{l}</div>
                </div>
              ))}
            </div>

            {a.hubs && a.hubs.length > 0 && (
              <div className="mt-7">
                <div className="eyebrow mb-2 text-ink-faint">Hubs</div>
                <div className="flex flex-wrap gap-2">
                  {a.hubs.map((h) => (
                    <Link
                      key={h}
                      to={`/airports/${h}`}
                      className="mono border px-2.5 py-1 text-[12px] transition-colors"
                      style={{ borderColor: `${accent}44`, color: accent }}
                    >
                      {h}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Booking handoff: their own site if they have one, otherwise say so. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {a.booking_url ? (
                <a
                  href={a.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713]"
                  style={{ background: accent }}
                >
                  Book with {named ?? a.carrier_code} ↗
                </a>
              ) : (
                <span className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  Contact airline for booking
                </span>
              )}
              {a.website_url && (
                <a
                  href={a.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
                >
                  Website ↗
                </a>
              )}
            </div>
          </div>

          <div>
            <RouteMap
              arcs={arcs}
              nodes={nodes}
              className="w-full"
              
              focusedAirport={ttAirport || null}
              onPickAirport={(iata) => setTtAirport(iata)}
            />
            <p className="mono mt-1 text-center text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              {num(routes.length)} routes · click an airport to filter the timetable
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 lg:grid-cols-2">
        <div>
          <h2 className="display text-2xl">Fleet</h2>
          <p className="mt-1 text-ink-faint">
            {num(a.fleet_size)} aircraft across {num(a.aircraft_types)} types
          </p>
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-left">
                  <th className="mono px-4 py-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">Type</th>
                  <th className="mono px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] text-ink-faint">Count</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((f) => (
                  <tr key={f.aircraft_model} className="border-t border-edge-soft">
                    <td className="px-4 py-2 text-ink">{f.aircraft_model}</td>
                    <td className="mono px-4 py-2 text-right text-ink-dim">{f.aircraft_count}</td>
                  </tr>
                ))}
                {fleet.length === 0 && (
                  <tr><td className="px-4 py-6 text-ink-faint" colSpan={2}>No fleet recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="display text-2xl">Busiest routes</h2>
          <p className="mt-1 text-ink-faint">By departures a week</p>
          <div className="panel mt-4 max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-surface-2 text-left">
                  <th className="mono px-4 py-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">Route</th>
                  <th className="mono px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] text-ink-faint">Weekly</th>
                  <th className="mono px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] text-ink-faint">Block</th>
                  <th className="mono px-4 py-2 text-right text-[10px] uppercase tracking-[0.1em] text-ink-faint">From</th>
                </tr>
              </thead>
              <tbody>
                {routes.slice(0, 60).map((r, i) => (
                  <tr key={`${r.origin_iata}-${r.destination_iata}-${i}`} className="border-t border-edge-soft">
                    <td className="mono px-4 py-2 text-ink">
                      <Link to={`/airports/${r.origin_iata}`} className="hover:text-cyan">{r.origin_iata}</Link>
                      <span className="text-ink-faint"> → </span>
                      <Link to={`/airports/${r.destination_iata}`} className="hover:text-cyan">{r.destination_iata}</Link>
                    </td>
                    <td className="mono px-4 py-2 text-right text-ink-dim">{r.departures_per_week}</td>
                    <td className="mono px-4 py-2 text-right text-ink-dim">{duration(r.fastest_minutes)}</td>
                    <td className="mono px-4 py-2 text-right text-ink-dim">{usd(r.cheapest_economy_usd)}</td>
                  </tr>
                ))}
                {routes.length === 0 && (
                  <tr><td className="px-4 py-6 text-ink-faint" colSpan={4}>No routes filed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 pb-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-2xl">Timetable</h2>
          <div className="mono flex items-center gap-2 text-[11px]">
            {ttAirport && (
              <button
                onClick={() => setTtAirport('')}
                className="border border-edge px-2.5 py-1 uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
              >
                {ttAirport} ×
              </button>
            )}
            <span className="text-ink-faint">
              {timetable ? `${num(shown.length)} services` : ''}
            </span>
          </div>
        </div>
        <p className="mt-1 text-ink-faint">
          Departure times are local to the departure airport. 0 = Monday.
        </p>

        {timetable === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <p className="panel mt-4 p-8 text-center text-ink-dim">
            No scheduled services{ttAirport ? ` from ${ttAirport}` : ''}.
          </p>
        ) : (
          <div className="panel mt-4 max-h-[560px] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0">
                <tr className="bg-surface-2 text-left">
                  {['Flight', 'Route', 'Departs', 'Arrives', 'Duration', 'Days', 'Aircraft', 'From'].map((h) => (
                    <th key={h} className="mono px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((t, i) => (
                  <tr key={t.flight_designator + i} className="border-t border-edge-soft">
                    <td className="mono px-3 py-2 text-cyan">{t.flight_designator}</td>
                    <td className="mono px-3 py-2 text-ink">
                      {t.origin_iata} → {t.destination_iata}
                    </td>
                    <td className="mono px-3 py-2 text-ink-dim">{t.departure_time.slice(0, 5)}</td>
                    <td className="mono px-3 py-2 text-ink-dim">
                      {t.arrival_time.slice(0, 5)}
                      {t.arrival_days_after > 0 && (
                        <sup className="ml-0.5 text-cyan">+{t.arrival_days_after}</sup>
                      )}
                    </td>
                    <td className="mono px-3 py-2 text-ink-dim">{duration(t.duration_minutes)}</td>
                    <td className="mono px-3 py-2">
                      <span className="inline-flex gap-0.5">
                        {DAYS.map((d, di) => (
                          <span
                            key={d}
                            title={d}
                            className="inline-block w-[15px] text-center text-[10px]"
                            style={{
                              color: t.days.includes(di) ? accent : 'var(--color-ink-faint)',
                              opacity: t.days.includes(di) ? 1 : 0.3,
                            }}
                          >
                            {d}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-ink-faint">{t.aircraft_model ?? '—'}</td>
                    <td className="mono px-3 py-2 text-right text-ink-dim">{usd(t.economy_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

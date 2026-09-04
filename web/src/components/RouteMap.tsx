import { useMemo, useState } from 'react'
import type { Arc, NetworkNode } from '../lib/types'

/**
 * The network as a flat map.
 *
 * This replaces a WebGL globe that could not be made to behave: it held a
 * render loop alive for the life of the page and stuttered on ordinary
 * laptops. What is here instead is static SVG. It draws once, animates
 * nothing, and costs the browser nothing after paint. Hovering is a CSS
 * state, and picking an airport is a click handler.
 *
 * Equirectangular projection, which is the honest choice for a route map: it
 * distorts area badly at the poles, but the alliance flies almost nothing
 * above 70 degrees and the arcs stay readable.
 */

const W = 1000
const H = 500

const project = (lat: number, lon: number): [number, number] => [
  ((lon + 180) / 360) * W,
  ((90 - lat) / 180) * H,
]

/**
 * A curved path between two points. The bow is proportional to the distance so
 * short hops stay nearly straight and long-haul sweeps, and it always bends the
 * same way, which keeps a busy map from looking like scribble.
 */
function arcPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy)
  const bow = Math.min(dist * 0.22, 90)
  // control point offset perpendicular to the line, always toward the pole
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const nx = -dy / (dist || 1)
  const ny = dx / (dist || 1)
  const sign = y1 + y2 < H ? 1 : -1
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + nx * bow * sign).toFixed(1)} ${(
    my + ny * bow * sign
  ).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

type Props = {
  arcs: Arc[]
  nodes: NetworkNode[]
  highlightDivision?: string | null
  focusedAirport?: string | null
  onPickAirport?: (iata: string) => void
  className?: string
  /** Cap on drawn arcs. The DOM, not the GPU, is the limit here. */
  maxArcs?: number
}

export default function RouteMap({
  arcs,
  nodes,
  highlightDivision = null,
  focusedAirport = null,
  onPickAirport,
  className = '',
  maxArcs = 400,
}: Props) {
  const [hover, setHover] = useState<NetworkNode | null>(null)

  const paths = useMemo(() => {
    return arcs.slice(0, maxArcs).map((a, i) => {
      const [x1, y1] = project(a.origin_lat, a.origin_lon)
      const [x2, y2] = project(a.dest_lat, a.dest_lon)
      const dim = highlightDivision != null && a.division_code !== highlightDivision
      return {
        key: `${a.origin_iata}-${a.destination_iata}-${i}`,
        d: arcPath(x1, y1, x2, y2),
        color: a.accent_color || '#A855F7',
        opacity: dim ? 0.07 : 0.42,
        width: dim ? 0.5 : 0.7,
      }
    })
  }, [arcs, highlightDivision, maxArcs])

  const points = useMemo(
    () =>
      nodes.slice(0, 700).map((n) => {
        const [x, y] = project(n.latitude, n.longitude)
        return { n, x, y, r: Math.min(1.1 + Math.log10(n.weekly_departures + 1) * 0.8, 4) }
      }),
    [nodes],
  )

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        style={{ background: '#0A0614' }}
        role="img"
        aria-label={`Alliance route map, ${arcs.length} city pairs`}
      >
        {/* graticule: enough to read the map as a map, cheap to draw */}
        <g stroke="var(--color-edge-soft)" strokeWidth="0.4" opacity="0.5">
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = ((90 - lat) / 180) * H
            return <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y} />
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const x = ((lon + 180) / 360) * W
            return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={H} />
          })}
        </g>

        <g fill="none" strokeLinecap="round">
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.width}
              opacity={p.opacity}
            />
          ))}
        </g>

        <g>
          {points.map((p) => {
            const focused = focusedAirport === p.n.iata_code
            return (
              <circle
                key={p.n.iata_code}
                cx={p.x}
                cy={p.y}
                r={focused ? p.r + 2.5 : p.r}
                fill={focused ? 'var(--color-cyan)' : '#9EE8F5'}
                opacity={focused ? 1 : 0.75}
                style={{ cursor: onPickAirport ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(p.n)}
                onMouseLeave={() => setHover((h) => (h === p.n ? null : h))}
                onClick={() => onPickAirport?.(p.n.iata_code)}
              >
                <title>
                  {p.n.iata_code} · {p.n.city_name ?? ''} · {p.n.carriers} carriers
                </title>
              </circle>
            )
          })}
        </g>
      </svg>

      {hover && (
        <div className="panel pointer-events-none absolute bottom-2 left-2 px-3 py-2">
          <div className="mono text-[11px] tracking-[0.14em] text-cyan">{hover.iata_code}</div>
          <div className="text-sm text-ink">{hover.city_name ?? '—'}</div>
          <div className="mono text-[11px] text-ink-faint">
            {hover.carriers} carriers · {hover.weekly_departures.toLocaleString('en-GB')} weekly
          </div>
        </div>
      )}

      {focusedAirport && (
        <div className="panel absolute right-2 top-2 px-3 py-2">
          <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            Routes from
          </div>
          <div className="mono text-lg text-cyan">{focusedAirport}</div>
        </div>
      )}
    </div>
  )
}

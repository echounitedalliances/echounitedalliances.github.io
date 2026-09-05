import { useEffect, useMemo, useRef, useState } from 'react'
import type { Arc, NetworkNode } from '../lib/types'

/**
 * The network as a flat map.
 *
 * This replaces a WebGL globe that could not be made to behave: it held a
 * render loop alive for the life of the page and stuttered on ordinary
 * laptops. What is here instead is static SVG. It draws once and costs the
 * browser nothing after paint.
 *
 * Picking an airport zooms to it. The zoom is a transform on one <g> with a
 * CSS transition, which the compositor animates by itself — so there is still
 * no render loop, and still nothing running once it settles. Everything that
 * should stay a constant size on screen (stroke widths, dot radii, label text)
 * is divided by the scale, because a transform scales those too and a 4.5x
 * zoom would otherwise turn every route into a ribbon.
 *
 * Equirectangular projection, which is the honest choice for a route map: it
 * distorts area badly at the poles, but the alliance flies almost nothing
 * above 70 degrees and the arcs stay readable.
 */

const W = 1000
const H = 500

/** How far in a picked airport pulls the map. */
const ZOOM = 4.5

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
  /** Zoom to the focused airport. Off for the small decorative maps. */
  zoomOnFocus?: boolean
}

export default function RouteMap({
  arcs,
  nodes,
  highlightDivision = null,
  focusedAirport = null,
  onPickAirport,
  className = '',
  maxArcs = 400,
  zoomOnFocus = false,
}: Props) {
  const [hover, setHover] = useState<NetworkNode | null>(null)

  /**
   * How wide the map is actually drawn, so lines and labels can be sized in
   * screen pixels rather than map units.
   *
   * Without this the same strokeWidth is a fat ribbon on a full-width map and
   * sub-pixel on a phone: a user unit is 1.14px at 1140 wide and 0.38px at
   * 380. A ResizeObserver fires on layout changes only -- no polling, nothing
   * running while the map sits still.
   */
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(W)
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width || W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = useMemo(
    () =>
      nodes.slice(0, 700).map((n) => {
        const [x, y] = project(n.latitude, n.longitude)
        return { n, x, y, r: Math.min(1.1 + Math.log10(n.weekly_departures + 1) * 0.8, 4) }
      }),
    [nodes],
  )

  /**
   * The transform, and the scale everything else divides by.
   *
   * Clamped to the map's own bounds so a hub near an edge does not drag empty
   * space into frame — Anchorage and Auckland would otherwise leave a third of
   * the picture blank.
   */
  const view = useMemo(() => {
    const target =
      zoomOnFocus && focusedAirport
        ? points.find((p) => p.n.iata_code === focusedAirport)
        : undefined
    if (!target) return { scale: 1, tx: 0, ty: 0, zoomed: false }
    const s = ZOOM
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
    return {
      scale: s,
      tx: clamp(W / 2 - target.x * s, W - W * s, 0),
      ty: clamp(H / 2 - target.y * s, H - H * s, 0),
      zoomed: true,
    }
  }, [zoomOnFocus, focusedAirport, points])

  const k = view.scale
  // map units per screen pixel, at the current zoom
  const unit = W / Math.max(boxW, 1) / k
  const px = (n: number) => n * unit

  /**
   * Which points are actually on screen at this zoom, in world units.
   *
   * Only used to decide what to label. Zooming to LHR and then writing 700
   * codes, 660 of them outside the frame, is DOM spent on nothing — and the
   * ones that are in frame read better without their neighbours crowding in,
   * so quiet airports stay unlabelled and the busy ones get named.
   */
  const labelled = useMemo(() => {
    if (!view.zoomed) return new Set<string>()
    const pad = 12 / k
    const x0 = -view.tx / k - pad
    const x1 = (-view.tx + W) / k + pad
    const y0 = -view.ty / k - pad
    const y1 = (-view.ty + H) / k + pad
    // A narrow map fits fewer names before they collide, so it gets stricter
    // about which airports are worth one, and there is a hard cap either way.
    const floor = boxW < 560 ? 3 : 2.4
    const cap = boxW < 560 ? 14 : 40
    const inFrame = points
      .filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
      .filter((p) => p.n.iata_code === focusedAirport || p.r >= floor)
      .sort((a, b) => b.r - a.r)
      .slice(0, cap)
    return new Set(inFrame.map((p) => p.n.iata_code))
  }, [view, k, points, focusedAirport, boxW])

  const paths = useMemo(
    () =>
      arcs.slice(0, maxArcs).map((a, i) => {
        const [x1, y1] = project(a.origin_lat, a.origin_lon)
        const [x2, y2] = project(a.dest_lat, a.dest_lon)
        return {
          key: `${a.origin_iata}-${a.destination_iata}-${i}`,
          d: arcPath(x1, y1, x2, y2),
          color: a.accent_color || '#A855F7',
          dim: highlightDivision != null && a.division_code !== highlightDivision,
        }
      }),
    [arcs, highlightDivision, maxArcs],
  )

  // Zoomed in there are far fewer routes on screen, so they can afford to be
  // drawn properly rather than as the faint wash a whole-world view needs.
  const lineOpacity = view.zoomed ? 0.85 : 0.42
  const lineWidth = px(view.zoomed ? 1.9 : 0.85)
  const dimOpacity = view.zoomed ? 0.14 : 0.07

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        style={{ background: '#0A0614' }}
        role="img"
        aria-label={`Alliance route map, ${arcs.length} city pairs`}
      >
        <g
          transform={`translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${k})`}
          style={{ transition: 'transform 620ms cubic-bezier(.32,.72,.24,1)' }}
        >
          {/* graticule: enough to read the map as a map, cheap to draw */}
          <g stroke="var(--color-edge-soft)" strokeWidth={px(0.5)} opacity="0.5">
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
                strokeWidth={p.dim ? px(0.6) : lineWidth}
                opacity={p.dim ? dimOpacity : lineOpacity}
              />
            ))}
          </g>

          <g>
            {points.map((p) => {
              const focused = focusedAirport === p.n.iata_code
              // dots in screen pixels too, or they vanish on a phone
              const r = px((focused ? p.r + 2.5 : p.r) * 1.2)
              return (
                <g key={p.n.iata_code}>
                  {focused && view.zoomed && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r * 2.6}
                      fill="none"
                      stroke="var(--color-cyan)"
                      strokeWidth={px(1.2)}
                      opacity="0.5"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
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
                  {/* Codes are only legible once zoomed, and only drawn for
                      what is in frame and worth naming. */}
                  {labelled.has(p.n.iata_code) && (
                    <text
                      x={p.x + r + px(3)}
                      y={p.y + px(3.4)}
                      fill={focused ? 'var(--color-cyan)' : '#B6AAD6'}
                      fontSize={px(10)}
                      fontFamily="var(--font-mono)"
                      style={{ pointerEvents: 'none' }}
                    >
                      {p.n.iata_code}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
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

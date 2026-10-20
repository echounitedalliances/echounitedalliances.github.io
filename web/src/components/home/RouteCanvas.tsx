import { useEffect, useRef } from 'react'
import type { Arc } from '../../lib/types'
import { WORLD_OUTLINE_PATH } from '../../lib/worldOutline'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * Echo's real routes on a canvas, two ways.
 *
 *   hero:    every line in faint white, drawn in on arrival, with small
 *            lights travelling along them. Like contour lines behind the
 *            headline; no land, no colour.
 *   network: the same routes in their division's colour over the coastline,
 *            drawn in the first time the map scrolls into view.
 *
 * Equirectangular, the same projection as RouteMap and worldOutline: x and
 * y are linear in longitude and latitude, so no projection library.
 */

type Mode = 'hero' | 'network'

type Pt = { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number; color: string }

function curve(a: Arc, W: number, H: number, lift: number, ox = 0, oy = 0): Pt | null {
  const x1 = ((a.origin_lon + 180) / 360) * W + ox
  const y1 = ((90 - a.origin_lat) / 180) * H + oy
  const x2 = ((a.dest_lon + 180) / 360) * W + ox
  const y2 = ((90 - a.dest_lat) / 180) * H + oy
  // A pair that crosses the date line would be drawn the long way round.
  if (Math.abs(x2 - x1) > W / 2) return null
  const dx = x2 - x1
  const dy = y2 - y1
  const L = Math.hypot(dx, dy)
  return {
    x1, y1, x2, y2,
    cx: (x1 + x2) / 2 - dy * lift,
    cy: (y1 + y2) / 2 + dx * lift - L * lift,
    color: a.accent_color || '#F4F2EE',
  }
}

function at(p: Pt, u: number): [number, number] {
  const v = 1 - u
  return [v * v * p.x1 + 2 * v * u * p.cx + u * u * p.x2, v * v * p.y1 + 2 * v * u * p.cy + u * u * p.y2]
}

export default function RouteCanvas({
  arcs,
  mode,
  className = '',
  label,
}: {
  arcs: Arc[]
  mode: Mode
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c || arcs.length === 0) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const reduce = prefersReducedMotion()
    const land = mode === 'network' ? new Path2D(WORLD_OUTLINE_PATH) : null
    const list = mode === 'hero' ? arcs.slice(0, 420) : arcs

    let W = 0
    let H = 0
    let pts: Pt[] = []
    let start = 0
    let raf = 0
    let visible = false

    const layout = () => {
      const r = c.getBoundingClientRect()
      const k = Math.min(window.devicePixelRatio || 1, 2)
      W = r.width
      H = r.height
      c.width = Math.round(W * k)
      c.height = Math.round(H * k)
      ctx.setTransform(k, 0, 0, k, 0, 0)
      if (mode === 'hero') {
        // Wider than the screen and nudged up, so the busy north Atlantic and
        // Europe sit behind the headline rather than the empty Pacific.
        const mapW = Math.max(W * 1.35, H * 2.4)
        const mapH = mapW / 2
        const ox = (W - mapW) / 2 - mapW * 0.04
        const oy = (H - mapH) / 2 - H * 0.08
        pts = list.map((a) => curve(a, mapW, mapH, 0.18, ox, oy)).filter((p): p is Pt => !!p)
      } else {
        pts = list.map((a) => curve(a, W, H, 0.15)).filter((p): p is Pt => !!p)
      }
    }

    const draw = (now: number) => {
      if (!start) start = now
      const t = reduce ? 1 : Math.min(1, (now - start) / (mode === 'hero' ? 2800 : 2200))
      ctx.clearRect(0, 0, W, H)

      if (land) {
        ctx.save()
        ctx.scale(W / 1000, H / 500)
        ctx.fillStyle = '#141414'
        ctx.fill(land)
        ctx.restore()
      }

      ctx.lineWidth = mode === 'hero' ? 1 : 0.8
      if (mode === 'network') ctx.globalCompositeOperation = 'lighter'
      pts.forEach((p, i) => {
        // each line starts a little after the one before, so the map fills in
        const local = Math.min(1, Math.max(0, t * 1.7 - (i / pts.length) * 0.7))
        if (local <= 0) return
        ctx.beginPath()
        ctx.moveTo(p.x1, p.y1)
        if (local >= 1) {
          ctx.quadraticCurveTo(p.cx, p.cy, p.x2, p.y2)
        } else {
          for (let s = 1; s <= 16; s++) {
            const [x, y] = at(p, (s / 16) * local)
            ctx.lineTo(x, y)
          }
        }
        if (mode === 'hero') {
          ctx.strokeStyle = `rgba(244,242,238,${0.05 + (i % 7) * 0.012})`
        } else {
          ctx.strokeStyle = p.color
          ctx.globalAlpha = 0.36
        }
        ctx.stroke()
      })
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // the traffic: small lights along a share of the routes
      if (!reduce && t >= 0.6) {
        const fade = Math.min(1, (t - 0.6) / 0.4)
        const clock = now / (mode === 'hero' ? 9000 : 7000)
        const step = mode === 'hero' ? 7 : 3
        for (let i = 0; i < pts.length; i += step) {
          const p = pts[i]
          const [x, y] = at(p, (clock + i * 0.137) % 1)
          ctx.fillStyle = mode === 'hero' ? `rgba(255,255,255,${0.4 * fade})` : p.color
          ctx.globalAlpha = mode === 'hero' ? 1 : fade
          ctx.beginPath()
          ctx.arc(x, y, mode === 'hero' ? 1.2 : 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      if (mode === 'hero') {
        // fade to black under the type
        const g = ctx.createLinearGradient(0, H * 0.3, 0, H)
        g.addColorStop(0, 'rgba(5,5,5,0)')
        g.addColorStop(1, 'rgba(5,5,5,0.94)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(draw)
    }

    const kick = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }

    layout()
    const io = new IntersectionObserver((e) => {
      const was = visible
      visible = e.some((i) => i.isIntersecting)
      if (visible && !was) kick()
    })
    io.observe(c)
    const onResize = () => {
      layout()
      kick()
    }
    const onVis = () => {
      if (!document.hidden && visible) kick()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVis)
    if (reduce) {
      visible = true
      kick()
    }
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [arcs, mode])

  return (
    <canvas
      ref={ref}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

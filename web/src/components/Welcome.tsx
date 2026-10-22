import { useEffect, useRef, useState } from 'react'
import { SLOGAN } from '../lib/alliance'
import { isConfigured, supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

/**
 * The arrival sequence: radar contact.
 *
 *   1. A radar scope draws itself: crosshairs, range rings, bearing ticks.
 *   2. The sweep turns once, and every member airline appears as a contact
 *      where it passes, one blip per airline in the database, in its
 *      division's colour, counted in
 *      the corner like a controller's readout.
 *   3. "Form up": every contact leaves its position and flies to a place on
 *      the Echo wing, so the alliance's airlines literally make the mark.
 *   4. Lock on: brackets close around the wing, it fills solid white, and the
 *      name and slogan rise underneath.
 *   5. The wing climbs away and the site is there.
 *
 * Any key, click, tap or scroll ends it at once, and prefers-reduced-motion
 * skips it entirely. One canvas and a little DOM text; nothing here outlives
 * the five seconds it runs.
 */

const RUN_MS = 5600

// Phase boundaries, ms from the start.
const T_SCOPE = 450 // scope drawn
const T_SWEEP = 1900 // one full turn of the sweep
const T_FORM = 3350 // contacts reach the wing
const T_LOCK = 3900 // wing filled
const T_EXIT = 4900 // climb away

type Roster = [string, number][] // [division colour, airlines]

/**
 * Stand-in until the real roster arrives: the divisions' colours and sizes
 * from the 22 October 2026 data. Only seen if the database is slow to answer
 * or unreachable.
 */
const FALLBACK: Roster = [
  ['#7B35FF', 80], // Kyra
  ['#D0FF4D', 79], // Aegis
  ['#E46EFF', 62], // Elysium
  ['#81FBFE', 80], // Proxima
  ['#5DFE95', 80], // Rhea
  ['#FF7E42', 80], // Vilis
  ['#7EA0F4', 80], // Elion
  ['#EF9D9E', 78], // Aura
  ['#FDECD8', 57], // Eos
]

/**
 * The live roster: every division's colour and airline count, asked for as
 * soon as the bundle runs, so the radar shows exactly as many contacts as
 * the database holds airlines. The scope takes T_SCOPE to draw before the
 * first contact appears, which is the window the answer has to land in.
 */
let roster: Roster | null = null
const rosterReady: Promise<Roster | null> = !isConfigured
  ? Promise.resolve(null)
  : Promise.resolve(
      supabase.from('v_division_summary').select('accent_color, carriers, sort_order').order('sort_order'),
    ).then(
      ({ data, error }) => {
        if (error || !data?.length) return null
        roster = (data as { accent_color: string | null; carriers: number }[])
          .filter((d) => d.carriers > 0)
          .map((d) => [d.accent_color || '#A855F7', d.carriers])
        return roster
      },
      () => null,
    )

const WING_RATIO = 428 / 339
const wingSrc = `${import.meta.env.BASE_URL}brand/echo-mark.png`
// Fetched as soon as the bundle runs, so the wing is in hand long before the
// contacts need their places on it.
const wingImage: HTMLImageElement | null =
  typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: wingSrc })

type Blip = {
  a: number // bearing, radians
  rel: number // bearing measured from straight up, where the sweep starts
  r: number // range, 0..1
  color: string
  tx: number // target on the wing, px
  ty: number
  delay: number // ms of stagger leaving the scope
  bend: number // sideways bow of its flight path
}

/**
 * Development only: ?welcome-at=2600 holds the sequence at that moment, so
 * each phase can be looked at. Compiled out of the published site.
 */
const HOLD_AT: number | null = (() => {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(window.location.search).get('welcome-at')
  return v == null ? null : Number(v)
})()

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export default function Welcome() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return true
    }
  })
  const canvas = useRef<HTMLCanvasElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const t = useT()
  const root = useRef<HTMLDivElement>(null)
  const hud = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLParagraphElement | null)[]>([])

  // End on any input, or when the run is over.
  useEffect(() => {
    if (!show || HOLD_AT != null) return
    const end = () => setShow(false)
    const timer = window.setTimeout(end, RUN_MS)
    window.addEventListener('keydown', end)
    window.addEventListener('pointerdown', end)
    window.addEventListener('wheel', end, { passive: true })
    window.addEventListener('touchmove', end, { passive: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', end)
      window.removeEventListener('pointerdown', end)
      window.removeEventListener('wheel', end)
      window.removeEventListener('touchmove', end)
      document.body.style.overflow = overflow
    }
  }, [show])

  // The scope, the contacts and the wing.
  useEffect(() => {
    if (!show) return
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return

    const k = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    // A window with no size (a background or pre-rendering tab) has nothing
    // to draw on, and sampling the wing from it would throw.
    if (W < 40 || H < 40) {
      setShow(false)
      return
    }
    c.width = Math.round(W * k)
    c.height = Math.round(H * k)
    ctx.setTransform(k, 0, 0, k, 0, 0)

    const cx = W / 2
    const cy = H * 0.42
    const R = Math.min(W, H) * 0.4
    const wingH = Math.min(H * 0.3, 250, (W * 0.7) / WING_RATIO)
    const wingW = wingH * WING_RATIO
    const wx = cx - wingW / 2
    const wy = cy - wingH / 2

    // One blip per member airline, coloured by division.
    const build = (list: Roster) => {
      const out: Blip[] = []
      list.forEach(([color, n]) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          out.push({
            a,
            rel: (a + Math.PI / 2) % (Math.PI * 2),
            r: 0.12 + Math.sqrt(Math.random()) * 0.86,
            color,
            tx: cx,
            ty: cy,
            delay: Math.random() * 380,
            bend: (Math.random() - 0.5) * 0.6,
          })
        }
      })
      // Sweep order: the contacts light as the beam reaches their bearing.
      return out.sort((p, q) => p.rel - q.rel)
    }
    let blips = build(roster ?? FALLBACK)

    // Wing targets: sample the mark's opaque pixels, then deal them out.
    const wing = wingImage ?? Object.assign(new Image(), { src: wingSrc })
    let wingReady = false
    const place = () => {
      const off = document.createElement('canvas')
      const ow = Math.round(wingW)
      const oh = Math.round(wingH)
      off.width = ow
      off.height = oh
      const o = off.getContext('2d')
      if (!o) return
      o.drawImage(wing, 0, 0, ow, oh)
      const data = o.getImageData(0, 0, ow, oh).data
      const pts: [number, number][] = []
      const step = Math.max(2, Math.round(wingH / 70))
      for (let y = 0; y < oh; y += step)
        for (let x = 0; x < ow; x += step) if (data[(y * ow + x) * 4 + 3] > 128) pts.push([x, y])
      for (let i = pts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pts[i], pts[j]] = [pts[j], pts[i]]
      }
      blips.forEach((b, i) => {
        const p = pts[i % pts.length]
        b.tx = wx + p[0] + (Math.random() - 0.5) * step
        b.ty = wy + p[1] + (Math.random() - 0.5) * step
      })
      wingReady = true
    }
    if (wing.complete && wing.naturalWidth) place()
    else wing.addEventListener('load', place, { once: true })

    const t0 = performance.now()

    // The live count, if it lands before the sweep shows the first contact.
    // Later than that it would visibly reshuffle the scope, so the stand-in
    // stays for this run.
    let live = true
    if (!roster)
      void rosterReady.then((list) => {
        if (!live || !list || performance.now() - t0 >= T_SCOPE) return
        blips = build(list)
        if (wingReady) place()
      })
    let raf = 0

    // The words, the readout and the fade-out run off the same clock as the
    // canvas, so nothing can drift out of step with the wing.
    const rise = (el: HTMLElement | null | undefined, at: number, t: number) => {
      if (!el) return
      const u = easeInOut(clamp01((t - at) / 650))
      el.style.opacity = String(u)
      el.style.transform = `translateY(${(1 - u) * 16}px)`
    }

    const frame = (now: number) => {
      const t = HOLD_AT ?? now - t0

      if (hud.current) hud.current.style.opacity = String(clamp01((t - 200) / 400) * (1 - clamp01((t - 3400) / 400)))
      rise(words.current[0], 3750, t)
      rise(words.current[1], 3950, t)
      rise(words.current[2], 4150, t)
      if (root.current) root.current.style.opacity = String(1 - clamp01((t - 5000) / 600))

      // Phosphor: last frame fades rather than clears, so blips and the
      // sweep leave the afterglow a real scope has.
      ctx.fillStyle = t < T_SWEEP ? 'rgba(5,5,5,0.16)' : 'rgba(5,5,5,0.3)'
      ctx.fillRect(0, 0, W, H)

      // --- the scope -----------------------------------------------------
      const scope = clamp01(t / T_SCOPE)
      const scopeFade = 1 - clamp01((t - T_SWEEP) / 600)
      if (scopeFade > 0) {
        ctx.save()
        ctx.globalAlpha = 0.5 * scopeFade
        ctx.strokeStyle = '#F4F2EE'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx - R * scope, cy)
        ctx.lineTo(cx + R * scope, cy)
        ctx.moveTo(cx, cy - R * scope)
        ctx.lineTo(cx, cy + R * scope)
        ctx.stroke()
        ;[0.33, 0.66, 1].forEach((f, i) => {
          const rr = R * f * easeInOut(clamp01(scope * 1.4 - i * 0.2))
          if (rr <= 0) return
          ctx.globalAlpha = (i === 2 ? 0.55 : 0.25) * scopeFade
          ctx.beginPath()
          ctx.arc(cx, cy, rr, 0, Math.PI * 2)
          ctx.stroke()
        })
        // bearing ticks every 10°
        ctx.globalAlpha = 0.4 * scopeFade * scope
        for (let d = 0; d < 360; d += 10) {
          const th = (d * Math.PI) / 180
          const len = d % 30 === 0 ? 10 : 5
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R)
          ctx.lineTo(cx + Math.cos(th) * (R - len), cy + Math.sin(th) * (R - len))
          ctx.stroke()
        }
        ctx.restore()
      }

      // --- the sweep, and contacts lighting as it passes ----------------
      const sweepU = clamp01((t - T_SCOPE) / (T_SWEEP - T_SCOPE))
      const beam = -Math.PI / 2 + sweepU * Math.PI * 2
      if (t >= T_SCOPE && t < T_SWEEP) {
        ctx.save()
        for (let s = 0; s < 14; s++) {
          const th = beam - s * 0.035
          ctx.globalAlpha = 0.5 * (1 - s / 14)
          ctx.strokeStyle = '#F4F2EE'
          ctx.lineWidth = s === 0 ? 1.5 : 1
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R)
          ctx.stroke()
        }
        ctx.restore()
      }

      // how many contacts the beam has passed so far
      let lit = 0
      const beamFrom = beam + Math.PI / 2 // 0..2π from straight up
      for (const b of blips) {
        if (t >= T_SWEEP || b.rel <= beamFrom) lit++
        else break
      }
      if (counter.current) counter.current.textContent = String(lit).padStart(3, '0')

      // --- contacts: on the scope, then flying to the wing --------------
      blips.forEach((b, i) => {
        if (i >= lit) return
        const sx = cx + Math.cos(b.a) * b.r * R
        const sy = cy + Math.sin(b.a) * b.r * R
        let x = sx
        let y = sy
        let size = 1.8
        let alpha = 0.9
        if (t >= T_SWEEP && wingReady) {
          const u = easeInOut(clamp01((t - T_SWEEP - b.delay) / (T_FORM - T_SWEEP - 380)))
          const dx = b.tx - sx
          const dy = b.ty - sy
          const bow = Math.sin(Math.PI * u) * b.bend
          x = sx + dx * u - dy * bow
          y = sy + dy * u + dx * bow
          size = 1.8 - u * 0.6
          if (t > T_LOCK) alpha = 0.9 - clamp01((t - T_LOCK) / 500) * 0.75
        } else {
          // freshly swept contacts flare, then settle
          const since = (beamFrom - b.rel) / (Math.PI * 2)
          if (since >= 0 && since < 0.04 && t < T_SWEEP) {
            size = 3.2
            alpha = 1
          }
        }
        ctx.globalAlpha = alpha
        ctx.fillStyle = b.color
        ctx.fillRect(x - size / 2, y - size / 2, size, size)
      })
      ctx.globalAlpha = 1

      // --- lock on: brackets close in, the wing fills -------------------
      if (t >= T_FORM - 150 && wingReady) {
        const u = easeInOut(clamp01((t - (T_FORM - 150)) / 450))
        const pad = 26 + (1 - u) * 60
        const arm = 18
        ctx.save()
        ctx.strokeStyle = '#F4F2EE'
        ctx.lineWidth = 2
        ctx.globalAlpha = u * (1 - clamp01((t - T_EXIT) / 300))
        const L = wx - pad
        const Rr = wx + wingW + pad
        const T = wy - pad
        const B = wy + wingH + pad
        ;[
          [L, T, 1, 1],
          [Rr, T, -1, 1],
          [L, B, 1, -1],
          [Rr, B, -1, -1],
        ].forEach(([x0, y0, sx, sy]) => {
          ctx.beginPath()
          ctx.moveTo(x0 + sx * arm, y0)
          ctx.lineTo(x0, y0)
          ctx.lineTo(x0, y0 + sy * arm)
          ctx.stroke()
        })
        ctx.restore()

        const fill = clamp01((t - T_FORM) / (T_LOCK - T_FORM))
        if (fill > 0) {
          // climb away: up and to the left, the way the wing points
          const e = easeInOut(clamp01((t - T_EXIT) / (RUN_MS - T_EXIT)))
          ctx.save()
          ctx.globalAlpha = fill * (1 - e)
          ctx.translate(-e * W * 0.35, -e * H * 0.25)
          ctx.drawImage(tinted(wing, wingW, wingH), wx, wy, wingW, wingH)
          ctx.restore()
        }
      }

      if (t < RUN_MS || HOLD_AT != null) raf = requestAnimationFrame(frame)
    }

    ctx.fillStyle = '#050505'
    ctx.fillRect(0, 0, W, H)
    raf = requestAnimationFrame(frame)
    return () => {
      live = false
      cancelAnimationFrame(raf)
    }
  }, [show])

  if (!show) return null

  return (
    <div ref={root} className="welcome" role="status" aria-label={t('Welcome to Echo United Alliances')}>
      <canvas ref={canvas} className="welcome-canvas" aria-hidden="true" />

      <div ref={hud} className="welcome-hud" aria-hidden="true">
        <span>{t('EUA radar')}</span>
        <span>
          {t('Contacts')} <b ref={counter}>000</b>
        </span>
      </div>

      <div className="welcome-copy">
        <p ref={(el) => { words.current[0] = el }} className="welcome-echo">Echo</p>
        <p ref={(el) => { words.current[1] = el }} className="welcome-name">United Alliances</p>
        <p ref={(el) => { words.current[2] = el }} className="welcome-slogan">{SLOGAN}</p>
      </div>

      <button type="button" className="welcome-skip" onClick={() => setShow(false)}>
        Skip
      </button>
    </div>
  )
}

// The mark is a white silhouette; drawing it as-is gives the solid white wing.
// Cached so the frame loop does not rebuild it.
let tintCache: HTMLCanvasElement | null = null
function tinted(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement | HTMLImageElement {
  if (tintCache && tintCache.width === Math.round(w * 2)) return tintCache
  const c = document.createElement('canvas')
  c.width = Math.round(w * 2)
  c.height = Math.round(h * 2)
  const o = c.getContext('2d')
  if (!o) return img
  o.drawImage(img, 0, 0, c.width, c.height)
  o.globalCompositeOperation = 'source-in'
  o.fillStyle = '#F4F2EE'
  o.fillRect(0, 0, c.width, c.height)
  tintCache = c
  return c
}

import { useEffect, useRef, useState } from 'react'

/**
 * The home page's motion, in one place.
 *
 * Everything here gives way to prefers-reduced-motion: the content is simply
 * shown, at rest, with nothing sliding, counting or drawing. And nothing is
 * hidden until JavaScript says so -- an element is only put in its "before"
 * state once it is known to be off screen, so a slow script never leaves a
 * blank page behind it.
 */

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** True once the element has come within `margin` of the viewport. */
export function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margin, seen])
  return [ref, seen] as const
}

/**
 * Slides and fades its children in as they scroll into view. Elements that
 * are already on screen when the page opens are shown immediately.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'p' | 'span'
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    // Only hide what is below the fold right now.
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true)
  }, [ref])
  const Comp = Tag as React.ElementType
  return (
    <Comp
      ref={ref}
      className={`${armed ? 'reveal' : ''} ${armed && seen ? 'reveal-in' : ''} ${className}`}
      style={armed ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Comp>
  )
}

/** A number that counts up to `to` the first time it scrolls into view. */
export function CountUp({ to, duration = 1400, format }: { to: number; duration?: number; format?: (n: number) => string }) {
  const [ref, seen] = useInView<HTMLSpanElement>('0px')
  const [value, setValue] = useState(to)
  const started = useRef(false)
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('en-US'))

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    if (!seen && el.getBoundingClientRect().top > window.innerHeight) setValue(0)
  }, [ref, seen])

  useEffect(() => {
    if (!seen || started.current || !to || prefersReducedMotion()) {
      setValue(to)
      return
    }
    started.current = true
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      setValue(to * (1 - Math.pow(1 - p, 4)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to, duration])

  return <span ref={ref}>{fmt(value)}</span>
}

/**
 * How far an element has travelled through the viewport: 0 as its top meets
 * the bottom of the screen, 1 as its bottom leaves the top.
 */
export function useScrollProgress<T extends Element>() {
  const ref = useRef<T>(null)
  const [p, setP] = useState(0.5)
  useEffect(() => {
    if (prefersReducedMotion()) return
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const total = r.height + window.innerHeight
      setP(Math.min(1, Math.max(0, (window.innerHeight - r.top) / total)))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return [ref, p] as const
}

/**
 * A band of text that drifts sideways forever and runs faster while the page
 * is being scrolled. The content is repeated so the loop has no seam.
 */
export function Marquee({
  children,
  speed = 0.5,
  reverse = false,
  className = '',
}: {
  children: React.ReactNode
  speed?: number
  reverse?: boolean
  className?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = track.current
    if (!el || prefersReducedMotion()) return
    let x = 0
    let boost = 0
    let lastY = window.scrollY
    let raf = 0
    let visible = true
    const io = new IntersectionObserver((e) => {
      visible = e.some((i) => i.isIntersecting)
    })
    io.observe(el)
    const frame = () => {
      const y = window.scrollY
      boost = boost * 0.9 + Math.abs(y - lastY) * 0.1
      lastY = y
      if (visible) {
        const half = el.scrollWidth / 2
        x += (speed + boost) * (reverse ? 1 : -1)
        if (x <= -half) x += half
        if (x > 0) x -= half
        el.style.transform = `translate3d(${x}px,0,0)`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [speed, reverse])
  return (
    <div className={`marquee ${className}`} aria-hidden="true">
      <div ref={track} className="marquee-track">
        <div className="marquee-run">{children}</div>
        <div className="marquee-run">{children}</div>
      </div>
    </div>
  )
}

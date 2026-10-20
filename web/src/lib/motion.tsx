import { useEffect, useRef, useState } from 'react'

/**
 * The home page's motion, in one place: the sliding text bands of the
 * approved proposal, and the scroll position that flies the Airline of the
 * Week's livery across. Both stand still under prefers-reduced-motion.
 */

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
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

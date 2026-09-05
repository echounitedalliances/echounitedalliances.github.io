import { useEffect, useState } from 'react'
import EchoMark from './EchoMark'
import { SLOGAN } from '../lib/alliance'

/**
 * The arrival sequence, shown once.
 *
 * The wing flies in from the right in two pieces — the upper and lower halves
 * arrive separately and a beat apart — settles, then narrows and sweeps out to
 * the left, taking the overlay with it.
 *
 * Three things keep it from being an obstacle:
 *
 *   - it runs ONCE per browser, remembered in localStorage, because an
 *     animation you cannot skip is a toll booth on the second visit;
 *   - any key, click or scroll ends it immediately;
 *   - prefers-reduced-motion skips it entirely rather than playing it faster.
 *
 * It is CSS keyframes on four elements over transform and opacity, so the
 * compositor runs it and it stops existing when it unmounts. Nothing here
 * holds a frame loop.
 */

const SEEN_KEY = 'echo.welcomed.v1'
const RUN_MS = 4200

function alreadyWelcomed() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // Private windows and blocked storage throw. Showing it every time is a
    // worse failure than never showing it, so treat unknown as seen.
    return true
  }
}

function remember() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* nothing to do; it simply plays again next time */
  }
}

export default function Welcome() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    if (alreadyWelcomed()) return false
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        remember()
        return false
      }
    } catch {
      /* older browsers: play it */
    }
    return true
  })

  useEffect(() => {
    if (!show) return
    const end = () => {
      remember()
      setShow(false)
    }
    const timer = window.setTimeout(end, RUN_MS)
    window.addEventListener('keydown', end)
    window.addEventListener('pointerdown', end)
    window.addEventListener('wheel', end, { passive: true })
    // Nothing should scroll behind it while it plays.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', end)
      window.removeEventListener('pointerdown', end)
      window.removeEventListener('wheel', end)
      document.body.style.overflow = overflow
    }
  }, [show])

  if (!show) return null

  return (
    <div className="welcome" role="status" aria-label="Welcome to Echo United Alliances">
      <div className="welcome-inner">
        <p className="welcome-line welcome-kicker">Welcome to</p>

        <div className="welcome-mark" aria-hidden="true">
          <EchoMark half="top" height={132} color="var(--color-ink)" className="welcome-wing-top" />
          <EchoMark
            half="bottom"
            height={132}
            color="var(--color-accent)"
            className="welcome-wing-bottom"
          />
        </div>

        <p className="welcome-line welcome-name">
          Echo <span className="welcome-name-dim">United Alliances</span>
        </p>
        <p className="welcome-line welcome-slogan">{SLOGAN}</p>
      </div>

      <button type="button" className="welcome-skip" onClick={() => { remember(); setShow(false) }}>
        Skip
      </button>
    </div>
  )
}

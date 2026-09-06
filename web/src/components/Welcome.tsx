import { useEffect, useState } from 'react'
import EchoMark from './EchoMark'
import { SLOGAN } from '../lib/alliance'

/**
 * The arrival sequence, shown once.
 *
 * The two halves fly in from opposite corners of the page — the upper one down
 * from the top right, the lower one up from the bottom right — each stretched
 * along its direction of travel so it reads as a strike rather than a slide,
 * each flattening and compressing back to its true shape as it lands. They
 * assemble above the words, hold, then leave to the left TOGETHER.
 *
 * Together is why the exit is on their shared parent rather than on each wing:
 * the arcs start a beat apart, and two animations on one element cannot both
 * own `transform`. The parent carries the exit, each wing carries its arc, and
 * the transforms compose.
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
const RUN_MS = 4600

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
        {/* The wing sits above everything; the words are all beneath it. */}
        <div className="welcome-stage">
          <div className="welcome-mark" aria-hidden="true">
            <EchoMark half="top" height={210} color="var(--color-ink)" className="welcome-wing-top" />
            <EchoMark
              half="bottom"
              height={210}
              color="var(--color-accent)"
              className="welcome-wing-bottom"
            />
          </div>
        </div>

        <p className="welcome-line welcome-kicker">Welcome to</p>
        <p className="welcome-line welcome-echo">Echo</p>

        <p className="welcome-line welcome-strap">
          <span className="welcome-strap-name">United Alliances</span>
          <span className="welcome-strap-slogan">{SLOGAN}</span>
        </p>
      </div>

      <button type="button" className="welcome-skip" onClick={() => { remember(); setShow(false) }}>
        Skip
      </button>
    </div>
  )
}

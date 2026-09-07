import { useEffect, useState } from 'react'
import Modal from './Modal'
import { ADVISORIES } from '../lib/advisories'

const KEY = 'echo.advisory.dismissed'

function dismissed(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    // Private windows, cleared site data, storage blocked outright: the
    // honest fallback is to show the advisory, not to hide it.
    return []
  }
}

/**
 * The disruption notice on the home page.
 *
 * Two things it has to get right, and both are about not being an obstacle:
 *
 *   it waits for the arrival animation. Welcome renders a full-page overlay
 *   for a few seconds, and a dialog opening on top of it would land in the
 *   middle of the wings. Rather than couple the two components, this watches
 *   for the overlay to leave the DOM. When the animation is skipped entirely
 *   — reduced motion — there is nothing to wait for and it shows at once.
 *
 *   it is dismissed per advisory, not per session. Somebody who has read the
 *   Krakatoa notice should not meet it again on every visit; somebody meeting
 *   a NEW advisory should, which is why the id is stored rather than a flag.
 *
 * If nothing is running, this renders nothing and costs one array read.
 */
export default function Advisory() {
  const [show, setShow] = useState(false)
  const advisory = ADVISORIES.find((a) => !dismissed().includes(a.id))

  useEffect(() => {
    if (!advisory) return
    // The arrival animation runs about 4.6s and can be cut short by any
    // click or key, so poll for its absence rather than assume a duration.
    if (!document.querySelector('.welcome')) {
      setShow(true)
      return
    }
    const timer = window.setInterval(() => {
      if (!document.querySelector('.welcome')) {
        window.clearInterval(timer)
        setShow(true)
      }
    }, 200)
    return () => window.clearInterval(timer)
  }, [advisory])

  if (!advisory || !show) return null

  const close = () => {
    setShow(false)
    try {
      localStorage.setItem(KEY, JSON.stringify([...dismissed(), advisory.id]))
    } catch {
      // Not being able to remember the dismissal is not a reason to fail to
      // close it. It will simply come back next visit.
    }
  }

  return (
    <Modal title={advisory.title} onClose={close} labelledBy="advisory-title">
      <div className="border-l-2 border-warn pl-4">
        {advisory.body.map((p) => (
          <p key={p} className="mb-3 text-sm leading-relaxed text-ink-dim last:mb-0">
            {p}
          </p>
        ))}
      </div>

      {advisory.footnote && (
        <p className="mt-4 text-[12px] text-ink-faint">{advisory.footnote}</p>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={close}
          className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90"
        >
          Understood
        </button>
      </div>
    </Modal>
  )
}

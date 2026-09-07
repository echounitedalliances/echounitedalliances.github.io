import { useEffect, useState } from 'react'
import Modal from './Modal'
import { currentAdvisory, dismiss, isDismissed } from '../lib/advisories'

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
 *   it is dismissed per advisory, not per session. Somebody who has read this
 *   notice should not meet it again on every visit; somebody meeting a NEW
 *   advisory should, which is why the id is stored rather than a flag.
 *
 * Closing it does not end the story: AdvisoryBar picks the same advisory up
 * as a line above the top bar, on every page, for as long as it is running.
 *
 * If nothing is running, this renders nothing.
 */
export default function Advisory() {
  const advisory = currentAdvisory()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!advisory || isDismissed(advisory.id)) return
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
    dismiss(advisory.id)
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

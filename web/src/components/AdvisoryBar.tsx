import { useEffect, useState } from 'react'
import {
  ADVISORY_DISMISSED,
  currentAdvisory,
  dismissBanner,
  isBannerDismissed,
  isDismissed,
} from '../lib/advisories'

/**
 * The running advisory, condensed to one line above the top bar.
 *
 * The pop-up on the home page is a one-time interruption; this is the thing
 * that stays. It sits above the header rather than inside it because it is
 * not navigation — it outranks the alliance's own chrome for as long as
 * travel is disrupted, and it should read that way.
 *
 * When it appears:
 *
 *   after the pop-up is closed, which is why it listens for that event
 *   rather than only reading storage on mount;
 *   immediately on any page that is not the home page, because somebody who
 *   deep-links to a carrier never meets the pop-up at all and would otherwise
 *   see nothing.
 *
 * It can be closed, which it could not be at first. Leaving it permanent was
 * deliberate — a live disruption should not vanish on one click — but with no
 * close at all there was no way to put it down, and that reads as a bug
 * rather than as a decision. Closing it is remembered separately from closing
 * the pop-up, so a NEW advisory still arrives in full.
 */
export default function AdvisoryBar({ onHome }: { onHome: boolean }) {
  const advisory = currentAdvisory()
  const [read, setRead] = useState(() => (advisory ? isDismissed(advisory.id) : false))
  const [closed, setClosed] = useState(() =>
    advisory ? isBannerDismissed(advisory.id) : false,
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!advisory) return
    const sync = () => {
      setRead(isDismissed(advisory.id))
      setClosed(isBannerDismissed(advisory.id))
    }
    window.addEventListener(ADVISORY_DISMISSED, sync)
    // Another tab dismissing it should settle this one too.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(ADVISORY_DISMISSED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [advisory])

  if (!advisory || closed) return null
  // On the home page the pop-up is still to come; two of the same message at
  // once is noise.
  if (onHome && !read) return null

  return (
    <div className="advisory-bar">
      <div className="relative mx-auto max-w-[1180px] px-4 pr-10 sm:px-5 sm:pr-10">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="advisory-detail"
          className="flex w-full items-center gap-2.5 py-2 text-left"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
          />
          <span className="eyebrow shrink-0 text-warn">Advisory</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-dim sm:text-[13px]">
            {advisory.headline}
          </span>
          <span className="mono shrink-0 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {open ? 'Less' : 'More'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setClosed(true)
            dismissBanner(advisory.id)
          }}
          aria-label="Dismiss this advisory"
          className="absolute right-3 top-1.5 px-1.5 py-0.5 text-[13px] leading-none text-ink-faint transition-colors hover:text-ink"
        >
          ×
        </button>

        <div id="advisory-detail" hidden={!open} className="pb-4 pl-4">
          <div className="border-l-2 border-warn pl-4">
            <p className="display mb-2 text-base">{advisory.title}</p>
            {advisory.body.map((p) => (
              <p key={p} className="mb-2 text-[13px] leading-relaxed text-ink-dim last:mb-0">
                {p}
              </p>
            ))}
            {advisory.footnote && (
              <p className="mt-3 text-[12px] text-ink-faint">{advisory.footnote}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

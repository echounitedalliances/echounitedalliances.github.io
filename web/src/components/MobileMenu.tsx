import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import EchoMark from './EchoMark'
import { SITE, discordConfigured } from '../lib/site'

/**
 * The phone navigation: a drawer in from the right, not a block that pushes
 * the page down.
 *
 * It replaced an expanding panel inside the header, which had two problems.
 * The small one is that the header is sticky, so a tall open menu covered the
 * page and could not be scrolled independently of it. The large one is that
 * it mounted a second copy of the presence badge while the desktop nav's copy
 * was still mounted-but-CSS-hidden, and that crashed the whole app -- see
 * lib/presence.ts.
 *
 * It renders as a SIBLING of the sticky header rather than inside it, and
 * that is load-bearing: the header carries backdrop-blur, and a backdrop
 * filter establishes a containing block for fixed-position descendants. A
 * `fixed inset-0` drawer nested inside it would be laid out against the
 * header's box -- a 48px-tall strip -- instead of the viewport.
 *
 * Escape closes it, the backdrop closes it, following a link closes it (the
 * Shell does that on navigation), and the page behind does not scroll while
 * it is open.
 */
export default function MobileMenu({
  open,
  onClose,
  links,
  badges,
  account,
}: {
  open: boolean
  onClose: () => void
  links: { to: string; label: string }[]
  /** The live counters, passed in so this file does not reach for them itself. */
  badges: React.ReactNode
  account: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  /**
   * Drives the slide. It flips on the tick after the panel mounts, so the
   * browser has an off-screen frame to transition FROM -- and because the
   * resting state is the one the layout gives it, a transition that never
   * runs leaves the panel open and readable rather than parked off-screen.
   */
  const [shown, setShown] = useState(false)

  // Read through a ref rather than depending on it: onClose is an inline
  // arrow from the Shell, so it changes identity on every render -- and the
  // Shell re-renders whenever the live counters tick. As a dependency it
  // re-ran this effect every few seconds, cancelling the slide's timer and
  // yanking focus back to the panel. Same defect as Modal had.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    const tick = window.setTimeout(() => setShown(true), 0)
    panel.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.clearTimeout(tick)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 w-full cursor-default bg-[#0B0713]/70 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={panel}
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-[82%] max-w-[320px] flex-col overflow-y-auto border-l border-edge bg-[color:var(--color-ground)] outline-none transition-transform duration-200 ease-out motion-reduce:transition-none ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge-soft px-5 py-3">
          <Link to="/" onClick={onClose} className="flex items-baseline gap-2.5">
            <EchoMark height={15} color="var(--color-ink)" />
            <span className="wordmark text-[18px]">Echo</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="mono flex h-9 w-9 shrink-0 items-center justify-center border border-edge text-ink-dim transition-colors hover:border-accent hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <line x1="3" y1="3" x2="12" y2="12" />
                <line x1="12" y1="3" x2="3" y2="12" />
              </g>
            </svg>
          </button>
        </div>

        <nav className="flex flex-col px-5 py-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={onClose}
              className={({ isActive }) =>
                `mono border-b border-edge-soft py-3.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${
                  isActive ? 'text-cyan' : 'text-ink-dim hover:text-ink'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 px-5 pb-6 pt-4">
          <div className="flex flex-wrap items-center gap-2">{badges}</div>
          {account}
          {discordConfigured && (
            <a
              href={SITE.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full text-center"
            >
              Join Discord
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

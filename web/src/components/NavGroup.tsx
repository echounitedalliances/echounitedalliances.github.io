import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { NavItem } from '../lib/nav'

/**
 * A top-bar item that opens a small panel of related pages.
 *
 * The bar had seven items across and was crowding the live counters and the
 * account chip off the end. Grouping the pages that belong together — About
 * and what the alliance actually does — buys the row back without hiding
 * anything: the parent is still a link to its own page, and the panel is one
 * click away.
 *
 * Click to open rather than hover. A hover menu on the one item that also
 * navigates is a trap on a laptop trackpad, and it does not exist at all on a
 * touch screen. Escape closes it, clicking outside closes it, and following
 * any link inside closes it.
 */
export default function NavGroup({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const children = item.children ?? []

  // The group counts as current when any page inside it is.
  const active = pathname === item.to || children.some((c) => pathname === c.to)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={box}>
      <div className="flex items-center">
        <NavLink
          to={item.to}
          className={`mono py-1.5 pl-2.5 pr-1 text-[11px] uppercase tracking-[0.12em] transition-colors ${
            active ? 'text-cyan' : 'text-ink-faint hover:text-ink-dim'
          }`}
        >
          {item.label}
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={`More under ${item.label}`}
          className={`py-1.5 pr-2 text-[11px] leading-none transition-colors ${
            active ? 'text-cyan' : 'text-ink-faint hover:text-ink-dim'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
      </div>

      {open && (
        <div className="panel absolute right-0 top-full z-40 mt-1 w-56 py-1">
          <NavLink
            to={item.to}
            onClick={() => setOpen(false)}
            className="mono block px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {item.label}
          </NavLink>
          {children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `mono block px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors hover:bg-surface-2 ${
                  isActive ? 'text-cyan' : 'text-ink-dim hover:text-ink'
                }`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

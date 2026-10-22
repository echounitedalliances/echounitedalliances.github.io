import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MEMBER_ROUTES } from '../lib/apps'
import { setAudience, useAudience, type Audience } from '../lib/audience'
import { useT } from '../lib/i18n'

/**
 * The two front doors: travelling with Echo, or flying with it.
 *
 * AudienceSwitch is the thin strip above the bar on every page -- the
 * Personal / Business tabs of a bank's site. It always shows both, so nobody
 * is locked into the answer they gave on their first visit.
 *
 * The first-visit question that used to sit above the home page went with
 * the facelift of October 2026: the opening screen is the first impression
 * now, and these tabs are always there for anyone who wants the other door.
 */

export function isMemberPath(pathname: string): boolean {
  return MEMBER_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

export function AudienceSwitch() {
  const { pathname } = useLocation()
  const member = isMemberPath(pathname)
  const t = useT()

  const tab = (to: string, label: string, a: Audience, active: boolean) => (
    <Link
      to={to}
      onClick={() => setAudience(a)}
      aria-current={active ? 'page' : undefined}
      className={`mono relative px-3 py-1.5 text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
        active ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
      }`}
    >
      {label}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-px bg-[color:var(--color-accent)]" />
      )}
    </Link>
  )

  return (
    <div className="border-b border-edge-soft bg-[color:var(--color-ground-2)]">
      <nav
        aria-label={t('Who is this for')}
        className="mx-auto flex max-w-[1180px] items-center gap-1 px-2 sm:px-3"
      >
        {tab('/', t('Travellers'), 'visitor', !member)}
        {tab('/members', t('Members'), 'member', member)}
        <span className="mono ml-auto hidden px-3 text-[10px] uppercase tracking-[0.14em] text-ink-faint sm:inline">
          Echo United Alliances
        </span>
      </nav>
    </div>
  )
}

// Whether this visit opened on the home page, read once as the bundle loads.
let landedHome = ['', '#', '#/'].includes(window.location.hash)

/**
 * A member who comes back to the home page lands in the members' area, the
 * way a bank remembers you picked Business. Only when the visit opens on the
 * home page: clicking the logo or the Travellers tab later still shows it.
 */
export function useMemberLanding() {
  const navigate = useNavigate()
  const audience = useAudience()
  useEffect(() => {
    const first = landedHome
    landedHome = false
    if (first && audience === 'member') navigate('/members', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

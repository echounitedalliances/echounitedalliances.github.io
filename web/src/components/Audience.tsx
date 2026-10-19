import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MEMBER_ROUTES } from '../lib/apps'
import { setAudience, useAudience, type Audience } from '../lib/audience'

/**
 * The two front doors: travelling with Echo, or flying with it.
 *
 * AudienceSwitch is the thin strip above the bar on every page -- the
 * Personal / Business tabs of a bank's site. It always shows both, so nobody
 * is locked into the answer they gave on their first visit.
 *
 * AudienceGate is that first-visit question, on the home page, until it has
 * been answered once in this browser.
 */

export function isMemberPath(pathname: string): boolean {
  return MEMBER_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

export function AudienceSwitch() {
  const { pathname } = useLocation()
  const member = isMemberPath(pathname)

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
        aria-label="Who is this for"
        className="mx-auto flex max-w-[1180px] items-center gap-1 px-2 sm:px-3"
      >
        {tab('/', 'Travellers', 'visitor', !member)}
        {tab('/members', 'Members', 'member', member)}
        <span className="mono ml-auto hidden px-3 text-[10px] uppercase tracking-[0.14em] text-ink-faint sm:inline">
          Echo Alliances
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

export function AudienceGate() {
  const audience = useAudience()
  const navigate = useNavigate()
  if (audience) return null

  const choose = (a: Audience) => {
    setAudience(a)
    if (a === 'member') navigate('/members')
  }

  return (
    <section
      aria-labelledby="audience-q"
      className="border-b border-edge-soft bg-[color:var(--color-ground-2)]"
    >
      <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-10">
        <p className="eyebrow text-cyan">Welcome to Echo Alliances</p>
        <h2 id="audience-q" className="display mt-2 text-[clamp(26px,4.5vw,40px)]">
          How can we help you today?
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => choose('visitor')}
            className="panel group p-5 text-left transition-colors hover:border-accent sm:p-6"
          >
            <span className="eyebrow text-ink-faint">I'm travelling</span>
            <span className="display mt-2 block text-2xl">Fly with Echo</span>
            <span className="mt-2 block text-[14px] text-ink-dim">
              Search and book flights across every member airline, explore the
              network, and read the latest news.
            </span>
            <span className="mono mt-4 inline-block text-[11px] uppercase tracking-[0.12em] text-cyan">
              Continue to the site →
            </span>
          </button>
          <button
            type="button"
            onClick={() => choose('member')}
            className="panel group p-5 text-left transition-colors hover:border-accent sm:p-6"
          >
            <span className="eyebrow text-ink-faint">I run an Echo airline</span>
            <span className="display mt-2 block text-2xl">Members' area</span>
            <span className="mt-2 block text-[14px] text-ink-dim">
              Echo Live, Echo Market, your division and its leaders: the tools
              for airlines in the alliance, with Discord sign-in.
            </span>
            <span className="mono mt-4 inline-block text-[11px] uppercase tracking-[0.12em] text-cyan">
              Go to members →
            </span>
          </button>
        </div>
        <p className="mt-4 text-[12px] text-ink-faint">
          You can switch any time from the Travellers and Members tabs at the top
          of every page.
        </p>
      </div>
    </section>
  )
}

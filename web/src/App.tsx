import { useEffect, useRef, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Activities from './pages/Activities'
import Divisions from './pages/Divisions'
import DivisionPage from './pages/Division'
import AirlinePage from './pages/Airline'
import Directory from './pages/Directory'
import AirportPage from './pages/Airport'
import NetworkPage from './pages/Network'
import { MAINTENANCE_LOCK_UNTIL, SITE, discordConfigured } from './lib/site'
import { useOnlineCount } from './lib/discordWidget'
import { useSiteVisitorCount } from './lib/presence'
import { num } from './lib/format'
import { useAirportCount, useCarrierCount, useDivisionCount } from './lib/carriers'
import Resonance from './pages/Resonance'
import { Conduct, Privacy, Terms } from './pages/Policy'
import News from './pages/News'
import Members from './pages/Members'
import { LivePreview, MarketPreview } from './pages/AppPreview'
import { AudienceSwitch } from './components/Audience'
import { AuthProvider, useAuth } from './lib/auth'
import AdvisoryBar from './components/AdvisoryBar'
import NavGroup from './components/NavGroup'
import { NAV } from './lib/nav'
import MobileMenu from './components/MobileMenu'
import EchoMark from './components/EchoMark'
import Welcome from './components/Welcome'
import MaintenanceLock from './components/MaintenanceLock'
import EchoAssistant from './components/EchoAssistant'
import { SneakPeekProvider } from './lib/sneakPeek'
import LangMenu from './components/LangMenu'
import { I18nProvider, rich, useI18n, useT } from './lib/i18n'

/**
 * HashRouter, not BrowserRouter. GitHub Pages has no server to rewrite unknown
 * paths back to index.html, so a deep link like /d/kyra/emirates would 404 on
 * refresh. The hash keeps every route client-side.
 */


/** The live count from Discord's public widget. Renders nothing until it loads. */
function OnlineBadge() {
  const onlineCount = useOnlineCount()
  const t = useT()
  if (onlineCount == null) return null
  return (
    <div className="mono flex items-center gap-1.5 whitespace-nowrap border border-edge px-2.5 py-1.5 text-[11px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {t('{n} online', { n: num(onlineCount) })}
    </div>
  )
}

/** How many tabs have the site open right now, via Supabase Presence. */
function SiteVisitorBadge() {
  const visitorCount = useSiteVisitorCount()
  const t = useT()
  if (visitorCount == null) return null
  return (
    <div className="mono flex items-center gap-1.5 whitespace-nowrap border border-edge px-2.5 py-1.5 text-[11px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
      {t('{n} on site', { n: num(visitorCount) })}
    </div>
  )
}

/** Signed out it reads "Resonance"; signed in it is your name. */
function AccountLink({ block = false }: { block?: boolean }) {
  const { user, resonant } = useAuth()
  const t = useT()
  const label = user ? (resonant?.display_name || t('Account')) : 'Resonance'
  return (
    <NavLink
      to="/resonance"
      className={({ isActive }) =>
        `mono border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
          block ? 'block text-center' : 'ml-1'
        } ${
          isActive
            ? 'border-[color:var(--color-cyan)] text-cyan'
            : 'border-edge text-ink-dim hover:border-accent hover:text-ink'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

/**
 * Three links, a button and an account chip come to 526px, which does not fit
 * a 390px phone -- and because the header is the same on every route, that one
 * row was making the WHOLE SITE scroll sideways on mobile. Above 900px it is
 * the row it always was; below, the links fold into a menu and only the two
 * things a visitor actually came for stay out: Discord, and their account.
 */
function MenuButton({ open, onToggle, always }: { open: boolean; onToggle: () => void; always: boolean }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="site-menu"
      aria-label={open ? t('Close menu') : t('Open menu')}
      className={`mono flex h-9 w-9 shrink-0 items-center justify-center border border-edge text-ink-dim transition-colors hover:border-accent hover:text-ink ${always ? '' : 'lg:hidden'}`}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
        {open ? (
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="3" y1="3" x2="12" y2="12" />
            <line x1="12" y1="3" x2="3" y2="12" />
          </g>
        ) : (
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="2" y1="4" x2="13" y2="4" />
            <line x1="2" y1="7.5" x2="13" y2="7.5" />
            <line x1="2" y1="11" x2="13" y2="11" />
          </g>
        )}
      </svg>
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { lang, t } = useI18n()
  const carrierCount = useCarrierCount()
  const airportCount = useAirportCount()
  const divisionCount = useDivisionCount()
  const { pathname } = useLocation()
  // Following a link should close the menu, or the next page opens behind it.
  useEffect(() => setOpen(false), [pathname])

  // The strip (advisory + Travellers/Members) is solid and sticky; the bar
  // floats under it and blends with the page. Their heights go into CSS so
  // the bar knows where to sit and every page knows how far to start down.
  const strip = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const measure = () => {
      root.style.setProperty('--chrome-top', `${strip.current?.offsetHeight ?? 0}px`)
      root.style.setProperty('--bar-h', `${bar.current?.offsetHeight ?? 0}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    if (strip.current) ro.observe(strip.current)
    if (bar.current) ro.observe(bar.current)
    return () => ro.disconnect()
  }, [])

  // Scrolling down tucks the bar up under the strip; any scroll up brings it
  // back. Near the top of the page it always shows. Past a screen's height
  // the back-to-top button appears.
  const [barHidden, setBarHidden] = useState(false)
  const [showTop, setShowTop] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      const dy = y - last
      if (y < 80) setBarHidden(false)
      else if (dy > 6) setBarHidden(true)
      else if (dy < -6) setBarHidden(false)
      if (Math.abs(dy) > 6 || y < 80) last = y
      setShowTop(y > window.innerHeight * 0.9)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  // The full row of links fits in English at 1024px, but not in every
  // language: Vietnamese needs about 1,350px. Rather than let the bar push
  // past the edge of the screen, it folds into the menu button whenever the
  // links do not fit, and unfolds again once there is room for them.
  const row = useRef<HTMLDivElement>(null)
  const [folded, setFolded] = useState(false)
  const needed = useRef(0)
  useEffect(() => {
    needed.current = 0
    setFolded(false)
  }, [lang])
  useEffect(() => {
    const el = row.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => {
      if (!folded) {
        if (el.scrollWidth > el.clientWidth + 1) {
          needed.current = el.scrollWidth
          setFolded(true)
        }
      } else if (needed.current && el.clientWidth >= needed.current) {
        setFolded(false)
      }
    }
    check()
    // The row keeps its width when a late web font widens the links inside
    // it, so watch the children too, and look again whenever fonts load.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    // A font arriving changes what "fits" in both directions: a fallback face
    // can be wider than the real one, so a fold made before the fonts loaded
    // is measured again from scratch.
    const refit = () => {
      if (folded) {
        needed.current = 0
        setFolded(false)
      } else check()
    }
    document.fonts?.addEventListener?.('loadingdone', refit)
    return () => {
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', refit)
    }
  }, [folded, lang, carrierCount])

  // A new page, or the menu open, always shows the bar.
  useEffect(() => setBarHidden(false), [pathname, open])

  return (
    <div className="min-h-screen">
      {/* The advisory outranks the alliance's own chrome while travel is
          disrupted, so it sits above everything. It shares the solid sticky
          strip with the Travellers / Members tabs. */}
      <div ref={strip} className="sticky top-0 z-40">
        <AdvisoryBar onHome={pathname === '/'} />
        <AudienceSwitch />
      </div>
      {/* The bar itself has no background: it floats over the page and is
          drawn in difference mode, so it reads white over black and black
          over white, changing smoothly as the page scrolls beneath it. */}
      <header
        ref={bar}
        className={`site-bar ${barHidden && !open ? 'site-bar-hidden' : ''}`}
        onFocusCapture={() => setBarHidden(false)}
      >
        <div ref={row} className="mx-auto flex max-w-[1440px] items-center gap-x-3 px-4 py-2.5 sm:px-5 sm:py-3">
          <Link to="/" className="flex shrink-0 items-baseline gap-2.5">
            {/* The wing, not a coloured square standing in for it. */}
            <EchoMark height={17} color="var(--color-ink)" />
            <span className="wordmark text-[21px]">Echo</span>
            <span className="wordmark-sub hidden whitespace-nowrap text-[9.5px] text-ink-faint xl:inline">
              United Alliances
            </span>
          </Link>
          <nav className={folded ? 'hidden' : 'ml-auto hidden items-center gap-1 lg:flex'}>
            {NAV.map((l) =>
              l.children ? (
                <NavGroup key={l.to} item={l} />
              ) : (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `mono whitespace-nowrap px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                      isActive ? 'text-cyan' : 'text-ink-faint hover:text-ink-dim'
                    }`
                  }
                >
                  {t(l.label)}
                </NavLink>
              ),
            )}
            <div className="ml-2 flex items-center gap-2">
              <OnlineBadge />
              {/* The drawer always carries it; the bar only has room on wide screens. */}
              <span className="hidden 2xl:contents">
                <SiteVisitorBadge />
              </span>
            </div>
            {discordConfigured && (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary ml-2 !px-4 !py-2"
              >
                {t('Join Discord')}
              </a>
            )}
            <LangMenu />
            <AccountLink />
          </nav>

          {/* the phone header: Discord stays out, everything else folds in */}
          <div className={`ml-auto flex items-center gap-2 ${folded ? '' : 'lg:hidden'}`}>
            <LangMenu />
            {discordConfigured && (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary !px-3 !py-1.5 !text-[10px]"
              >
                Discord
              </a>
            )}
            <MenuButton open={open} onToggle={() => setOpen((o) => !o)} always={folded} />
          </div>
        </div>

      </header>

      <MobileMenu
        always={folded}
        open={open}
        onClose={() => setOpen(false)}
        links={NAV}
        badges={
          <>
            <OnlineBadge />
            <SiteVisitorBadge />
          </>
        }
        account={<AccountLink block />}
      />

      <main className="site-main">{children}</main>

      <footer className="mt-24 border-t border-edge-soft">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-8 text-[12px] text-ink-faint sm:flex-row sm:justify-between">
          <span>
            {rich(t('Echo United Alliances · a virtual airline group in {game}'), {
              game: <span className="text-ink-dim">The Airline Simulator</span>,
            })}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* This was hand-counted, with a note to re-check it on every
                rebuild. Nobody did: the 16 September 2026 scrape left it
                claiming 602 carriers and 2,186 airports against 583 and 2,180.
                It reads the same shared counts as the rest of the site now. */}
            <span className="mono">
              {t('{carriers} carriers · {divisions} divisions · {airports} airports', {
                carriers: num(carrierCount),
                divisions: divisionCount,
                airports: num(airportCount),
              })}
            </span>
            <Link to="/terms" className="hover:text-ink-dim">
              {t('Terms')}
            </Link>
            <Link to="/conduct" className="hover:text-ink-dim">
              {t('Code of conduct')}
            </Link>
            <Link to="/privacy" className="hover:text-ink-dim">
              {t('Privacy')}
            </Link>
            {discordConfigured && (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-cyan"
              >
                {t('Join on Discord')} ↗
              </a>
            )}
          </div>
        </div>
      </footer>

      <button
        type="button"
        className={`to-top ${showTop ? 'to-top-on' : ''}`}
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          })
        }
        aria-label={t('Back to top')}
        tabIndex={showTop ? 0 : -1}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <EchoAssistant />
    </div>
  )
}

function NotFound() {
  const t = useT()
  return (
    <>
      <h1 className="display text-4xl">{t('Off the route map')}</h1>
      <p className="mt-3 text-ink-dim">{t('That page is not in the network.')}</p>
      <Link to="/" className="mono mt-6 inline-block text-cyan">
        ← {t('Back to the alliance')}
      </Link>
    </>
  )
}

const lockUntil = MAINTENANCE_LOCK_UNTIL ? new Date(MAINTENANCE_LOCK_UNTIL) : null

export default function App() {
  // Nothing past this point runs while the lock is up: no auth, no router,
  // no data fetch. See lib/site.ts for how to end it early or move it.
  const [locked, setLocked] = useState(() => !!lockUntil && lockUntil.getTime() > Date.now())
  if (locked && lockUntil) {
    return <MaintenanceLock until={lockUntil} onPass={() => setLocked(false)} />
  }

  return (
    <I18nProvider>
    <SneakPeekProvider>
    <AuthProvider>
      <Welcome />
      <HashRouter>
        <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/divisions" element={<Divisions />} />
          <Route path="/d/:code" element={<DivisionPage />} />
          <Route path="/d/:code/:slug" element={<AirlinePage />} />
          <Route path="/airlines" element={<Directory />} />
          <Route path="/airports/:iata" element={<AirportPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/resonance" element={<Resonance />} />
          <Route path="/news" element={<News />} />
          <Route path="/members" element={<Members />} />
          <Route path="/live" element={<LivePreview />} />
          <Route path="/market" element={<MarketPreview />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/conduct" element={<Conduct />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-[1180px] px-5 py-24 text-center">
                <NotFound />
              </div>
            }
          />
        </Routes>
        </Shell>
      </HashRouter>
    </AuthProvider>
    </SneakPeekProvider>
    </I18nProvider>
  )
}

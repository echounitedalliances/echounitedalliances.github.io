import { useEffect, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Divisions from './pages/Divisions'
import DivisionPage from './pages/Division'
import AirlinePage from './pages/Airline'
import Directory from './pages/Directory'
import AirportPage from './pages/Airport'
import SearchResults from './pages/SearchResults'
import Book from './pages/Book'
import Trips from './pages/Trips'
import NetworkPage from './pages/Network'
import { SITE, discordConfigured } from './lib/site'
import { useOnlineCount } from './lib/discordWidget'
import { useSiteVisitorCount } from './lib/presence'
import { num } from './lib/format'
import Resonance from './pages/Resonance'
import { AuthProvider, useAuth } from './lib/auth'

/**
 * HashRouter, not BrowserRouter. GitHub Pages has no server to rewrite unknown
 * paths back to index.html, so a deep link like /d/kyra/emirates would 404 on
 * refresh. The hash keeps every route client-side.
 */

const links = [
  { to: '/divisions', label: 'Divisions' },
  { to: '/airlines', label: 'Airlines' },
  { to: '/network', label: 'Network' },
  { to: '/trips', label: 'My trips' },
]

/** The live count from Discord's public widget. Renders nothing until it loads. */
function OnlineBadge() {
  const onlineCount = useOnlineCount()
  if (onlineCount == null) return null
  return (
    <div className="mono ml-2 flex items-center gap-1.5 border border-edge px-2.5 py-1.5 text-[11px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {num(onlineCount)} online
    </div>
  )
}

/** How many tabs have the site open right now, via Supabase Presence. */
function SiteVisitorBadge() {
  const visitorCount = useSiteVisitorCount()
  if (visitorCount == null) return null
  return (
    <div className="mono ml-2 flex items-center gap-1.5 border border-edge px-2.5 py-1.5 text-[11px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
      {num(visitorCount)} on site
    </div>
  )
}

/** Signed out it reads "Resonance"; signed in it is your name. */
function AccountLink({ block = false }: { block?: boolean }) {
  const { user, resonant } = useAuth()
  const label = user ? (resonant?.display_name || 'Account') : 'Resonance'
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
function MenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="site-menu"
      aria-label={open ? 'Close menu' : 'Open menu'}
      className="mono flex h-9 w-9 shrink-0 items-center justify-center border border-edge text-ink-dim transition-colors hover:border-accent hover:text-ink lg:hidden"
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
  const { pathname } = useLocation()
  // Following a link should close the menu, or the next page opens behind it.
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-edge-soft bg-[color:var(--color-ground)]/88 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-x-3 px-4 py-2.5 sm:px-5 sm:py-3">
          <Link to="/" className="flex items-baseline gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5"
              // the eight division accents, in roster order
              style={{
                background:
                  'conic-gradient(from 210deg, #45C8F0, #B9F227, #F0605F, #2E6FF2,' +
                  ' #E549C9, #8B5CF6, #2FBF5B, #F4622A, #45C8F0)',
                borderRadius: 2,
              }}
            />
            <span className="wordmark text-[21px]">Echo</span>
            <span className="wordmark-sub hidden text-[9.5px] text-ink-faint sm:inline">
              United Alliances
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `mono px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                    isActive ? 'text-cyan' : 'text-ink-faint hover:text-ink-dim'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <OnlineBadge />
            <SiteVisitorBadge />
            {discordConfigured && (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary ml-2 !px-4 !py-2"
              >
                Join Discord
              </a>
            )}
            <AccountLink />
          </nav>

          {/* the phone header: Discord stays out, everything else folds in */}
          <div className="ml-auto flex items-center gap-2 lg:hidden">
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
            <MenuButton open={open} onToggle={() => setOpen((o) => !o)} />
          </div>
        </div>

        {open && (
          <nav
            id="site-menu"
            className="border-t border-edge-soft bg-[color:var(--color-ground)] px-4 pb-4 pt-3 lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `mono border-b border-edge-soft py-3 text-[12px] uppercase tracking-[0.14em] transition-colors ${
                      isActive ? 'text-cyan' : 'text-ink-dim hover:text-ink'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="pt-3">
                <AccountLink block />
              </div>
            </div>
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-24 border-t border-edge-soft">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-8 text-[12px] text-ink-faint sm:flex-row sm:justify-between">
          <span>
            Echo United Alliances · a virtual airline group in{' '}
            <span className="text-ink-dim">The Airline Simulator</span>
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="mono">590 carriers · 8 divisions · 2,187 airports</span>
            {discordConfigured && (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-cyan"
              >
                Join on Discord ↗
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/divisions" element={<Divisions />} />
          <Route path="/d/:code" element={<DivisionPage />} />
          <Route path="/d/:code/:slug" element={<AirlinePage />} />
          <Route path="/airlines" element={<Directory />} />
          <Route path="/airports/:iata" element={<AirportPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/book" element={<Book />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/resonance" element={<Resonance />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-[1180px] px-5 py-24 text-center">
                <h1 className="display text-4xl">Off the route map</h1>
                <p className="mt-3 text-ink-dim">That page is not in the network.</p>
                <Link to="/" className="mono mt-6 inline-block text-cyan">
                  ← Back to the alliance
                </Link>
              </div>
            }
          />
        </Routes>
        </Shell>
      </HashRouter>
    </AuthProvider>
  )
}

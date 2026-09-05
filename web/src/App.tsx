import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
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

/** Signed out it reads "Resonance"; signed in it is your name. */
function AccountLink() {
  const { user, resonant } = useAuth()
  const label = user ? (resonant?.display_name || 'Account') : 'Resonance'
  return (
    <NavLink
      to="/resonance"
      className={({ isActive }) =>
        `mono ml-1 border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-edge-soft bg-[color:var(--color-ground)]/88 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
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
          <nav className="ml-auto flex items-center gap-1">
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
        </div>
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

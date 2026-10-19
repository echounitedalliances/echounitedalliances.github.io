import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { appByKey, type MemberApp } from '../lib/apps'

/**
 * /live and /market: what a members' app will be, until it is plugged in.
 *
 * Behind the notice is a mock of the app -- sample figures, labelled as such,
 * dimmed so nobody takes it for the real thing. Once lib/apps.ts marks the
 * app live, this page forwards to it instead and the mock never shows.
 */

function TrackerMock() {
  // A handful of arcs and aircraft over a dot grid: the shape of a live map,
  // not a map of anything real.
  const arcs = [
    ['M60 210 Q 240 60 430 150'],
    ['M120 250 Q 330 140 560 230'],
    ['M430 150 Q 520 70 640 120'],
    ['M200 120 Q 360 30 520 90'],
    ['M90 160 Q 180 260 320 270'],
  ]
  const planes: [number, number, number][] = [
    [250, 112, 20], [360, 175, 10], [540, 98, -25], [300, 72, 15], [190, 238, -40],
  ]
  const flights = [
    ['EK 412', 'DXB → SYD', 'En route'],
    ['KY 208', 'LHR → JFK', 'Boarding'],
    ['AE 77', 'HND → LAX', 'En route'],
    ['EO 15', 'SIN → CDG', 'Landed'],
    ['RH 330', 'GRU → MAD', 'En route'],
  ]
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
      <svg viewBox="0 0 700 320" className="panel h-auto w-full" aria-hidden="true">
        <defs>
          <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="var(--color-edge)" />
          </pattern>
        </defs>
        <rect width="700" height="320" fill="url(#dots)" />
        {arcs.map(([d], i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-accent)" strokeOpacity=".55" strokeWidth="1.4" />
        ))}
        {planes.map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
            <path d="M-7 0 L7 0 M0 -5 L0 5 M-6 -2 L-6 2" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" />
          </g>
        ))}
      </svg>
      <div className="panel p-3">
        <p className="eyebrow text-ink-faint">In the air</p>
        <ul className="mt-2 divide-y divide-[color:var(--color-edge-soft)]">
          {flights.map(([f, r, s]) => (
            <li key={f} className="flex items-center justify-between py-2 text-[13px]">
              <span>
                <span className="mono text-ink">{f}</span>
                <span className="ml-2 text-ink-dim">{r}</span>
              </span>
              <span className="mono text-[10.5px] uppercase text-cyan">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function MarketMock() {
  const listings = [
    ['Airbus A320neo', '12 in stock', '$98.2M', '$110.6M'],
    ['Boeing 787-9', '4 in stock', '$262.0M', '$292.5M'],
    ['Airbus A350-900', '6 in stock', '$281.4M', '$317.4M'],
    ['Boeing 737 MAX 8', '9 in stock', '$108.9M', '$121.6M'],
    ['Embraer E195-E2', '7 in stock', '$56.1M', '$60.4M'],
    ['ATR 72-600', '15 in stock', '$24.3M', '$26.8M'],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map(([model, stock, price, list]) => (
        <div key={model} className="panel p-4">
          <div className="flex h-20 items-center justify-center border border-edge-soft bg-[color:var(--color-ground-2)]">
            <svg width="90" height="36" viewBox="0 0 90 36" aria-hidden="true">
              <path d="M4 20 L70 18 Q86 18 86 20 Q86 22 70 22 L4 22 Z M34 19 L22 4 L30 4 L50 19 M34 21 L22 34 L30 34 L50 21 M8 20 L4 10 L10 10 L16 19" fill="var(--color-surface-2)" stroke="var(--color-ink-faint)" />
            </svg>
          </div>
          <p className="mt-3 text-[15px] text-ink">{model}</p>
          <p className="mono text-[11px] text-ink-faint">{stock}</p>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="mono text-lg text-ink">{price}</span>
            <span className="mono text-[11px] text-ink-faint line-through">{list}</span>
          </div>
          <div className="btn btn-ghost mt-3 w-full justify-center">Order</div>
        </div>
      ))}
    </div>
  )
}

function DiscordGlyph() {
  return (
    <svg width="16" height="12" viewBox="0 0 71 55" aria-hidden="true" fill="currentColor">
      <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A39 39 0 0 0 25.8.4 58.4 58.4 0 0 0 11.2 4.9C2 18.7-.5 32.2.7 45.5a58.9 58.9 0 0 0 17.9 9 43 43 0 0 0 3.8-6.2 38 38 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 35.9 0l1.5 1.1a38 38 0 0 1-6 2.9 43 43 0 0 0 3.8 6.2 58.7 58.7 0 0 0 17.9-9c1.5-15.4-2.5-28.8-10.9-40.6ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z" />
    </svg>
  )
}

function Preview({ app }: { app: MemberApp }) {
  // Plugged in: this page only forwards.
  useEffect(() => {
    if (app.live) window.location.replace(app.url)
  }, [app])

  return (
    <>
      <section className="aurora relative overflow-hidden border-b border-edge-soft">
        <div className="mx-auto max-w-[1180px] px-4 pt-8 pb-8 sm:px-5 sm:pt-12">
          <Link to="/members" className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink-dim">
            ← Members' area
          </Link>
          <h1 className="display mt-3 text-[clamp(32px,6vw,64px)]">{app.name}</h1>
          <p className="mt-3 max-w-[62ch] text-ink-dim sm:text-lg">{app.tagline}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 pt-8 sm:px-5">
        <div className="relative">
          {/* the mock: dimmed, blurred, and not interactive */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none opacity-45 blur-[1.5px]"

          >
            {app.key === 'live' ? <TrackerMock /> : <MarketMock />}
          </div>

          <div className="absolute inset-0 flex items-start justify-center p-3 pt-6 lg:items-center lg:pt-3">
            <div
              role="status"
              className="w-full max-w-[440px] border border-edge bg-[color:var(--color-surface)]/95 p-6 text-center shadow-2xl backdrop-blur"
            >
              <p className="eyebrow text-cyan">Members only</p>
              <p className="display mt-2 text-[34px] leading-none">Page coming soon</p>
              <p className="mt-3 text-[14px] text-ink-dim">
                {app.name} is moving to <span className="mono text-ink">{app.plannedUrl.replace('https://', '')}</span>.
                You'll sign in with your Discord account.
              </p>
              <ul className="mt-4 space-y-1.5 text-left text-[13px] text-ink-dim">
                {app.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-cyan">·</span>
                    {p}
                  </li>
                ))}
              </ul>
              <button type="button" disabled className="btn btn-primary mt-5 w-full justify-center gap-2">
                <DiscordGlyph /> Sign in with Discord
              </button>
              <p className="mono mt-3 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                Preview · sample data
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function LivePreview() {
  return <Preview app={appByKey('live')} />
}

export function MarketPreview() {
  return <Preview app={appByKey('market')} />
}

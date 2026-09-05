import { Link } from 'react-router-dom'
import type { Airline } from '../lib/types'
import { accentOf, flag, initials, num } from '../lib/format'

/** A carrier's stand-in identity: its code on its division's accent. */
export function Mark({
  airline,
  size = 40,
}: {
  airline: Pick<Airline, 'airline_code' | 'carrier_code' | 'accent_color'>
  size?: number
}) {
  const accent = accentOf(airline)
  return (
    <div
      className="mark"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${accent}, ${accent}88)`,
        fontSize: Math.round(size * 0.36),
        borderRadius: Math.round(size * 0.18),
      }}
      aria-hidden="true"
    >
      {initials(airline.airline_code, airline.carrier_code)}
    </div>
  )
}

export function Stat({
  value,
  label,
  accent,
}: {
  value: string | number
  label: string
  accent?: string
}) {
  return (
    <div className="px-4 py-3">
      <div
        className="mono text-2xl leading-tight"
        style={accent ? { color: accent } : undefined}
      >
        {typeof value === 'number' ? num(value) : value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.09em] text-ink-faint">
        {label}
      </div>
    </div>
  )
}

export function DivisionChip({
  code,
  name,
  accent,
}: {
  code: string
  name: string
  accent: string
}) {
  return (
    <Link
      to={`/d/${code}`}
      className="mono inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] transition-colors"
      style={{ color: accent, borderColor: `${accent}55` }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: accent }}
      />
      {name}
    </Link>
  )
}

/** One carrier in a list or grid. Same object everywhere it appears. */
export function AirlineCard({ a }: { a: Airline }) {
  const accent = accentOf(a)
  return (
    <Link
      to={`/d/${a.division_code}/${a.airline_slug}`}
      className="panel lift group flex items-start gap-3 p-4"
      style={{ ['--card-accent' as string]: accent }}
    >
      <Mark airline={a} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-ink">
            {a.airline_name?.trim() || 'Unnamed carrier'}
          </span>
          <span className="mono shrink-0 text-[11px] text-ink-faint">
            {a.carrier_code}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
          <span style={{ color: accent }}>{a.division_name}</span>
          {a.airline_country && (
            <span>
              {flag(a.airline_country)} {a.airline_country}
            </span>
          )}
        </div>
        <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim">
          <span>{num(a.fleet_size)} aircraft</span>
          <span>{num(a.routes)} routes</span>
          <span>{num(a.destinations)} destinations</span>
        </div>
      </div>
    </Link>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="mono py-16 text-center text-[12px] tracking-[0.14em] text-ink-faint uppercase">
      {label}…
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel p-8 text-center text-ink-dim">{children}</div>
  )
}

/** Shown when the Supabase environment variables are missing from the build. */
export function NotConfigured() {
  return (
    <div
      className="panel mx-auto my-16 max-w-xl p-6"
      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
    >
      <h2 className="display mb-2 text-2xl">The database is not connected</h2>
      <p className="text-ink-dim">
        This build has no <code className="mono text-cyan">VITE_SUPABASE_URL</code> or{' '}
        <code className="mono text-cyan">VITE_SUPABASE_ANON_KEY</code>. Copy{' '}
        <code className="mono">web/.env.example</code> to{' '}
        <code className="mono">web/.env.local</code> and fill them in, or set them
        as repository variables for the GitHub Pages build.
      </p>
    </div>
  )
}

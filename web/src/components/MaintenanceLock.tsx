import { useEffect, useState } from 'react'
import EchoMark from './EchoMark'
import { SITE, discordConfigured } from '../lib/site'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Whole seconds remaining, floored at 0 -- never negative, never fractional. */
function remaining(until: Date) {
  return Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000))
}

function Countdown({ until }: { until: Date }) {
  const [secs, setSecs] = useState(() => remaining(until))

  useEffect(() => {
    const id = window.setInterval(() => setSecs(remaining(until)), 1000)
    return () => window.clearInterval(id)
  }, [until])

  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60

  return (
    <div className="mono mt-8 text-[clamp(32px,7vw,64px)] tabular-nums text-ink">
      {pad(h)}:{pad(m)}:{pad(s)}
    </div>
  )
}

/**
 * The whole site, replaced by this one screen, while MAINTENANCE_LOCK_UNTIL
 * (lib/site.ts) is in the future. Nothing behind it runs: App.tsx renders
 * this instead of AuthProvider and the router, so there is no sign-in, no
 * data fetch, and no route to fall through to. Nothing is deleted anywhere
 * -- accounts, bookings, and admin applications sit exactly as they were.
 *
 * onPass fires once, the moment the countdown reaches zero, and App.tsx uses
 * it to switch over to the real site immediately -- nobody has to reload.
 */
export default function MaintenanceLock({
  until,
  onPass,
}: {
  until: Date
  onPass: () => void
}) {
  useEffect(() => {
    if (remaining(until) === 0) {
      onPass()
      return
    }
    const id = window.setInterval(() => {
      if (remaining(until) === 0) onPass()
    }, 1000)
    return () => window.clearInterval(id)
  }, [until, onPass])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <EchoMark height={40} color="var(--color-accent)" />
      <p className="eyebrow mt-8 text-cyan">Pre-launch lock</p>
      <h1 className="display mt-3 text-[clamp(30px,5vw,52px)]">
        Echo is between flights
      </h1>
      <p className="mt-4 max-w-[52ch] text-lg text-ink-dim">
        The site is temporarily locked while we finish getting things ready.
        Nothing is lost — every account, booking, and application is still
        here, exactly as it was — and it reopens on its own when the
        countdown below reaches zero.
      </p>

      <Countdown until={until} />

      {discordConfigured && (
        <a
          href={SITE.discordInvite}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mt-8"
        >
          Follow along on Discord ↗
        </a>
      )}
    </div>
  )
}

import EchoMark from './EchoMark'
import { SITE, discordConfigured } from '../lib/site'

/**
 * The whole site, replaced by this one screen, while MAINTENANCE_LOCK is on
 * in lib/site.ts. Nothing behind it runs: App.tsx renders this instead of
 * AuthProvider and the router, so there is no sign-in, no data fetch, and no
 * route to fall through to. Nothing is deleted anywhere -- accounts,
 * bookings, and admin applications sit exactly as they were, waiting for the
 * flag to flip back.
 */
export default function MaintenanceLock() {
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
        here, exactly as it was, and the site reopens as soon as the lock
        comes off.
      </p>
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

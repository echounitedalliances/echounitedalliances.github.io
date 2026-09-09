import { SITE, discordConfigured } from '../lib/site'
import { useOnlineCount } from '../lib/discordWidget'
import { num } from '../lib/format'

/**
 * The join panel. Applying happens on Discord; this is the one place the
 * site asks something of the reader, and it says plainly what applying
 * involves.
 */
export default function Join({ compact = false }: { compact?: boolean }) {
  const onlineCount = useOnlineCount()

  if (compact) {
    return (
      <a
        href={discordConfigured ? SITE.discordInvite : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost"
      >
        Join on Discord ↗
      </a>
    )
  }

  return (
    <section className="border-y border-edge-soft bg-ground-2">
      <div className="mx-auto max-w-[1180px] px-5 py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="eyebrow text-cyan">Membership</p>
            <h2 className="display mt-3 text-[clamp(30px,4vw,44px)]">
              Fly with Echo
            </h2>
            <p className="mt-4 max-w-[60ch] text-lg text-ink-dim">
              {SITE.joinRequirement}
            </p>

            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {SITE.joinSteps.map((s, i) => (
                <li key={s.title} className="border-t border-edge pt-3">
                  <div className="mono text-[11px] uppercase tracking-[0.12em] text-cyan">
                    Step {i + 1}
                  </div>
                  <div className="mt-1 font-medium text-ink">{s.title}</div>
                  <p className="mt-1 text-[14px] text-ink-faint">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <aside className="panel flex flex-col justify-center p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Echo Alliances
              </div>
              {onlineCount != null && (
                <div className="mono flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {num(onlineCount)} online
                </div>
              )}
            </div>
            <p className="mt-2 text-ink-dim">
              Apply on Discord — a division lead picks it up from there.
            </p>

            {discordConfigured ? (
              <a
                href={SITE.discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary mt-5 w-full"
              >
                Open the Discord ↗
              </a>
            ) : (
              <div className="mono mt-5 border border-edge px-5 py-3.5 text-center text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Invite link not set yet
              </div>
            )}

            <p className="mt-3 text-[12px] text-ink-faint">
              Applying in the game alone is not enough — both steps are required.
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}

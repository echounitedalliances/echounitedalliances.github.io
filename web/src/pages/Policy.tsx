import { Link } from 'react-router-dom'
import { CONDUCT, PRIVACY, type Policy } from '../lib/policies'
import { SITE, discordConfigured } from '../lib/site'

/**
 * One renderer for both policy pages.
 *
 * They are the same shape — a lede, then numbered sections of prose and the
 * occasional list — and the only thing that differs is the words. Two nearly
 * identical page components would drift apart the first time one of them was
 * restyled.
 *
 * Both end at the same place, because both do: every route out of here is a
 * conversation with a person on Discord.
 */
function PolicyPage({ policy }: { policy: Policy }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">{policy.eyebrow}</p>
      <h1 className="display mt-3 text-[clamp(34px,5vw,58px)]">{policy.title}</h1>
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">{policy.lede}</p>
      <p className="mono mt-4 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
        Last updated {policy.updated}
      </p>

      <div className="mt-12 flex flex-col gap-10">
        {policy.sections.map((s, i) => (
          <section key={s.heading} className="border-t border-edge-soft pt-8">
            <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:gap-10">
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-ink-faint lg:w-10">
                {String(i + 1).padStart(2, '0')}
              </p>
              <div>
                <h2 className="display text-[clamp(22px,2.6vw,30px)]">{s.heading}</h2>
                <div className="mt-4 flex flex-col gap-4">
                  {s.body.map((p) => (
                    <p key={p.slice(0, 32)} className="max-w-[64ch] text-ink-dim">
                      {p}
                    </p>
                  ))}
                </div>
                {s.list && (
                  <ul className="mt-4 flex max-w-[64ch] flex-col gap-3">
                    {s.list.map((item) => (
                      <li key={item.slice(0, 32)} className="flex gap-3 text-ink-dim">
                        <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 bg-cyan" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="panel mt-12 p-6">
        <h2 className="display text-xl">Questions, or something to report</h2>
        <p className="mt-2 max-w-[62ch] text-ink-dim">
          Everything on this page is handled by a person, not a form. Open a ticket in
          our Discord server, or message a division leader or board member directly.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {discordConfigured && (
            <a
              href={SITE.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90"
            >
              Join on Discord ↗
            </a>
          )}
          <Link to="/about" className="mono text-[11px] uppercase tracking-[0.14em] text-cyan">
            Who runs the alliance →
          </Link>
          <a
            href={SITE.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
          >
            Read the source ↗
          </a>
        </div>
      </div>
    </div>
  )
}

export function Conduct() {
  return <PolicyPage policy={CONDUCT} />
}

export function Privacy() {
  return <PolicyPage policy={PRIVACY} />
}

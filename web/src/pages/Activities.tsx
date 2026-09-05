import { Link } from 'react-router-dom'
import { ACTIVITIES } from '../lib/alliance'
import { SITE, discordConfigured } from '../lib/site'

/**
 * What the group does together.
 *
 * All of it happens on Discord rather than on this site — the site is where
 * the network is drawn and tickets are booked; the trading and the events are
 * a conversation. So every section ends up pointing at the same place, and
 * the page says so once at the bottom instead of eight times.
 */
export default function Activities() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">Our activities</p>
      <h1 className="display mt-3 text-[clamp(34px,5vw,58px)]">
        More than a shared logo
      </h1>
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">
        Echo members trade aircraft with each other, fill each other's orders,
        and compete for the odd prize. None of it is automated and none of it
        is scheduled — it runs on people being online at the same time.
      </p>

      <div className="mt-12 flex flex-col gap-12">
        {ACTIVITIES.map((a, i) => (
          <section key={a.id} id={a.id} className="border-t border-edge-soft pt-8">
            <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h2 className="display mt-2 text-[clamp(26px,3.4vw,38px)]">{a.name}</h2>
                <p className="mt-2 text-lg text-cyan">{a.lede}</p>
                <div className="mt-5 flex flex-col gap-4">
                  {a.body.map((para) => (
                    <p key={para.slice(0, 32)} className="max-w-[62ch] text-ink-dim">
                      {para}
                    </p>
                  ))}
                </div>
              </div>

              <dl className="panel h-fit p-5">
                {a.facts.map((f, n) => (
                  <div
                    key={f.label}
                    className={n > 0 ? 'mt-4 border-t border-edge-soft pt-4' : ''}
                  >
                    <dt className="mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      {f.label}
                    </dt>
                    <dd className="mt-1.5 text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ))}
      </div>

      <section className="panel mt-14 p-6">
        <h2 className="display text-2xl">All of it happens on Discord</h2>
        <p className="mt-2 max-w-[62ch] text-ink-dim">
          The sales channel, the buy tickets, the challenges and the results
          are all there. You need to be a member of a division to take part —{' '}
          <Link to="/divisions" className="text-cyan">
            pick one
          </Link>{' '}
          and apply in the game and on Discord both.
        </p>
        {discordConfigured && (
          <a
            href={SITE.discordInvite}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary mt-5"
          >
            Join on Discord ↗
          </a>
        )}
      </section>
    </div>
  )
}

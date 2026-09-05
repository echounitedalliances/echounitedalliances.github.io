import { useState } from 'react'
import { SITE, discordConfigured } from '../lib/site'
import { applyWebhookConfigured, submitApplication } from '../lib/discord'
import type { Division } from '../lib/types'

function ApplyForm({ divisions }: { divisions: Division[] }) {
  const [airlineName, setAirlineName] = useState('')
  const [divisionName, setDivisionName] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!airlineName.trim() || !divisionName) return
    setStatus('sending')
    try {
      await submitApplication({ airlineName: airlineName.trim(), divisionName, notes: notes.trim() })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="mono mt-4 border border-edge px-5 py-3.5 text-center text-[11px] uppercase tracking-[0.14em] text-ink-faint">
        Application sent — a division lead will follow up on Discord.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <div>
        <label htmlFor="apply-airline" className="eyebrow mb-1.5 block text-ink-faint">
          Airline name
        </label>
        <input
          id="apply-airline"
          value={airlineName}
          onChange={(e) => setAirlineName(e.target.value)}
          placeholder="Your airline"
          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="apply-division" className="eyebrow mb-1.5 block text-ink-faint">
          Division
        </label>
        <select
          id="apply-division"
          value={divisionName}
          onChange={(e) => setDivisionName(e.target.value)}
          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
        >
          <option value="">Choose a division</option>
          {divisions.map((d) => (
            <option key={d.division_code} value={d.division_name}>
              {d.division_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="apply-notes" className="eyebrow mb-1.5 block text-ink-faint">
          Notes (optional)
        </label>
        <textarea
          id="apply-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Fleet, routes, anything a division lead should know"
          className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={!airlineName.trim() || !divisionName || status === 'sending'}
        className="btn btn-primary w-full"
      >
        {status === 'sending' ? 'Sending…' : 'Send application'}
      </button>
      {status === 'error' && (
        <p className="text-[12px] text-red-400">
          Something went wrong — try again, or apply on Discord instead.
        </p>
      )}
    </form>
  )
}

/**
 * The join panel. The expected path through this site is
 * outsider -> website -> Discord, so this is the one place the site asks
 * something of the reader, and it says plainly what applying involves.
 */
export default function Join({ compact = false, divisions = [] }: { compact?: boolean; divisions?: Division[] }) {
  const [method, setMethod] = useState<'discord' | 'website'>('discord')
  const showToggle = discordConfigured && applyWebhookConfigured

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
            <div className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Echo Alliances
            </div>
            <p className="mt-2 text-ink-dim">
              Apply on Discord, or use the form below — either one reaches a
              division lead the same way.
            </p>

            {showToggle && (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('discord')}
                  className={`btn w-full ${method === 'discord' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Discord
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('website')}
                  className={`btn w-full ${method === 'website' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Website form
                </button>
              </div>
            )}

            {(!showToggle || method === 'discord') &&
              (discordConfigured ? (
                <a
                  href={SITE.discordInvite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary mt-5 w-full"
                >
                  Open the Discord ↗
                </a>
              ) : (
                !applyWebhookConfigured && (
                  <div className="mono mt-5 border border-edge px-5 py-3.5 text-center text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                    Invite link not set yet
                  </div>
                )
              ))}

            {(!showToggle || method === 'website') && applyWebhookConfigured && (
              <ApplyForm divisions={divisions} />
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

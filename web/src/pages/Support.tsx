import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { submitSupportTicket } from '../lib/support'
import type { TicketCategory } from '../lib/types'
import { useT } from '../lib/i18n'
import { tapError, tapSuccess } from '../lib/haptics'

/**
 * Support: the one place to tell the people running the site about a bug, an
 * idea, or anything else, instead of having to find someone on Discord.
 *
 * The category comes first and the form after, the way Apple's own support
 * site sorts a visit before it asks for details -- so a bug report's box
 * asks what a bug report needs (what happened, what you expected, with the
 * page and browser sent along automatically) rather than one generic box
 * trying to be right for everything.
 *
 * Open to anyone, signed in or not: submitSupportTicket (lib/support.ts) is
 * granted to anon as well as authenticated. A signed-in Resonant's address
 * comes from their own account and nothing here asks for it again; everyone
 * else may leave one, or not, and accepts that leaving none means nobody can
 * write back.
 */
const CATEGORIES: { id: TicketCategory; title: string; body: string }[] = [
  {
    id: 'bug',
    title: 'Report a bug',
    body: 'Something on the site is broken, missing, or not doing what it should.',
  },
  {
    id: 'suggestion',
    title: 'Suggest something',
    body: 'An idea for a feature, or a way to make the site better.',
  },
  {
    id: 'account',
    title: 'Account & sign-in',
    body: 'Trouble with your Resonance account, or signing in with Discord.',
  },
  {
    id: 'other',
    title: 'Something else',
    body: 'Anything that does not fit the others.',
  },
]

const SUBJECT_MAX = 200
const MESSAGE_MAX = 4000

export default function Support() {
  const t = useT()
  const { user } = useAuth()
  const [category, setCategory] = useState<TicketCategory | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const chosen = CATEGORIES.find((c) => c.id === category) ?? null
  const canSubmit = subject.trim().length > 0 && message.trim().length > 0

  const reset = () => {
    setCategory(null)
    setSubject('')
    setMessage('')
    setEmail('')
    setStatus('idle')
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !category) return
    setStatus('sending')
    setError('')
    try {
      await submitSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
        email,
      })
      tapSuccess()
      setStatus('sent')
    } catch {
      tapError()
      setStatus('error')
      setError(t('Something went wrong sending that. Try again in a moment.'))
    }
  }

  if (status === 'sent') {
    const left = email.trim()
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-5">
        <p className="eyebrow text-cyan">{t('Support')}</p>
        <h1 className="display mt-3 text-[clamp(30px,4vw,44px)]">{t('Sent')}</h1>
        <p className="mt-4 text-lg text-ink-dim">
          {user
            ? t('Thanks, we read every one of these. You can check on this from your Resonance page any time.')
            : left
              ? t('Thanks, we read every one of these. We will write back to {email} if there is anything to say.', {
                  email: left,
                })
              : t('Thanks, we read every one of these.')}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-ghost">
            {t('Send another')}
          </button>
          {user && (
            <Link to="/resonance" className="btn btn-primary">
              {t('Go to Resonance')}
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-9 sm:px-5 sm:py-16">
      <p className="eyebrow text-cyan">{t('Support')}</p>
      <h1 className="display mt-3 text-[clamp(32px,4.6vw,52px)]">{t('How can we help?')}</h1>
      <p className="mt-4 max-w-[58ch] text-lg text-ink-dim">
        {t('This goes straight to the people who run the site, not the board. Pick what this is about.')}
      </p>

      {!chosen ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className="panel lift p-5 text-left"
            >
              <h2 className="text-lg text-ink">{t(c.title)}</h2>
              <p className="mt-1.5 text-sm text-ink-dim">{t(c.body)}</p>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="mono self-start text-[11px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink"
          >
            {t('← Change')}
          </button>

          <div className="panel p-4">
            <p className="eyebrow text-ink-faint">{t(chosen.title)}</p>
            <p className="mt-1 text-sm text-ink-dim">{t(chosen.body)}</p>
          </div>

          <label className="block">
            <span className="eyebrow mb-1.5 block text-ink-faint">{t('Subject')}</span>
            <input
              value={subject}
              autoFocus
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('A short summary')}
              className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="eyebrow mb-1.5 block text-ink-faint">{t('Message')}</span>
            <textarea
              value={message}
              maxLength={MESSAGE_MAX}
              rows={7}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'bug'
                  ? t(
                      'What happened, and what you expected instead. The page you are on and your browser are sent along automatically.',
                    )
                  : t('As much detail as you can give.')
              }
              className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            />
            <span className="mt-1.5 block text-[11px] text-ink-faint">
              {message.length}/{MESSAGE_MAX}
            </span>
          </label>

          {!user && (
            <label className="block">
              <span className="eyebrow mb-1.5 block text-ink-faint">{t('Your email (optional)')}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('So we can write back, if there is anything to say')}
                className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit || status === 'sending'}
            className="btn btn-primary mt-1 self-start"
          >
            {status === 'sending' ? t('Sending…') : t('Send')}
          </button>

          {status === 'error' && <p className="text-[12px] text-danger">{error}</p>}
        </form>
      )}
    </div>
  )
}

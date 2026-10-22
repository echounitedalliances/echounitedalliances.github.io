import { useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../lib/auth'
import { submitAdminApplication } from '../lib/adminApply'
import { MIN_PASSWORD, explain } from './ResonanceAuth'
import { useT } from '../lib/i18n'

/**
 * Applying to join the board, from either side of an account.
 *
 * From signup: creates the Resonance account first (email + password), then
 * sends the application, so checking "apply for admin" costs nothing extra
 * beyond a Discord username. From an existing account, the email is already
 * known and there is no password to collect -- it only sends the
 * application.
 *
 * Either way this is a request, not a grant. Nothing here changes is_admin;
 * a board member does that by hand once they have read it -- now from the
 * queue on their own Resonance page rather than out of psql.
 */
export default function AdminApplyModal({
  createAccount,
  initialEmail,
  initialPassword = '',
  onClose,
}: {
  createAccount: boolean
  initialEmail: string
  initialPassword?: string
  onClose: () => void
}) {
  const { signUp } = useAuth()
  const t = useT()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState(initialPassword)
  const [discordUsername, setDiscordUsername] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [error, setError] = useState('')

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const canSubmit =
    emailOk &&
    discordUsername.trim().length > 0 &&
    (!createAccount || password.length >= MIN_PASSWORD)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setStatus('sending')
    setError('')

    if (createAccount) {
      const { error: signUpError, needsConfirmation: nc } = await signUp(email, password)
      if (signUpError) {
        setStatus('error')
        setError(explain(signUpError))
        return
      }
      setNeedsConfirmation(nc)
      // An account waiting on its confirmation email has no session yet, and
      // the application is filed under the signed-in account -- so it is
      // sent from the Resonance page once they have confirmed and signed in.
      if (nc) {
        setStatus('sent')
        return
      }
    }

    try {
      await submitAdminApplication({ discordUsername: discordUsername.trim() })
      setStatus('sent')
    } catch {
      setStatus('error')
      setError(
        createAccount
          ? t('Your account was created, but the application could not be sent. Message a board member directly.')
          : t('Something went wrong. Try again, or message a board member directly.'),
      )
    }
  }

  if (status === 'sent') {
    return (
      <Modal title={createAccount && needsConfirmation ? t('Confirm your email') : t('Application sent')} onClose={onClose}>
        <p className="text-ink-dim">
          {createAccount && `${t('Account created.')} `}
          {createAccount && needsConfirmation
            ? t('Confirm {email} from the email we just sent, then sign in and choose “Apply for admin” on your Resonance page to send the application to the board.', { email })
            : t('Your admin application is with the board, and someone will follow up with you on Discord.')}
        </p>
      </Modal>
    )
  }

  return (
    <Modal title={t('Apply for admin')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-dim">
          {t('This goes to the board, who will follow up with you on Discord. It is a request, not an approval.')}
        </p>

        <label className="block">
          <span className="eyebrow mb-1.5 block text-ink-faint">{t('Email')}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>

        {createAccount && (
          <label className="block">
            <span className="eyebrow mb-1.5 block text-ink-faint">{t('Password')}</span>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1.5 block text-[11px] text-ink-faint">
              {t('At least {n} characters.', { n: MIN_PASSWORD })}
            </span>
          </label>
        )}

        <label className="block">
          <span className="eyebrow mb-1.5 block text-ink-faint">{t('Discord username')}</span>
          <input
            required
            value={discordUsername}
            onChange={(e) => setDiscordUsername(e.target.value)}
            placeholder="yourname"
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit || status === 'sending'}
          className="btn btn-primary mt-1"
        >
          {status === 'sending'
            ? t('Sending…')
            : createAccount
              ? t('Create account & apply')
              : t('Send application')}
        </button>

        {status === 'error' && <p className="text-[12px] text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

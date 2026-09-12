import { useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../lib/auth'
import { submitAdminApplication } from '../lib/adminApply'
import { MIN_PASSWORD, explain } from './ResonanceAuth'

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
    }

    try {
      await submitAdminApplication({ email, discordUsername: discordUsername.trim() })
      setStatus('sent')
    } catch {
      setStatus('error')
      setError(
        createAccount
          ? 'Your account was created, but the application could not be sent — message a board member directly.'
          : 'Something went wrong — try again, or message a board member directly.',
      )
    }
  }

  if (status === 'sent') {
    return (
      <Modal title="Application sent" onClose={onClose}>
        <p className="text-ink-dim">
          {createAccount && 'Account created. '}
          {createAccount && needsConfirmation
            ? `Confirm ${email} from the email we just sent, then sign in. `
            : ''}
          Your admin application is with the board — someone will follow up
          with you on Discord.
        </p>
      </Modal>
    )
  }

  return (
    <Modal title="Apply for admin" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-dim">
          This goes to the board, who will follow up with you on Discord. It
          is a request, not an approval.
        </p>

        <label className="block">
          <span className="eyebrow mb-1.5 block text-ink-faint">Email</span>
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
            <span className="eyebrow mb-1.5 block text-ink-faint">Password</span>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1.5 block text-[11px] text-ink-faint">
              At least {MIN_PASSWORD} characters.
            </span>
          </label>
        )}

        <label className="block">
          <span className="eyebrow mb-1.5 block text-ink-faint">Discord username</span>
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
            ? 'Sending…'
            : createAccount
              ? 'Create account & apply'
              : 'Send application'}
        </button>

        {status === 'error' && <p className="text-[12px] text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

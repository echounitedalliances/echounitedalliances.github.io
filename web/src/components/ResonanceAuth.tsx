import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Getting into a Resonance account.
 *
 * This used to be one field and a magic link. A link is genuinely good for
 * signing up — nothing to invent, nothing to remember — and genuinely bad for
 * signing in on a phone, where it throws you out to a mail app and back. So
 * both are here, password first, because that is the one people reach for
 * when they already have an account.
 *
 * Passwords are never held, logged, or put in component state longer than the
 * submit that uses them: the field's value goes straight to supabase-js, which
 * sends it to GoTrue over TLS. Nothing about a password reaches this project's
 * own database.
 */

/** What the server enforces is set in the dashboard; this is the front door. */
const MIN_PASSWORD = 8

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  id,
}: {
  label: string
  type: 'email' | 'password'
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder?: string
  hint?: string
  id: string
}) {
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  return (
    <label className="block" htmlFor={id}>
      <span className="eyebrow mb-1.5 block text-ink-faint">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={isPassword ? MIN_PASSWORD : undefined}
          className={`w-full border border-edge bg-ground-2 py-2.5 pl-3 text-ink outline-none placeholder:text-ink-faint focus:border-accent ${
            isPassword ? 'pr-16' : 'pr-3'
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-pressed={reveal}
            className="mono absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
          >
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}
      </span>
      {hint && <span className="mt-1.5 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  )
}

type Mode = 'password' | 'signup' | 'link' | 'forgot'

const TABS: { key: Mode; label: string }[] = [
  { key: 'password', label: 'Password' },
  { key: 'link', label: 'Email link' },
]

export function SignIn() {
  const { signInWithPassword, signInWithLink, signUp, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setNote(null)
    setPassword('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)

    if (mode === 'password') {
      const { error } = await signInWithPassword(email, password)
      setBusy(false)
      setPassword('')
      if (error) {
        setError(
          /invalid login credentials/i.test(error)
            ? 'That email and password do not match. If you have only ever used a sign-in link, you will not have a password yet — use the Email link tab, then set one from your account.'
            : error,
        )
      }
      return
    }

    if (mode === 'signup') {
      const { error, needsConfirmation } = await signUp(email, password)
      setBusy(false)
      setPassword('')
      if (error) setError(error)
      else if (needsConfirmation)
        setNote(
          `Account created. Confirm ${email} from the email we just sent, then sign in with your password.`,
        )
      return
    }

    if (mode === 'forgot') {
      const { error } = await sendPasswordReset(email)
      setBusy(false)
      if (error) setError(error)
      else
        setNote(
          `If ${email} has an account, a reset link is on its way. Opening it brings you back here to choose a new password.`,
        )
      return
    }

    const { error } = await signInWithLink(email)
    setBusy(false)
    if (error) setError(error)
    else setNote(`A sign-in link is on its way to ${email}. It opens this page already signed in.`)
  }

  const heading =
    mode === 'signup'
      ? 'Create an account'
      : mode === 'forgot'
        ? 'Reset your password'
        : 'Sign in'

  const cta =
    mode === 'signup'
      ? 'Create account'
      : mode === 'forgot'
        ? 'Send reset link'
        : mode === 'link'
          ? 'Send a sign-in link'
          : 'Sign in'

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const wantsPassword = mode === 'password' || mode === 'signup'
  const canSubmit = emailOk && (!wantsPassword || password.length >= MIN_PASSWORD) && !busy

  return (
    <>
      {/* Two ways in. Neither is right on its own, so neither is hidden. */}
      {(mode === 'password' || mode === 'link') && (
        <div className="mt-8 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              aria-pressed={mode === t.key}
              className={`chip ${mode === t.key ? 'chip-on' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={submit}
        className={`panel flex flex-col gap-4 p-5 ${mode === 'password' || mode === 'link' ? 'mt-3' : 'mt-8'}`}
      >
        <h2 className="display text-2xl">{heading}</h2>

        {mode === 'link' && (
          <p className="-mt-2 text-sm text-ink-dim">
            No password needed. We send a one-time link that opens this page
            signed in.
          </p>
        )}
        {mode === 'signup' && (
          <p className="-mt-2 text-sm text-ink-dim">
            One account across all 590 carriers. You can also book without one.
          </p>
        )}

        <Field
          id="res-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
        />

        {wantsPassword && (
          <Field
            id="res-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={
              mode === 'signup'
                ? `At least ${MIN_PASSWORD} characters. Use something you do not use elsewhere.`
                : undefined
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!canSubmit} className="btn btn-book">
            {busy ? 'Working…' : cta}
          </button>

          {mode === 'password' && (
            <>
              <button
                type="button"
                onClick={() => go('signup')}
                className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
              >
                Create an account
              </button>
              <button
                type="button"
                onClick={() => go('forgot')}
                className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
              >
                Forgot password
              </button>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <button
              type="button"
              onClick={() => go('password')}
              className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
            >
              ← Back to sign in
            </button>
          )}
        </div>

        {note && (
          <p className="border-l-2 border-l-[color:var(--color-cyan)] bg-surface-2 p-3 text-sm text-ink-dim">
            {note}
          </p>
        )}
        {error && (
          <p className="border-l-2 border-l-[color:var(--color-danger)] bg-surface-2 p-3 text-sm text-ink-dim">
            {error}
          </p>
        )}
      </form>

      <p className="mono mt-6 text-[11px] text-ink-faint">
        Already booked without an account? Retrieve it with your reference on{' '}
        <Link to="/trips" className="text-cyan">
          manage booking
        </Link>
        .
      </p>
    </>
  )
}

/**
 * Setting a password from inside the account.
 *
 * This is also the escape hatch. Everyone who joined before passwords existed
 * has no password at all, and a reset link cannot always be relied on to be
 * recognised as a recovery (the event differs between the PKCE and implicit
 * flows). Whatever route someone took to get signed in, this panel is here.
 */
export function PasswordCard({ highlight = false }: { highlight?: boolean }) {
  const { setPassword: save } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && password !== confirm
  const ok = password.length >= MIN_PASSWORD && password === confirm && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await save(password)
    setBusy(false)
    setPassword('')
    setConfirm('')
    if (error) setError(error)
    else {
      setDone(true)
      setTimeout(() => setDone(false), 6000)
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`panel mt-4 p-5 ${
        highlight ? 'border-l-2 border-l-[color:var(--color-cyan)]' : ''
      }`}
    >
      <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {highlight ? 'Choose a new password' : 'Password'}
      </h2>
      <p className="mt-2 max-w-[54ch] text-sm text-ink-dim">
        {highlight
          ? 'Your reset link worked. Pick a new password and you are done.'
          : 'Set one to sign in without waiting for an email. Signing in with a link keeps working either way.'}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="res-newpw"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <Field
          id="res-newpw2"
          label="Repeat it"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          hint={mismatch ? 'These do not match yet.' : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ok} className="btn btn-ghost">
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {done && (
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-good">
            Password saved
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  )
}

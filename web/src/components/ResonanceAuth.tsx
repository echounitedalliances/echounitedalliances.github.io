import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCarrierCount } from '../lib/carriers'
import { num } from '../lib/format'
import { useSneakPeek } from '../lib/sneakPeek'
import AdminApplyModal from './AdminApplyModal'
import DiscordGlyph from './DiscordGlyph'
import { rich, translate, useT } from '../lib/i18n'

/**
 * Getting into a Resonance account.
 *
 * Three states: sign in, create an account, and ask for a reset. There was a
 * fourth — a one-time sign-in link — and it is gone, because it sent people
 * out to a mail app and back to come in.
 *
 * Reset stays, and has to. It is the only route into an account whose
 * password is forgotten, and the only route in at all for everyone who joined
 * while the link was the way in: there is no password on those records.
 *
 * Passwords are never held, logged, or put in component state longer than the
 * submit that uses them: the field's value goes straight to supabase-js, which
 * sends it to GoTrue over TLS. Nothing about a password reaches this project's
 * own database.
 */

/** What the server enforces is set in the dashboard; this is the front door. */
export const MIN_PASSWORD = 8

/**
 * GoTrue's own wording, translated where it would leave someone stuck.
 *
 * Most of it is passed through untouched -- "Invalid login credentials" is
 * deliberately vague and should stay that way. These are the cases where the
 * raw message does not tell you what to do next, and one of them (the email
 * rate limit) is a wall you can hit just by retrying a form that looked
 * broken for an unrelated reason.
 */
export function explain(error: { message: string; code?: string; status?: number }) {
  const code = error.code ?? ''
  const msg = error.message ?? ''
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) {
    return translate('Too many emails from this project in the last hour. That is a limit on the sending account, not on you. It clears by itself; try again a little later, or sign in with a password instead.')
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) {
    return translate('That address already has an account. Sign in with your password, or use Forgot password if you have never set one.')
  }
  if (code === 'weak_password') {
    return `${msg} ${translate('Passwords need at least {n} characters.', { n: MIN_PASSWORD })}`
  }
  if (code === 'signup_disabled') {
    return translate('New accounts are turned off for this project at the moment.')
  }
  if (code === 'email_provider_disabled') {
    return translate('Email sign-in is switched off for this project.')
  }
  if (/provider is not enabled/i.test(msg)) {
    return translate('Discord sign-in is not turned on for this project yet.')
  }
  return msg
}

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
  const t = useT()
  const isPassword = type === 'password'
  return (
    <label className="block" htmlFor={id}>
      <span className="eyebrow mb-1.5 block text-ink-faint">{t(label)}</span>
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
            {reveal ? t('Hide') : t('Show')}
          </button>
        )}
      </span>
      {hint && <span className="mt-1.5 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  )
}

type Mode = 'password' | 'signup' | 'forgot'

export function SignIn() {
  const carrierCount = useCarrierCount()
  const t = useT()
  const { signInWithPassword, signInWithDiscord, signUp, sendPasswordReset, discordGuildError } = useAuth()
  const { unlocked: discordSignInUnlocked } = useSneakPeek()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [discordBusy, setDiscordBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [wantsAdmin, setWantsAdmin] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)

  const discordSignIn = async () => {
    setDiscordBusy(true)
    setError(null)
    setNote(null)
    const { error } = await signInWithDiscord()
    // On success this redirects the whole page to Discord, so there is
    // nothing left here to update -- only a failure to start the redirect
    // (e.g. the provider is not enabled yet) comes back to this component.
    if (error) {
      setDiscordBusy(false)
      setError(explain(error))
    }
  }

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setNote(null)
    setPassword('')
    setWantsAdmin(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Applying for admin needs a Discord username the form below does not
    // collect, so it hands off to its own modal instead of signing up here.
    if (mode === 'signup' && wantsAdmin) {
      setShowAdminModal(true)
      return
    }

    setBusy(true)
    setError(null)
    setNote(null)

    if (mode === 'password') {
      const { error } = await signInWithPassword(email, password)
      setBusy(false)
      setPassword('')
      if (error) {
        setError(
          error.code === 'invalid_credentials'
            ? t('That email and password do not match. If you joined before passwords existed you will not have one yet, so use Forgot password to set your first.')
            : explain(error),
        )
      }
      return
    }

    if (mode === 'signup') {
      const { error, needsConfirmation } = await signUp(email, password)
      setBusy(false)
      setPassword('')
      if (error) setError(explain(error))
      else if (needsConfirmation)
        setNote(
          t('Account created. Confirm {email} from the email we just sent, then sign in with your password.', { email }),
        )
      // With confirmation off there is already a session, and the page has
      // re-rendered as the account by the time this line runs.
      return
    }

    const { error } = await sendPasswordReset(email)
    setBusy(false)
    if (error) setError(explain(error))
    else
      setNote(
        t('If {email} has an account, a reset link is on its way. Opening it brings you back here to choose a new password.', { email }),
      )
  }

  const heading =
    mode === 'signup'
      ? t('Create an account')
      : mode === 'forgot'
        ? t('Reset your password')
        : t('Sign in')

  const cta =
    mode === 'signup'
      ? wantsAdmin
        ? t('Continue')
        : t('Create account')
      : mode === 'forgot'
        ? t('Send reset link')
        : t('Sign in')

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const wantsPassword = mode !== 'forgot'
  const canSubmit = emailOk && (!wantsPassword || password.length >= MIN_PASSWORD) && !busy

  return (
    <>
      <form onSubmit={submit} className="panel mt-8 flex flex-col gap-4 p-5">
        <h2 className="display text-2xl">{heading}</h2>

        {mode === 'signup' && (
          <p className="-mt-2 text-sm text-ink-dim">
            {t('One account across all {n} carriers. Everything on the site is open without one.', { n: num(carrierCount) })}
          </p>
        )}
        {mode === 'forgot' && (
          <p className="-mt-2 text-sm text-ink-dim">
            {t('We email you a link that brings you back here to choose a new one. This is also how to set your first password if you have never had one.')}
          </p>
        )}

        {mode === 'password' && discordSignInUnlocked && (
          <>
            <button
              type="button"
              onClick={discordSignIn}
              disabled={discordBusy}
              className="btn btn-ghost w-full justify-center gap-2"
            >
              <DiscordGlyph /> {discordBusy ? t('Working…') : t('Sign in with Discord')}
            </button>
            {discordGuildError && (
              <p className="border-l-2 border-l-[color:var(--color-danger)] bg-surface-2 p-3 text-sm text-ink-dim">
                {t('That Discord account is not in the EUA server, so it was signed back out. Join the alliance on Discord first, then try again.')}
              </p>
            )}
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              <span className="h-px flex-1 bg-edge-soft" />
              {t('or')}
              <span className="h-px flex-1 bg-edge-soft" />
            </div>
          </>
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
                ? t('At least {n} characters. Use something you do not use elsewhere.', { n: MIN_PASSWORD })
                : undefined
            }
          />
        )}

        {mode === 'signup' && (
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={wantsAdmin}
              onChange={(e) => setWantsAdmin(e.target.checked)}
              className="h-4 w-4 border-edge bg-ground-2 accent-cyan"
            />
            {t('Admin? Check this box to apply for admin')}
          </label>
        )}

        {mode === 'signup' && (
          <p className="text-[12px] text-ink-faint">
            {rich(t('Creating an account means you agree to the {terms} and the {privacy}.'), {
              terms: (
                <Link to="/terms" className="text-cyan hover:underline">
                  {t('Terms')}
                </Link>
              ),
              privacy: (
                <Link to="/privacy" className="text-cyan hover:underline">
                  {t('Privacy Policy')}
                </Link>
              ),
            })}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!canSubmit} className="btn btn-book">
            {busy ? t('Working…') : cta}
          </button>

          {mode === 'password' && (
            <>
              <button
                type="button"
                onClick={() => go('signup')}
                className="mono text-[11px] uppercase tracking-[0.14em] text-cyan"
              >
                {t('Create an account')}
              </button>
              <button
                type="button"
                onClick={() => go('forgot')}
                className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
              >
                {t('Forgot password')}
              </button>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <button
              type="button"
              onClick={() => go('password')}
              className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
            >
              ← {t('Back to sign in')}
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

      {showAdminModal && (
        <AdminApplyModal
          createAccount
          initialEmail={email}
          initialPassword={password}
          onClose={() => setShowAdminModal(false)}
        />
      )}
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
  const t = useT()
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
    if (error) setError(explain(error))
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
        {highlight ? t('Choose a new password') : t('Password')}
      </h2>
      <p className="mt-2 max-w-[54ch] text-sm text-ink-dim">
        {highlight
          ? t('Your reset link worked. Pick a new password and you are done.')
          : t('Change the password you sign in with. If you forget it, Forgot password on the sign-in screen emails you a way back.')}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="res-newpw"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={t('At least {n} characters.', { n: MIN_PASSWORD })}
        />
        <Field
          id="res-newpw2"
          label="Repeat it"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          hint={mismatch ? t('These do not match yet.') : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ok} className="btn btn-ghost">
          {busy ? t('Saving…') : t('Save password')}
        </button>
        {done && (
          <span className="mono text-[11px] uppercase tracking-[0.12em] text-good">
            {t('Password saved')}
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  )
}

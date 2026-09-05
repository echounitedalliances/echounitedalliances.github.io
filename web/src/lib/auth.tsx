import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isConfigured, supabase } from './supabase'

/**
 * Resonance: the alliance's membership programme. A member is a Resonant.
 *
 * There are two ways in, because neither is right on its own. A magic link
 * needs nothing memorised but sends you out to a mail app, which is exactly
 * the wrong thing to do to someone checking a booking on a phone. A password
 * is instant and works offline of email -- but has to be set once, and reset
 * over email when forgotten. So: passwords for the people who want them,
 * links for the people who do not, and the same account either way.
 *
 * Passwords never touch this codebase's own storage. They are passed straight
 * to supabase-js, which sends them over TLS to GoTrue; the site only ever
 * holds the session that comes back.
 *
 * On the way back in, the Resonant row is created if it does not exist yet --
 * the row level security in 08_rls_policies allows an authenticated user to
 * insert exactly one row, their own, and nothing else.
 *
 * Signing in is optional throughout. A guest can search and book; an account
 * only adds a place for trips to collect.
 */

export type Resonant = {
  resonant_id: string
  user_id: string
  email: string
  display_name: string | null
  given_name: string | null
  family_name: string | null
  home_airport: string | null
  home_division: string | null
  is_admin: boolean
  joined_at: string
}

/**
 * The raw error, not just its text. GoTrue's codes are what distinguish "wrong
 * password" from "you have sent too many emails this hour", and the page needs
 * to say different things about those.
 */
export type AuthFailure = { message: string; code?: string; status?: number }
type Result = { error: AuthFailure | null }

type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  resonant: Resonant | null
  /** True while the user arrived on a reset link and owes us a new password. */
  recovering: boolean
  endRecovery: () => void
  signInWithLink: (email: string) => Promise<Result>
  signInWithPassword: (email: string, password: string) => Promise<Result>
  /** Resolves with needsConfirmation when the project requires a confirmed email. */
  signUp: (email: string, password: string) => Promise<Result & { needsConfirmation: boolean }>
  sendPasswordReset: (email: string) => Promise<Result>
  setPassword: (password: string) => Promise<Result>
  signOut: () => Promise<void>
  refreshResonant: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

/** Where the magic link comes back to. HashRouter, so the route is in the hash. */
function redirectTo() {
  const base = import.meta.env.BASE_URL || '/'
  return `${window.location.origin}${base}#/resonance`
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [resonant, setResonant] = useState<Resonant | null>(null)
  const [recovering, setRecovering] = useState(false)

  const loadResonant = async (user: User | null) => {
    if (!user) {
      setResonant(null)
      return
    }
    const { data } = await supabase
      .from('resonants')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setResonant(data as Resonant)
      return
    }

    // First sign-in: create the membership row. The insert policy checks that
    // user_id matches the caller, so this can only ever create your own.
    const { data: created } = await supabase
      .from('resonants')
      .insert({
        user_id: user.id,
        email: user.email ?? '',
        display_name: (user.email ?? '').split('@')[0],
      })
      .select('*')
      .maybeSingle()
    setResonant((created as Resonant) ?? null)
  }

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      await loadResonant(data.session?.user ?? null)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Arriving on a reset link signs you in with a recovery session. The
      // page has to notice and ask for the new password, or you land on your
      // account with no idea the link did anything.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(next)
      void loadResonant(next?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      resonant,
      recovering,
      endRecovery: () => setRecovering(false),

      signInWithLink: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectTo() },
        })
        return { error }
      },

      signInWithPassword: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        // GoTrue answers "Invalid login credentials" whether the address is
        // unknown or the password is wrong, which is what stops this being a
        // way to find out who has an account. Passed through unchanged.
        return { error }
      },

      signUp: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo() },
        })
        if (error) return { error, needsConfirmation: false }
        // With "Confirm email" ON there is no session yet and a confirmation
        // mail is on its way. With it OFF, signUp returns a session and the
        // page is already signed in by the time this resolves.
        return { error: null, needsConfirmation: !data.session }
      },

      sendPasswordReset: async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirectTo(),
        })
        return { error }
      },

      setPassword: async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (!error) setRecovering(false)
        return { error }
      },

      signOut: async () => {
        await supabase.auth.signOut()
        setResonant(null)
        setRecovering(false)
      },
      refreshResonant: async () => loadResonant(session?.user ?? null),
    }),
    [ready, session, resonant, recovering],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isConfigured, supabase } from './supabase'

/**
 * Resonance: the alliance's membership programme. A member is a Resonant.
 *
 * Sign-in is a magic link, so the site never handles a password. On the way
 * back, the Resonant row is created if it does not exist yet -- the row level
 * security in 08_rls_policies allows an authenticated user to insert exactly
 * one row, their own, and nothing else.
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

type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  resonant: Resonant | null
  signIn: (email: string) => Promise<{ error: string | null }>
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
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
      signIn: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectTo() },
        })
        return { error: error ? error.message : null }
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setResonant(null)
      },
      refreshResonant: async () => loadResonant(session?.user ?? null),
    }),
    [ready, session, resonant],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

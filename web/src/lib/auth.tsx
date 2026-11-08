import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isConfigured, supabase } from './supabase'

/**
 * The EUA Discord server, same id the online-count widget reads
 * (lib/discordWidget.ts), and the role on it that actually means something
 * here: Resonant, given out to vetted alliance members. Used only to check
 * a Discord sign-in holds that role, not to read anything else about the
 * server.
 *
 * Checking the role rather than plain membership was a deliberate tightening
 * (November 2026): the server itself is open to join, so "is a member"
 * let in anyone who had clicked the invite link, never mind whether they
 * had actually been vetted into the alliance. Resonant is the role real
 * members are given after that, so it is the one that is actually supposed
 * to gate the site account.
 */
const EUA_GUILD_ID = '1485632790035955722'
const EUA_RESONANT_ROLE_ID = '1485741662851567616'

/**
 * Whether the Discord account behind this OAuth access token holds the
 * Resonant role in the EUA server. Returns null, not false, when the check
 * itself failed (network, CORS, Discord outage, or the site's Discord
 * application not being installed as a bot in the server, which this
 * endpoint requires) -- a failure to verify is not the same as a confirmed
 * "does not hold it", and must never be treated as one, or a Discord hiccup
 * would lock out real members.
 *
 * GET /users/@me/guilds/{guild.id}/member needs the guilds.members.read
 * scope (requested in signInWithDiscord below) rather than the broader
 * guilds scope this used to ask for, which listed every server the person
 * is in just to check membership in one of them -- more than this ever
 * needed to see.
 */
async function hasEuaResonantRole(providerToken: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `https://discord.com/api/users/@me/guilds/${EUA_GUILD_ID}/member`,
      { headers: { Authorization: `Bearer ${providerToken}` } },
    )
    // Not a member of the server at all reads as a plain "no", same as
    // holding the wrong role -- both mean the account does not qualify.
    if (res.status === 404) return false
    if (!res.ok) return null
    const member = (await res.json()) as { roles?: string[] }
    return (member.roles ?? []).includes(EUA_RESONANT_ROLE_ID)
  } catch {
    return null
  }
}

/**
 * Resonance: the alliance's membership programme. A member is a Resonant.
 *
 * Sign-in is a password. There was a one-time email link too, and it is gone:
 * it sent people out to a mail app and back, which is the wrong thing to do
 * to someone checking a booking on a phone.
 *
 * Email has not left entirely, and cannot. resetPasswordForEmail is the only
 * way back into an account whose password is forgotten, and it is also how
 * everyone who joined before passwords existed gets their first one -- there
 * is nothing on their record to sign in with otherwise. Take that away and a
 * forgotten password is a permanently lost account.
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
  /** Self-claimed, not verified against the game. See database/sql/43_claim_airline.sql. */
  claimed_airline_uid: string | null
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
  signInWithPassword: (email: string, password: string) => Promise<Result>
  /**
   * Starts the Discord OAuth redirect. Resolves once Supabase has handed off
   * to Discord (or failed to, e.g. the provider is not enabled on this
   * project yet) -- not once sign-in is complete, which only happens after
   * the round trip back from Discord, picked up by the existing
   * onAuthStateChange listener like any other sign-in. That listener also
   * checks the EUA server for this account and signs it back out, setting
   * discordGuildError, if it is not a member there.
   */
  signInWithDiscord: () => Promise<Result>
  /**
   * Set right after a Discord sign-in that was rejected and signed back out
   * for not being in the EUA server. Cleared the next time Discord sign-in
   * is attempted.
   */
  discordGuildError: boolean
  /** Resolves with needsConfirmation when the project requires a confirmed email. */
  signUp: (email: string, password: string) => Promise<Result & { needsConfirmation: boolean }>
  sendPasswordReset: (email: string) => Promise<Result>
  setPassword: (password: string) => Promise<Result>
  signOut: () => Promise<void>
  refreshResonant: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

/**
 * Where a sign-in or reset link comes back to. Still the old #/resonance
 * form, because that is the address Supabase's redirect allow-list holds;
 * index.html turns it into /resonance (keeping ?code=) before the app reads it.
 */
function redirectTo() {
  const base = import.meta.env.BASE_URL || '/'
  return `${window.location.origin}${base}#/resonance`
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [resonant, setResonant] = useState<Resonant | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [discordGuildError, setDiscordGuildError] = useState(false)

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

      // provider_token is only ever present on the callback right after an
      // OAuth sign-in -- not on a restored session or a token refresh -- so
      // this runs the guild check exactly once, at the moment it matters.
      // app_metadata.providers (plural, every identity ever linked) is
      // checked alongside .provider (singular, the one just used), since
      // the token on hand is Discord's either way the moment it is present.
      const providers = (next?.user?.app_metadata?.providers as string[] | undefined) ?? []
      const isDiscordSignIn =
        next?.user?.app_metadata?.provider === 'discord' || providers.includes('discord')
      if (next?.provider_token && isDiscordSignIn) {
        const token = next.provider_token
        void hasEuaResonantRole(token).then((hasRole) => {
          // null means the check itself failed (network, CORS, Discord
          // outage, or the bot not being in the server), not that the role
          // is confirmed absent -- never sign someone out over a failure to
          // verify.
          if (hasRole === null) {
            console.warn('EUA Discord role check did not complete (network/CORS/Discord outage, or the bot is not in the server); letting the sign-in stand rather than guessing.')
            return
          }
          if (!hasRole) {
            setDiscordGuildError(true)
            void supabase.auth.signOut()
          }
        })
      }
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
      discordGuildError,
      endRecovery: () => setRecovering(false),

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

      signInWithDiscord: async () => {
        setDiscordGuildError(false)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'discord',
          // The default scope covers identify + email; guilds.members.read
          // is added on top of that (not instead of it) so the Resonant-role
          // check still has a Discord profile and address to work with. Not
          // the broader guilds scope this used to ask for: that would list
          // every server the person is in just to look at one of them.
          options: { redirectTo: redirectTo(), scopes: 'identify email guilds.members.read' },
        })
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
    [ready, session, resonant, recovering, discordGuildError],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

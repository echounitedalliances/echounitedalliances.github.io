import { createContext, useContext, useMemo, useState } from 'react'

/**
 * Sneak Peek: a standing lock, in front of whatever feature is still being
 * tried out. Lift it with the code in the corner of every page; it stays
 * lifted for this browser from then on (localStorage), no reload needed --
 * which is why this lives in a context rather than being read fresh from
 * storage by whichever component happens to check it. The lock button and
 * the feature it is gating are usually on different pages, and both need to
 * see the same `unlocked` the instant the code is accepted.
 *
 * To add a new sneak-peek feature: register it below with a teaser and
 * where to find it once unlocked, and gate its rendering on
 * useSneakPeek().unlocked.
 */

export type SneakPeekFeature = {
  id: string
  /** Shown as the feature's name in the lock panel. */
  name: string
  /** One or two sentences, shown once unlocked. */
  teaser: string
  /** Where to actually go use it -- there is no "Open" button here, since a
   *  sneak-peek feature usually lives on its own page rather than floating
   *  over every one of them. */
  whereToFind: string
}

export const SNEAK_PEEK_FEATURES: SneakPeekFeature[] = [
  {
    id: 'discord-login',
    name: 'Sign in with Discord',
    teaser:
      'Sign in to Resonance with the Discord account you already use on the EUA server -- no separate password to set or remember.',
    whereToFind: 'Look for it on the Resonance sign-in page.',
  },
  {
    id: 'claim-airline',
    name: 'Claim your airline',
    teaser:
      'Link the airline you fly for to your Resonance account, self-reported, the same way you already set a home airport and division.',
    whereToFind: 'Look for it under Your details on the Resonance page.',
  },
]

const KEY = 'eua-sneak-peek'

/**
 * Picked at random when this was built; changing it just means telling
 * whoever has it the new one.
 */
const CODE = 'ECHO-SNEAK-3WJB'

function readStoredAccess(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

type SneakPeekState = {
  unlocked: boolean
  /** Case- and whitespace-insensitive. Returns whether it matched. */
  unlock: (code: string) => boolean
}

const Ctx = createContext<SneakPeekState | null>(null)

export function SneakPeekProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(readStoredAccess)

  const value = useMemo<SneakPeekState>(
    () => ({
      unlocked,
      unlock: (code: string) => {
        if (code.trim().toUpperCase() !== CODE) return false
        try {
          localStorage.setItem(KEY, '1')
        } catch {
          // Storage can be unavailable (private browsing, quota); the unlock
          // still counts for the rest of this session even if it will not be
          // remembered next time.
        }
        setUnlocked(true)
        return true
      },
    }),
    [unlocked],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSneakPeek() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSneakPeek must be used inside SneakPeekProvider')
  return ctx
}

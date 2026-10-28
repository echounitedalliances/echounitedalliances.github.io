/**
 * Sneak Peek: a standing lock, separate from the timed ones in site.ts and
 * alliance.ts. Those lift themselves at a timestamp; this one lifts itself
 * the moment someone types the right code into the lock button in the
 * corner of every page. One code, shared by every feature registered below
 * -- there being several codes for several features would just be several
 * things to hand out and keep straight.
 *
 * To add a new sneak-peek feature: register it in SNEAK_PEEK_FEATURES below
 * with a teaser, and gate its rendering on hasSneakPeekAccess() (or the
 * useSneakPeekAccess hook, for a component that needs to react live to
 * someone unlocking it in the same tab).
 */

export type SneakPeekFeature = {
  id: string
  /** Shown as the feature's name in the lock panel. */
  name: string
  /** One or two sentences, shown while it is still locked. */
  teaser: string
}

export const SNEAK_PEEK_FEATURES: SneakPeekFeature[] = [
  {
    id: 'chatbot',
    name: 'Echo Assistant',
    teaser:
      'A chat widget with instant answers to the questions members ask most -- joining, divisions, the market, Airline of the Week, and more. No waiting on Discord for the basics.',
  },
]

const KEY = 'eua-sneak-peek'

/**
 * Picked at random when this was built; changing it just means telling
 * whoever has it the new one, same as the preview code in preview.ts.
 */
const CODE = 'ECHO-SNEAK-7QXM'

export function hasSneakPeekAccess(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Case- and whitespace-insensitive, so a code read off a phone still works. */
export function unlockSneakPeek(code: string): boolean {
  if (code.trim().toUpperCase() !== CODE) return false
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage can be unavailable (private browsing, quota); the unlock still
    // counts for the rest of this session even if it will not be remembered.
  }
  return true
}

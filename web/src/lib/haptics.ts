/**
 * A short vibration on touch devices that support it. Android's browsers do;
 * iOS Safari has never implemented the Vibration API at all, standard or
 * installed-as-an-app -- so this is quiet there, same as every other
 * feature on this site that degrades gracefully rather than erroring when
 * the platform underneath it cannot do something.
 *
 * Kept to a handful of named intensities, used at a handful of moments
 * (chips, menu toggles, a sent chat question, a saved profile, a sign-in
 * outcome) -- not wired into every button, which would stop reading as
 * feedback and start reading as buzzing.
 */

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function fire(pattern: number | number[]) {
  if (!supported) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw outside a user gesture, or while backgrounded.
    // Never worth surfacing over a vibration.
  }
}

/** Anything pressed often and lightly: chips, tabs, menu toggles. */
export function tapLight() {
  fire(8)
}

/** A committing action: sending a chat question, a primary button. */
export function tapMedium() {
  fire(15)
}

/** A positive outcome: saved, signed in, unlocked. */
export function tapSuccess() {
  fire([12, 40, 12])
}

/** Something went wrong. */
export function tapError() {
  fire(30)
}

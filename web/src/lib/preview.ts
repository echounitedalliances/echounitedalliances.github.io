/**
 * A one-time code in the URL that unlocks a locked segment early, for people
 * previewing a reveal before the public can see it.
 *
 * Visit once with ?preview=CODE and it is remembered in this browser
 * (localStorage) from then on -- nobody else sees it differently, and the
 * URL is cleaned up right after so the code does not linger in a shared
 * link or sit visible in browser history.
 *
 * One code, shared by whichever segment is currently locked (right now,
 * Airline of the Week). There is only ever one reveal pending at a time, so
 * splitting codes per segment would add nothing except another code to hand
 * out. To change it, edit CODE below and tell whoever needs it.
 */
const CODE = 'ECHO-2YJT-EGNB-3BAM'
const KEY = 'eua-preview-access'

export function hasPreviewAccess(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Call once per mount, from an effect (it writes to storage and to the URL,
 * so it must not run during render). Returns true if this visit is the one
 * that just unlocked it.
 */
export function applyPreviewCodeFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('preview')
    if (!code || code !== CODE) return false
    localStorage.setItem(KEY, '1')
    // Drop the query string, keep the hash -- the HashRouter route lives
    // there, and a code sitting in the address bar is the one place cleaning
    // it up does not actually help, but there is no reason to leave it too.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    return true
  } catch {
    return false
  }
}

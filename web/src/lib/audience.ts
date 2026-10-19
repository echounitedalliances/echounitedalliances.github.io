import { useEffect, useState } from 'react'

/**
 * Who the visitor said they are: travelling with Echo, or flying with it.
 *
 * Asked once, on the first visit, the way a bank asks Personal or Business,
 * and remembered in this browser only. It decides nothing about access --
 * every page stays open to everyone, and the members' apps do their own
 * Discord sign-in -- it only decides which front door is shown first.
 *
 * localStorage can be missing or throw (private windows, blocked site data),
 * so every read and write is guarded, and the site behaves as a first visit
 * when it cannot remember.
 */
export type Audience = 'visitor' | 'member'

const KEY = 'echo.audience'
const EVENT = 'echo-audience'

export function readAudience(): Audience | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'visitor' || v === 'member' ? v : null
  } catch {
    return null
  }
}

export function setAudience(a: Audience | null): void {
  try {
    if (a) localStorage.setItem(KEY, a)
    else localStorage.removeItem(KEY)
  } catch {
    /* not remembered; the choice still applies to this page */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: a }))
}

/** The current choice, kept in step across every component that shows it. */
export function useAudience(): Audience | null {
  const [a, setA] = useState<Audience | null>(readAudience)
  useEffect(() => {
    const on = (e: Event) => setA((e as CustomEvent<Audience | null>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return a
}

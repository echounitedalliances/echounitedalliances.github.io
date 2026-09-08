import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './supabase'

/**
 * How many carriers the alliance publishes.
 *
 * The number appears in the copy on five pages, and until now every one of
 * them had it typed in by hand. They all said 590 against a roster of 602,
 * and they had said so since the roster grew -- because there is nothing
 * about a hardcoded number that ever tells you it has gone wrong.
 *
 * One count, fetched once per page load and shared. It is a HEAD request with
 * an exact count, so nothing but the number crosses the wire.
 *
 * FALLBACK is what renders before the count lands and if it never does. It
 * will drift, and that is fine: it is a placeholder for the first paint, not
 * the answer. Anything reading this gets the real figure a moment later.
 */
const FALLBACK = 602

let cached: number | null = null
let inFlight = false
const listeners = new Set<(n: number) => void>()

function load(): void {
  if (cached !== null || inFlight || !isConfigured) return
  inFlight = true
  void (async () => {
    const { count, error } = await supabase
      .from('mv_airline_directory')
      .select('uid', { count: 'exact', head: true })
    inFlight = false
    if (error || count == null) return
    cached = count
    for (const notify of listeners) notify(count)
  })()
}

export function useCarrierCount(): number {
  const [n, setN] = useState<number>(cached ?? FALLBACK)

  useEffect(() => {
    listeners.add(setN)
    load()
    if (cached !== null) setN(cached)
    return () => {
      listeners.delete(setN)
    }
  }, [])

  return n
}

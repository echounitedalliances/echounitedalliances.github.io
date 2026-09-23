import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './supabase'

/**
 * The network's headline figures -- how many carriers, how many airports.
 *
 * Both appear in copy across the site, and until now most of them had the
 * number typed in by hand. They said 590 against a roster of 602 for as long
 * as nobody looked, and the footer said 2,186 airports on the weekly scrape
 * that took the group to 2,180 -- because there is nothing about a hardcoded
 * number that ever tells you it has gone wrong.
 *
 * Each figure is one HEAD request with an exact count, so nothing but the
 * number crosses the wire, fetched once per page load and shared by every
 * component that asks.
 *
 * The fallback is what renders before the count lands, and if it never does.
 * It will drift, and that is fine: it is a placeholder for the first paint,
 * not the answer. Anything reading these gets the real figure a moment later.
 * Last set from the 24 September 2026 scrape.
 */
type CountQuery = PromiseLike<{ count: number | null; error: unknown }>

function sharedCount(fallback: number, query: () => CountQuery) {
  let cached: number | null = null
  let inFlight = false
  const listeners = new Set<(n: number) => void>()

  const load = () => {
    if (cached !== null || inFlight || !isConfigured) return
    inFlight = true
    void (async () => {
      const { count, error } = await query()
      inFlight = false
      if (error || count == null) return
      cached = count
      for (const notify of listeners) notify(count)
    })()
  }

  return function useSharedCount(): number {
    const [n, setN] = useState<number>(cached ?? fallback)

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
}

/** Carriers the alliance publishes. */
export const useCarrierCount = sharedCount(608, () =>
  supabase.from('mv_airline_directory').select('uid', { count: 'exact', head: true }),
)

/**
 * Airports the network actually serves. The airports table holds more than
 * that on purpose -- an airport stays when the last route to it goes, because
 * an account's home airport or an old booking may still name it -- so the
 * figure counts the ones with a flight in or out, not the rows.
 */
export const useAirportCount = sharedCount(2173, () =>
  supabase
    .from('mv_airport_directory')
    .select('iata_code', { count: 'exact', head: true })
    .or('out_degree.gt.0,in_degree.gt.0'),
)

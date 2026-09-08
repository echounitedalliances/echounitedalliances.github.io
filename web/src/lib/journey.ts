import { supabase } from './supabase'
import type { Itinerary } from './types'

/**
 * A journey is one or more searches that get booked together.
 *
 * One way is a journey of one leg, a return is two, a multi-city is up to
 * five. Treating them as the same shape is what keeps the results page one
 * page instead of three: it renders a picker per leg and books whatever has
 * been picked, and a one-way is simply the case where there is one.
 *
 * Each leg is still an ordinary search_itineraries() call. The connection
 * logic that makes a search correct is hard-won and lives in one place; a
 * return-trip variant of it that drifted would be worse than two calls.
 */

export type TripType = 'oneway' | 'return' | 'multi'

export type LegQuery = {
  from: string
  to: string
  /** YYYY-MM-DD */
  date: string
}

export type JourneyQuery = {
  trip: TripType
  legs: LegQuery[]
  cabin: string
  pax: number
  stops: number
}

/**
 * The most legs one journey can carry.
 *
 * Seven, because that is the longest round-the-world tour the planner will
 * validate, and the planner hands its hops straight to this search. At five
 * it silently truncated a six- or seven-stop tour to the first five hops --
 * the traveller planned a circumnavigation and got a one-way to wherever the
 * fifth stop happened to be. create_booking takes up to 21 flights, which is
 * seven hops at the two-stop maximum, so a full tour books as one PNR.
 */
export const MAX_LEGS = 7

/** How many CONNECTING itineraries a leg returns. Nonstops are unlimited. */
export const CONNECTION_LIMIT = 60

const isCode = (s: string) => /^[A-Z]{3}$/.test(s)
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** One leg as it travels in a URL: HAN-SGN-2026-09-15. */
function encodeLeg(l: LegQuery): string {
  return `${l.from}-${l.to}-${l.date}`
}

function decodeLeg(s: string): LegQuery | null {
  // Split on the first two hyphens only; the date has two of its own.
  const m = /^([A-Z]{3})-([A-Z]{3})-(\d{4}-\d{2}-\d{2})$/.exec(s.trim().toUpperCase())
  return m ? { from: m[1], to: m[2], date: m[3] } : null
}

/**
 * One-way and return keep the original from/to/date parameters rather than
 * moving to the leg list. Links to this site already exist with those in
 * them, and there is no reason to break them for a tidier encoding.
 */
export function encodeJourney(q: JourneyQuery): URLSearchParams {
  const p = new URLSearchParams({
    cabin: q.cabin,
    pax: String(q.pax),
    stops: String(q.stops),
  })
  if (q.trip === 'multi') {
    p.set('legs', q.legs.map(encodeLeg).join(','))
    return p
  }
  const [out, back] = q.legs
  p.set('from', out.from)
  p.set('to', out.to)
  p.set('date', out.date)
  if (q.trip === 'return' && back) p.set('ret', back.date)
  return p
}

export function decodeJourney(params: URLSearchParams): JourneyQuery {
  const cabin = params.get('cabin') ?? 'ECONOMY'
  const pax = Math.max(1, Number(params.get('pax') ?? 1) || 1)
  const stops = Number(params.get('stops') ?? 2)

  const raw = params.get('legs')
  if (raw) {
    const legs = raw.split(',').map(decodeLeg).filter((l): l is LegQuery => l !== null)
    if (legs.length >= 2) {
      return { trip: 'multi', legs: legs.slice(0, MAX_LEGS), cabin, pax, stops }
    }
  }

  const from = (params.get('from') ?? '').toUpperCase()
  const to = (params.get('to') ?? '').toUpperCase()
  const date = params.get('date') ?? ''
  const ret = params.get('ret') ?? ''

  const legs: LegQuery[] = [{ from, to, date }]
  if (isDate(ret)) {
    legs.push({ from: to, to: from, date: ret })
    return { trip: 'return', legs, cabin, pax, stops }
  }
  return { trip: 'oneway', legs, cabin, pax, stops }
}

export function journeyIsValid(q: JourneyQuery): boolean {
  return (
    q.legs.length > 0 &&
    q.legs.every((l) => isCode(l.from) && isCode(l.to) && l.from !== l.to && isDate(l.date))
  )
}

/**
 * Every leg searched at once.
 *
 * In parallel, because they are independent: a five-leg multi-city otherwise
 * costs five round trips end to end, and the slowest single search measured
 * under four seconds. Errors are per leg — one leg nobody flies should not
 * blank the other four.
 */
export async function searchJourney(
  q: JourneyQuery,
  signal?: { aborted: boolean },
): Promise<{ results: (Itinerary[] | null)[]; errors: (string | null)[] }> {
  const calls = q.legs.map((leg) =>
    supabase.rpc('search_itineraries', {
      p_origin: leg.from,
      p_destination: leg.to,
      p_travel_date: leg.date,
      p_cabin: q.cabin,
      p_seats: q.pax,
      p_max_stops: q.stops,
      // Nonstops come back in full whatever this says -- search_itineraries
      // ranks them apart and never cuts them. This bounds the CONNECTING
      // options only, which are the ones that grow combinatorially.
      p_limit: CONNECTION_LIMIT,
    }),
  )
  const settled = await Promise.all(calls)
  if (signal?.aborted) return { results: [], errors: [] }

  return {
    results: settled.map((r) => (r.error ? null : ((r.data as Itinerary[]) ?? []))),
    errors: settled.map((r) => r.error?.message ?? null),
  }
}

/** What a journey costs once a flight has been chosen for every leg. */
export function journeyTotal(picks: (Itinerary | null)[]): number | null {
  if (picks.some((p) => p === null)) return null
  return picks.reduce((sum, p) => sum + (p as Itinerary).total_price_usd, 0)
}

/** The label a leg gets in the UI. */
export function legLabel(q: JourneyQuery, i: number): string {
  if (q.trip === 'return') return i === 0 ? 'Outbound' : 'Return'
  if (q.trip === 'multi') return `Flight ${i + 1}`
  return 'Your flight'
}

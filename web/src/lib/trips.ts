import type { BookingDetails } from './types'

/**
 * When a booking leaves and when it lands, for sorting a list of them.
 *
 * A booking is not one flight. A two-stop itinerary has three segments, so
 * "when does this trip depart" means the first segment's departure and "when
 * does it arrive" means the last segment's arrival — which is not necessarily
 * the last one in seq order once a leg rolls past midnight, hence the max
 * rather than taking segments[length - 1].
 *
 * The times are LOCAL CLOCK at each airport, because that is what the booking
 * stores and what the page shows. Two trips departing at 09:00 in Tokyo and
 * 09:00 in Los Angeles sort as equal here though they are sixteen hours apart.
 * Sorting your own trips by the numbers printed on them is what a person
 * expects; making it correct across zones would mean joining the airport
 * timezone table into every booking to answer a question nobody is asking.
 */

/** ISO date plus an "HH:MM" clock, optionally some days later. */
function at(dateISO: string, clock: string, plusDays = 0) {
  const [h = '0', m = '0'] = (clock ?? '').split(':')
  const d = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(d.getTime())) return Number.NaN
  d.setDate(d.getDate() + plusDays)
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0)
  return d.getTime()
}

/**
 * A booking with no segments sorts last whichever way the list runs. That is
 * every CANCELLED booking — cancelling deletes the segments, because deleting
 * them is what returns the seats — and it should not lead the list.
 */
const LAST = Number.MAX_SAFE_INTEGER

export function tripDeparture(t: BookingDetails) {
  const segs = t.segments ?? []
  const times = segs.map((s) => at(s.travel_date, s.departure_time)).filter((n) => !Number.isNaN(n))
  return times.length ? Math.min(...times) : LAST
}

export function tripArrival(t: BookingDetails) {
  const segs = t.segments ?? []
  const times = segs
    .map((s) => at(s.travel_date, s.arrival_time, s.arrival_days_after ?? 0))
    .filter((n) => !Number.isNaN(n))
  return times.length ? Math.max(...times) : LAST
}

export function bookedAt(t: BookingDetails) {
  const n = Date.parse(t.created_at)
  return Number.isNaN(n) ? LAST : n
}

export type TripSort = 'departure' | 'arrival' | 'booked'

export const TRIP_SORTS: { key: TripSort; label: string }[] = [
  { key: 'departure', label: 'Departure' },
  { key: 'arrival', label: 'Arrival' },
  { key: 'booked', label: 'Booked' },
]

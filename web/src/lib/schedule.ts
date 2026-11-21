/**
 * The alliance schedule, read from files rather than the database.
 *
 * Every departure, per aircraft, was 1.3 million rows and 209 MB of a free
 * plan's 500 MB. The weekly build now writes what the site shows from it to
 * Supabase Storage (database/scripts/export_schedule.py) and empties it
 * (51_schedule_summaries.sql):
 *
 *   airports/<IATA>/board.json     the week's departure board
 *   airports/<IATA>/carriers.json  who departs from there
 *   airlines/<uid>/timetable.json  a carrier's full timetable
 *
 * They are public, compressed and cached; each is fetched once per page
 * load and kept. A 404 is an airport or carrier with no departures.
 */
import type { BoardDeparture, TimetableRow } from './types'

const BASE = `${(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')}/storage/v1/object/public/schedule/`

const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T | null> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(BASE + path)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    cache.set(path, p)
    // A failed fetch is not remembered, so the next visit tries again.
    void p.then((v) => {
      if (v === null) cache.delete(path)
    })
  }
  return p as Promise<T | null>
}

// ---------------------------------------------------------------- board

type BoardFile = {
  iata: string
  city: string
  tz: string | null
  /** [carrier code, airline name, division code, accent colour] */
  airlines: [string, string, string, string][]
  /** IATA -> the label a board prints for it */
  places: Record<string, string>
  /** [day 0 = Monday .. 6, minute of the local day, airline index, flight number, destination] */
  slots: [number, number, number, string, string][]
}

/** The wall clock in a zone, as numbers. */
function wall(instant: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') }
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(instant: number, tz: string) {
  const w = wall(instant, tz)
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - instant) / 60_000)
}

/** The instant a local date and minute of the day happen in a zone, summer time included. */
function zonedInstant(y: number, m: number, d: number, minute: number, tz: string) {
  const naive = Date.UTC(y, m - 1, d, 0, minute)
  let at = naive - offsetMinutes(naive, tz) * 60_000
  // Once more at the result, for a date whose offset differs from the guess's.
  at = naive - offsetMinutes(at, tz) * 60_000
  return at
}

/**
 * The next departures from an airport, as board_departures returned them:
 * the rest of today on the airport's own clock, then tomorrow.
 */
export async function boardDepartures(iata: string, now: number, limit = 8): Promise<BoardDeparture[] | null> {
  const file = await load<BoardFile>(`airports/${iata.toUpperCase()}/board.json`)
  if (!file) return null
  if (!file.tz) return []
  const tz = file.tz
  const w = wall(now, tz)
  const today = (new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay() + 6) % 7
  const nowMinute = w.h * 60 + w.min
  const out: BoardDeparture[] = []

  for (const ahead of [0, 1]) {
    const day = (today + ahead) % 7
    const date = new Date(Date.UTC(w.y, w.m - 1, w.d + ahead))
    for (const [dow, minute, ai, number, dest] of file.slots) {
      if (dow !== day || (ahead === 0 && minute < nowMinute)) continue
      const at = zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), minute, tz)
      if (at < now) continue
      const [code, name, division, accent] = file.airlines[ai]
      out.push({
        departs_at: new Date(at).toISOString(),
        departure_local: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
        origin_tz: tz,
        origin_iata: file.iata,
        origin_city: file.city,
        flight_designator: `${code} ${number}`,
        destination_iata: dest,
        destination_city: file.places[dest] ?? dest,
        carrier_code: code,
        airline_name: name,
        division_code: division,
        accent_color: accent,
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

// ---------------------------------------------------------------- carriers

/** [uid, division code, division name, accent, slug, carrier code, name, destinations from here, is hub] */
type CarrierRow = [string, string, string, string, string, string, string | null, number, boolean]

export type AirportCarrier = {
  uid: string
  division_code: string
  division_name: string
  accent_color: string
  airline_slug: string
  carrier_code: string
  airline_name: string | null
  destinations_from_here: number
  is_hub: boolean
}

export async function airportCarriers(iata: string): Promise<AirportCarrier[]> {
  const file = await load<{ carriers: CarrierRow[] }>(`airports/${iata.toUpperCase()}/carriers.json`)
  return (file?.carriers ?? []).map(([uid, division_code, division_name, accent_color, airline_slug, carrier_code, airline_name, n, is_hub]) => ({
    uid,
    division_code,
    division_name,
    accent_color,
    airline_slug,
    carrier_code,
    airline_name,
    destinations_from_here: n,
    is_hub,
  }))
}

// ---------------------------------------------------------------- timetable

/** [designator, origin, destination, departure minute, arrival minute, arrival day, minutes, model, day mask, economy, business] */
type TimetableFileRow = [string, string, string, number, number, number, number, string | null, number, number | null, number | null]

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`

/**
 * A carrier's timetable, filtered as airline_timetable filtered it: both
 * directions of one route, departures from one airport, or everything.
 */
export async function airlineTimetable(uid: string, airport?: string | null, pairWith?: string | null): Promise<TimetableRow[]> {
  const file = await load<{ rows: TimetableFileRow[] }>(`airlines/${uid}/timetable.json`)
  const a = airport?.trim().toUpperCase() || null
  const b = pairWith?.trim().toUpperCase() || null
  return (file?.rows ?? [])
    .filter(([, o, d]) => (a && b ? (o === a && d === b) || (o === b && d === a) : a ? o === a : true))
    .map(([designator, o, d, dep, arr, arrDays, minutes, model, mask, eco, biz]) => ({
      flight_designator: designator,
      origin_iata: o,
      destination_iata: d,
      departure_time: clock(dep),
      arrival_time: clock(arr),
      arrival_days_after: arrDays,
      duration_minutes: minutes,
      aircraft_model: model,
      days: [0, 1, 2, 3, 4, 5, 6].filter((i) => (mask >> i) & 1),
      economy_price: eco,
      business_price: biz,
    }))
}

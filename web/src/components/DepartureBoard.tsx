import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SplitFlap, { toFlap } from './SplitFlap'
import type { BoardRow } from './SplitFlap'
import { isConfigured, supabase } from '../lib/supabase'
import type { BoardDeparture } from '../lib/types'

/**
 * The departure board, live.
 *
 * It used to ask the database for a list once and print the origin airport's
 * own clock string. Two things were wrong with that. The query had no time
 * filter, so it always returned the earliest departures of the day and the
 * board sat frozen on a row of 00:00 flights. And a bare "00:00" carries no
 * zone, so a viewer in Ho Chi Minh City and a viewer in Boston were both shown
 * a number that meant nothing to either of them.
 *
 * board_departures now returns departs_at as a real instant, so rendering it is
 * Intl's problem, and Intl already knows the viewer's zone. The one thing this
 * component tells the database is what that zone is called, so the board can be
 * scoped to the alliance hub the viewer would actually be standing in.
 *
 * Three clocks, on purpose, because they cost different amounts:
 *   - the flights are refetched once a minute (a network round trip),
 *   - the countdowns are recomputed every fifteen seconds (a re-render),
 *   - the wall clock ticks every second (one isolated component).
 * Keeping the seconds hand in its own component is what stops the board's 376
 * character cells from re-rendering once a second for the sake of a colon.
 */

const REFETCH_MS = 60_000
const TICK_MS = 15_000

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const clockFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** The viewer's zone, named the way their own browser names it. */
function viewerZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/** GMT+7, EDT, AEST — whatever their browser calls that offset. */
function viewerAbbrev() {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/**
 * Status is a pure function of the clock, and that is not a shortcut: every
 * flight in the alliance schedule is by definition on schedule. What is real is
 * how long until it goes, so that is what the column counts down — and it is
 * why the board keeps moving between refetches.
 */
function statusFor(departsAt: number, now: number) {
  const ms = departsAt - now
  // Only DEPARTED once it has actually gone. Rounding to the nearest minute
  // said DEPARTED nine seconds before the aircraft left.
  if (ms <= 0) return 'DEPARTED'
  const mins = Math.ceil(ms / 60_000)
  if (mins <= 15) return 'BOARDING'
  if (mins < 60) return `IN ${mins} MIN`
  return 'ON TIME'
}

/** Isolated so its once-a-second render never reaches the board. */
function WallClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{clockFmt.format(now)}</span>
}

type Hub = { iata_code: string; city_name: string | null; airport_name: string | null }

export default function DepartureBoard({ origin }: { origin?: string }) {
  const [departures, setDepartures] = useState<BoardDeparture[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  // null means "wherever the viewer is"; the database picks from their zone.
  const [pick, setPick] = useState<string | null>(origin ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [loaded, setLoaded] = useState(false)
  const zone = useRef({ name: viewerZone(), abbrev: viewerAbbrev() })

  const load = useCallback(async () => {
    if (!isConfigured) return
    const { data, error } = await supabase.rpc('board_departures', {
      p_origin: pick,
      p_limit: 8,
      p_viewer_tz: zone.current.name || null,
    })
    if (!error) setDepartures((data as BoardDeparture[]) ?? [])
    setLoaded(true)
    setNow(Date.now())
  }, [pick])

  // New flights once a minute, and immediately on returning to the tab: a
  // backgrounded tab has its timers throttled, so without this the board would
  // still be showing a stale minute when the viewer looks back at it.
  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFETCH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // The alliance's busiest airports, so the board is not stuck on whichever
  // one happens to share the viewer's clock. Fetched once; they do not move.
  useEffect(() => {
    if (!isConfigured) return
    void (async () => {
      const { data } = await supabase
        .from('mv_airport_directory')
        .select('iata_code, city_name, airport_name')
        .order('weekly_departures', { ascending: false })
        .limit(6)
      setHubs((data as Hub[]) ?? [])
    })()
  }, [])

  // The countdowns, between fetches.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const rows: BoardRow[] = useMemo(
    () =>
      departures.map((r) => {
        const at = new Date(r.departs_at)
        return {
          time: timeFmt.format(at),
          flight: toFlap(r.flight_designator, r.carrier_code),
          destination: toFlap(r.destination_city, r.destination_iata),
          carrier: toFlap(r.airline_name, r.carrier_code),
          status: statusFor(at.getTime(), now),
          accent: r.accent_color,
        }
      }),
    [departures, now],
  )

  const hub = departures[0]
  // The hub is picked to match the viewer's zone, so usually these agree. When
  // no member airline flies from anywhere on the viewer's clock, it falls back
  // to the alliance's busiest hub, and then the times on the board are the
  // viewer's own rather than the airport's — worth saying out loud.
  const shifted = hub != null && hub.origin_tz !== zone.current.name

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="display text-2xl">
          Departures
          {hub && (
            <span className="ml-3 text-base font-normal text-ink-dim">
              {hub.origin_city} ({hub.origin_iata})
            </span>
          )}
        </h2>
        <p className="mono flex flex-wrap items-baseline gap-x-2 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          <span>Your local time{zone.current.abbrev ? ` · ${zone.current.abbrev}` : ''}</span>
          <span aria-hidden="true">·</span>
          <WallClock />
        </p>
      </div>

      {rows.length > 0 ? (
        <SplitFlap rows={rows} />
      ) : (
        <div className="board">
          <div className="mono py-16 text-center text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            {!isConfigured
              ? 'Board offline'
              : loaded
                ? 'No departures scheduled'
                : 'Reading the board…'}
          </div>
        </div>
      )}

      {hubs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mono mr-1 text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Board at
          </span>
          <button
            type="button"
            onClick={() => setPick(null)}
            aria-pressed={pick === null}
            className={`chip ${pick === null ? 'chip-on' : ''}`}
          >
            Nearest me
          </button>
          {hubs.map((h) => (
            <button
              key={h.iata_code}
              type="button"
              onClick={() => setPick(h.iata_code)}
              aria-pressed={pick === h.iata_code}
              className={`chip ${pick === h.iata_code ? 'chip-on' : ''}`}
              title={h.city_name ?? h.airport_name ?? h.iata_code}
            >
              {h.iata_code}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">
        {hub
          ? `Next departures from ${hub.origin_city}, shown in ${
              zone.current.name || 'your local time'
            }${shifted ? ` — the airport itself is on ${hub.origin_tz}` : ''}. Refreshed every minute.`
          : 'Live from the alliance schedule.'}
      </p>
    </>
  )
}

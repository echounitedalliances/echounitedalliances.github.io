/**
 * Travel advisories: the pop-up on the home page, and the banner above the
 * top bar once it has been read.
 *
 * This is a hand-edited constant rather than a table, deliberately: an
 * advisory is written once, by a person, in response to something happening,
 * and it needs to reach travellers in the time it takes to deploy — not wait
 * on a migration. There is normally nothing in here.
 *
 * To retire one, delete its entry — the banner goes with it. To publish a new
 * one, add an entry with a NEW id. Dismissal is remembered per id, so reusing
 * an old id leaves the pop-up hidden from everyone who dismissed the previous
 * advisory; and when the news itself changes materially, a new id is how you
 * put it back in front of people who had already read the old version.
 *
 * One at a time is the expected case. The banner shows the first entry.
 */
export type Advisory = {
  /** Stable and unique. Changing it re-shows the pop-up to everyone. */
  id: string
  title: string
  /** One line, for the collapsed banner. Should stand alone. */
  headline: string
  /** Each string is its own paragraph, for the pop-up and expanded banner. */
  body: string[]
  /** Shown under the text, quieter than the body. */
  footnote?: string
}

export const ADVISORIES: Advisory[] = [
  {
    // New id, not the closure-era one: flights resuming is news that people
    // who read the original notice need to see.
    id: 'krakatoa-2026-09-08-resuming',
    title: 'Travel advisory: Indonesia',
    headline:
      'Indonesia: limited flights resuming since 05:00 on 8 September, with delays still spreading.',
    body: [
      'Limited flights began resuming at 05:00 local time on 8 September, following the airport closures caused by the eruption of Anak Krakatoa.',
      'Delays will continue to propagate over the coming days as aircraft and crews work back to their scheduled positions. A flight departing on time today may still be affected by disruption several rotations earlier.',
      'Schedules and fares shown on this site are the filed timetable, and will not reflect cancellations or retimings made in response to the ash cloud.',
      'Travellers should contact their respective airlines directly for the latest information on their flights.',
    ],
    footnote: 'Every member carrier is run by a person, and they answer their own disruptions.',
  },
]

/** The advisory currently running, if any. */
export function currentAdvisory(): Advisory | undefined {
  return ADVISORIES[0]
}

const KEY = 'echo.advisory.dismissed'

/**
 * The banner has to know the moment the pop-up is dismissed, and it lives in
 * the app shell rather than under the page that owns the pop-up. An event is
 * cheaper than threading state through the whole tree for one boolean.
 */
export const ADVISORY_DISMISSED = 'echo:advisory-dismissed'

export function dismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    // Private windows, cleared site data, storage blocked outright: the
    // honest fallback is to show the advisory, not to hide it.
    return []
  }
}

export function isDismissed(id: string): boolean {
  return dismissedIds().includes(id)
}

export function dismiss(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...dismissedIds(), id]))
  } catch {
    // Not being able to remember the dismissal is not a reason to fail to
    // close it. It will simply come back next visit.
  }
  window.dispatchEvent(new Event(ADVISORY_DISMISSED))
}

/**
 * Travel advisories shown on the home page.
 *
 * This is a hand-edited constant rather than a table, deliberately: an
 * advisory is written once, by a person, in response to something happening,
 * and it needs to reach travellers in the time it takes to deploy — not wait
 * on a migration. There is normally nothing in here.
 *
 * To retire one, delete its entry. To publish a new one, add an entry with a
 * NEW id: dismissal is remembered per id, so reusing an old id would leave it
 * hidden from everyone who dismissed the previous advisory.
 */
export type Advisory = {
  /** Stable and unique. Changing it re-shows the pop-up to everyone. */
  id: string
  title: string
  /** Each string is its own paragraph. */
  body: string[]
  /** Shown under the text, quieter than the body. */
  footnote?: string
}

export const ADVISORIES: Advisory[] = [
  {
    id: 'krakatoa-2026-09',
    title: 'Travel advisory: Indonesia',
    body: [
      'Airports across Indonesia are closed or operating intermittently following the eruption of Anak Krakatoa.',
      'Flights to, from and over the region remain disrupted. Schedules and fares shown on this site are the filed timetable and will not reflect cancellations made in response to the ash cloud.',
      'Travellers should contact their respective airlines directly for the latest information on their flights.',
    ],
    footnote: 'Every member carrier is run by a person, and they answer their own disruptions.',
  },
]

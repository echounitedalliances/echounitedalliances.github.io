import { countryName, num } from './format'
import type { translate } from './i18n'

/**
 * A carrier's generated description, in the language being read.
 *
 * The English is written by echo_generate_profile() in the database and the
 * site shows it as it comes. Every other language is written here, from the
 * same figures (airline_profile_facts, 42_profile_facts.sql), one sentence
 * per fact -- English joins its clauses with commas in a way that does not
 * survive translation, so each clause is its own sentence here. A
 * description an admin wrote by hand is never rewritten: it stays as written,
 * like everything else members write.
 */
export type ProfileFacts = {
  airline_name: string | null
  division_name: string
  country_code: string | null
  hubs: string[] | null
  routes: number
  destinations: number
  countries: number
  fleet_size: number
  aircraft_types: number
  main_aircraft: string | null
  widebodies: number
  longest: { from: string; to: string; minutes: number } | null
  busiest: { from: string; to: string; weekly: number } | null
}

const REACH = (countries: number) =>
  countries >= 40
    ? 'a genuinely global network'
    : countries >= 15
      ? 'a wide international network'
      : countries >= 5
        ? 'an international network'
        : countries === 1
          ? 'a domestic network'
          : 'a regional network'

export function composeProfile(f: ProfileFacts, t: typeof translate): string {
  const airline = f.airline_name ?? t('This carrier')
  const out: string[] = []

  out.push(
    f.country_code
      ? t('{airline} is a member of Echo United Alliances, flying in the {division} division out of {country}.', {
          airline,
          division: f.division_name,
          country: countryName(f.country_code),
        })
      : t('{airline} is a member of Echo United Alliances, flying in the {division} division.', {
          airline,
          division: f.division_name,
        }),
  )

  if (f.routes === 0) {
    out.push(t('It holds a fleet but has not yet filed a schedule.'))
    return out.join(' ')
  }

  const vars = {
    hubs: f.hubs?.length ? f.hubs.join(', ') : t('its bases'),
    reach: t(REACH(f.countries)),
    routes: num(f.routes),
    destinations: num(f.destinations),
    countries: num(f.countries),
  }
  out.push(
    f.countries > 1
      ? t('From {hubs} it operates {reach} of {routes} routes to {destinations} destinations across {countries} countries.', vars)
      : t('From {hubs} it operates {reach} of {routes} routes to {destinations} destinations.', vars),
  )

  out.push(
    f.aircraft_types > 1
      ? t('The fleet numbers {n} aircraft across {types} types.', { n: num(f.fleet_size), types: f.aircraft_types })
      : t('The fleet numbers {n} aircraft.', { n: num(f.fleet_size) }),
  )
  if (f.main_aircraft) out.push(t('Its mainstay is the {model}.', { model: f.main_aircraft }))
  if (f.fleet_size > 0 && f.widebodies === f.fleet_size) {
    out.push(t('Every aircraft in it is a widebody.'))
  } else if (f.widebodies === 1) {
    out.push(t('One of them is a widebody for the long-haul work.'))
  } else if (f.widebodies > 1) {
    out.push(t('{n} of them are widebodies for the long-haul work.', { n: num(f.widebodies) }))
  }

  if (f.longest && f.longest.minutes >= 480) {
    const h = Math.floor(f.longest.minutes / 60)
    const m = String(f.longest.minutes % 60).padStart(2, '0')
    out.push(t('Its longest sector, {from} to {to}, takes {time}.', { from: f.longest.from, to: f.longest.to, time: `${h}h ${m}m` }))
  } else if (f.busiest && f.busiest.weekly >= 7) {
    out.push(t('Its busiest sector, {from} to {to}, runs {n} times a week.', { from: f.busiest.from, to: f.busiest.to, n: f.busiest.weekly }))
  }

  return out.join(' ')
}

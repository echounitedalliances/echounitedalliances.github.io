import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AIRLINE_OF_THE_WEEK } from '../../lib/alliance'
import { isConfigured, supabase } from '../../lib/supabase'
import { flag, num } from '../../lib/format'
import { Marquee, Reveal, prefersReducedMotion, useScrollProgress } from '../../lib/motion'

/**
 * Airline of the Week: the chosen carrier's livery crossing the screen as the
 * page scrolls past, over its name and what it flies.
 *
 * Which airline, and its liveries, are set in lib/alliance.ts. Everything
 * else (name, division, fleet, network) is read live, so the figures are
 * always this week's.
 */

type Row = {
  airline_name: string
  division_code: string
  division_name: string
  accent_color: string | null
  airline_slug: string
  airline_country: string | null
  fleet_size: number
  routes: number
  destinations: number
  hubs: string[] | null
  most_common_aircraft: string | null
}

const base = import.meta.env.BASE_URL

function countryName(cc: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc.toUpperCase()) ?? cc
  } catch {
    return cc
  }
}

/** This week's airline, as configured, with its figures read live. */
export function useAirlineOfTheWeek() {
  const pick = AIRLINE_OF_THE_WEEK
  const [row, setRow] = useState<Row | null>(null)
  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('mv_airline_directory')
      .select(
        'airline_name, division_code, division_name, accent_color, airline_slug, airline_country, fleet_size, routes, destinations, hubs, most_common_aircraft',
      )
      .eq('division_code', pick.division_code)
      .eq('airline_slug', pick.airline_slug)
      .maybeSingle()
      .then(({ data }) => setRow((data as Row) ?? null))
  }, [pick.division_code, pick.airline_slug])
  return { pick, row }
}

/**
 * The same airline as a card, for the members' area: the livery, who it is,
 * what it flies, and a link to its page.
 */
export function AirlineOfTheWeekCard() {
  const { pick, row } = useAirlineOfTheWeek()
  const livery = pick.liveries[0]
  const accent = row?.accent_color ?? 'var(--color-ink)'
  return (
    <div className="aotw-card panel">
      <div className="aotw-card-text">
        <p className="eyebrow text-ink-faint">Airline of the Week</p>
        <h2 className="display aotw-card-name">{row?.airline_name ?? '\u00a0'}</h2>
        {row && (
          <p className="aotw-tags">
            <span className="aotw-div" style={{ ['--c' as string]: accent }}>
              {row.division_name}
            </span>
            {row.airline_country && (
              <span>
                {flag(row.airline_country)} {countryName(row.airline_country)}
              </span>
            )}
          </p>
        )}
        <p className="aotw-card-blurb">{pick.blurb}</p>
        {row && (
          <dl className="aotw-card-figs">
            <div><dt className="eyebrow">Fleet</dt><dd>{num(row.fleet_size)}</dd></div>
            <div><dt className="eyebrow">Routes</dt><dd>{num(row.routes)}</dd></div>
            <div><dt className="eyebrow">Destinations</dt><dd>{num(row.destinations)}</dd></div>
          </dl>
        )}
        {row && (
          <Link to={`/d/${row.division_code}/${row.airline_slug}`} className="btn btn-ghost">
            Visit {row.airline_name} →
          </Link>
        )}
      </div>
      {livery && (
        <figure className="aotw-card-plane">
          <img src={`${base}${livery.src}`} alt={`${row?.airline_name ?? 'This week’s airline'}’s ${livery.aircraft}`} decoding="async" />
          <figcaption className="eyebrow text-ink-faint">
            {livery.aircraft}
            {livery.registration ? ` · ${livery.registration}` : ''}
          </figcaption>
        </figure>
      )}
    </div>
  )
}

export default function AirlineOfTheWeek() {
  const { pick, row } = useAirlineOfTheWeek()
  const [shown, setShown] = useState(0)
  const [ref, p] = useScrollProgress<HTMLElement>()

  // More than one livery: show each in turn.
  useEffect(() => {
    if (pick.liveries.length < 2 || prefersReducedMotion()) return
    const t = window.setInterval(() => setShown((i) => (i + 1) % pick.liveries.length), 6000)
    return () => window.clearInterval(t)
  }, [pick.liveries.length])

  const livery = pick.liveries[shown]
  const accent = row?.accent_color ?? 'var(--color-ink)'
  // Crosses from the right edge to past the left as the section scrolls by,
  // climbing slightly, nose up, the way an aircraft leaves the runway. The
  // livery faces left, so a clockwise (positive) turn lifts the nose.
  const x = 55 - p * 110
  const y = 18 - p * 36
  const tilt = 2 + p * 4

  return (
    <section ref={ref} className="aotw" aria-labelledby="aotw-h">
      <Marquee speed={0.7} className="aotw-band outline">
        <span>Airline of the Week</span><i>·</i>
        <span>{row?.airline_name ?? 'Airline of the Week'}</span><i>·</i>
      </Marquee>

      <div className="aotw-stage" aria-hidden="true">
        {pick.liveries.map((l, i) => (
          <img
            key={l.src}
            src={`${base}${l.src}`}
            alt=""
            className="aotw-plane"
            style={{
              opacity: i === shown ? 1 : 0,
              transform: `translate3d(${x}%, ${y}%, 0) rotate(${tilt}deg)`,
            }}
            decoding="async"
          />
        ))}
      </div>

      <div className="home-wrap aotw-body">
        <Reveal>
          <p className="eyebrow text-ink-faint">Airline of the Week</p>
          <h2 className="display aotw-name" id="aotw-h">
            {row?.airline_name ?? ' '}
          </h2>
          {row && (
            <p className="aotw-tags">
              <span className="aotw-div" style={{ ['--c' as string]: accent }}>
                {row.division_name}
              </span>
              {row.airline_country && <span>{flag(row.airline_country)} {countryName(row.airline_country)}</span>}
              {livery && (
                <span>
                  {livery.aircraft}
                  {livery.registration ? ` · ${livery.registration}` : ''}
                </span>
              )}
            </p>
          )}
        </Reveal>
        <Reveal delay={120} className="aotw-grid">
          <p className="aotw-blurb">{pick.blurb}</p>
          {row && (
            <dl className="aotw-figs">
              <div><dt className="eyebrow">Fleet</dt><dd>{num(row.fleet_size)}</dd></div>
              <div><dt className="eyebrow">Routes</dt><dd>{num(row.routes)}</dd></div>
              <div><dt className="eyebrow">Destinations</dt><dd>{num(row.destinations)}</dd></div>
              {row.hubs && row.hubs.length > 0 && (
                <div className="aotw-hubs"><dt className="eyebrow">Hubs</dt><dd>{row.hubs.join(' · ')}</dd></div>
              )}
            </dl>
          )}
          {row && (
            <Link to={`/d/${row.division_code}/${row.airline_slug}`} className="btn btn-ghost">
              Fly {row.airline_name} →
            </Link>
          )}
        </Reveal>
      </div>
    </section>
  )
}

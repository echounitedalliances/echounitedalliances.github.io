import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Advisory from '../components/Advisory'
import DepartureBoard from '../components/DepartureBoard'
import SearchPanel from '../components/SearchPanel'
import { AirlineCard, NotConfigured } from '../components/ui'
import DivisionTile from '../components/DivisionTile'
import RouteCanvas from '../components/home/RouteCanvas'
import AirlineOfTheWeek from '../components/home/AirlineOfTheWeek'
import { useMemberLanding } from '../components/Audience'
import { isConfigured, supabase } from '../lib/supabase'
import type { Airline, Arc, Division } from '../lib/types'
import { accentOf, capitalise, num, spell } from '../lib/format'
import { useAirportCount, useCarrierCount, useDivisionCount } from '../lib/carriers'
import { useOnlineCount } from '../lib/discordWidget'
import { SITE, discordConfigured } from '../lib/site'
import { SLOGAN, STORY } from '../lib/alliance'
import { Marquee } from '../lib/motion'
import '../home.css'

/**
 * The front page, rebuilt for the facelift of October 2026 (direction A).
 *
 * It is written for the player deciding which alliance to join, because that
 * is who the page has to win over: what they get (the market first), who
 * they would be joining, and how to apply. Travellers get the search and the
 * live board further down, and members have their own tab.
 *
 * Black and white throughout. The only colour is the divisions' own, where a
 * division is named or drawn.
 */

/**
 * Six carriers from anywhere in the alliance, different on every visit:
 * six random places in the directory's own order, fetched one row each.
 */
async function spotlightPicks(total: number): Promise<Airline[]> {
  const n = Math.max(total, 1)
  const offsets = new Set<number>()
  while (offsets.size < Math.min(6, n)) offsets.add(Math.floor(Math.random() * n))
  const rows = await Promise.all(
    [...offsets].map((p_offset) =>
      supabase.rpc('search_airlines', { p_limit: 1, p_offset }).then(({ data }) =>
        ((data as Airline[]) ?? [])[0],
      ),
    ),
  )
  return rows.filter((a): a is Airline => Boolean(a))
}

/** In-page links: HashRouter owns the hash, so these scroll rather than navigate. */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const BENEFITS: { title: string; body: string }[] = [
  {
    title: 'A big, friendly crowd',
    body: 'The largest alliance group in the game, active on Discord in every timezone. Someone is always around to answer a question.',
  },
  {
    title: 'Beginners welcome',
    body: 'Eight in ten of our members joined in their first days of playing. Leaders and veterans share what works, and members’ growth has quadrupled after joining.',
  },
  {
    title: 'Your airline, on the map',
    body: 'Every member carrier gets its own page here, with its routes, fleet and timetable drawn into the alliance network, and bookable by passengers.',
  },
  {
    title: 'Free-for-all sales',
    body: 'Members sell aircraft to each other in the open. No queue, no seniority: say what you will use it for and it is yours.',
  },
  {
    title: 'Airline of the Week',
    body: 'One member carrier in front of the whole group every week, plus challenges with prizes worth flying for.',
  },
  {
    title: 'A division that fits',
    body: 'Each division has its own leaders. Kyra is the main division; Elysium is for players who want realism.',
  },
]

export default function Home() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [arcs, setArcs] = useState<Arc[]>([])
  const [spotlight, setSpotlight] = useState<Airline[]>([])
  const carrierCount = useCarrierCount()
  const divisionCount = useDivisionCount()
  const airportCount = useAirportCount()
  const online = useOnlineCount()
  useMemberLanding()

  useEffect(() => {
    if (!isConfigured) return
    void (async () => {
      const [d, a, s] = await Promise.all([
        supabase.from('v_division_summary').select('*').order('sort_order'),
        // Each division's busiest pairs first, so every division is drawn.
        supabase
          .from('mv_network_arcs')
          .select('*')
          .order('featured', { ascending: false })
          .order('weekly_departures', { ascending: false })
          .limit(900),
        spotlightPicks(carrierCount),
      ])
      setDivisions((d.data as Division[]) ?? [])
      setArcs((a.data as Arc[]) ?? [])
      setSpotlight(s)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = divisions.reduce(
    (acc, d) => ({
      carriers: acc.carriers + Number(d.carriers),
      aircraft: acc.aircraft + Number(d.aircraft),
      routes: acc.routes + Number(d.routes),
    }),
    { carriers: 0, aircraft: 0, routes: 0 },
  )
  // Live figures; the shared count until the divisions land, so the headline
  // never reads "0 airlines" on first paint.
  const carriers = totals.carriers || carrierCount
  const nDiv = divisions.length || divisionCount

  if (!isConfigured) return <NotConfigured />

  const [sloganLead, sloganWord] = (() => {
    const i = SLOGAN.lastIndexOf(' ')
    return [SLOGAN.slice(0, i), SLOGAN.slice(i + 1)]
  })()

  return (
    <div className="home">
      {/* Renders nothing unless something is actually disrupting travel. */}
      <Advisory />

      {/* ---------- the opening screen ---------- */}
      <section className="home-hero" aria-label="Echo United Alliances">
        <RouteCanvas arcs={arcs} mode="hero" className="home-hero-canvas" />
        <div className="home-wrap home-hero-inner">
          <p className="eyebrow">
            Echo United Alliances · The Airline Simulator
          </p>
          <h1 className="display home-hero-title">
            <span className="line"><span>{sloganLead}</span></span>
            <span className="line"><span className="serif">{sloganWord}</span></span>
          </h1>
          <div className="home-hero-foot">
            <p>
              <strong>The largest alliance group in The Airline Simulator.</strong>{' '}
              {num(carriers)} airlines in {spell(nDiv)} divisions, from first-week beginners
              to the game’s biggest fleets. There’s room for yours.
            </p>
            <div className="home-cta">
              <a
                href={discordConfigured ? SITE.discordInvite : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-lg"
              >
                Join EUA ↗
              </a>
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => scrollToId('why')}>
                Why EUA
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- the sliding bands ---------- */}
      <div className="home-bands">
        <Marquee speed={0.6}>
          <span>{num(carriers)} airlines</span><i>and</i>
          <span>{spell(nDiv)} divisions</span><i>and</i>
          <span>{num(totals.aircraft)} aircraft</span><i>and</i>
          <span>{num(totals.routes)} routes</span><i>and</i>
        </Marquee>
        <Marquee speed={0.45} reverse className="outline">
          <span>All levels welcome</span><i>·</i>
          <span>One network</span><i>·</i>
          <span>Every timezone</span><i>·</i>
          <span>{SLOGAN}</span><i>·</i>
        </Marquee>
      </div>

      {/* ---------- the headline benefit ---------- */}
      <section className="home-offer" id="why">
        <div className="home-wrap">
          <div>
            <p className="eyebrow">The headline benefit</p>
            <h2 className="display home-h2">
              New aircraft, <span className="serif">well</span> below list
            </h2>
          </div>
          <div className="home-offer-figure">
            <div className="home-offer-big">
              50–90%
            </div>
            <div className="home-offer-copy">
              <p>
                <b>of the original price.</b> Name the models you want and what you’ll pay. A
                veteran member fills the order, and the market is strictly watched, so your order
                can’t be taken by someone else.
              </p>
              <p className="home-offer-note">
                Members order through <Link to="/members">Echo Market</Link>, signed in with Discord.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- everything around it ---------- */}
      <section className="home-section" aria-labelledby="stay">
        <div className="home-wrap">
          <div>
            <p className="eyebrow text-ink-faint">And everything around it</p>
            <h2 className="display home-h2" id="stay">
              Why players <span className="serif">stay</span>
            </h2>
          </div>
          <div className="home-rows">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="home-row">
                <h3 className="display">{b.title}</h3>
                <p>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- airline of the week ---------- */}
      <AirlineOfTheWeek />

      {/* ---------- the community in numbers ---------- */}
      <section className="home-section" aria-labelledby="growth">
        <div className="home-wrap">
          <div>
            <p className="eyebrow text-ink-faint">Since {STORY.founded}</p>
            <h2 className="display home-h2" id="growth">
              From {spell(STORY.foundingMembers)} founders <span className="serif">to</span> {num(carriers)}
            </h2>
          </div>
          <div className="home-figures">
            {[
              ['Member airlines', carriers],
              ['Aircraft', totals.aircraft],
              ['Routes', totals.routes],
              ['Airports', airportCount],
            ].map(([label, v], i) => (
              <div key={label as string} className="home-fig">
                <b>{(v as number) > 0 ? num(v as number) : '—'}</b>
                <span className="eyebrow text-ink-faint">{label}</span>
              </div>
            ))}
          </div>
          <div className="home-story">
            <div>
              <p>
                EUA began as {STORY.foundingMembers === 3 ? 'three founders' : 'a handful of founders'} under the name{' '}
                {STORY.foundedAs}. It has grown into {spell(nDiv)} divisions, and every one of those
                airlines is a player who chose to fly with us.
                {online != null && (
                  <> Right now, {num(online)} of them are online on Discord.</>
                )}{' '}
                Invite your friends, so they can make it home too.
              </p>
            </div>
            <div>
              <blockquote className="serif">“{STORY.closing}”</blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- the divisions ---------- */}
      <section className="home-section pt-0" aria-labelledby="divs">
        <div className="home-wrap">
          <div className="home-head-row">
            <div>
              <p className="eyebrow text-ink-faint">{capitalise(spell(nDiv))} divisions</p>
              <h2 className="display home-h2" id="divs">
                Pick your <span className="serif">colours</span>
              </h2>
            </div>
            <Link to="/divisions" className="btn btn-ghost">All divisions →</Link>
          </div>
          <div className="div-grid">
            {divisions.map((d) => (
              <DivisionTile key={d.division_code} d={d} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- the network ---------- */}
      <section className="home-section pt-0" aria-labelledby="net">
        <div className="home-wrap">
          <div className="home-head-row">
            <div>
              <p className="eyebrow text-ink-faint">The network</p>
              <h2 className="display home-h2" id="net">
                {num(airportCount)} airports. <span className="serif">One</span> map.
              </h2>
            </div>
            <Link to="/network" className="btn btn-ghost">Explore the network →</Link>
          </div>
          <Link to="/network" className="home-map" aria-label="Explore the network">
            <RouteCanvas
              arcs={arcs}
              mode="network"
              className="home-map-canvas"
              label="Echo's busiest routes on a world map, coloured by division"
            />
          </Link>
          <div className="home-legend">
            {divisions.map((d) => (
              <span key={d.division_code} style={{ ['--c' as string]: accentOf(d) }}>
                <i />
                {d.division_name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- carriers ---------- */}
      <section className="home-section pt-0" aria-labelledby="carriers">
        <div className="home-wrap">
          <div className="home-head-row">
            <div>
              <p className="eyebrow text-ink-faint">Different on every visit</p>
              <h2 className="display home-h2" id="carriers">
                Carriers in the <span className="serif">alliance</span>
              </h2>
            </div>
            <Link to="/airlines" className="btn btn-ghost">All {num(carriers)} →</Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spotlight.map((a, i) => (
              <div key={a.uid}>
                <AirlineCard a={a} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- join ---------- */}
      <section className="home-join" id="join">
        <div className="home-wrap">
          <div>
            <p className="eyebrow">Join Echo United Alliances</p>
            <h2 className="display home-h2">
              Two applications. <span className="serif">One</span> alliance.
            </h2>
            <p className="home-join-lede">{SITE.joinRequirement}</p>
          </div>
          <ol className="home-steps">
            {SITE.joinSteps.map((s, i) => (
              <li key={s.title}>
                <b className="display">{i + 1}</b>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="home-join-cta">
            {discordConfigured && (
              <a href={SITE.discordInvite} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-dark">
                Join on Discord ↗
              </a>
            )}
            <Link to="/members" className="btn btn-lg btn-dark-ghost">
              Already a member? Members’ area
            </Link>
            {online != null && (
              <span className="home-online">
                <i /> {num(online)} online now
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ---------- travellers ---------- */}
      <section className="home-section" id="fly" aria-labelledby="fly-h">
        <div className="home-wrap">
          <div>
            <p className="eyebrow text-ink-faint">Just here to fly?</p>
            <h2 className="display home-h2" id="fly-h">
              Book a seat <span className="serif">on</span> any EUA airline
            </h2>
            <p className="mt-4 max-w-[60ch] text-ink-dim">
              One search across all {num(carriers)} member carriers. Connect between divisions on a
              single booking reference, and keep your trips in one place.
            </p>
          </div>
          <div className="mt-8">
            <SearchPanel />
          </div>
          <div className="mt-10">
            <DepartureBoard />
          </div>
        </div>
      </section>

      <div className="home-sign" aria-hidden="true">
        <span>Echo</span> <span className="serif">United Alliances</span>
      </div>
    </div>
  )
}

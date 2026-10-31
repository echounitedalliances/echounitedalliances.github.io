import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import EchoMark from './EchoMark'
import { isConfigured, supabase } from '../lib/supabase'
import { SITE, discordConfigured } from '../lib/site'
import { AIRLINE_OF_THE_WEEK, AIRLINE_OF_THE_WEEK_LOCK_UNTIL, divisionPath } from '../lib/alliance'
import { num } from '../lib/format'
import { emph, useT } from '../lib/i18n'
import { useAirlineOfTheWeek } from './home/AirlineOfTheWeek'

/**
 * The pop-ups a visitor sees once: news worth interrupting them for.
 *
 * Two kinds, at most one per visit, and never over the radar welcome:
 *
 *  - the Airline of the Week, congratulated on the first visit after a new
 *    pick goes live (and not while it is still locked for its reveal). It
 *    follows lib/alliance.ts by itself: a new pick is a new key, so it shows
 *    again without touching this file;
 *  - a one-off ANNOUNCEMENT, below -- at the moment Uzuri, the tenth division.
 *
 * The Airline of the Week goes first because it changes every week; an
 * announcement still unseen waits for the next visit. Each is remembered in
 * this browser once closed.
 */
export const ANNOUNCEMENT = {
  id: 'uzuri-2026-10',
  division: 'uzuri',
  leader: 'Ahnaf',
  founded: '30 October 2026',
  color: '#FAE246',
  /** The last day it shows, inclusive. */
  until: '2026-11-30',
}

const KEY = 'eua-announcement-seen'
const AOTW_KEY = 'eua-aotw-seen'
/** Set once a pop-up has shown, so a second one waits for the next visit. */
const VISIT_KEY = 'eua-popup-this-visit'

const aotwId = `${AIRLINE_OF_THE_WEEK.division_code}/${AIRLINE_OF_THE_WEEK.airline_slug}`

function read(store: Storage, key: string) {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function write(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value)
  } catch {
    /* shows again next visit; harmless */
  }
}

function aotwDue() {
  const locked = AIRLINE_OF_THE_WEEK_LOCK_UNTIL && new Date(AIRLINE_OF_THE_WEEK_LOCK_UNTIL).getTime() > Date.now()
  return !locked && read(localStorage, AOTW_KEY) !== aotwId
}

function announcementDue() {
  return read(localStorage, KEY) !== ANNOUNCEMENT.id && new Date() <= new Date(`${ANNOUNCEMENT.until}T23:59:59`)
}

export default function Announcement() {
  const [which, setWhich] = useState<'aotw' | 'announcement' | null>(null)

  useEffect(() => {
    if (read(sessionStorage, VISIT_KEY)) return
    const next = aotwDue() ? 'aotw' : announcementDue() ? 'announcement' : null
    if (!next) return
    // Not over the radar welcome: wait until it has gone.
    const ready = () => !document.querySelector('.welcome')
    const show = () => {
      write(sessionStorage, VISIT_KEY, '1')
      setWhich(next)
    }
    if (ready()) {
      show()
      return
    }
    const id = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(id)
        show()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  if (which === 'aotw')
    return (
      <AirlineOfTheWeekNews
        onClose={() => {
          setWhich(null)
          write(localStorage, AOTW_KEY, aotwId)
        }}
      />
    )
  if (which === 'announcement')
    return (
      <DivisionNews
        onClose={() => {
          setWhich(null)
          write(localStorage, KEY, ANNOUNCEMENT.id)
        }}
      />
    )
  return null
}

function AirlineOfTheWeekNews({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { pick, row } = useAirlineOfTheWeek()
  const livery = pick.liveries[0]
  // Its name and figures come from the database; wait for them rather than
  // open with a blank where the airline goes.
  if (!row) return null
  const color = row.accent_color ?? 'var(--color-ink)'

  return (
    <Modal
      title={<span style={{ ['--c' as string]: color }}>{emph(t('Congratulations, *{airline}*', { airline: row.airline_name }))}</span>}
      onClose={onClose}
      labelledBy="announcement-title"
    >
      <div className="announce" style={{ ['--c' as string]: color }}>
        <div className="announce-band">
          <EchoMark height={30} color="var(--c)" />
          <span className="eyebrow">{t('Airline of the Week')}</span>
        </div>
        {livery && (
          <img
            className="announce-livery"
            src={`${import.meta.env.BASE_URL}${livery.src}`}
            alt={livery.aircraft}
          />
        )}
        <p className="text-ink-dim">{t(pick.blurb)}</p>
        <dl className="announce-facts">
          <div>
            <dt className="eyebrow">{t('Fleet')}</dt>
            <dd>{num(row.fleet_size)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('Routes')}</dt>
            <dd>{num(row.routes)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('Destinations')}</dt>
            <dd>{num(row.destinations)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to={divisionPath(row.division_code, row.airline_slug)} onClick={onClose} className="btn announce-cta">
            {t('Fly {airline}', { airline: row.airline_name })} →
          </Link>
          <button type="button" onClick={onClose} className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
            {t('Maybe later')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DivisionNews({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [carriers, setCarriers] = useState<number | null>(null)

  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('carriers')
      .eq('division_code', ANNOUNCEMENT.division)
      .maybeSingle()
      .then(({ data }) => setCarriers((data as { carriers: number } | null)?.carriers ?? null))
  }, [])

  return (
    <Modal title={emph(t('Welcome, *Uzuri*'))} onClose={onClose} labelledBy="announcement-title">
      <div className="announce" style={{ ['--c' as string]: ANNOUNCEMENT.color }}>
        <div className="announce-band">
          <EchoMark height={30} color="var(--c)" />
          <span className="eyebrow">{t('New division')}</span>
        </div>
        <p className="text-ink-dim">
          {t('Echo United Alliances now has ten divisions. Uzuri is the newest, led by {leader}, and it is taking its first airlines right now: the perfect time to get in early and help shape it.', {
            leader: ANNOUNCEMENT.leader,
          })}
        </p>
        <dl className="announce-facts">
          <div>
            <dt className="eyebrow">{t('Founded')}</dt>
            <dd>{t(ANNOUNCEMENT.founded)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('Led by')}</dt>
            <dd>{ANNOUNCEMENT.leader}</dd>
          </div>
          {carriers != null && (
            <div>
              <dt className="eyebrow">{t('Carriers')}</dt>
              <dd>{num(carriers)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to={divisionPath(ANNOUNCEMENT.division)} onClick={onClose} className="btn announce-cta">
            {t('Meet Uzuri')} →
          </Link>
          {discordConfigured && (
            <a href={SITE.discordInvite} target="_blank" rel="noopener noreferrer" onClick={onClose} className="btn btn-ghost">
              {t('Apply on Discord')} ↗
            </a>
          )}
          <button type="button" onClick={onClose} className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
            {t('Maybe later')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

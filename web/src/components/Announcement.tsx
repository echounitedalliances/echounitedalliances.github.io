import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import EchoMark from './EchoMark'
import { isConfigured, supabase } from '../lib/supabase'
import { SITE, discordConfigured } from '../lib/site'
import { num } from '../lib/format'
import { emph, useT } from '../lib/i18n'

/**
 * A one-off welcome on the home page for something new in the group -- at the
 * moment, Uzuri, the tenth division.
 *
 * Shown once per visitor (remembered in this browser), only on the home page,
 * only after the radar welcome has finished, and not at all after `until`.
 * For the next one, change ANNOUNCEMENT: a new id shows it again to everyone.
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

function alreadySeen() {
  try {
    return localStorage.getItem(KEY) === ANNOUNCEMENT.id
  } catch {
    return false
  }
}

export default function Announcement() {
  const t = useT()
  const [show, setShow] = useState(false)
  const [carriers, setCarriers] = useState<number | null>(null)

  useEffect(() => {
    if (alreadySeen()) return
    if (new Date() > new Date(`${ANNOUNCEMENT.until}T23:59:59`)) return
    // Not over the radar welcome: wait until it has gone.
    const ready = () => !document.querySelector('.welcome')
    if (ready()) {
      setShow(true)
      return
    }
    const id = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(id)
        setShow(true)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!show || !isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('carriers')
      .eq('division_code', ANNOUNCEMENT.division)
      .maybeSingle()
      .then(({ data }) => setCarriers((data as { carriers: number } | null)?.carriers ?? null))
  }, [show])

  if (!show) return null

  const close = () => {
    setShow(false)
    try {
      localStorage.setItem(KEY, ANNOUNCEMENT.id)
    } catch {
      /* shows again next visit; harmless */
    }
  }

  return (
    <Modal title={emph(t('Welcome, *Uzuri*'))} onClose={close} labelledBy="announcement-title">
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
          <Link to={`/d/${ANNOUNCEMENT.division}`} onClick={close} className="btn announce-cta">
            {t('Meet Uzuri')} →
          </Link>
          {discordConfigured && (
            <a href={SITE.discordInvite} target="_blank" rel="noopener noreferrer" onClick={close} className="btn btn-ghost">
              {t('Apply on Discord')} ↗
            </a>
          )}
          <button type="button" onClick={close} className="mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
            {t('Maybe later')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

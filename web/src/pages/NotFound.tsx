import { useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FlapText, toFlap } from '../components/SplitFlap'
import { emph, useT } from '../lib/i18n'
import { pageTitle } from '../lib/pageMeta'

/**
 * The page for an address the site does not have, as a departures board:
 * flight EUA 404 to wherever was typed, diverted, and the rows beneath it the
 * flights it has been rebooked onto -- real pages, each row a link.
 *
 * The first rebooking is the nearest page that does exist above the address
 * (/d/aegis for a mistyped /d/aegis/tsuki_airwys), because that is most often
 * where the reader meant to be. The flaps are Latin-only, like the departure
 * board's and like real ones, so they stay in English; the words around them
 * translate.
 */

const COLUMNS = { time: 5, flight: 7, destination: 16, status: 8 }

// On a phone the board keeps only where and what: time and flight number
// would push the status off the edge.
const WIDE = 'board-wide'

type Row = { to: string; destination: string; status: string; label: string }

function runWidth(cells: number) {
  return { width: `calc(${cells} * (var(--flap-w) + 2px) - 2px)`, flexShrink: 0 }
}

function clock(offsetMin: number) {
  const d = new Date(Date.now() + offsetMin * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The last part of the address, as the board would print it. */
function wanted(pathname: string) {
  const last = pathname.split('/').filter(Boolean).pop() ?? ''
  let decoded = last
  try {
    decoded = decodeURIComponent(last)
  } catch {
    /* shown as typed */
  }
  return toFlap(decoded.replace(/[_-]+/g, ' '), 'UNKNOWN')
}

/** The nearest page above this address that the site has, if it is not home. */
function nearest(pathname: string): Row | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'd' && parts.length > 2)
    return { to: `/d/${parts[1]}`, destination: `${parts[1]} DIVISION`, status: 'BOARDING', label: parts[1] }
  if (parts[0] === 'airports' && parts.length > 1)
    return { to: '/network', destination: 'NETWORK', status: 'BOARDING', label: 'Network' }
  return null
}

export default function NotFound() {
  const t = useT()
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = pageTitle(t('Page not found'))
  }, [t])

  const rows = useMemo<Row[]>(() => {
    const options: Row[] = [
      { to: '/', destination: 'HOME', status: 'ON TIME', label: t('Home') },
      { to: '/divisions', destination: 'DIVISIONS', status: 'ON TIME', label: t('Divisions') },
      { to: '/airlines', destination: 'AIRLINES', status: 'ON TIME', label: t('Airlines') },
      { to: '/network', destination: 'NETWORK', status: 'ON TIME', label: t('Network') },
      { to: '/join', destination: 'HOW TO JOIN', status: 'ON TIME', label: t('How to join') },
    ]
    const near = nearest(pathname)
    const list = near ? [near, ...options.filter((o) => o.to !== near.to)] : options
    // The first flight out is the one boarding now.
    return list.slice(0, 5).map((r, i) => (i === 0 ? { ...r, status: 'BOARDING' } : r))
    // Recomputed per address; t only changes the screen-reader labels.
  }, [pathname, t])

  const now = clock(0)

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-5 sm:py-20">
      <p className="eyebrow text-ink-faint">{t('Error 404')}</p>
      <h1 className="display mt-3 text-[clamp(34px,5.4vw,64px)]">{emph(t('Off the *route map*'))}</h1>
      <p className="mt-4 max-w-[60ch] text-lg text-ink-dim">
        {t('There are no departures to that page from here. We have rebooked you onto the next flights out.')}
      </p>

      <div className="board mt-10 w-fit max-w-full" role="table" aria-label={t('Rebooking options')}>
        <div className="board-head" role="row">
          <span className={WIDE} style={runWidth(COLUMNS.time)}>{t('Time')}</span>
          <span className={WIDE} style={runWidth(COLUMNS.flight)}>{t('Flight')}</span>
          <span style={runWidth(COLUMNS.destination)}>{t('Destination')}</span>
          <span style={runWidth(COLUMNS.status)}>{t('Status')}</span>
        </div>

        <div className="board-row" role="row">
          <FlapText value={now} width={COLUMNS.time} className={WIDE} />
          <FlapText value="EUA 404" width={COLUMNS.flight} delayBase={120} className={WIDE} />
          <FlapText value={wanted(pathname)} width={COLUMNS.destination} delayBase={240} />
          <FlapText value="DIVERTED" width={COLUMNS.status} delayBase={560} className="flap-warn" />
        </div>

        {rows.map((r, i) => (
          <Link
            key={r.to}
            to={r.to}
            role="row"
            aria-label={t('Go to {page}', { page: r.label })}
            className="board-row board-link"
          >
            <FlapText value={clock(5 * (i + 1))} width={COLUMNS.time} delayBase={(i + 1) * 70} className={WIDE} />
            <FlapText value={`EUA ${i + 1}`} width={COLUMNS.flight} delayBase={(i + 1) * 70 + 120} className={WIDE} />
            <FlapText value={toFlap(r.destination, r.destination)} width={COLUMNS.destination} delayBase={(i + 1) * 70 + 240} />
            <FlapText
              value={r.status}
              width={COLUMNS.status}
              delayBase={(i + 1) * 70 + 560}
              className={r.status === 'BOARDING' ? 'flap-live' : ''}
            />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-ink-dim">
        {t('Followed a link on this site to get here?')}{' '}
        <Link to="/support" className="text-ink underline underline-offset-4">
          {t('Tell us, and we will fix it.')}
        </Link>
      </p>
    </div>
  )
}

import { LEADER_EMAILS, type Leader } from '../lib/alliance'
import { useT } from '../lib/i18n'

/**
 * A small envelope beside a leader's name that opens an email to their Echo
 * address. A leader without one yet gets the same envelope, greyed out, with
 * a tooltip saying so -- the slot is there, it just is not filled in.
 *
 * A button rather than a link: on the Divisions page it sits inside the
 * division tile, which is itself a link, and a link cannot hold another.
 */
export default function LeaderMail({ leader }: { leader: Leader }) {
  const t = useT()
  const email = (LEADER_EMAILS[leader.discord] ?? '').trim()
  const label = email
    ? t('Email {name}', { name: leader.name })
    : t('Contact details updated soon')

  return (
    <button
      type="button"
      className={`leader-mail ${email ? '' : 'is-off'}`}
      aria-label={label}
      aria-disabled={!email}
      title={label}
      onClick={(e) => {
        // Never let the click fall through to the tile it sits in.
        e.preventDefault()
        e.stopPropagation()
        if (email) window.location.href = `mailto:${email}`
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2 4.2 8 9l6-4.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

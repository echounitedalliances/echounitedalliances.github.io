import { siInstagram, siReddit, siTiktok, siYoutube } from 'simple-icons'
import { SOCIALS } from '../lib/site'

/**
 * The alliance's own accounts, as a row of icons that light up in their
 * brand colour on hover. Icons from simple-icons (CC0), so the marks are the
 * brands' own shapes rather than drawn by eye.
 */
const ICONS = { youtube: siYoutube, tiktok: siTiktok, instagram: siInstagram, reddit: siReddit } as const

export default function SocialLinks() {
  return (
    <ul className="social-links">
      {SOCIALS.map((s) => {
        const icon = ICONS[s.id]
        return (
          <li key={s.id}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.name}
              title={s.name}
              style={{ '--brand': icon.hex === '000000' ? '#F4F2EE' : `#${icon.hex}` } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d={icon.path} fill="currentColor" />
              </svg>
              <span>{s.name}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

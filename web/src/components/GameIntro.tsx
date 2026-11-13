import { GAME, GAME_SCREENSHOTS } from '../lib/site'
import { emph, useI18n } from '../lib/i18n'

/**
 * "What is The Airline Simulator?" -- for the visitor who arrives from a
 * search or a Discord link and has never played it. On the home page right
 * after the opening screen, and at the top of /join.
 *
 * The store badges are Apple's and Google's own artwork, unaltered, in the
 * visitor's language where the store publishes one (public/brand/stores);
 * only the frame around them is ours. On a phone the visitor's own store
 * comes first.
 *
 * Every figure is the developer's, as airline-simulator.com states it, and the
 * section says plainly that Echo is not the developer.
 */

const FACTS = [
  { figure: '70+', label: 'airliners from Airbus, Boeing, Bombardier and Embraer' },
  { figure: '2,230+', label: 'airports around the world' },
  { figure: '20+', label: 'livery types to paint your fleet in' },
]

function storeOrder(): ('ios' | 'android')[] {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/android/i.test(ua)) return ['android', 'ios']
  return ['ios', 'android']
}

export default function GameIntro({ className = '' }: { className?: string }) {
  const { t, lang } = useI18n()
  const base = import.meta.env.BASE_URL
  const badges = {
    ios: { href: GAME.ios, src: `${base}brand/stores/apple-${lang}.svg`, alt: t('Download on the App Store') },
    android: { href: GAME.android, src: `${base}brand/stores/google-${lang}.png`, alt: t('Get it on Google Play') },
  }
  const shot = GAME_SCREENSHOTS[0]

  return (
    <section className={`game-intro ${className}`} aria-labelledby="game-intro">
      <div className={`game-intro-grid ${shot ? 'has-shot' : ''}`}>
        <div>
          <p className="eyebrow text-ink-faint">{t('New to the game?')}</p>
          <h2 id="game-intro" className="display game-intro-h2">
            {emph(t('What is *The Airline Simulator*?'))}
          </h2>
          <p className="game-intro-lede">
            {t(
              'The Airline Simulator is an airline management game for iOS and Android phones. You build an airline of your own, choose its aircraft, paint its livery, and open routes between real airports, with passenger demand based on real-world data.',
            )}
          </p>
          <p className="game-intro-lede">
            {t('Every other airline in the game is run by another player. Alliances like Echo are how they fly together.')}
          </p>

          <ul className="game-intro-facts">
            {FACTS.map((f) => (
              <li key={f.figure}>
                <b>{f.figure}</b>
                <span>{t(f.label)}</span>
              </li>
            ))}
          </ul>

          <div className="game-intro-stores">
            {storeOrder().map((s) => (
              <a key={s} href={badges[s].href} target="_blank" rel="noopener noreferrer" className="store-badge">
                <img src={badges[s].src} alt={badges[s].alt} height={44} />
              </a>
            ))}
          </div>

          <p className="game-intro-note">
            <a href={GAME.website} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">
              {t('Visit the game’s website')} ↗
            </a>
            <span>{t('Echo is a player-run alliance, not affiliated with the game’s developers.')}</span>
          </p>
        </div>

        {shot && (
          <div className="game-intro-phone" aria-hidden="true">
            <img src={`${base}${shot}`} alt="" loading="lazy" />
          </div>
        )}
      </div>
    </section>
  )
}

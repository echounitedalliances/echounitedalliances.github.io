import { Link } from 'react-router-dom'
import { SITE, discordConfigured } from '../lib/site'
import { useAirportCount, useCarrierCount, useDivisionCount } from '../lib/carriers'
import { num } from '../lib/format'
import { emph, useT } from '../lib/i18n'

/**
 * Join an alliance in The Airline Simulator: the page a new player lands on
 * from a search, written for someone who has never heard of Echo.
 *
 * Every claim here is one the site already makes elsewhere -- the share of
 * members who joined as beginners is from the board's own story (STORY in
 * lib/alliance.ts), the aircraft orders from the home page -- and the counts
 * are live, so nothing on it goes stale on its own.
 */
const BENEFITS = [
  {
    title: 'Aircraft for less',
    body: 'Members fill each other’s aircraft orders well below list price through Echo Market, and the market is watched, so an order can’t be taken from under you.',
  },
  {
    title: 'People who have done it before',
    body: 'Most of our members joined in their first weeks of playing. Veterans in every division answer questions on Discord, from your first route to your hundredth aircraft.',
  },
  {
    title: 'A network to fly into',
    body: 'Your airline joins a network reaching {airports} airports. It gets its own page on this site and shows up on the alliance map and the departure board.',
  },
]

const STEPS = [
  'Join the Echo Discord server. Everything happens there: applications, trading and help.',
  'Pick a division. Each has its own leaders and style: Kyra is the main alliance, Elysium the realism alliance.',
  'Apply in that division’s channel on Discord. Its leaders invite your airline to the division’s alliance in the game.',
  'Once you are in, your airline appears on this site with the next weekly update.',
]

const FAQ = [
  {
    q: 'Do I need to be good at the game first?',
    a: 'No. Most of our members joined when they had just started, and helping new airlines grow is a large part of what the alliance is for.',
  },
  {
    q: 'Which division should I choose?',
    a: 'Any of them. They share one network and one Discord; the division mostly decides who you fly alongside. If you are unsure, ask on Discord and someone will point you to one that is recruiting.',
  },
  {
    q: 'Where do I find Echo in the game?',
    a: 'Every division is an alliance in The Airline Simulator named Echo and the division’s name, such as Echo Aegis or Echo Kyra.',
  },
]

export default function Join() {
  const t = useT()
  const airlines = useCarrierCount()
  const airports = useAirportCount()
  const divisions = useDivisionCount()

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">{t('New to The Airline Simulator?')}</p>
      <h1 className="display mt-3 max-w-[18ch] text-[clamp(34px,5.4vw,64px)]">
        {emph(t('Join an alliance in *The Airline Simulator*'))}
      </h1>
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">
        {t('An alliance is a group of player-run airlines that help each other grow. Echo United Alliances is one: {airlines} airlines across {divisions} divisions, open to first-week beginners and the game’s biggest fleets alike.', {
          airlines: num(airlines),
          divisions: num(divisions),
        })}
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        {discordConfigured && (
          <a href={SITE.discordInvite} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            {t('Join on Discord')} ↗
          </a>
        )}
        <Link to="/divisions" className="btn btn-ghost">
          {t('Browse the divisions')} →
        </Link>
      </div>

      <section className="mt-16 border-t border-edge-soft pt-8" aria-labelledby="join-why">
        <h2 id="join-why" className="display text-[clamp(26px,3.4vw,38px)]">
          {t('What an alliance gives you')}
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="panel p-5">
              <h3 className="display text-[22px]">{t(b.title)}</h3>
              <p className="mt-3 text-ink-dim">{t(b.body, { airports: num(airports) })}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 border-t border-edge-soft pt-8" aria-labelledby="join-how">
        <h2 id="join-how" className="display text-[clamp(26px,3.4vw,38px)]">
          {t('How to join Echo')}
        </h2>
        <ol className="mt-6 flex max-w-[70ch] flex-col gap-5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-4">
              <span className="mono pt-1 text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-lg text-ink-dim">{t(s)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 border-t border-edge-soft pt-8" aria-labelledby="join-faq">
        <h2 id="join-faq" className="display text-[clamp(26px,3.4vw,38px)]">
          {t('Questions new players ask')}
        </h2>
        <dl className="mt-6 flex max-w-[70ch] flex-col gap-6">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="text-lg text-ink">{t(f.q)}</dt>
              <dd className="mt-2 text-ink-dim">{t(f.a)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

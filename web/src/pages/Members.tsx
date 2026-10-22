import { Link } from 'react-router-dom'
import { MEMBER_APPS, type MemberApp } from '../lib/apps'
import { AirlineOfTheWeekCard } from '../components/home/AirlineOfTheWeek'
import '../home.css'
import { SITE, discordConfigured } from '../lib/site'
import { useCarrierCount, useDivisionCount } from '../lib/carriers'
import { num, spell } from '../lib/format'
import { useT } from '../lib/i18n'

/**
 * The members' front door.
 *
 * The public site is for travellers; this is for the people running Echo
 * airlines. The two apps on it are separate sites under the alliance domain,
 * each with its own sign-in and its own rules on who gets in (lib/apps.ts);
 * until one is plugged in, its tile leads to a "coming soon" preview here.
 *
 * Nothing here is behind a login, so the public sees it too: the tools come
 * first because members visit most, each app says who can use it, and a
 * link under the heading takes newcomers straight to how to join.
 */

function AppTile({ app }: { app: MemberApp }) {
  const t = useT()
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="display text-[28px] leading-none">{app.name}</span>
        <span
          className={`mono shrink-0 border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
            !app.live
              ? 'border-edge text-ink-faint'
              : app.access.membersOnly
                ? 'border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[#050505]'
                : 'border-[color:var(--color-good)] text-[color:var(--color-good)]'
          }`}
        >
          {app.live ? t(app.access.badge) : t('Coming soon')}
        </span>
      </div>
      <p className="mt-3 text-[15px] text-ink-dim">{t(app.tagline)}</p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="mono text-[11px] uppercase tracking-[0.12em] text-cyan">
          {app.live ? `${t('Open')} ↗` : `${t('Preview')} →`}
        </span>
        <span className="mono text-right text-[10.5px] text-ink-faint">{t(app.access.signIn)}</span>
      </div>
    </>
  )
  const cls = 'panel block p-5 transition-colors hover:border-accent sm:p-6'
  return (
    <div>
      {app.live ? (
        <a href={app.url} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link to={app.route} className={cls}>
          {body}
        </Link>
      )}
      {app.secondary && app.live && (
        <a
          href={app.secondary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mono mt-2 inline-block text-[11px] text-ink-faint hover:text-ink-dim"
        >
          {t(app.secondary.label)} ↗
        </a>
      )}
    </div>
  )
}

const ON_SITE = [
  { to: '/divisions', title: 'Divisions', text: 'Every division, its carriers and its network.' },
  { to: '/about', title: 'Leadership board', text: 'Who leads each division, and how to reach them.' },
  { to: '/activities', title: 'Our activities', text: 'Events, group flights and what the alliance is up to.' },
  { to: '/news', title: 'News', text: 'What member airlines have announced lately.' },
]

export default function Members() {
  const carriers = useCarrierCount()
  const divisions = useDivisionCount()
  const t = useT()

  return (
    <>
      <section className="aurora relative overflow-hidden border-b border-edge-soft">
        <div className="mx-auto max-w-[1180px] px-4 pt-9 pb-10 sm:px-5 sm:pt-14 sm:pb-12">
          <p className="eyebrow text-cyan">{t("Members' area")}</p>
          <h1 className="display mt-3 text-[clamp(32px,6vw,72px)]">
            {t('For the airlines that are Echo.')}
          </h1>
          <p className="mt-4 max-w-[62ch] text-ink-dim sm:text-lg">
            {t('The tools for {airlines} member airlines across {divisions} divisions. Echo Live is open to everyone; Echo Market is for members, signed in with the Discord account you use on the EUA server.', {
              airlines: num(carriers),
              divisions: spell(divisions),
            })}
          </p>
          <button
            type="button"
            onClick={() => document.getElementById('join')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-ink underline decoration-[color:var(--color-ink-faint)] underline-offset-4 hover:decoration-[color:var(--color-ink)]"
          >
            {t('Not in EUA yet? Here’s how to join')} ↓
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 pt-10 sm:px-5 sm:pt-12">
        <p className="eyebrow text-ink-faint">{t("Members' apps")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {MEMBER_APPS.map((a) => (
            <AppTile key={a.key} app={a} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 pt-12 sm:px-5" aria-label={t('Airline of the Week')}>
        <p className="eyebrow text-ink-faint">{t('This week in EUA')}</p>
        <div className="mt-4">
          <AirlineOfTheWeekCard />
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 pt-12 sm:px-5">
        <p className="eyebrow text-ink-faint">{t('On this site')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ON_SITE.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="panel block p-4 transition-colors hover:border-accent"
            >
              <span className="display block text-xl">{t(l.title)}</span>
              <span className="mt-1.5 block text-[13.5px] text-ink-dim">{t(l.text)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="join" className="mx-auto max-w-[1180px] scroll-mt-28 px-4 pt-12 sm:px-5">
        <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="display text-2xl">{t('Not in a division yet?')}</p>
            <p className="mt-1 max-w-[70ch] text-[14px] text-ink-dim">{t(SITE.joinRequirement)}</p>
          </div>
          {discordConfigured && (
            <a
              href={SITE.discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary shrink-0"
            >
              {t('Apply on Discord')}
            </a>
          )}
        </div>
      </section>
    </>
  )
}

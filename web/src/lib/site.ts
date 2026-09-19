/**
 * Site-wide copy and links that are not in the database.
 *
 * Edit this file to change the join links. Everything here is public.
 */

/**
 * Pre-launch lock.
 *
 * Set to an ISO timestamp, App.tsx renders MaintenanceLock and nothing else
 * -- no routes, no data fetching, no sign-in -- with a live countdown to
 * that moment, and switches over to the real site on its own the instant it
 * passes, in every tab already open as well as any new visit. Set to null,
 * the site is open as normal.
 *
 * Because the switch has to happen live, without a rebuild, the real app
 * has to ship in the bundle the whole time the lock is up rather than being
 * tree-shaken out of it the way a static true/false could manage -- there
 * is no way to make code appear in an already-downloaded bundle later.
 *
 * This is a front-end gate only: it touches no data, and nobody's account,
 * booking, or admin application is affected while it is on. To end the lock
 * early, set this to null, rebuild (npm --prefix web run build), and
 * publish; left alone, it lifts itself at the timestamp below.
 */
export const MAINTENANCE_LOCK_UNTIL: string | null = '2026-09-19T23:00:00+07:00'

export const SITE = {
  /**
   * The Discord invite. This is the whole point of the join panel: the
   * expected path is outsider -> website -> Discord.
   *
   * Check in Discord that this invite is set to never expire and has no use
   * limit. A default invite dies after seven days, and it would take the
   * site's main call to action with it.
   */
  discordInvite: 'https://discord.gg/E6ZccFNWnd',

  /**
   * The source. The privacy page tells people every claim on it can be
   * checked, which is only true if it says where to look.
   */
  repoUrl: 'https://github.com/echounitedalliances/echounitedalliances.github.io',

  /** Where applications actually happen, stated plainly. */
  joinRequirement:
    'Every division of Echo requires an application in two places: in The Airline Simulator itself, and with Echo Alliances on the Discord server. Both steps are needed — an in-game request alone will not be actioned, and neither will an alliance application without the in-game request.',

  joinSteps: [
    {
      title: 'Apply in the game',
      body: 'Open The Airline Simulator, find the division you want in the alliance browser, and send an application from your airline.',
    },
    {
      title: 'Apply with Echo Alliances',
      body: 'Post your application on the Discord server, or use the form on this page instead — either way it reaches a division lead, who matches it to your in-game request.',
    },
    {
      title: 'Wait for a division lead',
      body: 'Divisions are run separately and review at their own pace. Every application is read by hand, in every division, so allow a little time.',
    },
  ],
} as const

/**
 * Badges on the division cards.
 *
 * Group policy rather than game data, which is why it lives here and not in
 * the database: the divisions table is rebuilt from the game exports, and a
 * rebuild would wipe anything written into it by hand. The running order is
 * policy too, but that one has to be in the database -- every page that lists
 * divisions sorts by sort_order -- and it is set by
 * database/sql/16_division_policy.sql.
 */
export const DIVISION_NOTES: Record<string, string> = {
  kyra: 'Main division',
  elysium: 'Realism alliance',
}

export const discordConfigured = !SITE.discordInvite.includes('REPLACE-ME')

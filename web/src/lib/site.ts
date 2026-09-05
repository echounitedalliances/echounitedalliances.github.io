/**
 * Site-wide copy and links that are not in the database.
 *
 * Edit this file to change the join links. Everything here is public.
 */

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

  /** Where applications actually happen, stated plainly. */
  joinRequirement:
    'Every division of Echo requires an application in two places: in The Airline Simulator itself, and with Echo Alliances — either on the Discord server or through the form on this page, whichever is easier. Both steps are needed — an in-game request alone will not be actioned, and neither will an alliance application without the in-game request.',

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

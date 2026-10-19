/**
 * The members' apps: the sites that sit beside this one under Echo Alliances.
 *
 * Each is its own project, with its own database and its own Discord sign-in,
 * reached on its own subdomain (the "option A" layout agreed 19 October 2026):
 *
 *   echoalliances.com          this site, public
 *   live.echoalliances.com     Echo Live, the flight tracker
 *   market.echoalliances.com   Echo Market, aircraft orders
 *   desk.echoalliances.com     the market's seller desk
 *
 * Nothing here signs anyone in or reads their data. This site only links
 * out; each app does its own Discord login, so a member signs in there.
 *
 * TO PLUG ONE IN: set `url` to where it lives and `live: true`. The tile on
 * /members starts linking straight to it, and its page here (/live, /market)
 * forwards there instead of showing "coming soon". Nothing else changes.
 * When the domain is bought, swap `url` for `plannedUrl`.
 */

export type MemberApp = {
  key: 'live' | 'market'
  name: string
  /** One line for the tile. */
  tagline: string
  /** What a member gets, three short points for the preview page. */
  points: string[]
  /** This site's page for it, which shows "coming soon" until it is live. */
  route: string
  /** Where it will live under the alliance domain. */
  plannedUrl: string
  /** Where it lives today. */
  url: string
  /** false: /members and `route` show "coming soon". true: both link to `url`. */
  live: boolean
  /** A second, smaller link on the tile. */
  secondary?: { label: string; url: string }
}

export const MEMBER_APPS: MemberApp[] = [
  {
    key: 'live',
    name: 'Echo Live',
    tagline: 'Every Echo flight in the air right now, on one live map.',
    points: [
      "Live positions worked out from every member airline's timetable",
      'Follow a carrier, a division or one flight',
      'Departures and arrivals at any airport, as they happen',
    ],
    route: '/live',
    plannedUrl: 'https://live.echoalliances.com',
    url: 'https://echoflightslive.github.io/',
    live: false,
  },
  {
    key: 'market',
    name: 'Echo Market',
    tagline: 'Order brand-new aircraft below the in-game list price, delivered by alliance sellers.',
    points: [
      'Order new airframes below the in-game list price',
      'Track every order from request to delivery',
      'Discord messages when an order is taken or delivered',
    ],
    route: '/market',
    plannedUrl: 'https://market.echoalliances.com',
    url: 'https://echomarket-buyer.vercel.app',
    live: false,
    secondary: {
      label: 'Seller desk (sellers & admins)',
      // planned: https://desk.echoalliances.com
      url: 'https://echomarket-seller.vercel.app',
    },
  },
]

export function appByKey(key: MemberApp['key']): MemberApp {
  return MEMBER_APPS.find((a) => a.key === key)!
}

/** Routes that belong to the members' side of the site. */
export const MEMBER_ROUTES = ['/members', ...MEMBER_APPS.map((a) => a.route)]

/**
 * The code of conduct and the privacy notice.
 *
 * Written plainly and specifically, because generic boilerplate would be
 * worse than nothing here: this is a hobby group of a few hundred people
 * playing a game, and the only personal data in the building is a Discord
 * handle attached to an application and an email address attached to a
 * Resonance account. Saying exactly that is more use to an applicant than a
 * page of clauses about "affiliates and processors".
 *
 * Everything here is checkable against the code:
 *   the application form  -> components/Join.tsx, lib/discord.ts
 *   accounts              -> lib/auth.ts, components/ResonanceAuth.tsx
 *   the visitor counter   -> lib/presence.ts
 *   browser storage       -> lib/advisories.ts, and Supabase's own session
 *
 * If any of those change, this changes with them. A privacy notice that has
 * drifted from what the software does is the one kind that actively harms.
 */

export type PolicySection = {
  heading: string
  body: string[]
  /** Rendered as a list under the body, when the point is a set of things. */
  list?: string[]
}

export type Policy = {
  eyebrow: string
  title: string
  lede: string
  /** Shown at the top so a reader knows how current this is. */
  updated: string
  sections: PolicySection[]
}

const UPDATED = '8 September 2026'

export const CONDUCT: Policy = {
  eyebrow: 'Code of conduct',
  title: 'How we fly together',
  lede: 'Echo United Alliances is a group of people playing a game. This is what we expect of each other, and what happens when someone falls short of it.',
  updated: UPDATED,
  sections: [
    {
      heading: 'What this site is',
      body: [
        'Echo United Alliances is a virtual airline group in The Airline Simulator. This website is made by members of the group, for members of the group and anyone curious about it.',
        'It is not affiliated with, endorsed by or connected to The Airline Simulator, any real airline, or any company whose name a member has borrowed for their fictional carrier. Every schedule, fare and booking on this site describes flights inside a game.',
        'Nothing here can be bought with real money, and no booking made here entitles anyone to real travel of any kind.',
      ],
    },
    {
      heading: 'Joining',
      body: [
        'You must be at least 13 years old to join, which is the minimum age for a Discord account and applications are made through Discord.',
        'Applications are read by a person, every time. There is no automated screening, no ranking, and no scoring — a division leader reads what you wrote and answers you.',
        'Apply honestly. Claiming an airline that is not yours, or applying under someone else\'s name, is the fastest way to be turned down.',
      ],
    },
    {
      heading: 'What we expect',
      body: [
        'The short version: assume good faith, and be someone others want in the channel.',
      ],
      list: [
        'Treat other members with respect. Harassment, hate speech, slurs and personal attacks have no place here, in any channel or any language.',
        'Honour your trades. If you open a discount-market order or take one on, see it through, or say plainly that you cannot.',
        'Do not exploit bugs in the game for advantage, and do not encourage others to.',
        'Do not impersonate another member, a division leader or the board.',
        'Keep alliance business inside the alliance. Do not repost private channels elsewhere.',
        'Follow Discord\'s own terms and community guidelines while you are in our server.',
      ],
    },
    {
      heading: 'Using this website',
      body: [
        'Read it, book fictional flights on it, link to it. What we ask you not to do is submit applications you do not mean, hammer the database with automated requests, or try to reach data that is not yours.',
        'The booking data belongs to the members whose airlines it describes. It is published so travellers can plan a trip, not so it can be lifted wholesale.',
      ],
    },
    {
      heading: 'When something goes wrong',
      body: [
        'Report it to your division leader, or to any member of the board, through a Discord ticket or a direct message. Reports are handled by people, not a form.',
        'The usual path is a warning first. Your division leader will tell you what the problem is and give you the chance to put it right. If it continues, or if it was serious enough on its own, the division leader can remove you from the division.',
        'Serious cases — harassment, repeated bad-faith trading, anything affecting several divisions — go to the board, whose decision is final.',
        'If you think a decision about you was wrong, say so to a board member. You will get an answer.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'This page changes when the way we run the alliance changes. The date at the top is when it last did.',
      ],
    },
  ],
}

export const PRIVACY: Policy = {
  eyebrow: 'Privacy',
  title: 'What we hold, and why',
  lede: 'We are a hobby group, not a company, and we collect as little as we can get away with. This page says exactly what that is — all of it checkable against the code that runs this site.',
  updated: UPDATED,
  sections: [
    {
      heading: 'When you apply to join',
      body: [
        'The application form on this site asks for your airline name, its tag, the division you want, and any notes you care to add. When you submit it, that text is posted straight into a private channel in our Discord server. There is no database in between and no server of ours that sees it first.',
        'If you apply through Discord instead, we see whatever Discord shows us: your handle, your display name and your avatar. We do not ask for your real name, your address, your age or your location, and you should not send them.',
        'Applications stay in that Discord channel indefinitely, so leaders can look back at who joined when. If you want yours removed, ask — see below.',
      ],
    },
    {
      heading: 'When you make a Resonance account',
      body: [
        'A Resonance account is optional. Everything on this site except saving your own trips works without one.',
        'If you create one, we hold your email address and the bookings you make. Your password is never seen by this site: it goes to Supabase, our database host, which stores it hashed and handles signing you in.',
        'We do not send marketing email. The only mail an account can generate is a password reset you asked for.',
      ],
    },
    {
      heading: 'What the site does on its own',
      body: [
        'Two small things, and neither identifies you:',
      ],
      list: [
        'A live count of how many browser tabs currently have the site open. Each tab joins with a random identifier generated fresh every time and discarded when you leave. It counts tabs, not people, and it is not stored.',
        'A count of members currently online in our Discord server, read from Discord\'s own public widget.',
      ],
    },
    {
      heading: 'What your browser stores',
      body: [
        'No advertising or analytics trackers, and no third-party cookies. Two things are kept in your browser\'s own storage, on your device:',
      ],
      list: [
        'Which travel advisories you have dismissed, so a notice you have already read does not reappear on every visit.',
        'Your sign-in session, if you have a Resonance account, so you are not asked to sign in on every page.',
      ],
    },
    {
      heading: 'Who else can see it',
      body: [
        'Three services are involved in running this site, and each has its own privacy policy:',
      ],
      list: [
        'Discord, which receives applications and hosts our server.',
        'Supabase, which hosts the database and handles account sign-in.',
        'GitHub Pages, which serves these pages and records ordinary web request logs.',
      ],
    },
    {
      heading: 'What we never do',
      body: [
        'We do not sell your data, share it with advertisers, or pass it to anyone outside the alliance. There is nothing here worth selling and no one is trying to.',
      ],
    },
    {
      heading: 'Children',
      body: [
        'This site and the alliance are not intended for anyone under 13, matching Discord\'s own minimum age. If you are under 13, please do not apply or create an account.',
        'If you believe a child under 13 has given us information, tell a board member and we will remove it.',
      ],
    },
    {
      heading: 'Getting your data removed',
      body: [
        'Open a ticket in our Discord server, or send a direct message to any board member or division leader, and say what you want removed. We will delete your application message, your Resonance account, or both.',
        'You do not have to be a member to ask, and you do not have to give a reason.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'If what we collect changes, this page changes in the same commit. The date at the top is when it last did.',
      ],
    },
  ],
}

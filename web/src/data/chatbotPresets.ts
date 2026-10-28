/**
 * The Echo Assistant's whole brain: fixed questions, fixed answers. There is
 * no model behind this and no call to anything -- picking a question just
 * looks up its answer here. That makes it honest about what it is, and it
 * means it can never say something about the alliance that was not written
 * by someone who checked it first.
 *
 * Grouped under a handful of categories so the widget can offer them as
 * chips rather than one long list.
 */

export type ChatPreset = {
  id: string
  category: string
  question: string
  answer: string
}

export const CHATBOT_CATEGORIES = [
  'Joining',
  'Divisions',
  'Activities',
  'Airline of the Week',
  'Travel tools',
  'Your account',
  'News',
  'About & policies',
] as const

export const CHATBOT_PRESETS: ChatPreset[] = [
  // Joining -----------------------------------------------------------
  {
    id: 'join-how',
    category: 'Joining',
    question: 'How do I join Echo United Alliances?',
    answer:
      'Two applications, not one: send a request from your airline in The Airline Simulator\'s alliance browser, and post an application with EUA on Discord (or use the form on the Join page). A division lead matches the two up -- an in-game request alone will not be actioned, and neither will a Discord application without the in-game one.',
  },
  {
    id: 'join-which-division',
    category: 'Joining',
    question: 'Which division should I apply to?',
    answer:
      'Whichever fits how you like to play. The Divisions page lists all of them with their badges -- Kyra is the main alliance, Elysium runs on realism rules, and the rest each have their own character. Pick one and apply there; you are not applying to Echo as a whole first.',
  },
  {
    id: 'join-how-long',
    category: 'Joining',
    question: 'How long does an application take?',
    answer:
      'There is no fixed turnaround. Divisions are run separately and each reviews applications by hand, at its own pace, so allow a little time rather than expecting an instant answer.',
  },
  {
    id: 'join-discord-required',
    category: 'Joining',
    question: 'Do I have to use Discord?',
    answer:
      'Yes. Discord is where applications are matched to divisions, where activities like the FFA sales and the discount market actually run, and where division leads are reachable. The website is the front door; Discord is where membership happens.',
  },
  {
    id: 'join-multiple-airlines',
    category: 'Joining',
    question: 'Can I have more than one airline in the alliance?',
    answer:
      'Several members do -- more than one of the division leaders themselves run multiple carriers. Each airline still needs its own in-game application to the division you want it in.',
  },
  {
    id: 'join-beginner',
    category: 'Joining',
    question: 'Is Echo good for beginners?',
    answer:
      'That is who it was built around: most members joined early in their time with The Airline Simulator, and the alliance exists to make that growth faster and the market safer, not just to showcase airlines that have already arrived.',
  },
  {
    id: 'join-switch-division',
    category: 'Joining',
    question: 'Can I move my airline to a different division later?',
    answer:
      'Talk to the leads of your current and target divisions on Discord first -- this is not something the website handles, and it is a courtesy to the division you would be leaving as much as a request to the one you would be joining.',
  },
  {
    id: 'join-rejected',
    category: 'Joining',
    question: 'What if my application is turned down?',
    answer:
      'Ask the division lead what to fix and try again, or try a different division -- each reviews on its own criteria, so a no from one is not a verdict on the airline itself.',
  },

  // Divisions -----------------------------------------------------------
  {
    id: 'div-what-is',
    category: 'Divisions',
    question: 'What is a division?',
    answer:
      'Echo United Alliances is a multi-alliance group: each division runs its own roster and its own leadership, and every member flies under one shared network regardless of which division they are in.',
  },
  {
    id: 'div-leaders',
    category: 'Divisions',
    question: 'Who leads each division?',
    answer:
      'The board is simply the division leaders, one or more per division. They are listed on the About page by their Discord handle, since that is how the group actually knows them -- several lead more than one division at once.',
  },
  {
    id: 'div-main-vs-realism',
    category: 'Divisions',
    question: 'What is the difference between Kyra and Elysium?',
    answer:
      'Kyra is the main alliance; Elysium is the realism alliance, for members who want their operation held to realism rules. Both sit under the same group and the same shared network, just with different house rules.',
  },
  {
    id: 'div-how-many',
    category: 'Divisions',
    question: 'How many divisions does Echo have?',
    answer:
      'Nine at the moment, each with its own roster and leadership. The exact count and every carrier in them is on the Divisions and Airlines pages, read live from the roster rather than fixed here.',
  },
  {
    id: 'div-contact-lead',
    category: 'Divisions',
    question: 'How do I contact my division lead?',
    answer:
      'By their Discord handle, listed on the About page. Where a lead has shared an email instead, it shows next to their name there too; until they do, it reads as contact details updated soon rather than guessing one.',
  },
  {
    id: 'div-own-rules',
    category: 'Divisions',
    question: 'Do divisions have their own rules?',
    answer:
      'Yes -- beyond the alliance-wide code of conduct, each division sets its own expectations for its roster. Ask your division lead what applies to yours.',
  },

  // Activities ----------------------------------------------------------
  {
    id: 'act-ffa',
    category: 'Activities',
    question: 'What is an FFA sale?',
    answer:
      'Free for all: a member with an aircraft to sell posts it in the FFA channel on Discord, and anyone in the group can buy it -- no queue, no seniority, no allocation. Buyers are expected to say why they want it; FFA works because people take what they can actually use.',
  },
  {
    id: 'act-discount-market',
    category: 'Activities',
    question: 'How does the discount aircraft market work?',
    answer:
      'The other way round from a shop: you open a buy ticket naming the aircraft you want and the price you will pay, anywhere from 50% to 90% of the original price, and a veteran member who can fulfil it picks it up. It runs continuously, not on a schedule.',
  },
  {
    id: 'act-where',
    category: 'Activities',
    question: 'Where do alliance activities actually happen?',
    answer:
      'On Discord -- the sales channel, the buy tickets, the challenges and their results are all there. You need to be a member of a division to take part, so joining comes first.',
  },
  {
    id: 'act-challenges',
    category: 'Activities',
    question: 'Are there challenges with prizes?',
    answer:
      'Occasionally, yes. They are not run to a fixed calendar -- watch Discord for when one is announced.',
  },
  {
    id: 'act-eligible',
    category: 'Activities',
    question: 'Who can take part in FFA and the market?',
    answer:
      'Any member of any division. Neither is limited to one division\'s roster -- the whole group can buy and sell across both.',
  },
  {
    id: 'act-sell-price',
    category: 'Activities',
    question: 'What price can I ask in the discount market?',
    answer:
      'Buyers post what they are willing to pay, between 50% and 90% of the aircraft\'s original price. A veteran member decides whether to fill the ticket at that price.',
  },
  {
    id: 'act-no-queue',
    category: 'Activities',
    question: 'Is there a queue for FFA sales?',
    answer:
      'No. An FFA sale is open to the whole alliance the instant it is posted -- whoever buys first with a genuine reason gets it, not whoever asked first in some other sense.',
  },
  {
    id: 'act-frequency',
    category: 'Activities',
    question: 'How often do FFA sales happen?',
    answer:
      'Whenever a member has something to sell -- there is no schedule. Keep an eye on the FFA channel rather than expecting them at set times.',
  },

  // Airline of the Week --------------------------------------------------
  {
    id: 'aotw-what',
    category: 'Airline of the Week',
    question: 'What is Airline of the Week?',
    answer:
      'A regular feature on the home page that puts one member carrier in front of the whole group -- its livery, its name, and figures like fleet size, routes and destinations, read live from the roster.',
  },
  {
    id: 'aotw-how-chosen',
    category: 'Airline of the Week',
    question: 'How is the airline chosen?',
    answer:
      'By the board, each week. It is alliance policy rather than something generated automatically, which is also why the pick and its write-up live in the site\'s own code rather than the database.',
  },
  {
    id: 'aotw-locked',
    category: 'Airline of the Week',
    question: 'Why does the home page show a countdown instead of this week\'s airline?',
    answer:
      'Reveals go out at an announced time, not the moment they are set up -- so the segment shows a countdown until that moment and switches itself over automatically, live, with no reload needed.',
  },
  {
    id: 'aotw-can-my-airline',
    category: 'Airline of the Week',
    question: 'Can my airline be Airline of the Week?',
    answer:
      'It is a board pick, not an application, so there is no form for it -- but being active in the alliance and visible on Discord is how a carrier ends up on the board\'s radar in the first place.',
  },

  // Travel tools ----------------------------------------------------------
  {
    id: 'tools-search',
    category: 'Travel tools',
    question: 'Can I search and book flights on this site?',
    answer:
      'Yes -- search the network from the home page, pick an itinerary, and book it. It is a simulated booking against the alliance\'s own network, not a real airline ticket.',
  },
  {
    id: 'tools-manage',
    category: 'Travel tools',
    question: 'How do I find a booking I already made?',
    answer:
      'Use Manage Booking on the Trips page: enter the six-character reference from your confirmation along with the surname of anyone travelling on it.',
  },
  {
    id: 'tools-rtw',
    category: 'Travel tools',
    question: 'What is the Round the World feature?',
    answer:
      'One fare, one direction: you build a route of stops around the alliance\'s network and it prices as a single round-the-world itinerary rather than separate one-way fares.',
  },
  {
    id: 'tools-network-map',
    category: 'Travel tools',
    question: 'Is there a route map for the whole alliance?',
    answer:
      'Yes, on the Network page -- it draws every route across every division\'s carriers on one map, rather than one airline at a time.',
  },
  {
    id: 'tools-directory',
    category: 'Travel tools',
    question: 'Where can I find a specific member airline?',
    answer:
      'The Airlines directory lists every carrier in the alliance and can be filtered by division or country -- search it by name if you know roughly who you are looking for.',
  },
  {
    id: 'tools-sign-in-needed',
    category: 'Travel tools',
    question: 'Do I need an account to search or book?',
    answer:
      'No -- searching and booking work for anyone. An account (Resonance) only comes in if you want to manage bookings under your profile or use the members-only tools.',
  },
  {
    id: 'tools-real-tickets',
    category: 'Travel tools',
    question: 'Are these real flight tickets?',
    answer:
      'No. Booking on this site is a simulation layered on the alliance\'s own network, built for The Airline Simulator community -- not a real-world travel agency.',
  },
  {
    id: 'tools-change-booking',
    category: 'Travel tools',
    question: 'Can I change or cancel a booking?',
    answer:
      'Look it up first on the Trips page with your reference and surname -- what you can do with it from there depends on the booking itself, so start there rather than guessing.',
  },

  // Your account ------------------------------------------------------------
  {
    id: 'acct-resonance',
    category: 'Your account',
    question: 'What is Resonance?',
    answer:
      'The sign-in system for this site, using the Discord account you already use on the EUA server. Signed out, the link in the bar reads Resonance; signed in, it shows your name.',
  },
  {
    id: 'acct-echo-live',
    category: 'Your account',
    question: 'What is Echo Live?',
    answer:
      'One of the members\' tools on the Members page, open to everyone rather than gated to a sign-in.',
  },
  {
    id: 'acct-echo-market',
    category: 'Your account',
    question: 'What is Echo Market and who can use it?',
    answer:
      'A members\' tool for EUA airlines, signed in with the Discord account you use on the alliance\'s server -- unlike Echo Live, it is not open to everyone.',
  },
  {
    id: 'acct-not-member-yet',
    category: 'Your account',
    question: 'I am not in EUA yet -- can I still sign in?',
    answer:
      'The Members page links straight to how to join if you are not in yet -- sign-in with Resonance uses your Discord account, so joining the alliance on Discord is the step that actually unlocks the members-only tools.',
  },
  {
    id: 'acct-admin-apply',
    category: 'Your account',
    question: 'How do I apply to help admin the alliance?',
    answer:
      'There is an apply option for admin roles once you are signed in -- ask on Discord if you cannot find it, since exactly where it appears can change as the site does.',
  },
  {
    id: 'acct-forgot-booking',
    category: 'Your account',
    question: 'I forgot my booking reference -- what now?',
    answer:
      'If you booked while signed in to Resonance, your trips are attached to your account rather than only to the reference -- sign in and check My Trips first before trying to recall the six characters.',
  },

  // News --------------------------------------------------------------------
  {
    id: 'news-source',
    category: 'News',
    question: 'Where does the news on this site come from?',
    answer:
      'The Newsroom is read live from a community newsroom run by one of our members, not stored on this site -- stories appear here as soon as they are published there, and if that source is briefly unreachable the page shows nothing rather than something stale.',
  },
  {
    id: 'news-language',
    category: 'News',
    question: 'Why are some news stories only in English?',
    answer:
      'Stories are shown as their authors published them. If you are browsing in another language, that is a translation of the site around the story, not of the story itself.',
  },
  {
    id: 'news-submit',
    category: 'News',
    question: 'Can I submit a story to the newsroom?',
    answer:
      'That is run by the newsroom\'s own team, separately from this site -- ask on Discord who runs it if you want to pitch something.',
  },

  // About & policies ----------------------------------------------------------
  {
    id: 'about-founded',
    category: 'About & policies',
    question: 'When was Echo founded?',
    answer:
      'On 24 March 2026, as Axian Alliance, with three founding members. It has grown a great deal since, entirely on the back of its members.',
  },
  {
    id: 'about-slogan',
    category: 'About & policies',
    question: 'What does "Home of the Excellence" mean?',
    answer:
      'It is the alliance\'s slogan -- the standard it holds its members and its own running of the group to, across every division.',
  },
  {
    id: 'about-game',
    category: 'About & policies',
    question: 'What game is Echo United Alliances for?',
    answer:
      'The Airline Simulator. Echo is a virtual airline alliance group built around it, not an airline or a real-world company.',
  },
  {
    id: 'about-discord-invite',
    category: 'About & policies',
    question: 'Where do I find the Discord invite?',
    answer:
      'The Join Discord button in the site header and footer links straight to it, and it is set never to expire -- if it ever fails, that is worth reporting rather than assuming the alliance closed up.',
  },
  {
    id: 'about-terms',
    category: 'About & policies',
    question: 'Where are the Terms of Service?',
    answer:
      'Linked in the footer of every page, along with the Code of Conduct and the Privacy Policy.',
  },
  {
    id: 'about-privacy',
    category: 'About & policies',
    question: 'What does the Privacy Policy cover, and can I check it?',
    answer:
      'What this site collects and why, including that this is a GitHub Pages site with a public source -- the Privacy page says that every claim on it can be checked, and links to where.',
  },
  {
    id: 'about-source',
    category: 'About & policies',
    question: 'Is the source code for this site public?',
    answer:
      'Yes -- the whole site is open on GitHub, linked from the Privacy page. That is also how its figures, like the number of carriers and airports, stay honest: they are read live rather than typed in once and left to go stale.',
  },
]

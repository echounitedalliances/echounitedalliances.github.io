/**
 * Who runs Echo, and what the group does together.
 *
 * This is in the repository rather than the database on purpose. The
 * `divisions` and `airlines` tables are rebuilt wholesale from the game
 * exports every time the scraper runs, so anything written into them by hand
 * is wiped on the next build. Leadership and activities are alliance policy,
 * not game data, and they change when the group decides they have — so they
 * live here, next to the other site copy, and are edited by editing this file.
 *
 * Leaders are recorded by DISCORD identity, not by airline. Several of them
 * own more than one carrier, so an airline is not a stable way to name a
 * person; the Discord handle is how the group actually knows them. The
 * database does carry a leader_uid, but only Proxima's roster export ever
 * filled it in, and it points at a carrier rather than a person.
 *
 * division_code keys into the divisions table, so names, ordering and accent
 * colours stay in step with the rest of the site without being repeated here.
 */

export type Leader = {
  division_code: string
  /** As they are known on Discord. */
  name: string
  /** Discord handle, verbatim — some legitimately begin with a dot. */
  discord: string
}

/**
 * The board is currently exactly the eight division leaders. If that stops
 * being true, this is where it stops being true.
 */
export const LEADERS: Leader[] = [
  { division_code: 'kyra', name: 'Naofum', discord: 'w4leste' },
  { division_code: 'aegis', name: 'DCC', discord: 'creativator_2001' },
  { division_code: 'elysium', name: 'Top G', discord: 'jet_gooning' },
  { division_code: 'proxima', name: 'Rust', discord: '.rustyy' },
  { division_code: 'rhea', name: 'Reiner', discord: '_erwinsmith' },
  { division_code: 'vilis', name: 'Yukai', discord: 'ykw_1009' },
  { division_code: 'elion', name: 'Tekkerz', discord: 'jaffacakes12' },
  { division_code: 'aura', name: 'Ahnaf', discord: '_ahnafabrar_' },
]

export const SLOGAN = 'Home of the Excellences'

export type Activity = {
  id: string
  name: string
  /** One line under the heading. */
  lede: string
  body: string[]
  /** Short facts down the side: how it runs, who can take part. */
  facts: { label: string; value: string }[]
}

export const ACTIVITIES: Activity[] = [
  {
    id: 'ffa',
    name: 'FFA sales',
    lede: 'Free for all. Anyone sells, anyone buys.',
    body: [
      'A member with an aircraft to sell posts it in the FFA channel on Discord, and any other member can come and buy it. There is no queue, no seniority and no allocation — the sale is open to the whole group the moment it is announced.',
      'Buyers are expected to ask with a reason. FFA is not a race to claim whatever appears; it works because people take the aircraft they can actually use, and say why.',
    ],
    facts: [
      { label: 'Runs', value: 'Whenever someone has something to sell' },
      { label: 'Open to', value: 'Every member of every division' },
      { label: 'Where', value: 'The FFA channel on Discord' },
    ],
  },
  {
    id: 'discount-market',
    name: 'Discount aircraft market',
    lede: 'Post what you want and what you will pay. A veteran fills it.',
    body: [
      'The market runs the other way round from a shop. Instead of browsing what is for sale, a member opens a buy ticket naming the aircraft models they want and the price they are willing to pay — anywhere from 50% to 80% of the original price.',
      'Veteran members who can fulfil an order pick it up and handle it. Nothing is scheduled: tickets are opened and filled while people happen to be online, which in a group spanning every timezone means most of the day.',
    ],
    facts: [
      { label: 'Price range', value: '50% – 80% of original' },
      { label: 'You post', value: 'Models wanted, and your price' },
      { label: 'Filled by', value: 'Veteran members, as they come online' },
      { label: 'Schedule', value: 'None — it runs continuously' },
    ],
  },
  {
    id: 'events',
    name: 'Events and challenges',
    lede: 'Airline of the Week, and prizes worth flying for.',
    body: [
      'Airline of the Week picks out one member carrier and puts it in front of the whole group.',
      'Alongside it there are occasional challenges with prizes attached. They are announced on Discord rather than run to a fixed calendar.',
    ],
    facts: [
      { label: 'Regular', value: 'Airline of the Week' },
      { label: 'Occasional', value: 'Prized challenges' },
      { label: 'Announced', value: 'On Discord' },
    ],
  },
]

/**
 * Where the alliance came from, and what it offers someone thinking of
 * joining. Written by the board; kept here as content rather than markup so
 * it can be edited without touching the page.
 *
 * The founding facts are pulled out separately because they are facts, and a
 * date buried in a paragraph is a date nobody can find.
 */
export const STORY = {
  founded: '24 March 2026',
  foundedAs: 'Axian Alliance',
  foundingMembers: 3,
  paragraphs: [
    'Echo United Alliances started as Axian Alliance, with three founding members, on 24 March 2026. The growth of Echo since has been immense, and it is all thanks to the support of every single one of its members.',
    'If you are a beginner, and you need guidance and tips, Echo is the perfect alliance for you. Eighty per cent of our members joined us when they had just started playing The Airline Simulator, and by joining the alliance their growth quadrupled. We also monitor our market strictly, so that aircraft orders do not get stolen and you can actually get them. We are a hot spot for many well established airlines as well.',
    'Echo can be home to anyone — it does not matter who. Invite your friends, so they can make this community their home too.',
  ],
  closing: 'We are a family. We trust and we respect everyone equally.',
}

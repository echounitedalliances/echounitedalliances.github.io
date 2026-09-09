/**
 * The top bar, in one place.
 *
 * It lived inline in App.tsx, which was fine while every entry was a flat
 * link. Now that one of them carries a submenu, two components render this
 * list — the bar and the phone drawer — and they should not each hold their
 * own idea of what is in it.
 */
export type NavItem = {
  to: string
  label: string
  /** Pages that belong under this one. The parent stays a link in its own right. */
  children?: { to: string; label: string }[]
}

export const NAV: NavItem[] = [
  {
    to: '/about',
    label: 'About',
    // Seven items across was crowding the counters and the account chip off
    // the end of the bar. Activities is about the alliance rather than about
    // the network, so it belongs here rather than beside Airlines.
    children: [{ to: '/activities', label: 'Our activities' }],
  },
  { to: '/divisions', label: 'Divisions' },
  { to: '/airlines', label: 'Airlines' },
  { to: '/network', label: 'Network' },
  { to: '/news', label: 'News' },
  { to: '/trips', label: 'My trips' },
]

/** Small formatters, in one place so the whole site reads the same way. */

export const num = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-GB')

export const usd = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('en-GB')

/** 435 -> "7h 15m". Durations here are always minutes. */
export const duration = (mins: number | null | undefined) => {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

/** ISO date for an <input type="date">, n days from today. */
export const dateInDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Two letters for a carrier's generated mark. Prefers the in-game code, which
 * is what players recognise, and falls back to the unique carrier code.
 */
export const initials = (airlineCode: string | null, carrierCode: string) =>
  (airlineCode || carrierCode).slice(0, 2).toUpperCase()

/** ISO 3166-1 alpha-2 to a flag emoji, for the country chips. */
export const flag = (cc: string | null | undefined) => {
  if (!cc || cc.length !== 2) return ''
  const base = 0x1f1e6
  return String.fromCodePoint(
    base + cc.toUpperCase().charCodeAt(0) - 65,
    base + cc.toUpperCase().charCodeAt(1) - 65,
  )
}

export const DIVISION_ORDER = [
  'proxima', 'aegis', 'aura', 'elion', 'elysium', 'kyra', 'rhea', 'vilis',
] as const

export const accentOf = (a: { accent_color?: string | null }) =>
  a.accent_color || '#A855F7'

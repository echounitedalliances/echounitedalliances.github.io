/** Small formatters, in one place so the whole site reads the same way. */
import { currentLang } from './i18n'

export const num = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('en-GB')

export const usd = (n: number | null | undefined) =>
  n == null ? '–' : '$' + Math.round(n).toLocaleString('en-GB')

/** 435 -> "7h 15m". Durations here are always minutes. */
export const duration = (mins: number | null | undefined) => {
  if (mins == null) return '–'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

/** The locale dates are written in, for the language being read. */
export const dateLocale = () =>
  ({ en: 'en-GB', id: 'id-ID', zh: 'zh-CN', ko: 'ko-KR', bn: 'bn-BD', hi: 'hi-IN' })[currentLang()]

/** A country's name, from its two-letter code, in the language being read. */
export const countryName = (cc: string): string => {
  try {
    return new Intl.DisplayNames([dateLocale()], { type: 'region' }).of(cc.toUpperCase()) ?? cc
  } catch {
    return cc
  }
}

/** Monday-first one-letter day names, in the language being read. */
export const weekdayInitials = (): string[] => {
  const f = new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow', timeZone: 'UTC' })
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))))
}

export const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(dateLocale(), {
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

export const accentOf = (a: { accent_color?: string | null }) =>
  a.accent_color || '#A855F7'

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve']

/**
 * A small count in words, for copy that says "nine divisions". Past twelve,
 * the figure -- and in every language but English, always the figure.
 */
export const spell = (n: number) => (currentLang() === 'en' ? WORDS[n] : undefined) ?? num(n)

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

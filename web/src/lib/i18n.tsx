import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * The site in the players' own languages.
 *
 * English is the source. Every string on a page is written in English and
 * passed through t(), and the English text itself is the key a translation
 * is looked up by -- the way gettext works -- so the code reads exactly as it
 * did, and a string with no translation yet simply shows in English rather
 * than as a key nobody can read.
 *
 * What stays in English on purpose: alliance, division and airline names,
 * codes and Discord handles (they are names, not words), what members and
 * the game wrote themselves (airline profiles, member-site notes, the news
 * feed), the legal pages -- where the English is the version that counts --
 * and the admin screens, which only the board sees.
 *
 * Each language's dictionary is its own chunk, fetched only when picked, so
 * a visitor reading English downloads none of them.
 */

export type Lang = 'en' | 'id' | 'vi' | 'fil' | 'zh' | 'ko' | 'bn' | 'hi'

export const LANGS: { code: Lang; short: string; name: string; font?: string }[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia' },
  // Bodoni Moda has no Vietnamese letters, so the italic headline word would
  // lose its accents to a fallback face; Playfair Display is the nearest
  // Didone italic that carries them.
  { code: 'vi', short: 'VI', name: 'Tiếng Việt', font: 'Playfair+Display:ital,wght@1,500' },
  { code: 'fil', short: 'FIL', name: 'Filipino' },
  { code: 'zh', short: '中文', name: '中文', font: 'Noto+Sans+SC:wght@400;500;700' },
  { code: 'ko', short: '한국어', name: '한국어', font: 'Noto+Sans+KR:wght@400;500;700' },
  { code: 'bn', short: 'বাংলা', name: 'বাংলা', font: 'Noto+Sans+Bengali:wght@400;500;700' },
  { code: 'hi', short: 'हिन्दी', name: 'हिन्दी', font: 'Noto+Sans+Devanagari:wght@400;500;700' },
]

type Dict = Record<string, string>

const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>> = {
  id: () => import('./i18n/id'),
  vi: () => import('./i18n/vi'),
  fil: () => import('./i18n/fil'),
  zh: () => import('./i18n/zh'),
  ko: () => import('./i18n/ko'),
  bn: () => import('./i18n/bn'),
  hi: () => import('./i18n/hi'),
}

const KEY = 'eua-lang'

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return isLang(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

/**
 * The language in force, readable outside React -- by the formatters in
 * format.ts, which have no hook to call. It changes before the re-render
 * that follows, so anything rendered after a switch reads the new one.
 */
let current: Lang = 'en'
let currentDict: Dict = {}
export const currentLang = () => current

/** Fills {name} placeholders. */
function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/** Translate outside a component. Inside one, use useT() so a switch re-renders it. */
export function translate(en: string, vars?: Record<string, string | number>) {
  return fill((current !== 'en' && currentDict[en]) || en, vars)
}

/** Loads a language's Noto face on first use: the display and text fonts carry Latin only. */
function loadFont(lang: Lang) {
  const font = LANGS.find((l) => l.code === lang)?.font
  if (!font || document.getElementById(`font-${lang}`)) return
  const link = document.createElement('link')
  link.id = `font-${lang}`
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${font}&display=swap`
  document.head.appendChild(link)
}

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: typeof translate
}

const I18n = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: translate })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ lang: Lang; dict: Dict }>({ lang: 'en', dict: {} })

  const apply = useCallback(async (lang: Lang) => {
    let dict: Dict = {}
    if (lang !== 'en') {
      loadFont(lang)
      try {
        dict = (await LOADERS[lang]()).default
      } catch {
        lang = 'en'
      }
    }
    current = lang
    currentDict = dict
    document.documentElement.lang = lang
    setState({ lang, dict })
  }, [])

  useEffect(() => {
    const saved = storedLang()
    if (saved !== 'en') void apply(saved)
  }, [apply])

  const setLang = useCallback(
    (l: Lang) => {
      try {
        localStorage.setItem(KEY, l)
      } catch {
        /* not remembered, still switched */
      }
      void apply(l)
    },
    [apply],
  )

  const value = useMemo<Ctx>(
    () => ({
      lang: state.lang,
      setLang,
      // A new function per language, so memoised children see the change.
      t: (en, vars) => fill((state.lang !== 'en' && state.dict[en]) || en, vars),
    }),
    [state, setLang],
  )
  return <I18n.Provider value={value}>{children}</I18n.Provider>
}

export const useI18n = () => useContext(I18n)
export const useT = () => useContext(I18n).t

/**
 * A translated sentence with something live inside it -- a link, a bold
 * figure. The sentence is translated whole, with {placeholders} where the
 * parts go, so each language can put them where its grammar wants them.
 *
 *   rich(t('You need to join a division to take part, so {link}.'), {
 *     link: <Link to="/divisions">{t('pick one')}</Link>,
 *   })
 */
export function rich(s: string, parts: Record<string, ReactNode>): ReactNode[] {
  return s.split(/(\{\w+\})/g).map((piece, i) => {
    const m = /^\{(\w+)\}$/.exec(piece)
    return m && m[1] in parts ? <Fragment key={i}>{parts[m[1]]}</Fragment> : piece
  })
}

/**
 * A headline with its one italic word marked *like this* in the string, so
 * each language decides which of its words carries the emphasis.
 */
export function emph(s: string, className = 'serif'): ReactNode[] {
  return s.split(/(\*[^*]+\*)/g).map((piece, i) =>
    piece.startsWith('*') && piece.endsWith('*') && piece.length > 2 ? (
      <span key={i} className={className}>
        {piece.slice(1, -1)}
      </span>
    ) : (
      piece
    ),
  )
}

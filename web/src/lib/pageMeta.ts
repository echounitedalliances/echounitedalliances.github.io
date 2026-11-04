import { useEffect } from 'react'
import meta from '../data/pageMeta.json'
import { translate, useI18n } from './i18n'

/**
 * The browser tab's title, kept in step with the page.
 *
 * The first title a visitor (or a search engine) sees is the one written into
 * that page's own index.html at publish time (scripts/prerender.mjs). These
 * keep it right as they move around without reloading. Both read the same
 * data/pageMeta.json, so the two cannot drift.
 */
const SITE = meta.site
const PAGES = meta.pages as Record<string, { title: string; description: string }>

export function pageTitle(title?: string | null) {
  if (!title) return SITE
  return title.includes(SITE) ? title : `${title} · ${SITE}`
}

/** For a fixed page in data/pageMeta.json; does nothing on any other path. */
export function useFixedPageTitle(pathname: string) {
  const { t } = useI18n()
  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    const page = PAGES[path]
    if (page) document.title = pageTitle(t(page.title))
  }, [pathname, t])
}

/** For a page built from data: set once its name has loaded. */
export function usePageTitle(title: string | null | undefined) {
  const { lang } = useI18n()
  useEffect(() => {
    if (title) document.title = pageTitle(title)
  }, [title, lang])
}

// The same wording scripts/prerender.mjs writes, in the language in force;
// change both together.
export const divisionTitle = (name: string) => translate('{name} division', { name })
export const airlineTitle = (name: string, code: string, division: string) => `${name} (${code}) · ${division}`
export const airportTitle = (iata: string, city: string | null) =>
  city ? translate('{city} ({iata}) flights', { city, iata }) : translate('{iata} flights', { iata })

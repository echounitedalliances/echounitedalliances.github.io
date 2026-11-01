import { useEffect } from 'react'
import meta from '../data/pageMeta.json'

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
  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    const page = PAGES[path]
    if (page) document.title = pageTitle(page.title)
  }, [pathname])
}

/** For a page built from data: set once its name has loaded. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = pageTitle(title)
  }, [title])
}

// The same wording scripts/prerender.mjs writes; change both together.
export const divisionTitle = (name: string) => `${name} division`
export const airlineTitle = (name: string, code: string, division: string) => `${name} (${code}) · ${division}`
export const airportTitle = (iata: string, city: string | null) => `${city ? `${city} (${iata})` : iata} flights`

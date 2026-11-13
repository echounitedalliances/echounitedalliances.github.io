/**
 * Write an index.html for every page the site knows, at its real address.
 *
 * The app is one page that draws whatever the address asks for, and GitHub
 * Pages has no server to send /d/aegis back to it. So, for each page, this
 * copies the built index.html to <path>/index.html with that page's own
 * title, description and canonical address, plus a little plain text and
 * links in place of the empty <div id="root"> -- what a search engine or a
 * link preview reads before (or without) running the app. The app replaces
 * that text as soon as it starts.
 *
 * Division, airline and airport pages come from the live database through
 * the public API, with the same publishable key the site itself uses; the
 * fixed pages from src/data/pageMeta.json. Anything newer than the last
 * publish still works through 404.html, just without its own title.
 *
 * Every file written is listed in published-pages.txt at the repository
 * root, so the next run can remove exactly those -- some of them sit inside
 * source folders (divisions/index.html, next to the rosters) -- and so the
 * deploy workflow knows what to upload.
 *
 *     node web/scripts/prerender.mjs     (run by publish-to-root.mjs)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webDir, '..')
export const ORIGIN = 'https://echoalliances.com'
const LIST = join(repoRoot, 'published-pages.txt')

const meta = JSON.parse(readFileSync(join(webDir, 'src/data/pageMeta.json'), 'utf8'))
const SITE = meta.site

// The address a division is published under (lib/alliance.ts, DIVISION_URL).
// Read from there rather than repeated, so a rename is one edit.
const allianceTs = readFileSync(join(webDir, 'src/lib/alliance.ts'), 'utf8')
const DIVISION_URL = Object.fromEntries(
  [...(allianceTs.match(/const DIVISION_URL[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(
    (m) => [m[1], m[2]],
  ),
)
// The Discord invite, the alliance's other accounts and the game's links, from
// lib/site.ts, for the organisation details below.
const siteTs = readFileSync(join(webDir, 'src/lib/site.ts'), 'utf8')
const DISCORD = siteTs.match(/discordInvite:\s*'([^']+)'/)?.[1]
const SOCIAL_URLS = [...(siteTs.match(/export const SOCIALS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/url:\s*'([^']+)'/g)].map((m) => m[1])
const GAME_BLOCK = siteTs.match(/export const GAME = \{([\s\S]*?)\}/)?.[1] ?? ''
const gameLink = (key) => GAME_BLOCK.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1]
const ORGANISATION = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE,
    alternateName: ['Echo', 'EUA', 'Echo Alliances'],
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/brand/echo-icon-512.png`,
    description: 'An alliance of player-run airlines in The Airline Simulator.',
    foundingDate: '2026-03-24',
    sameAs: [...(DISCORD && !DISCORD.includes('REPLACE-ME') ? [DISCORD] : []), ...SOCIAL_URLS],
  },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: `${ORIGIN}/` },
  // The game the alliance plays, as the home page's "What is The Airline
  // Simulator?" section introduces it, with its store links.
  {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'The Airline Simulator',
    url: gameLink('website'),
    gamePlatform: ['iOS', 'Android'],
    applicationCategory: 'GameApplication',
    sameAs: [gameLink('ios'), gameLink('android')].filter(Boolean),
  },
]

const divisionPath = (code, slug) => `/d/${DIVISION_URL[code] ?? code}${slug ? `/${slug}` : ''}`

/**
 * The languages, each with its own addresses (/vi/d/aegis), as the app reads
 * them (src/lib/i18n.tsx). Every page but the airports' is written in each:
 * 2,200 airports in eight languages would be 15,000 more files rewritten at
 * every publish, for pages that are mostly codes and numbers.
 *
 * hreflang is the language tag search engines match to a reader; the
 * Chinese is simplified. locale is what numbers and country names use, the
 * same as src/lib/format.ts.
 */
const LANGS = [
  { code: 'en', hreflang: 'en', locale: 'en-GB', og: 'en_GB' },
  { code: 'id', hreflang: 'id', locale: 'id-ID', og: 'id_ID' },
  { code: 'vi', hreflang: 'vi', locale: 'vi-VN', og: 'vi_VN' },
  { code: 'fil', hreflang: 'fil', locale: 'fil-PH', og: 'fil_PH' },
  { code: 'zh', hreflang: 'zh-Hans', locale: 'zh-CN', og: 'zh_CN' },
  { code: 'ko', hreflang: 'ko', locale: 'ko-KR', og: 'ko_KR' },
  { code: 'bn', hreflang: 'bn', locale: 'bn-BD', og: 'bn_BD' },
  { code: 'hi', hreflang: 'hi', locale: 'hi-IN', og: 'hi_IN' },
]
const prefix = (lang) => (lang === 'en' ? '' : `/${lang}`)

// The app's own dictionaries (src/lib/i18n/<lang>.ts), English text as the
// key: one object literal of quoted strings, read as JSON once its comment
// lines are dropped.
const DICTS = Object.fromEntries(
  LANGS.filter((l) => l.code !== 'en').map((l) => {
    const src = readFileSync(join(webDir, `src/lib/i18n/${l.code}.ts`), 'utf8')
    const body = src
      .slice(src.indexOf('{', src.search(/=\s*\{/)), src.lastIndexOf('}') + 1)
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*)\}$/, '$1}')
    return [l.code, JSON.parse(body)]
  }),
)

/** A translator for one language: t('{n} airlines', { n }), English when a string has no translation. */
function translator(lang) {
  const dict = DICTS[lang] ?? {}
  return (en, vars = {}) => (dict[en] || en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

// The same wording as src/lib/pageMeta.ts; change both together.
const pageTitle = (t) => (t.includes(SITE) ? t : `${t} · ${SITE}`)
const divisionTitle = (t, name) => t('{name} division', { name })
const airlineTitle = (name, code, division) => `${name} (${code}) · ${division}`
const airportTitle = (iata, city) => `${city ? `${city} (${iata})` : iata} flights`

function env() {
  const vars = { ...process.env }
  for (const f of ['.env', '.env.local']) {
    const p = join(webDir, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) vars[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return vars
}

async function rows(table, query) {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env()
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing: cannot read the pages to publish')
  const out = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Range: `${from}-${from + 999}` },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** Numbers, country names and lists the way a language writes them. */
function formats(locale) {
  const countries = new Intl.DisplayNames([locale], { type: 'region' })
  const lists = new Intl.ListFormat(locale, { type: 'conjunction' })
  return {
    num: (n) => Number(n ?? 0).toLocaleString(locale),
    country: (cc) => {
      try {
        return cc ? countries.of(cc) : null
      } catch {
        return null
      }
    },
    list: (xs) => lists.format(xs),
  }
}
const { num, country, list } = formats('en-GB')

/**
 * One page: its address, words, the plain HTML that stands in for the app,
 * and its link preview -- a card image (web/scripts/make_cards.py) and the
 * colour Discord draws down the side of the embed.
 */
function page(path, title, description, body, preview = {}) {
  return {
    path,
    title: pageTitle(title),
    description,
    body,
    card: preview.card ?? 'echo.jpg',
    color: preview.color,
    lang: preview.lang ?? LANGS[0],
    // The page's own path without a language prefix, which its translations
    // share; null for a page written in English only.
    alternates: preview.alternates ?? null,
    crumbs: preview.crumbs ?? null,
  }
}

const cardFor = (divisionCode) =>
  existsSync(join(webDir, 'public/brand/cards', `${divisionCode}.png`)) ? `${divisionCode}.png` : 'echo.jpg'

const urlOf = (path) => `${ORIGIN}${path === '/' ? '/' : `${encodeURI(path)}/`}`

/**
 * The trail search results show above a page's title -- Echo United
 * Alliances > Aegis division > Tsuki Airways -- as schema.org breadcrumbs.
 */
function breadcrumbs(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: urlOf(path) })),
  }
}

function render(template, p) {
  const url = urlOf(p.path)
  const image = `${ORIGIN}/brand/cards/${p.card}`
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE)}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(p.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta property="og:locale" content="${p.lang.og}" />`,
  ]
  // Each translation names all the others, and English as the default, so a
  // search engine shows a reader the one in their language.
  if (p.alternates != null) {
    for (const l of LANGS)
      tags.push(`<link rel="alternate" hreflang="${l.hreflang}" href="${urlOf(prefix(l.code) + (p.alternates === '/' && l.code !== 'en' ? '' : p.alternates) || '/')}" />`)
    tags.push(`<link rel="alternate" hreflang="x-default" href="${urlOf(p.alternates)}" />`)
  }
  if (p.crumbs) tags.push(`<script type="application/ld+json">${JSON.stringify(breadcrumbs(p.crumbs))}</script>`)
  let html = template
    .replace('<html lang="en">', `<html lang="${p.lang.code}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(p.description)}" />`)
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${p.body}</div>`)
  // Who the site belongs to, in the form search engines read for their
  // knowledge panel: the alliance, its logo, and its Discord as its channel.
  if (p.path === '/' || p.path === `/${p.lang.code}`) html = html.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(ORGANISATION)}</script>\n  </head>`)
  // Discord colours the edge of an embed with the page's theme colour.
  if (p.color) html = html.replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${esc(p.color)}"`)
  if (!html.includes(`<link rel="canonical" href="${url}"`)) throw new Error(`could not fill in ${p.path}`)
  return html
}

const link = (href, text) => `<a href="${encodeURI(href === '' ? '/' : `${href}/`)}">${esc(text)}</a>`
const main = (h1, description, extra = '') => `<main><h1>${esc(h1)}</h1><p>${esc(description)}</p>${extra}</main>`

function removePrevious() {
  if (!existsSync(LIST)) return
  for (const rel of readFileSync(LIST, 'utf8').split(/\r?\n/).filter(Boolean)) {
    if (rel === 'index.html') continue
    const file = join(repoRoot, rel)
    rmSync(file, { force: true })
    // Tidy folders this left empty, but never one that holds anything else.
    for (let dir = dirname(file); dir !== repoRoot; dir = dirname(dir)) {
      if (!existsSync(dir) || readdirSync(dir).length) break
      rmdirSync(dir)
    }
  }
}

export async function prerender() {
  const template = readFileSync(join(repoRoot, 'index.html'), 'utf8')
  const [divisions, airlines, airports] = await Promise.all([
    rows('v_division_summary', 'select=division_code,division_name,accent_color,carriers,aircraft,routes,destinations,top_hubs&order=sort_order'),
    rows(
      'mv_airline_directory',
      'select=division_code,division_name,accent_color,airline_slug,carrier_code,airline_name,airline_country,fleet_size,routes,destinations,hubs&order=division_code,airline_slug',
    ),
    rows(
      'mv_airport_directory',
      'select=iata_code,airport_name,city_name,country_code,weekly_departures,carriers&weekly_departures=gt.0&order=iata_code',
    ),
  ])
  const counts = { divisions: divisions.length, airlines: airlines.length }
  const byDivision = Object.groupBy(airlines, (a) => a.division_code)

  const pages = []

  // Every page but the airports', once per language.
  for (const lang of LANGS) {
    const t = translator(lang.code)
    const f = formats(lang.locale)
    const at = (path) => prefix(lang.code) + (path === '/' && lang.code !== 'en' ? '' : path) || '/'
    const fill = (s) => t(s).replace(/\{(\w+)\}/g, (m, k) => (k in counts ? f.num(counts[k]) : m))
    const home = [SITE, at('/')]
    const options = (path, extra = {}) => ({ lang, alternates: path, ...extra })

    for (const [path, m] of Object.entries(meta.pages)) {
      let extra = ''
      if (path === '/' || path === '/divisions')
        extra = `<ul>${divisions.map((d) => `<li>${link(at(divisionPath(d.division_code)), divisionTitle(t, d.division_name))}</li>`).join('')}</ul>`
      if (path === '/airlines')
        extra = `<ul>${airlines.map((a) => `<li>${link(at(divisionPath(a.division_code, a.airline_slug)), a.airline_name ?? a.carrier_code)}</li>`).join('')}</ul>`
      const title = t(m.title)
      pages.push(
        page(at(path), title, fill(m.description), main(path === '/' ? SITE : title, fill(m.description), extra), options(path, {
          crumbs: path === '/' ? null : [home, [title, at(path)]],
        })),
      )
    }

    for (const d of divisions) {
      const members = byDivision[d.division_code] ?? []
      const path = divisionPath(d.division_code)
      const title = divisionTitle(t, d.division_name)
      const description = t(
        '{name} is one of the {divisions} divisions of Echo United Alliances in The Airline Simulator: {carriers} airlines flying {aircraft} aircraft on {routes} routes to {destinations} destinations.',
        {
          name: d.division_name,
          divisions: f.num(counts.divisions),
          carriers: f.num(d.carriers),
          aircraft: f.num(d.aircraft),
          routes: f.num(d.routes),
          destinations: f.num(d.destinations),
        },
      )
      const extra = `<ul>${members.map((a) => `<li>${link(at(divisionPath(a.division_code, a.airline_slug)), a.airline_name ?? a.carrier_code)}</li>`).join('')}</ul>`
      pages.push(
        page(at(path), title, description, main(title, description, extra), options(path, {
          card: cardFor(d.division_code),
          color: d.accent_color,
          crumbs: [home, [title, at(path)]],
        })),
      )
    }

    for (const a of airlines) {
      const name = a.airline_name ?? a.carrier_code
      const from = f.country(a.airline_country)
      const hubs = (a.hubs ?? []).slice(0, 4)
      const path = divisionPath(a.division_code, a.airline_slug)
      const vars = { name, code: a.carrier_code, division: a.division_name, country: from }
      const flies = {
        aircraft: f.num(a.fleet_size),
        routes: f.num(a.routes),
        destinations: f.num(a.destinations),
        hubs: f.list(hubs),
      }
      const description = [
        from
          ? t('{name} ({code}) is an airline from {country} in the {division} division of Echo United Alliances in The Airline Simulator.', vars)
          : t('{name} ({code}) is an airline in the {division} division of Echo United Alliances in The Airline Simulator.', vars),
        a.fleet_size
          ? hubs.length
            ? t('It flies {aircraft} aircraft on {routes} routes to {destinations} destinations from {hubs}.', flies)
            : t('It flies {aircraft} aircraft on {routes} routes to {destinations} destinations.', flies)
          : '',
      ]
        .filter(Boolean)
        .join(' ')
      const division = divisionTitle(t, a.division_name)
      const extra = `<p>${link(at(divisionPath(a.division_code)), division)}</p>`
      pages.push(
        page(at(path), airlineTitle(name, a.carrier_code, a.division_name), description, main(name, description, extra), options(path, {
          card: cardFor(a.division_code),
          color: a.accent_color,
          crumbs: [home, [division, at(divisionPath(a.division_code))], [name, at(path)]],
        })),
      )
    }
  }

  // Windows will not create a folder named after an old device (PRN, CON,
  // AUX, NUL, COM1...), and publishing runs on Windows. Pristina (PRN) and
  // the rest still open through 404.html, just without a page of their own.
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i
  for (const ap of airports.filter((a) => !reserved.test(a.iata_code))) {
    const place = [ap.city_name, country(ap.country_code)].filter(Boolean).join(', ')
    const description =
      `Flights from ${ap.airport_name ?? ap.iata_code} (${ap.iata_code})${place ? `, ${place}` : ''}, in The Airline Simulator: ` +
      `${num(ap.weekly_departures)} departures a week by ${num(ap.carriers)} Echo United Alliances airline${ap.carriers === 1 ? '' : 's'}.`
    const title = airportTitle(ap.iata_code, ap.city_name)
    const path = `/airports/${ap.iata_code}`
    pages.push(page(path, title, description, main(title, description), { crumbs: [[SITE, '/'], ['Network', '/network'], [title, path]] }))
  }

  removePrevious()
  const written = []
  for (const p of pages) {
    const rel = p.path === '/' ? 'index.html' : `${p.path.slice(1)}/index.html`
    const file = join(repoRoot, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, render(template, p))
    written.push(rel)
  }
  writeFileSync(LIST, written.join('\n') + '\n')

  // Every page, for search engines to find without following links.
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(
    join(repoRoot, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      pages.map((p) => `  <url><loc>${esc(urlOf(p.path))}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
      '\n</urlset>\n',
  )
  writeFileSync(join(repoRoot, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
  return { pages, counts }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pages } = await prerender()
  console.log(`prerendered ${pages.length} pages`)
}

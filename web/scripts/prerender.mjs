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
// The Discord invite, from lib/site.ts, for the organisation details below.
const DISCORD = readFileSync(join(webDir, 'src/lib/site.ts'), 'utf8').match(/discordInvite:\s*'([^']+)'/)?.[1]
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
    ...(DISCORD && !DISCORD.includes('REPLACE-ME') ? { sameAs: [DISCORD] } : {}),
  },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: `${ORIGIN}/` },
]

const divisionPath = (code, slug) => `/d/${DIVISION_URL[code] ?? code}${slug ? `/${slug}` : ''}`

// The same wording as src/lib/pageMeta.ts; change both together.
const pageTitle = (t) => (t.includes(SITE) ? t : `${t} · ${SITE}`)
const divisionTitle = (name) => `${name} division`
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
const num = (n) => Number(n ?? 0).toLocaleString('en-GB')
const countries = new Intl.DisplayNames(['en'], { type: 'region' })
const country = (cc) => {
  try {
    return cc ? countries.of(cc) : null
  } catch {
    return null
  }
}
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * One page: its address, words, the plain HTML that stands in for the app,
 * and its link preview -- a card image (web/scripts/make_cards.py) and the
 * colour Discord draws down the side of the embed.
 */
function page(path, title, description, body, preview = {}) {
  return { path, title: pageTitle(title), description, body, card: preview.card ?? 'echo.jpg', color: preview.color }
}

const cardFor = (divisionCode) =>
  existsSync(join(webDir, 'public/brand/cards', `${divisionCode}.png`)) ? `${divisionCode}.png` : 'echo.jpg'

function render(template, p) {
  const url = `${ORIGIN}${p.path === '/' ? '/' : `${p.path}/`}`
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
  ]
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(p.description)}" />`)
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${p.body}</div>`)
  // Who the site belongs to, in the form search engines read for their
  // knowledge panel: the alliance, its logo, and its Discord as its channel.
  if (p.path === '/') html = html.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(ORGANISATION)}</script>\n  </head>`)
  // Discord colours the edge of an embed with the page's theme colour.
  if (p.color) html = html.replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${esc(p.color)}"`)
  if (!html.includes(`<link rel="canonical" href="${url}"`)) throw new Error(`could not fill in ${p.path}`)
  return html
}

const link = (href, text) => `<a href="${href}">${esc(text)}</a>`
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
  const counts = { divisions: num(divisions.length), airlines: num(airlines.length) }
  const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => counts[k] ?? m)
  const byDivision = Object.groupBy(airlines, (a) => a.division_code)

  const pages = []

  for (const [path, m] of Object.entries(meta.pages)) {
    let extra = ''
    if (path === '/' || path === '/divisions')
      extra = `<ul>${divisions.map((d) => `<li>${link(divisionPath(d.division_code), divisionTitle(d.division_name))}</li>`).join('')}</ul>`
    if (path === '/airlines')
      extra = `<ul>${airlines.map((a) => `<li>${link(divisionPath(a.division_code, a.airline_slug), a.airline_name ?? a.carrier_code)}</li>`).join('')}</ul>`
    pages.push(page(path, m.title, fill(m.description), main(path === '/' ? SITE : m.title, fill(m.description), extra)))
  }

  for (const d of divisions) {
    const members = byDivision[d.division_code] ?? []
    const description =
      `${d.division_name} is one of the ${counts.divisions} divisions of Echo United Alliances in The Airline Simulator: ` +
      `${num(d.carriers)} airlines flying ${num(d.aircraft)} aircraft on ${num(d.routes)} routes to ${num(d.destinations)} destinations.`
    const extra = `<ul>${members.map((a) => `<li>${link(divisionPath(a.division_code, a.airline_slug), a.airline_name ?? a.carrier_code)}</li>`).join('')}</ul>`
    pages.push(
      page(divisionPath(d.division_code), divisionTitle(d.division_name), description, main(divisionTitle(d.division_name), description, extra), {
        card: cardFor(d.division_code),
        color: d.accent_color,
      }),
    )
  }

  for (const a of airlines) {
    const name = a.airline_name ?? a.carrier_code
    const from = country(a.airline_country)
    const hubs = (a.hubs ?? []).slice(0, 4)
    const description =
      `${name} (${a.carrier_code}) is ${from ? `an airline from ${from}` : 'an airline'} in the ${a.division_name} division of Echo United Alliances in The Airline Simulator` +
      (a.fleet_size ? `, flying ${num(a.fleet_size)} aircraft on ${num(a.routes)} routes to ${num(a.destinations)} destinations` : '') +
      (hubs.length ? ` from ${list(hubs)}.` : '.')
    const extra = `<p>${link(divisionPath(a.division_code), divisionTitle(a.division_name))}</p>`
    pages.push(
      page(divisionPath(a.division_code, a.airline_slug), airlineTitle(name, a.carrier_code, a.division_name), description, main(name, description, extra), {
        card: cardFor(a.division_code),
        color: a.accent_color,
      }),
    )
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
    pages.push(page(`/airports/${ap.iata_code}`, title, description, main(title, description)))
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
  const loc = (path) => `${ORIGIN}${path === '/' ? '/' : `${encodeURI(path)}/`}`
  writeFileSync(
    join(repoRoot, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      pages.map((p) => `  <url><loc>${esc(loc(p.path))}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
      '\n</urlset>\n',
  )
  writeFileSync(join(repoRoot, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
  return { pages, counts }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pages } = await prerender()
  console.log(`prerendered ${pages.length} pages`)
}

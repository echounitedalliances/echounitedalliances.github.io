/**
 * Build the site and copy it to the repository root.
 *
 * Why the root: this is a <name>.github.io user site, and GitHub Pages is set
 * to "Deploy from a branch", which serves the root of main. Publishing there
 * means the site works with the setting as it is, rather than depending on
 * someone flipping Pages over to GitHub Actions first.
 *
 * .nojekyll goes with it. Without that file GitHub runs Jekyll over the
 * branch, which renders README.md with a theme and serves that instead of the
 * app -- exactly the white static page this replaces. Jekyll also drops any
 * file or folder starting with an underscore, which a bundler can emit.
 *
 * The Supabase URL and publishable key are compiled in. That is intended:
 * they are meant to reach browsers, and row level security is what protects
 * the data.
 *
 *     node web/scripts/publish-to-root.mjs
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prerender } from './prerender.mjs'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webDir, '..')
const dist = join(webDir, 'dist')

// Anything the build owns at the repo root. Everything else there is source and
// must not be touched.
// Everything the build owns at the repository root. 'brand' holds the logo
// and the favicons: they are NOT under assets/, so both this list and the
// deploy workflow have to name it or they quietly stop being published.
// favicon.ico sits at the root because that is where search engines look.
const OWNED = ['assets', 'brand', 'index.html', '.nojekyll', '404.html', 'favicon.ico']

console.log('building…')
execSync('npm run build', { cwd: webDir, stdio: 'inherit' })

if (!existsSync(join(dist, 'index.html'))) {
  console.error('build produced no index.html; refusing to publish')
  process.exit(1)
}

console.log('clearing previously published files…')
for (const name of OWNED) {
  const p = join(repoRoot, name)
  if (existsSync(p)) rmSync(p, { recursive: true, force: true })
}

console.log('copying build to the repository root…')
for (const entry of readdirSync(dist)) {
  cpSync(join(dist, entry), join(repoRoot, entry), { recursive: true })
}

// Stop Jekyll touching any of it.
writeFileSync(join(repoRoot, '.nojekyll'), '')

// 404.html is the app itself, so an address with no page of its own (an
// airline newer than this publish) still opens the right page.
const indexHtml = join(repoRoot, 'index.html')
cpSync(indexHtml, join(repoRoot, '404.html'))

// Then a real page at every address the site knows, each with its own title
// and description (scripts/prerender.mjs). After 404.html, which stays the
// plain app: it answers for any address without a page of its own.
console.log('writing a page for every address…')
const { pages } = await prerender()
console.log(`  ${pages.length} pages, listed in published-pages.txt`)

const files = readdirSync(join(repoRoot, 'assets'))
console.log(`\npublished: index.html, 404.html, .nojekyll, assets/ (${files.length} files)`)
console.log('commit and push to publish.')

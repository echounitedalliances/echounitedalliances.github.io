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
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webDir, '..')
const dist = join(webDir, 'dist')

// Anything the build owns at the repo root. Everything else there is source and
// must not be touched.
// Everything the build owns at the repository root. 'brand' holds the logo
// and the favicons: they are NOT under assets/, so both this list and the
// deploy workflow have to name it or they quietly stop being published.
const OWNED = ['assets', 'brand', 'index.html', '.nojekyll', '404.html']

console.log('building…')
execSync('npm run build', { cwd: webDir, stdio: 'inherit' })

if (!existsSync(join(dist, 'index.html'))) {
  console.error('build produced no index.html; refusing to publish')
  process.exit(1)
}

/*
 * The application form has now been deleted twice by an innocent rebuild.
 *
 * VITE_DISCORD_APPLY_WEBHOOK_URL is compiled in, and it is gitignored, so it
 * only exists on a machine where somebody has typed it into web/.env.local.
 * Build anywhere else and applyWebhookConfigured is false, Join.tsx quietly
 * drops back to the bare Discord invite, and nothing anywhere says so. Both
 * times it was caught by a person noticing the form had gone.
 *
 * So: notice it here instead. --allow-missing-webhook is the deliberate way
 * past, for a build that genuinely does not need the form.
 */
if (!process.argv.includes('--allow-missing-webhook')) {
  const bundles = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
  const wired = bundles.some((f) =>
    readFileSync(join(dist, 'assets', f), 'utf8').includes('api/webhooks'),
  )
  if (!wired) {
    console.error(
      '\nrefusing to publish: this build has no Discord apply webhook in it.\n\n' +
        '  VITE_DISCORD_APPLY_WEBHOOK_URL is missing from web/.env.local, so the\n' +
        '  in-site application form would silently vanish from the published site.\n\n' +
        '  Put the value in web/.env.local and run this again, or pass\n' +
        '  --allow-missing-webhook if dropping the form is actually what you want.\n',
    )
    process.exit(1)
  }
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

// HashRouter keeps every route in the hash, so a deep link never asks the
// server for a path it does not have. This is belt and braces for anyone who
// types a path directly.
const indexHtml = join(repoRoot, 'index.html')
cpSync(indexHtml, join(repoRoot, '404.html'))

const files = readdirSync(join(repoRoot, 'assets'))
console.log(`\npublished: index.html, 404.html, .nojekyll, assets/ (${files.length} files)`)
console.log('commit and push to publish.')

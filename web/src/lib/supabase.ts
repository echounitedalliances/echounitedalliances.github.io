import { createClient } from '@supabase/supabase-js'

/**
 * The site is a static build talking straight to Supabase.
 *
 * The publishable key is meant to reach browsers -- it identifies the project,
 * it does not authorise anything. What actually protects the data is the row
 * level security in database/sql/08_rls_policies.sql: game data is world
 * readable, reservations are not, and nothing is writable except through the
 * policies and RPCs.
 */
// Trimmed, and empty treated as missing. An unset GitHub Actions variable
// substitutes an EMPTY STRING rather than nothing, and `'' ?? fallback` keeps
// the empty string -- which made createClient throw at module load, so React
// never mounted and the site served a blank white page with one console error.
// Missing configuration has to degrade to the NotConfigured panel, never to a
// crash.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const isConfigured = url.length > 0 && key.length > 0

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy web/.env.example to web/.env.local and fill them in.',
  )
}

export const supabase = createClient(
  isConfigured ? url : 'https://placeholder.supabase.co',
  isConfigured ? key : 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

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
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy web/.env.example to web/.env.local and fill them in.',
  )
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

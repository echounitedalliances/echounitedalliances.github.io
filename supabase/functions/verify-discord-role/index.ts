// Echo United Alliances -- verifying the Resonant Discord role, server-side
//
// resonants.discord_role_verified_at (53_discord_resonant_badge.sql) used to
// be written by the browser straight after the client's own Discord check
// came back true. That update is refused: 40_lock_admin_flag.sql grants the
// client write on only display_name, given_name, family_name, home_airport
// and home_division, for exactly the reason this column was never added to
// it -- a client-writable "I am verified" column is a client-writable lie,
// the same shape as the is_admin hole that migration closed. Granting this
// one column to authenticated would reopen it: anyone could
// PATCH /rest/v1/resonants?user_id=eq.<self> {"discord_role_verified_at":
// "now"} and pass 55_claims_require_discord_verification.sql's gate without
// ever touching Discord.
//
// So the check happens here instead, where nobody but this function can
// write the column. It takes the caller's own Supabase session (to know
// which resonant row is theirs, the same way every other security definer
// function on this site does) and their Discord provider_token (the
// one-time OAuth token lib/auth.tsx already has at sign-in, good for
// exactly this one request) and re-does the same check the client used to
// trust itself to report: GET the EUA guild member object, read its roles,
// look for Resonant. Only a true result is written, with the service role,
// which is the one key that bypasses the column grant deliberately rather
// than by accident.
//
// Deploy with the Supabase CLI from the repo root:
//     supabase functions deploy verify-discord-role --project-ref <ref>
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are supplied
// automatically in the function's environment; nothing else to configure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EUA_GUILD_ID = '1485632790035955722'
const EUA_RESONANT_ROLE_ID = '1485741662851567616'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // x-client-info is not optional: supabase-js's functions client attaches it
  // to every invoke() call by default (SupabaseClient's DEFAULT_GLOBAL_OPTIONS),
  // so leaving it out of this list fails the browser's CORS preflight on every
  // single call -- not sometimes, always -- before the request body is even
  // sent. That looked from the client like the Discord/role check itself
  // failing every time, when the actual failure never reached this function at
  // all.
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let providerToken: unknown
  try {
    ;({ provider_token: providerToken } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof providerToken !== 'string' || !providerToken) {
    return json({ error: 'Missing provider_token' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Who is calling, proven by Supabase's own auth server -- not a claim read
  // out of the request body, the same discipline every RPC on this site
  // already holds itself to (echo_current_user_id()).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) {
    return json({ error: 'Not signed in' }, 401)
  }
  const userId = userData.user.id

  // The check itself: same endpoint, same role, lib/auth.tsx's
  // hasEuaResonantRole used to make this call directly from the browser.
  // 404 reads as a plain "no", same as holding the wrong role; anything
  // else that is not ok() is a failure to verify, not a confirmed absence,
  // and must not be treated as one.
  let hasRole: boolean | null
  try {
    const discordRes = await fetch(
      `https://discord.com/api/users/@me/guilds/${EUA_GUILD_ID}/member`,
      { headers: { Authorization: `Bearer ${providerToken}` } },
    )
    if (discordRes.status === 404) {
      hasRole = false
    } else if (!discordRes.ok) {
      hasRole = null
    } else {
      const member = (await discordRes.json()) as { roles?: string[] }
      hasRole = (member.roles ?? []).includes(EUA_RESONANT_ROLE_ID)
    }
  } catch {
    hasRole = null
  }

  if (hasRole === null) {
    return json({ verified: null, reason: 'discord_check_failed' })
  }
  if (!hasRole) {
    return json({ verified: false, reason: 'no_role' })
  }

  // Only now, with the service role -- the one route past the column grant
  // that is not also a hole an unauthenticated request could use.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceKey)
  const { error: updateError } = await adminClient
    .from('resonants')
    .update({ discord_role_verified_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (updateError) {
    return json({ verified: true, reason: 'write_failed', detail: updateError.message }, 500)
  }

  return json({ verified: true })
})

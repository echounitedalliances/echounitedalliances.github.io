// Echo United Alliances -- the "that's me" / "not me" DM for a new claim
//
// 58_airline_claim_dm_confirmation.sql's airline_claims_notify_dm trigger
// calls this function right after a row lands in airline_claims, the same
// moment echo_notify_airline_claim posts the admin-facing notice to the
// claims channel. This one messages the claimant instead: a DM from the
// EUA Resonance bot -- the same Discord application the site already uses
// for Discord sign-in (verify-discord-role) -- with two buttons, so an
// admin reviewing the claim can see whether the account behind it actually
// meant to file it, not just take the claim's word for that.
//
// AUTH
//
// Not a user action, so there is no Supabase session to carry a JWT.
// Deploy with --no-verify-jwt and trust only a request carrying the
// shared secret the trigger also holds (claim_dm_trigger_secret in Vault,
// this function's own CLAIM_DM_TRIGGER_SECRET) -- not the service role
// key, which is never put in the database at all: anyone who later read
// vault.decrypted_secrets would read a secret good for nothing but
// calling this one function, not full access to the project.
//
//     supabase functions deploy discord-claim-dm --project-ref <ref> --no-verify-jwt
//     supabase secrets set DISCORD_BOT_TOKEN=... CLAIM_DM_TRIGGER_SECRET=...
//
// DISCORD_BOT_TOKEN is the EUA Resonance application's bot token (Discord
// Developer Portal -- Bot -- Reset Token), and that bot must already share
// a guild with the claimant for the DM to send at all, which it does: it
// is the same bot verify-discord-role's guild-member check implies is
// already a member of the EUA server.
//
// CLAIM_DM_TRIGGER_SECRET is any random string, set here and the same
// value stored in Vault as claim_dm_trigger_secret (and
// claim_dm_function_url pointing at this function's own invoke URL) --
// nothing automates that pairing, it is a password the trigger and this
// function are both handed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_API = 'https://discord.com/api/v10'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  const secret = Deno.env.get('CLAIM_DM_TRIGGER_SECRET')
  if (!secret || req.headers.get('x-echo-trigger-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let claimId: unknown
  try {
    ;({ claim_id: claimId } = await req.json())
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }
  if (typeof claimId !== 'number') return new Response('Missing claim_id', { status: 400 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceKey)

  const { data: claim } = await db
    .from('airline_claims')
    .select('claim_id, resonant_id, airline_uid')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!claim) return new Response('No such claim', { status: 200 })

  const { data: resonant } = await db
    .from('resonants')
    .select('discord_user_id')
    .eq('resonant_id', claim.resonant_id)
    .maybeSingle()
  const discordUserId = resonant?.discord_user_id as string | null | undefined
  // Nothing to DM -- the trigger itself already checks this, but the
  // function is the one place that actually knows how to no-op on it.
  if (!discordUserId) return new Response('No discord_user_id on file', { status: 200 })

  const { data: airline } = await db
    .from('v_airline_directory_live')
    .select('airline_name, carrier_code')
    .eq('uid', claim.airline_uid)
    .maybeSingle()
  const airlineLabel = airline?.airline_name ?? airline?.carrier_code ?? 'that carrier'

  const botToken = Deno.env.get('DISCORD_BOT_TOKEN')!
  const botHeaders = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  }

  // Step 1: a bot can only message a user through a DM channel it opens
  // with them first -- there is no "send to user id" endpoint.
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers: botHeaders,
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!channelRes.ok) {
    const detail = await channelRes.text()
    // The dashboard's Invocations view shows status/timing but not the
    // response body pg_net received -- console.error is what shows up on
    // the separate Logs tab, which is where this needs to be visible.
    console.error(`discord-claim-dm: could not open a DM channel (${channelRes.status}): ${detail}`)
    return new Response(`Could not open a DM channel: ${detail}`, { status: 502 })
  }
  const channel = (await channelRes.json()) as { id: string }

  // Step 2: the message itself, two buttons. custom_id carries the claim
  // id and the choice -- discord-interactions reads both straight back
  // off it, no lookup needed to know which claim a tap was about.
  const messageRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: botHeaders,
    body: JSON.stringify({
      content:
        `You (or someone signed in as you) just filed a claim on **${airlineLabel}** at Echo United Alliances. ` +
        `Was that you?`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "That's me",
              custom_id: `claim_confirm:${claimId}`,
            },
            {
              type: 2,
              style: 4,
              label: "That's not me",
              custom_id: `claim_deny:${claimId}`,
            },
          ],
        },
      ],
    }),
  })
  if (!messageRes.ok) {
    const detail = await messageRes.text()
    console.error(`discord-claim-dm: could not send the DM (${messageRes.status}): ${detail}`)
    return new Response(`Could not send the DM: ${detail}`, { status: 502 })
  }

  return new Response('ok', { status: 200 })
})

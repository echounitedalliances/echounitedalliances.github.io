// Posts a pending airline claim to the staff Discord channel, as the bot,
// with Approve/Deny buttons. Called by the client right after
// submit_airline_claim() succeeds -- see web/src/pages/Airline.tsx.
//
// Secrets this function needs (set once, deployed alongside it):
//   supabase secrets set DISCORD_BOT_TOKEN=...
//   supabase secrets set DISCORD_CLAIMS_CHANNEL_ID=...
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are supplied
// automatically to every Edge Function in this project; nothing to set for
// those three.
//
// Nothing here trusts the request body for anything sensitive: the claim is
// re-read from the database using the *caller's own* access token, so the
// only way to post a claim notification is to actually own a real, pending
// claim row -- not to just call this function with made-up text.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const CHANNEL_ID = Deno.env.get('DISCORD_CLAIMS_CHANNEL_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') ?? ''
  const { claim_id } = await req.json().catch(() => ({ claim_id: null }))
  if (!claim_id) return new Response('claim_id required', { status: 400 })

  // Reads as the caller: the airline_claims RLS policy in
  // 19_airline_claims.sql only lets a Resonant see their own claims, so this
  // fails closed on anything that isn't really theirs.
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: claim, error } = await asCaller
    .from('airline_claims')
    .select('claim_id, airline_uid, discord_username, notes, status')
    .eq('claim_id', claim_id)
    .maybeSingle()

  if (error || !claim) return new Response('Claim not found', { status: 404 })
  if (claim.status !== 'pending') return new Response('Claim is not pending', { status: 409 })
  if (claim.discord_message_id) return new Response('Already posted', { status: 409 })

  const { data: airline } = await asCaller
    .from('mv_airline_directory')
    .select('airline_name, carrier_code, division_name')
    .eq('uid', claim.airline_uid)
    .maybeSingle()

  const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: 'Airline claim',
          color: 0x5b2ee5,
          fields: [
            { name: 'Airline', value: `${airline?.airline_name ?? claim.airline_uid} (${airline?.carrier_code ?? '?'})`, inline: true },
            { name: 'Division', value: airline?.division_name ?? '—', inline: true },
            { name: 'Discord', value: claim.discord_username, inline: true },
            ...(claim.notes ? [{ name: 'Notes', value: claim.notes.slice(0, 1000) }] : []),
          ],
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Approve', custom_id: `claim:${claim.claim_id}:approve` },
            { type: 2, style: 4, label: 'Deny', custom_id: `claim:${claim.claim_id}:deny` },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    return new Response(`Discord rejected the message (${res.status})`, { status: 502 })
  }
  const message = await res.json()

  // Service role, not the caller's token: attach_claim_message() is
  // deliberately not granted to `authenticated` (see 19_airline_claims.sql).
  const asService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  await asService.rpc('attach_claim_message', {
    p_claim_id: claim.claim_id,
    p_message_id: message.id,
    p_channel_id: CHANNEL_ID,
  })

  return new Response('ok', { status: 200 })
})

// Echo United Alliances -- Discord's callback when a claim DM button is tapped
//
// discord-claim-dm sends a DM with two buttons, "That's me" and "That's
// not me", when a claim is filed (58_airline_claim_dm_confirmation.sql).
// Discord's own servers call THIS function the moment either one is
// tapped -- this is the "Interactions Endpoint URL" set in the Discord
// Developer Portal for the EUA Resonance application, General
// Information page.
//
// AUTH
//
// Discord calls this directly, with no Supabase session at all, so it is
// deployed with --no-verify-jwt like discord-claim-dm. What proves a
// request really came from Discord is not a bearer token but an Ed25519
// signature over the raw request body, checked against the application's
// public key -- Discord's own documented scheme for interaction
// endpoints, the same check every slash-command bot has to implement.
// Skipping it would let anyone on the internet who finds this URL confirm
// or withdraw any claim by guessing a claim_id.
//
//     supabase functions deploy discord-interactions --project-ref <ref> --no-verify-jwt
//     supabase secrets set DISCORD_PUBLIC_KEY=...
//
// DISCORD_PUBLIC_KEY is on the same Developer Portal page as the
// Interactions Endpoint URL field -- General Information, "Public Key".
// Discord will not save that URL at all until this function answers a
// PING with a verified PONG, so DISCORD_PUBLIC_KEY has to be set and this
// function deployed BEFORE the URL is pasted in there.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nacl from 'https://esm.sh/tweetnacl@1.0.3'

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

type Interaction = {
  type: number
  data?: { custom_id?: string }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  const signature = req.headers.get('X-Signature-Ed25519')
  const timestamp = req.headers.get('X-Signature-Timestamp')
  const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY')
  const rawBody = await req.text()

  if (!signature || !timestamp || !publicKey) {
    return new Response('Missing signature', { status: 401 })
  }

  const verified = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + rawBody),
    hexToBytes(signature),
    hexToBytes(publicKey),
  )
  if (!verified) return new Response('Bad request signature', { status: 401 })

  const interaction = JSON.parse(rawBody) as Interaction

  // Discord will not accept this as the Interactions Endpoint URL until a
  // PING here gets a verified PONG back, before any button exists to tap.
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3 = a component (one of the two buttons) was tapped.
  if (interaction.type === 3 && interaction.data?.custom_id) {
    const [action, idStr] = interaction.data.custom_id.split(':')
    const claimId = Number(idStr)

    if ((action === 'claim_confirm' || action === 'claim_deny') && Number.isInteger(claimId)) {
      const db = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )

      const reply =
        action === 'claim_confirm'
          ? "Thanks -- marked as confirmed by you. An admin still has to approve the claim itself."
          : "Got it -- this claim will be withdrawn, since it says it wasn't you."

      if (action === 'claim_confirm') {
        await db.from('airline_claims').update({ claimant_confirmed: true }).eq('claim_id', claimId)
      } else {
        // Only a claim still pending is withdrawn by this -- one already
        // decided (approved or rejected) is left as the admin left it.
        await db
          .from('airline_claims')
          .update({ claimant_confirmed: false, status: 'withdrawn' })
          .eq('claim_id', claimId)
          .eq('status', 'pending')
      }

      // 7 = UPDATE_MESSAGE: edits the DM in place, removing the buttons,
      // in the same response -- no separate edit call needed.
      return new Response(
        JSON.stringify({
          type: 7,
          data: { content: reply, components: [] },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }
  }

  // Anything else Discord might send here (it currently sends nothing
  // else, since this application has no slash commands): acknowledge
  // without changing the message.
  return new Response(JSON.stringify({ type: 6 }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Discord's Interactions Endpoint URL for the claims-review bot. Discord
// calls this directly (not the site) whenever someone clicks Approve/Deny
// on a claim message, and once as a PING when you first set the URL.
//
// Secrets this function needs:
//   supabase secrets set DISCORD_PUBLIC_KEY=...   (Developer Portal -> General Information)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are supplied automatically.
//
// Every request is signature-verified against DISCORD_PUBLIC_KEY before
// anything else happens -- this is the only thing standing between "a
// button was really clicked on Discord" and "a POST from anywhere claiming
// to be Discord", so do not skip or loosen it.
//
// After deploying, paste this function's URL into the Developer Portal's
// "Interactions Endpoint URL" field. Discord immediately sends a PING and
// disables the field again if anything but a verified PONG comes back.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyKey } from 'npm:discord-interactions@3'

const PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Adjust to whatever your staff role actually is. This checks the Manage
// Server permission bit on the member who clicked; anyone without it gets
// told no rather than the claim silently going nowhere.
const MANAGE_GUILD = 0x20n

function canReview(permissions: string | undefined): boolean {
  if (!permissions) return false
  return (BigInt(permissions) & MANAGE_GUILD) === MANAGE_GUILD
}

Deno.serve(async (req) => {
  const signature = req.headers.get('X-Signature-Ed25519')
  const timestamp = req.headers.get('X-Signature-Timestamp')
  const body = await req.text()

  const valid = signature && timestamp &&
    await verifyKey(body, signature, timestamp, PUBLIC_KEY)
  if (!valid) return new Response('Bad signature', { status: 401 })

  const interaction = JSON.parse(body)

  // type 1 = PING, the handshake Discord does when you first set the
  // endpoint URL (and periodically after). type 1 back = PONG.
  if (interaction.type === 1) {
    return Response.json({ type: 1 })
  }

  // type 3 = a message component (button) was clicked.
  if (interaction.type === 3) {
    const customId: string = interaction.data?.custom_id ?? ''
    const [, claimId, decision] = customId.match(/^claim:(.+):(approve|deny)$/) ?? []
    if (!claimId) return new Response('Unknown component', { status: 400 })

    const member = interaction.member
    const clicker = member?.user?.username ?? 'someone'

    if (!canReview(member?.permissions)) {
      return Response.json({
        type: 4,
        data: { content: `${clicker} isn't able to review claims.`, flags: 64 }, // 64 = ephemeral
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data, error } = await supabase.rpc('decide_airline_claim', {
      p_claim_id: claimId,
      p_approve: decision === 'approve',
      p_decided_by: clicker,
    })

    if (error) {
      return Response.json({
        type: 4,
        data: { content: `Could not decide that claim: ${error.message}`, flags: 64 },
      })
    }

    const verb = decision === 'approve' ? 'Approved' : 'Denied'
    const original = interaction.message?.embeds?.[0]

    // type 7 = replace the original message in place, buttons and all.
    return Response.json({
      type: 7,
      data: {
        embeds: original ? [{ ...original, color: decision === 'approve' ? 0x2fbf5b : 0xff6b6b }] : [],
        content: `${verb} by ${clicker}.`,
        components: [],
      },
    })
  }

  return new Response('Unhandled interaction type', { status: 400 })
})

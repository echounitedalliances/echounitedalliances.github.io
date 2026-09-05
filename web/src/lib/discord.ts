/**
 * The alliance application form posts straight to a Discord webhook, the same
 * way the rest of the site talks straight to Supabase -- no server of its own.
 *
 * Unlike the Supabase keys, this URL is not designed to be public: anyone who
 * opens devtools can read it out of the bundle and post to the applications
 * channel directly. There is no account or table behind it to protect, so
 * that is an accepted tradeoff here, not an oversight -- if it is ever abused,
 * regenerate the webhook in Discord and rebuild.
 */
const webhookUrl = (import.meta.env.VITE_DISCORD_APPLY_WEBHOOK_URL ?? '').trim()

export const applyWebhookConfigured = webhookUrl.length > 0

export type Application = {
  airlineName: string
  airlineTag: string
  divisionName: string
  notes: string
}

export async function submitApplication(app: Application) {
  if (!applyWebhookConfigured) {
    throw new Error('Applications are not set up on this build yet.')
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: 'New alliance application',
          color: 0x45c8f0,
          fields: [
            { name: 'Airline', value: app.airlineName, inline: true },
            { name: 'Tag', value: app.airlineTag, inline: true },
            { name: 'Division', value: app.divisionName, inline: true },
            ...(app.notes ? [{ name: 'Notes', value: app.notes.slice(0, 1000) }] : []),
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Discord did not accept the application (${res.status}).`)
  }
}

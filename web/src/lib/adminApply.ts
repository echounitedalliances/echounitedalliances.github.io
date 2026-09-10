/**
 * The "apply for admin" request posts straight to a Discord webhook, the same
 * way the rest of the site talks straight to Supabase -- no server of its own.
 *
 * Unlike the Supabase keys, this URL is not designed to be public: anyone who
 * opens devtools can read it out of the bundle and post to the board's
 * channel directly. There is no account or table behind it to protect, so
 * that is an accepted tradeoff here, not an oversight -- if it is ever
 * abused, regenerate the webhook in Discord and rebuild.
 */
const webhookUrl = (import.meta.env.VITE_ADMIN_APPLY_WEBHOOK_URL ?? '').trim()

export const adminApplyConfigured = webhookUrl.length > 0

export type AdminApplication = {
  email: string
  discordUsername: string
}

export async function submitAdminApplication(app: AdminApplication) {
  if (!adminApplyConfigured) {
    throw new Error('Admin applications are not set up on this build yet.')
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: 'New alliance admin application',
          color: 0x45c8f0,
          fields: [
            { name: 'Email', value: app.email, inline: true },
            { name: 'Discord', value: app.discordUsername, inline: true },
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

/**
 * Sending an "apply for admin" request.
 *
 * It goes to two places, and the distinction matters:
 *
 *   the queue      a row in admin_applications, which the inbox on the
 *                  Resonance page reads and which Approve actually decides.
 *                  This is the durable half.
 *   Discord        a webhook post to the board's channel, so somebody knows
 *                  to go and look. A notification, nothing more.
 *
 * It used to be only the second one, and that is why a board member could not
 * answer "who has applied?" — a Discord message cannot be marked done, it
 * scrolls away, and a request nobody got to looks exactly like one that was
 * turned down. Nothing here grants anything: approving is still a person
 * reading it and clicking, which was the original design and remains it.
 *
 * The webhook URL, unlike the Supabase keys, is not designed to be public:
 * anyone who opens devtools can read it out of the bundle and post to the
 * board's channel. That was an accepted tradeoff when the post was the whole
 * feature. If it is abused, regenerate the webhook in Discord and rebuild —
 * applying keeps working in the meantime, because the queue does not depend
 * on it.
 */
import { supabase } from './supabase'

const webhookUrl = (import.meta.env.VITE_ADMIN_APPLY_WEBHOOK_URL ?? '').trim()

export const adminApplyConfigured = webhookUrl.length > 0

export type AdminApplication = {
  email: string
  discordUsername: string
}

/** Where the request actually landed. It has to reach at least one. */
export type SubmitResult = { queued: boolean; notified: boolean }

/**
 * Files the request under the caller's own account. The email is read from
 * the session on the server, never sent from here, so a request cannot be
 * filed under someone else's address.
 *
 * Returns false rather than throwing when there is no session to file under —
 * which is the signup path with email confirmation on. The board can still
 * see the Discord post and add it with "Log one from Discord".
 */
async function fileInQueue(app: AdminApplication): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('apply_for_admin', {
      p_discord: app.discordUsername,
      p_reason: null,
    })
    // 23505 is the unique violation raised when a request is already waiting.
    // Already in the queue is the end state we wanted, not a failure.
    return !error || error.code === '23505'
  } catch {
    return false
  }
}

async function notifyBoard(app: AdminApplication): Promise<boolean> {
  if (!adminApplyConfigured) return false
  try {
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
    return res.ok
  } catch {
    return false
  }
}

export async function submitAdminApplication(
  app: AdminApplication,
): Promise<SubmitResult> {
  // Both are attempted; neither is allowed to stop the other. Reporting a
  // failure the applicant cannot act on — when their request is sitting in
  // the board's inbox perfectly intact — is worse than saying nothing.
  const [queued, notified] = await Promise.all([fileInQueue(app), notifyBoard(app)])

  if (!queued && !notified) {
    throw new Error('The application could not be sent.')
  }

  return { queued, notified }
}

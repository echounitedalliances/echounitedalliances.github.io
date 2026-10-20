/**
 * Sending an "apply for admin" request.
 *
 * It files a row in admin_applications, which the inbox on the Resonance page
 * reads and which Approve actually decides. Nothing here grants anything:
 * approving is still a person reading it and clicking.
 *
 * The board is pinged on Discord too, but not from here. The site used to
 * post to the webhook itself, which put the URL in the public bundle where
 * anyone could read it and post to the board's channel. The database now
 * sends that notice when the row lands (41_admin_apply_notice.sql), with the
 * URL kept in Supabase Vault.
 */
import { supabase } from './supabase'

export type AdminApplication = {
  discordUsername: string
}

/**
 * Files the request under the caller's own account. The email is read from
 * the session on the server, never sent from here, so a request cannot be
 * filed under someone else's address. Needs a signed-in session.
 */
export async function submitAdminApplication(app: AdminApplication): Promise<void> {
  const { error } = await supabase.rpc('apply_for_admin', {
    p_discord: app.discordUsername,
    p_reason: null,
  })
  // 23505 is the unique violation raised when a request is already waiting.
  // Already in the queue is the end state we wanted, not a failure.
  if (error && error.code !== '23505') {
    throw new Error('The application could not be sent.')
  }
}

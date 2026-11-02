/**
 * Contacting the developers: filing a support ticket, and a signed-in
 * Resonant checking on their own.
 *
 * Submitting needs no account -- supabase.rpc('submit_support_ticket', ...)
 * is granted to anon as well as authenticated (48_support_tickets.sql), so
 * the only thing this adds over calling it directly is picking up the page
 * the reader was actually on and, on a bug report, what browser they are
 * using, since nobody reporting a bug should have to go find that out
 * themselves.
 */
import { supabase } from './supabase'
import type { MyTicket, TicketCategory } from './types'

export type SupportTicketInput = {
  category: TicketCategory
  subject: string
  message: string
  email?: string
}

export async function submitSupportTicket(input: SupportTicketInput): Promise<void> {
  const { error } = await supabase.rpc('submit_support_ticket', {
    p_category: input.category,
    p_subject: input.subject,
    p_message: input.message,
    p_email: input.email?.trim() || null,
    p_page_url: typeof window !== 'undefined' ? window.location.href : null,
    p_browser_info: input.category === 'bug' && typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (error) throw new Error(error.message)
}

export async function myTickets(): Promise<MyTicket[]> {
  const { data, error } = await supabase.rpc('my_support_tickets')
  if (error) throw new Error(error.message)
  return (data as MyTicket[]) ?? []
}

import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './supabase'

/**
 * How many browser tabs currently have the site open, via Supabase Realtime
 * Presence -- every tab joins the same channel and tracks itself, and every
 * tab in the channel gets told who else is in it. No backend of its own,
 * same as everything else here; it counts open tabs, not unique visitors.
 */
export function useSiteVisitorCount(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!isConfigured) return

    const channel = supabase.channel('site-presence', {
      config: { presence: { key: crypto.randomUUID() } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        setCount(Object.keys(channel.presenceState()).length)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ online_at: new Date().toISOString() })
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  return count
}

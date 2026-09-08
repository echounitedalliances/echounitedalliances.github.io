import { useEffect, useState } from 'react'
import { isConfigured, supabase } from './supabase'

/**
 * How many browser tabs currently have the site open, via Supabase Realtime
 * Presence -- every tab joins the same channel and tracks itself, and every
 * tab in the channel gets told who else is in it. No backend of its own,
 * same as everything else here; it counts open tabs, not unique visitors.
 *
 * ONE channel for the whole page, shared by every component that asks.
 *
 * This used to open a channel per hook call, and that took the site down on
 * mobile. supabase.channel(topic) does not create a new channel for a topic it
 * already holds -- it hands back the existing one. So the second mount called
 * .on('presence') on a channel that had already been subscribed, which throws
 *
 *     cannot add `presence` callbacks for realtime:site-presence
 *     after `subscribe()`
 *
 * synchronously inside an effect. Uncaught, React unmounted the entire tree,
 * and the page went to the bare background colour with nothing on it.
 *
 * It only ever happened on a phone, because the desktop nav that holds the
 * badge is hidden with CSS rather than unmounted -- so its copy was already
 * live and subscribed, and opening the mobile menu mounted a second one.
 *
 * The channel is deliberately never removed. It is joined for as long as the
 * tab is open, which is exactly what "how many tabs are open" means, and it
 * sidesteps a race where a removal still in flight lets supabase hand the
 * old, already-subscribed channel to the next caller.
 */

let joined = false
let current: number | null = null
const listeners = new Set<(n: number | null) => void>()

function join(): void {
  if (joined || !isConfigured) return
  joined = true

  const channel = supabase.channel('site-presence', {
    config: { presence: { key: crypto.randomUUID() } },
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      current = Object.keys(channel.presenceState()).length
      for (const notify of listeners) notify(current)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ online_at: new Date().toISOString() })
      }
    })
}

export function useSiteVisitorCount(): number | null {
  const [count, setCount] = useState<number | null>(current)

  useEffect(() => {
    if (!isConfigured) return
    listeners.add(setCount)
    join()
    // A component mounting after the first sync has already happened would
    // otherwise sit at null until the next one.
    setCount(current)
    return () => {
      listeners.delete(setCount)
    }
  }, [])

  return count
}

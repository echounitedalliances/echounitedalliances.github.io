import { useEffect, useState } from 'react'

/**
 * The online count comes from Discord's public Server Widget, not a bot --
 * enabling it in Server Settings -> Widget exposes this JSON with no auth
 * required and CORS already open, because it is meant to be embedded on
 * sites like this one. If the widget is ever turned off, this just quietly
 * returns null and the count stops rendering.
 */
const WIDGET_URL = 'https://discord.com/api/guilds/1535904782622138409/widget.json'

async function fetchOnlineCount(): Promise<number | null> {
  try {
    const res = await fetch(WIDGET_URL)
    if (!res.ok) return null
    const data = (await res.json()) as { presence_count?: number }
    return data.presence_count ?? null
  } catch {
    return null
  }
}

/** Shared by the header and the Join panel. */
export function useOnlineCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    void fetchOnlineCount().then(setCount)
  }, [])
  return count
}

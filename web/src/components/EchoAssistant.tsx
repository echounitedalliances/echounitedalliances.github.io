import { useState } from 'react'
import Chatbot from './Chatbot'
import { useT } from '../lib/i18n'

function ChatGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The Echo Assistant's entry point: a floating bubble, bottom-left, on
 * every page. Launched behind the Sneak Peek lock; now that it is a real
 * feature rather than a preview, it is just here, same as the back-to-top
 * button on the other side of the screen.
 *
 * Mounted once in App.tsx.
 */
export default function EchoAssistant() {
  const t = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="chat-bubble"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t('Close chat') : t('Open Echo Assistant chat')}
      >
        <ChatGlyph />
      </button>
      {open && <Chatbot onClose={() => setOpen(false)} />}
    </>
  )
}

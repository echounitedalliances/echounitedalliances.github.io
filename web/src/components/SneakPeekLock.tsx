import { useState } from 'react'
import Modal from './Modal'
import Chatbot from './Chatbot'
import { useT } from '../lib/i18n'
import { SNEAK_PEEK_FEATURES, hasSneakPeekAccess, unlockSneakPeek } from '../lib/sneakPeek'

/** The padlock icon, drawn open or shut depending on whether this browser already has access. */
function LockGlyph({ open }: { open: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <rect x="3" y="6.5" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {open ? (
        <path d="M5 6.5V4.8A2.5 2.5 0 0 1 9.8 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  )
}

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
 * Two floating buttons, mounted once in App.tsx: the lock, bottom-right,
 * and -- once that lock has been opened -- the Echo Assistant's own chat
 * bubble, bottom-left. Kept in one component because both need the same
 * `unlocked` flag the instant the code is accepted, with no reload; splitting
 * them would mean threading that state through a context for no other reason.
 *
 * Click the lock and it shows a box for the code, nothing else -- the
 * feature list in SNEAK_PEEK_FEATURES (lib/sneakPeek.ts) only renders once
 * unlockSneakPeek() has actually succeeded, locked or not is the one thing
 * that panel must never leak.
 */
export default function SneakPeekLock() {
  const t = useT()
  const [panelOpen, setPanelOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(hasSneakPeekAccess)
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (unlockSneakPeek(code)) {
      setUnlocked(true)
      setCode('')
      setWrong(false)
    } else {
      setWrong(true)
    }
  }

  return (
    <>
      <button
        type="button"
        className="sneak-lock"
        onClick={() => setPanelOpen(true)}
        aria-label={unlocked ? t('Sneak peek (unlocked)') : t('Sneak peek')}
      >
        <LockGlyph open={unlocked} />
      </button>

      {panelOpen && (
        <Modal title={t('Sneak Peek')} onClose={() => setPanelOpen(false)}>
          {unlocked ? (
            <>
              <p className="eyebrow text-cyan">{t('Unlocked for this browser')}</p>
              <ul className="mt-3 flex flex-col gap-4">
                {SNEAK_PEEK_FEATURES.map((f) => (
                  <li key={f.id}>
                    <p className="display text-base">{t(f.name)}</p>
                    <p className="mt-1 text-sm text-ink-dim">{t(f.teaser)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-ink-dim">
                {t('Look for the chat bubble in the bottom-left corner to open it.')}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-dim">
                {t('A few features go up here before they go live everywhere else. Have a code? Enter it below.')}
              </p>
              <form onSubmit={submit} className="mt-5 border-t border-edge-soft pt-4">
                <label htmlFor="sneak-code" className="eyebrow mb-1.5 block text-ink-faint">
                  {t('Have a code?')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="sneak-code"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setWrong(false)
                    }}
                    placeholder="ECHO-••••-••••"
                    className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                  />
                  <button type="submit" className="btn btn-primary shrink-0 !px-4 !py-2.5 !text-[11px]">
                    {t('Unlock')}
                  </button>
                </div>
                {wrong && <p className="mt-2 text-[12px] text-danger">{t('That code did not work.')}</p>}
              </form>
            </>
          )}
        </Modal>
      )}

      {unlocked && (
        <button
          type="button"
          className="chat-bubble"
          onClick={() => setChatOpen((o) => !o)}
          aria-label={chatOpen ? t('Close chat') : t('Open Echo Assistant chat')}
        >
          <ChatGlyph />
        </button>
      )}

      {unlocked && chatOpen && <Chatbot onClose={() => setChatOpen(false)} />}
    </>
  )
}

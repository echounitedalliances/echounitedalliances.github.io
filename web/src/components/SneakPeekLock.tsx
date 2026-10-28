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

/**
 * The one lock in the corner of every page, standing in front of whatever is
 * in SNEAK_PEEK_FEATURES (lib/sneakPeek.ts). Click it and it shows a teaser
 * of what is coming with a box for the code; get the code right once and
 * this browser can open any of them, from then on, without asking again.
 *
 * Mounted once in App.tsx, same as Welcome and AdvisoryBar, so it floats
 * over every route rather than belonging to any one page.
 */
export default function SneakPeekLock() {
  const t = useT()
  const [panelOpen, setPanelOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(hasSneakPeekAccess)
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  const [openFeature, setOpenFeature] = useState<string | null>(null)

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
          {!unlocked && (
            <p className="text-sm text-ink-dim">
              {t('A few features go up here before they go live everywhere else. Here is what is waiting.')}
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-4">
            {SNEAK_PEEK_FEATURES.map((f) => (
              <li key={f.id}>
                <p className="display text-base">{t(f.name)}</p>
                <p className="mt-1 text-sm text-ink-dim">{t(f.teaser)}</p>
                {unlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFeature(f.id)
                      setPanelOpen(false)
                    }}
                    className="btn btn-ghost mt-2 !px-4 !py-1.5 !text-[11px]"
                  >
                    {t('Open')} →
                  </button>
                )}
              </li>
            ))}
          </ul>

          {!unlocked && (
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
                  placeholder={t('ECHO-••••-••••')}
                  className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
                />
                <button type="submit" className="btn btn-primary shrink-0 !px-4 !py-2.5 !text-[11px]">
                  {t('Unlock')}
                </button>
              </div>
              {wrong && <p className="mt-2 text-[12px] text-danger">{t('That code did not work.')}</p>}
            </form>
          )}
        </Modal>
      )}

      {unlocked && openFeature === 'chatbot' && <Chatbot onClose={() => setOpenFeature(null)} />}
    </>
  )
}

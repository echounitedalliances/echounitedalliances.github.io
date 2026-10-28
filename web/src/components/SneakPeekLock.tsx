import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../lib/i18n'
import { SNEAK_PEEK_FEATURES, useSneakPeek } from '../lib/sneakPeek'

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
 * The lock in the corner of every page, standing in front of whatever is in
 * SNEAK_PEEK_FEATURES (lib/sneakPeek.ts). Click it locked and all it shows
 * is a box for the code -- not what is behind it, so the feature list
 * itself stays part of the surprise. Get the code right once and this
 * browser can see where to find any of them, from then on, without asking
 * again.
 *
 * Mounted once in App.tsx, same as Welcome and AdvisoryBar, so it floats
 * over every route rather than belonging to any one page.
 */
export default function SneakPeekLock() {
  const t = useT()
  const { unlocked, unlock } = useSneakPeek()
  const [panelOpen, setPanelOpen] = useState(false)
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (unlock(code)) {
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
                    <p className="mt-1 text-sm text-cyan">{t(f.whereToFind)}</p>
                  </li>
                ))}
              </ul>
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
    </>
  )
}

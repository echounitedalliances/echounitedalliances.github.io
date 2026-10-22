import { useEffect, useRef, useState } from 'react'
import { LANGS, useI18n } from '../lib/i18n'

/**
 * The language picker: a small chip in the top bar showing the current
 * language's short name, opening to the six in their own names -- a reader
 * looking for Bangla is looking for "বাংলা", not for "Bengali".
 */
export default function LangMenu() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const here = LANGS.find((l) => l.code === lang) ?? LANGS[0]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={root} className="lang-menu">
      <button
        type="button"
        className="lang-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('Language')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M1.8 8h12.4M8 1.6c2 2.2 2 10.6 0 12.8M8 1.6c-2 2.2-2 10.6 0 12.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
        <span>{here.short}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {open && (
        <ul className="lang-list" role="listbox" aria-label={t('Language')}>
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                lang={l.code}
                className={l.code === lang ? 'is-on' : ''}
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
              >
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

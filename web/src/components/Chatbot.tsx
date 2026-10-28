import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { useT } from '../lib/i18n'
import { CHATBOT_CATEGORIES, CHATBOT_PRESETS } from '../data/chatbotPresets'

type Turn = { id: string; question: string; answer: string }

/**
 * The Echo Assistant: fifty fixed questions with fixed answers, picked from
 * chips rather than typed. Nothing here calls out to anything -- an answer
 * is just the preset's own text, looked up by id -- so it can never say
 * something about the alliance that was not written and checked ahead of
 * time. It is one of the features behind the Sneak Peek lock; see
 * lib/sneakPeek.ts for how that gate works.
 */
export default function Chatbot({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [category, setCategory] = useState<string>(CHATBOT_CATEGORIES[0])
  const [thread, setThread] = useState<Turn[]>([])
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [thread.length])

  const ask = (id: string) => {
    const preset = CHATBOT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setThread((prev) => [...prev, { id, question: preset.question, answer: preset.answer }])
  }

  const visible = CHATBOT_PRESETS.filter((p) => p.category === category)

  return (
    <Modal title={t('Echo Assistant')} onClose={onClose} wide>
      <p className="text-sm text-ink-dim">
        {t('Fifty preset questions, with answers written and checked ahead of time -- nothing here is generated. Pick one below.')}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {CHATBOT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`chip ${category === c ? 'chip-on' : ''}`}
          >
            {t(c)}
          </button>
        ))}
      </div>

      <div className="mt-3 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {visible.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => ask(p.id)}
            className="mono border border-edge-soft px-2.5 py-1.5 text-left text-[11.5px] text-ink-dim transition-colors hover:border-accent hover:text-ink"
          >
            {t(p.question)}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[42vh] overflow-y-auto border-t border-edge-soft pt-4">
        {thread.length === 0 ? (
          <p className="eyebrow text-ink-faint">{t('Nothing asked yet -- pick a question above.')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {thread.map((turn, i) => (
              <div key={`${turn.id}-${i}`}>
                <p className="mono text-[11px] uppercase tracking-[0.1em] text-cyan">{t(turn.question)}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{t(turn.answer)}</p>
              </div>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {thread.length > 0 && (
        <button
          type="button"
          onClick={() => setThread([])}
          className="mono mt-4 text-[11px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
        >
          {t('Clear chat')}
        </button>
      )}
    </Modal>
  )
}

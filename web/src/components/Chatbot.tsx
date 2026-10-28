import { useEffect, useRef, useState } from 'react'
import EchoMark from './EchoMark'
import { useT } from '../lib/i18n'
import { CHATBOT_CATEGORIES, CHATBOT_PRESETS } from '../data/chatbotPresets'

type Turn = { id: string; question: string; answer: string; time: string }

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** The wing, dark on a light disc, standing in for an avatar on every bot line. */
function BotAvatar() {
  return (
    <span className="chat-avatar" aria-hidden="true">
      <EchoMark height={11} color="#050505" />
    </span>
  )
}

/**
 * The Echo Assistant, as a proper chat window rather than a form: a
 * scrollable thread of bubbles, a bot avatar, and a composer -- except the
 * composer is chips, not a text box, because this is fifty fixed questions
 * with fixed answers, not a model. Picking a question appends it and its
 * answer to the thread as if typed and replied to; nothing here calls out
 * to anything.
 *
 * Anchored bottom-left by its caller (EchoAssistant), which also owns
 * whether this is mounted at all.
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
    setThread((prev) => [...prev, { id, question: preset.question, answer: preset.answer, time: now() }])
  }

  const visible = CHATBOT_PRESETS.filter((p) => p.category === category)

  return (
    <div role="dialog" aria-modal="false" aria-label={t('Echo Assistant')} className="chat-window">
      <div className="chat-header">
        <div className="flex items-center gap-2.5">
          <BotAvatar />
          <div>
            <p className="display text-[15px] leading-none">{t('Echo Assistant')}</p>
            <p className="mt-0.5 text-[11px] leading-none text-ink-faint">
              {t('Fixed answers, written and checked ahead of time.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close chat')}
          className="shrink-0 px-1.5 py-1 text-lg leading-none text-ink-faint transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="chat-body">
        <div className="chat-msg chat-msg-bot">
          <BotAvatar />
          <p className="chat-bubble-bot">
            {t('Hi! Pick a question below and I will answer right away.')}
          </p>
        </div>

        {thread.map((turn, i) => (
          <div key={`${turn.id}-${i}`} className="contents">
            <div className="chat-msg chat-msg-user">
              <p className="chat-bubble-user">{t(turn.question)}</p>
            </div>
            <div className="chat-msg chat-msg-bot">
              <BotAvatar />
              <div>
                <p className="chat-bubble-bot">{t(turn.answer)}</p>
                <p className="chat-time">{turn.time}</p>
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="chat-composer">
        <p className="eyebrow mb-1.5 text-ink-faint">{t('Topics')}</p>
        <div className="flex flex-wrap gap-1.5">
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
        <p className="eyebrow mb-1.5 mt-3 text-ink-faint">{t('Questions')}</p>
        <div className="flex max-h-28 flex-col gap-1.5 overflow-y-auto">
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
        {thread.length > 0 && (
          <button
            type="button"
            onClick={() => setThread([])}
            className="mono mt-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink"
          >
            {t('Clear chat')}
          </button>
        )}
      </div>
    </div>
  )
}

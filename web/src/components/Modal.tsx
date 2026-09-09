import { useEffect, useRef } from 'react'

/**
 * A small centred dialog, used for the two things on this site that have to
 * interrupt: the notice before we hand a traveller to a member's own website,
 * and the disruption advisory on the home page.
 *
 * It is deliberately not a <dialog>. showModal() puts the element in the top
 * layer, which sits above everything including the arrival animation, and it
 * brings a ::backdrop that does not take our theme tokens. A plain fixed
 * overlay is easier to reason about and styles like the rest of the site.
 *
 * What it does take care of, because every caller would otherwise get it
 * wrong: Escape closes, the backdrop closes, focus moves into the dialog on
 * open and returns to whatever opened it on close, and the page behind stops
 * scrolling while it is up.
 */
export default function Modal({
  title,
  onClose,
  children,
  labelledBy = 'modal-title',
  wide = false,
}: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  labelledBy?: string
  /** For long-form content: a news story needs a reading measure, a notice does not. */
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  /**
   * The current onClose, without it being an effect dependency.
   *
   * Every caller passes an inline arrow, so its identity changes on each
   * render of the parent. With onClose in the dependency list, the setup and
   * teardown below ran on EVERY render -- and the teardown moves focus back
   * to whatever opened the dialog. Typing one character into a field inside a
   * modal therefore re-rendered the parent, tore the effect down, and threw
   * focus out of the field: the box appeared to close itself after each
   * keystroke. The listener still needs the latest callback, so it reads it
   * from here instead.
   */
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Once, on open. Modal is always mounted conditionally, so mounting IS
  // opening and there is nothing else this should re-run for.
  useEffect(() => {
    opener.current = document.activeElement

    // Only claim focus if nothing inside has already taken it -- a form can
    // autoFocus its first field, and that should win over the container.
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      // Sending focus back matters for keyboard users: without it focus falls
      // to <body> and the next Tab starts from the top of the page.
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-[#0B0713]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        // Without this, a click that starts inside the dialog closes it.
        onClick={(e) => e.stopPropagation()}
        className={`panel w-full p-6 outline-none sm:p-7 ${wide ? 'max-w-2xl my-8' : 'max-w-lg'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={labelledBy} className="display text-xl leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 px-2 py-1 text-lg leading-none text-ink-faint transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

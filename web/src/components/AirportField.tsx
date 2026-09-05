import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaceRow } from '../lib/types'

/**
 * The airport box, the way a booking site's actually behaves.
 *
 * What was here before took a query, uppercased whatever you typed, and
 * offered a flat list of seven airports. Three things were wrong with that.
 * "london" came out as "LONDON" while you typed it. A city with several
 * airports could have some of them pushed off the end of the list by an
 * unrelated match. And there was no keyboard at all — no arrows, no Enter, no
 * Escape — so the list could only be used with a mouse.
 *
 * It now asks search_places(), which ranks CITIES and returns all of each
 * one's airports, so London arrives as London with Heathrow, Gatwick and City
 * underneath it and stays that way however many other places match. Typing a
 * code works too, and brings the rest of that city with it.
 *
 * The value handed out is always a three-letter IATA code, because that is
 * what search_itineraries() takes; the label in the box is for the person.
 */

type Option =
  | { kind: 'airport'; row: PlaceRow; startsPlace: boolean }
  | { kind: 'header'; key: string; label: string; startsPlace: boolean }

/** "London Heathrow (LHR)" — what the box reads once something is chosen. */
function labelFor(a: PlaceRow) {
  const name = a.airport_name || a.city_name || a.iata_code
  return `${name} (${a.iata_code})`
}

export default function AirportField({
  label,
  value,
  onChange,
  placeholder,
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  id: string
}) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PlaceRow[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // Typing over a chosen airport clears the code, which comes back through the
  // effect below as value='' and used to wipe the keystroke that caused it.
  // This says "that change was mine, leave the text alone".
  const selfEdit = useRef(false)
  const listId = `${id}-list`

  // The parent owns the code. If it clears or changes it from outside (the
  // swap button, a URL), the box has to follow.
  useEffect(() => {
    if (selfEdit.current) {
      selfEdit.current = false
      return
    }
    if (!value) {
      setText('')
      return
    }
    setText((t) => (t.toUpperCase().includes(value.toUpperCase()) ? t : value))
  }, [value])

  useEffect(() => {
    const needle = text.trim()
    if (needle.length < 2 || !touched) {
      setRows([])
      setLoading(false)
      return
    }
    let dead = false
    setLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_places', { p_query: needle, p_limit: 6 })
      if (dead) return
      setRows((data as PlaceRow[]) ?? [])
      setActive(0)
      setLoading(false)
    }, 170)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [text, touched])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  /**
   * Headers interleaved with airports, in the order the database ranked them.
   *
   * A city gets a heading only when it has more than one airport — a heading
   * over a single line is noise. But then a lone airport listed straight after
   * a group reads as part of it: "new york" returns JFK and LGA under one
   * heading and then Newburgh's SWF, which looked like a third New York
   * airport. So every place after the first also gets a rule above it.
   */
  const options = useMemo<Option[]>(() => {
    const out: Option[] = []
    let lastPlace = ''
    for (const r of rows) {
      const starts = r.place_key !== lastPlace
      if (starts) {
        lastPlace = r.place_key
        if (r.place_airports > 1) {
          out.push({
            kind: 'header',
            key: r.place_key,
            label: `${r.place_name} — all airports`,
            startsPlace: true,
          })
          out.push({ kind: 'airport', row: r, startsPlace: false })
          continue
        }
      }
      out.push({ kind: 'airport', row: r, startsPlace: starts })
    }
    return out
  }, [rows])

  const pickable = useMemo(
    () => options.flatMap((o) => (o.kind === 'airport' ? [o.row] : [])),
    [options],
  )

  const choose = (a: PlaceRow) => {
    onChange(a.iata_code)
    setText(labelFor(a))
    setOpen(false)
    setTouched(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (pickable.length === 0) return
      setActive((i) => {
        const n = pickable.length
        return e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n
      })
      return
    }
    if (e.key === 'Enter') {
      if (open && pickable[active]) {
        e.preventDefault()
        choose(pickable[active])
        return
      }
      // Typed a bare code and hit Enter without ever opening the list.
      const exact = pickable.find((r) => r.iata_code === text.trim().toUpperCase())
      if (exact) {
        e.preventDefault()
        choose(exact)
      }
    }
  }

  const clear = () => {
    onChange('')
    setText('')
    setRows([])
    setTouched(false)
    input.current?.focus()
  }

  const showEmpty = touched && !loading && text.trim().length >= 2 && options.length === 0

  return (
    <div className="relative flex-1" ref={box}>
      <label htmlFor={id} className="eyebrow mb-1.5 block text-ink-faint">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setTouched(true)
            setOpen(true)
            // The code is only real once an airport is chosen; anything typed
            // over the top invalidates it rather than half-matching.
            if (value) {
              selfEdit.current = true
              onChange('')
            }
          }}
          onFocus={(e) => {
            setOpen(true)
            e.target.select()
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={60}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && pickable[active] ? `${id}-opt-${pickable[active].iata_code}` : undefined
          }
          className={`w-full border border-edge bg-ground-2 py-2.5 pl-3 text-ink outline-none placeholder:text-ink-faint focus:border-accent ${
            value ? 'pr-16 text-base' : 'pr-3 text-base'
          }`}
        />
        {value && (
          <>
            <span className="mono pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-[13px] text-cyan">
              {value}
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-ink-faint hover:text-ink"
            >
              ×
            </button>
          </>
        )}
      </div>

      {open && (options.length > 0 || showEmpty) && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="panel absolute z-30 mt-1 max-h-80 w-full overflow-auto py-1"
        >
          {showEmpty && (
            <li className="px-3 py-3 text-sm text-ink-faint">
              No airport in the alliance matches “{text.trim()}”.
            </li>
          )}
          {options.map((o, i) =>
            o.kind === 'header' ? (
              <li
                key={`h-${o.key}`}
                role="presentation"
                className={`mono px-3 pb-1 pt-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint ${
                  i > 0 ? 'mt-1 border-t border-edge-soft' : ''
                }`}
              >
                {o.label}
              </li>
            ) : (
              <li
                key={o.row.iata_code}
                className={o.startsPlace && i > 0 ? 'mt-1 border-t border-edge-soft' : ''}
              >
                <button
                  id={`${id}-opt-${o.row.iata_code}`}
                  type="button"
                  role="option"
                  aria-selected={pickable[active]?.iata_code === o.row.iata_code}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() =>
                    setActive(pickable.findIndex((r) => r.iata_code === o.row.iata_code))
                  }
                  onClick={() => choose(o.row)}
                  className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                    pickable[active]?.iata_code === o.row.iata_code
                      ? 'bg-surface-2'
                      : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="mono w-9 shrink-0 text-cyan">{o.row.iata_code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {o.row.airport_name ?? o.row.city_name ?? '—'}
                    </span>
                    {o.row.city_name && o.row.city_name !== o.row.airport_name && (
                      <span className="block truncate text-[11px] text-ink-faint">
                        {o.row.city_name}
                      </span>
                    )}
                  </span>
                  <span className="mono shrink-0 text-[11px] text-ink-faint">
                    {o.row.country_code}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { isConfigured, supabase } from '../lib/supabase'
import type { CountryCount } from '../lib/types'

/**
 * The carrier directory's country filter.
 *
 * It was a row of code chips carrying counts taken from the page of results
 * already on screen — so Vietnam read "VN 1" and then returned sixteen, and a
 * country with no carrier in the first sixty had no chip at all and could not
 * be reached. The list was capped at 24 on top of that.
 *
 * Now it is a box you type into, over the real counts from
 * airline_countries(). Eighty-five countries is small enough to fetch once and
 * filter here, so typing costs nothing; the list narrows with whatever else is
 * filtering, because "which countries can I pick" should mean "given what I
 * have already chosen".
 *
 * Matching is on the name AND the code, because people reach for both: "viet"
 * finds Vietnam, and so does "VN".
 */
export default function CountryField({
  value,
  onChange,
  query,
  division,
  id = 'country-filter',
}: {
  value: string
  onChange: (code: string) => void
  /** The filters already applied, so the menu offers what is actually there. */
  query: string
  division: string
  id?: string
}) {
  const [all, setAll] = useState<CountryCount[]>([])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = `${id}-list`

  useEffect(() => {
    if (!isConfigured) return
    let dead = false
    void (async () => {
      const { data } = await supabase.rpc('airline_countries', {
        p_query: query || null,
        p_division: division || null,
      })
      if (!dead) setAll((data as CountryCount[]) ?? [])
    })()
    return () => {
      dead = true
    }
  }, [query, division])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const selected = all.find((c) => c.country_code === value)

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (c) =>
        c.country_name.toLowerCase().includes(q) || c.country_code.toLowerCase().includes(q),
    )
  }, [all, text])

  const choose = (c: CountryCount) => {
    onChange(c.country_code)
    setText('')
    setOpen(false)
    input.current?.blur()
  }

  const clear = () => {
    onChange('')
    setText('')
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (matches.length === 0) return
      setActive((i) => {
        const n = matches.length
        return e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n
      })
      return
    }
    if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault()
      choose(matches[active])
    }
  }

  // What the box shows when it is not being typed in.
  const display = selected
    ? `${selected.country_name} (${selected.country_code})`
    : value
      ? value
      : ''

  return (
    <div className="relative w-full sm:max-w-[320px]" ref={box}>
      <label htmlFor={id} className="eyebrow mb-1.5 block text-ink-faint">
        Country
      </label>
      <div className="relative">
        <input
          id={id}
          ref={input}
          value={open ? text : display}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setText('')
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          placeholder={all.length ? `Any of ${all.length} countries` : 'Any country'}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[active] ? `${id}-opt-${matches[active].country_code}` : undefined
          }
          className={`w-full border border-edge bg-ground-2 py-2 pl-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent ${
            value ? 'pr-9' : 'pr-8'
          }`}
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear the country filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-ink-faint hover:text-ink"
          >
            ×
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint"
          >
            ▾
          </span>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="panel absolute z-30 mt-1 max-h-72 w-full overflow-auto py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-faint">
              No carrier is registered in a country matching “{text.trim()}”.
            </li>
          ) : (
            matches.map((c) => (
              <li key={c.country_code}>
                <button
                  id={`${id}-opt-${c.country_code}`}
                  type="button"
                  role="option"
                  aria-selected={c.country_code === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(matches.indexOf(c))}
                  onClick={() => choose(c)}
                  className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                    matches[active]?.country_code === c.country_code
                      ? 'bg-surface-2'
                      : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="mono w-7 shrink-0 text-cyan">{c.country_code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {c.country_name}
                  </span>
                  <span className="mono shrink-0 text-[11px] text-ink-faint">{c.carriers}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

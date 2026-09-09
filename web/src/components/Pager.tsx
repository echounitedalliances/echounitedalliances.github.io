import { useEffect, useMemo, useState } from 'react'

/**
 * Paging for the long tables.
 *
 * Several of these run to hundreds of rows — a carrier's timetable is capped
 * at a thousand, an airport's carrier list at four hundred — and rendering
 * the lot produced pages you scroll past rather than read. Twenty at a time,
 * with the size and the page under the reader's control.
 *
 * The page resets whenever the rows themselves change, which is the case that
 * bites: filter a timetable down to one route while sitting on page nine and
 * you would otherwise be looking at an empty table with no clue why.
 */
const SIZES = [20, 50, 100]

export function usePaged<T>(rows: T[], initialSize = SIZES[0]) {
  const [size, setSize] = useState(initialSize)
  const [page, setPage] = useState(1)

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / size))

  // Rows changed underneath us, or the size did: go back to the start rather
  // than leave the reader on a page that no longer exists.
  useEffect(() => {
    setPage(1)
  }, [total, size])

  const clamped = Math.min(page, pageCount)
  const from = total === 0 ? 0 : (clamped - 1) * size + 1
  const to = Math.min(clamped * size, total)

  const slice = useMemo(
    () => rows.slice((clamped - 1) * size, clamped * size),
    [rows, clamped, size],
  )

  return { slice, page: clamped, setPage, size, setSize, total, pageCount, from, to }
}

export type Paged = Omit<ReturnType<typeof usePaged<unknown>>, 'slice'>

/**
 * Renders nothing at all when everything already fits on one page — a control
 * that only ever says "1 of 1" is noise on the many small tables that share
 * this component with the few big ones.
 */
export default function Pager({
  paged,
  label = 'rows',
}: {
  paged: Paged
  /** What the rows are, for the count: "flights", "carriers", "routes". */
  label?: string
}) {
  const { page, setPage, size, setSize, total, pageCount, from, to } = paged
  if (total <= SIZES[0]) return null

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="mono text-[11px] text-ink-faint">
        {from}–{to} of {total} {label}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="mono flex items-center gap-2 text-[11px] text-ink-faint">
          Show
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="border border-edge bg-ground-2 px-2 py-1 text-ink outline-none focus:border-accent"
          >
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="mono border border-edge px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-edge disabled:hover:text-ink-dim"
          >
            ←
          </button>
          <span className="mono px-2 text-[11px] text-ink-faint">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="mono border border-edge px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-edge disabled:hover:text-ink-dim"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

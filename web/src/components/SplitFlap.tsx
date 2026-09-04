import { useEffect, useRef, useState } from 'react'

/**
 * A split-flap board, the way an airport actually announces itself.
 *
 * Deliberately not WebGL. The globe this replaces held a render loop alive for
 * the life of the page and could not be made to behave on a laptop; this is
 * plain DOM and CSS, animates only while characters are settling, and then
 * stops completely. A settled board costs nothing at all.
 *
 * Each cell steps through the glyph alphabet toward its target rather than
 * jumping, which is what makes it read as mechanical instead of as a text
 * scramble. Cells further right start later, so the row resolves left to right
 * like the real thing.
 */

const GLYPHS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/.'
const STEP_MS = 45

function glyphIndex(ch: string) {
  const i = GLYPHS.indexOf(ch.toUpperCase())
  return i === -1 ? 0 : i
}

function Cell({ target, delay }: { target: string; delay: number }) {
  const [idx, setIdx] = useState(0)
  const settled = useRef(false)

  useEffect(() => {
    const want = glyphIndex(target)
    settled.current = false
    let cur = Math.max(0, want - 6 - Math.floor(Math.random() * 6))
    setIdx(cur)

    let timer: number
    const start = window.setTimeout(function step() {
      if (cur === want) {
        settled.current = true
        return
      }
      cur = (cur + 1) % GLYPHS.length
      setIdx(cur)
      timer = window.setTimeout(step, STEP_MS)
    }, delay)

    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timer)
    }
  }, [target, delay])

  const ch = GLYPHS[idx]
  return (
    <span className="flap" aria-hidden="true">
      {ch === ' ' ? ' ' : ch}
    </span>
  )
}

/** One field of a board row: a run of flapping character cells. */
export function FlapText({
  value,
  width,
  delayBase = 0,
  className = '',
}: {
  value: string
  width: number
  delayBase?: number
  className?: string
}) {
  const padded = value.toUpperCase().slice(0, width).padEnd(width, ' ')
  return (
    <span className={`flap-run ${className}`} role="text" aria-label={value}>
      {Array.from(padded).map((ch, i) => (
        <Cell key={i} target={ch} delay={delayBase + i * 55} />
      ))}
    </span>
  )
}

export type BoardRow = {
  time: string
  flight: string
  destination: string
  carrier: string
  status: string
  accent?: string
}

/**
 * The board itself. Rows are handed in already formatted; this component is
 * only responsible for how they land.
 */
export default function SplitFlap({
  rows,
  columns = { time: 5, flight: 7, destination: 16, carrier: 10, status: 9 },
}: {
  rows: BoardRow[]
  columns?: { time: number; flight: number; destination: number; carrier: number; status: number }
}) {
  return (
    <div className="board" role="table" aria-label="Departures">
      <div className="board-head" role="row">
        <span style={{ width: `${columns.time}ch` }}>Time</span>
        <span style={{ width: `${columns.flight}ch` }}>Flight</span>
        <span style={{ width: `${columns.destination}ch` }}>Destination</span>
        <span style={{ width: `${columns.carrier}ch` }}>Carrier</span>
        <span style={{ width: `${columns.status}ch` }}>Status</span>
      </div>

      {rows.map((r, i) => (
        <div className="board-row" role="row" key={`${r.flight}-${i}`}>
          <FlapText value={r.time} width={columns.time} delayBase={i * 70} />
          <FlapText value={r.flight} width={columns.flight} delayBase={i * 70 + 120} />
          <FlapText value={r.destination} width={columns.destination} delayBase={i * 70 + 240} />
          <FlapText value={r.carrier} width={columns.carrier} delayBase={i * 70 + 420} />
          <FlapText
            value={r.status}
            width={columns.status}
            delayBase={i * 70 + 560}
            className={r.status.toLowerCase() === 'boarding' ? 'flap-live' : ''}
          />
        </div>
      ))}
    </div>
  )
}

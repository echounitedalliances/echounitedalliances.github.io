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

// Punctuation is in here because airline names have punctuation in them.
// Adding glyphs is free: a cell starts a fixed number of steps short of its
// target, so a longer alphabet does not make anything take longer to settle.
const GLYPHS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/.'&,()+"
const STEP_MS = 45

/**
 * What this board can actually show.
 *
 * Accents are folded onto their base letters, so Malmo and Munchen read
 * properly rather than losing a character. A name in a script the board has no
 * flaps for at all -- CJK, Cyrillic, Arabic -- would come out as a row of
 * blanks, so it falls back to the code instead. Real boards are Latin-only for
 * the same mechanical reason.
 */
export function toFlap(value: string | null | undefined, fallback: string) {
  const folded = (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
  if (!folded) return fallback
  const printable = Array.from(folded).filter((ch) => GLYPHS.includes(ch)).length
  return printable >= folded.length * 0.8 ? folded : fallback
}

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
 * A heading exactly as wide as the run of flaps beneath it.
 *
 * flexShrink matters: the flap runs cannot shrink, because their cells have a
 * min-width, but the headings can -- so on a narrow screen, where the board
 * scrolls sideways, the headings collapsed to the width of their own text and
 * stopped lining up with the columns.
 */
function runWidth(cells: number) {
  return { width: `calc(${cells} * (var(--flap-w) + 2px) - 2px)`, flexShrink: 0 }
}

/**
 * The board itself. Rows are handed in already formatted; this component is
 * only responsible for how they land.
 */
export default function SplitFlap({
  rows,
  // Sized from the data rather than by eye: the longest flight designator in
  // the alliance is 12 characters, 99% of airline names fit in 18 and 99% of
  // city names in 26. Seven characters of flight number was cutting "SVPX1
  // 2456" down to "SVPX1 2".
  columns = { time: 5, flight: 12, destination: 24, carrier: 18, status: 9 },
}: {
  rows: BoardRow[]
  columns?: { time: number; flight: number; destination: number; carrier: number; status: number }
}) {
  return (
    <div className="board" role="table" aria-label="Departures">
      <div className="board-head" role="row">
        <span style={runWidth(columns.time)}>Time</span>
        <span style={runWidth(columns.flight)}>Flight</span>
        <span style={runWidth(columns.destination)}>Destination</span>
        <span style={runWidth(columns.carrier)}>Carrier</span>
        <span style={runWidth(columns.status)}>Status</span>
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

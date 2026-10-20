import { useState } from 'react'
import { Link } from 'react-router-dom'
import EchoMark from './EchoMark'
import type { Division } from '../lib/types'
import { accentOf, num } from '../lib/format'
import { DIVISION_NOTES } from '../lib/site'
import { LEADERS } from '../lib/alliance'

/**
 * A division as a black tile that floods with its own colour, a pixel at a
 * time, when pointed at or focused. The same tile on the home page and on
 * /divisions; `detailed` adds the four headline figures and who leads it
 * (from LEADERS, the same list as the About page's board).
 *
 * The 60 cells light in a random order chosen once per tile, so each
 * division fills differently and keeps filling the same way.
 */
export default function DivisionTile({
  d,
  detailed = false,
  style,
  className = '',
}: {
  d: Division
  detailed?: boolean
  style?: React.CSSProperties
  className?: string
}) {
  const accent = accentOf(d)
  const note = DIVISION_NOTES[d.division_code]
  const leaders = LEADERS.filter((l) => l.division_code === d.division_code)
  const [delays] = useState(() => Array.from({ length: 60 }, () => Math.round(Math.random() * 260)))

  return (
    <Link
      to={`/d/${d.division_code}`}
      className={`div-tile ${detailed ? 'div-tile-detailed' : ''} ${className}`}
      style={{ ['--c' as string]: accent, ...style }}
    >
      <span className="div-px" aria-hidden="true">
        {delays.map((ms, i) => (
          <i key={i} style={{ transitionDelay: `${ms}ms` }} />
        ))}
      </span>
      <span className="div-top">
        <EchoMark height={22} color="var(--tile-ink)" />
        {note && <span className="div-tag">{note}</span>}
      </span>
      {detailed ? (
        <span>
          <span className="div-name">{d.division_name}</span>
          {leaders.length > 0 && (
            <span className="div-lead">
              <small>Led by</small>{' '}
              {leaders.map((l, i) => (
                <span key={l.discord}>
                  {i > 0 && ' & '}
                  <b>{l.name}</b> <span className="div-handle">@{l.discord}</span>
                </span>
              ))}
            </span>
          )}
          <span className="div-figs">
            {(
              [
                ['Carriers', d.carriers],
                ['Aircraft', d.aircraft],
                ['Routes', d.routes],
                ['Airports', d.destinations],
              ] as const
            ).map(([label, v]) => (
              <span key={label}>
                <b>{num(Number(v))}</b>
                <small>{label}</small>
              </span>
            ))}
          </span>
        </span>
      ) : (
        <span>
          <span className="div-name">{d.division_name}</span>
          <span className="div-meta">
            <span>{num(d.carriers)} airlines</span>
            <span>{num(d.routes)} routes</span>
          </span>
        </span>
      )}
    </Link>
  )
}

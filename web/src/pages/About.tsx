import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isConfigured, supabase } from '../lib/supabase'
import type { Division } from '../lib/types'
import { LEADERS, SLOGAN } from '../lib/alliance'
import { accentOf, num } from '../lib/format'
import { Loading, NotConfigured } from '../components/ui'
import EchoMark from '../components/EchoMark'

/**
 * Who runs Echo.
 *
 * The roster is in lib/alliance.ts; the division names, ordering and accent
 * colours come from the database, so renaming or reordering a division moves
 * this page too without anyone remembering to.
 *
 * There is no origin story here yet, deliberately. Rather than fill the space
 * with something invented, the page carries what is actually known — the
 * slogan, the eight leaders, and the size of the thing they run.
 */
export default function About() {
  const [divisions, setDivisions] = useState<Division[] | null>(null)

  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setDivisions((data as Division[]) ?? []))
  }, [])

  if (!isConfigured) return <NotConfigured />

  const byCode = new Map((divisions ?? []).map((d) => [d.division_code, d]))
  // Division order is group policy and lives in sort_order, so the board is
  // listed the way the divisions are listed everywhere else.
  const board = (divisions ?? [])
    .map((d) => ({ division: d, leader: LEADERS.find((l) => l.division_code === d.division_code) }))
    .filter((row): row is { division: Division; leader: NonNullable<typeof row.leader> } =>
      Boolean(row.leader),
    )

  const totals = (divisions ?? []).reduce(
    (a, d) => ({
      carriers: a.carriers + Number(d.carriers),
      aircraft: a.aircraft + Number(d.aircraft),
    }),
    { carriers: 0, aircraft: 0 },
  )

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">About</p>
      <h1 className="display mt-3 text-[clamp(34px,6vw,72px)]">{SLOGAN}</h1>
      {/* Two sentences, and the figures are a third. Splicing them into the
          middle of a sentence left it reading "...as one network. the
          excellence in the name" for as long as the query was in flight. */}
      <p className="mt-5 max-w-[64ch] text-lg text-ink-dim">
        Echo United Alliances is a group of eight alliances in The Airline
        Simulator, each running its own roster and its own leadership, flying as
        one network. The excellence in the name is not one airline's — it is all
        of them, and the people who keep them flying together.
      </p>
      {divisions !== null && (
        <p className="mono mt-4 text-[12px] uppercase tracking-[0.14em] text-ink-faint">
          {num(totals.carriers)} carriers · {num(totals.aircraft)} aircraft · 8 divisions
        </p>
      )}

      <section className="mt-14">
        <h2 className="display text-2xl">The board</h2>
        <p className="mt-1 max-w-[62ch] text-ink-faint">
          Echo's board is its eight division leaders — the people who run each
          alliance also run the group. They are listed here by the name and
          handle they go by on Discord, which is where the group actually
          meets; several of them own more than one carrier.
        </p>

        {divisions === null ? (
          <Loading />
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {board.map(({ division, leader }, i) => {
              const accent = accentOf(division)
              return (
                <article
                  key={leader.division_code}
                  className="panel rise flex flex-col justify-between gap-4 p-5"
                  style={{ animationDelay: `${i * 40}ms`, ['--card-accent' as string]: accent }}
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <EchoMark height={15} color={accent} />
                      <Link
                        to={`/d/${division.division_code}`}
                        className="mono text-[10px] uppercase tracking-[0.16em] transition-colors hover:text-ink"
                        style={{ color: accent }}
                      >
                        {division.division_name}
                      </Link>
                    </div>
                    <p className="display mt-3 text-2xl text-ink">{leader.name}</p>
                    <p className="mono mt-1 text-[12px] text-ink-faint">@{leader.discord}</p>
                  </div>
                  <p className="mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    {num(division.carriers)} carriers
                  </p>
                </article>
              )
            })}
          </div>
        )}

        {/* A leader named for a division the database does not have, or a
            division with nobody listed, would otherwise vanish silently. */}
        {divisions !== null &&
          LEADERS.filter((l) => !byCode.has(l.division_code)).map((l) => (
            <p key={l.discord} className="mono mt-3 text-[11px] text-danger">
              {l.name} is listed for “{l.division_code}”, which is not a division on record.
            </p>
          ))}
        {divisions !== null && board.length < divisions.length && (
          <p className="mono mt-3 text-[11px] text-ink-faint">
            {divisions.length - board.length} division(s) have no leader listed in
            web/src/lib/alliance.ts.
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="display text-2xl">Joining</h2>
        <p className="mt-2 max-w-[62ch] text-ink-dim">
          Every division takes applications in two places — in the game, and on
          the Echo Discord — and every one of them is read by hand.{' '}
          <Link to="/divisions" className="text-cyan">
            Meet the divisions
          </Link>{' '}
          to pick one, or see{' '}
          <Link to="/activities" className="text-cyan">
            what the group does together
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isConfigured, supabase } from '../lib/supabase'
import type { Division } from '../lib/types'
import { capitalise, spell } from '../lib/format'
import { useDivisionCount } from '../lib/carriers'
import { Loading, NotConfigured } from '../components/ui'
import DivisionTile from '../components/DivisionTile'
import { useT } from '../lib/i18n'

/**
 * Every division, three across: nine of them since Eos opened on 2 October
 * 2026, which squares the grid that eight used to fill four across.
 *
 * They used to be full-width rows, which gave one of them room for a long
 * welcome message and the other seven a one-line summary — so the page read as
 * a list with an odd first entry rather than as a group of equals. Every card
 * now carries the same summary of what its division actually flies, and the
 * order is group policy, held in sort_order by 16_division_policy.sql.
 *
 * Compact since 19 October 2026: the cards were square, which left most of
 * each one empty, and a sentence above the figures repeated the figures. Since
 * the facelift they are the home page's tiles -- black until pointed at, then
 * flooded with the division's colour a pixel at a time -- with the four
 * figures in a row.
 */
export default function Divisions() {
  const [rows, setRows] = useState<Division[] | null>(null)
  const divisionCount = useDivisionCount()
  const t = useT()

  useEffect(() => {
    if (!isConfigured) return
    void supabase
      .from('v_division_summary')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setRows((data as Division[]) ?? []))
  }, [])

  if (!isConfigured) return <NotConfigured />

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">{t('The group')}</p>
      <h1 className="display mt-3 text-[clamp(36px,5vw,58px)]">
        {capitalise(t('{n} divisions', { n: spell(rows?.length || divisionCount) }))}
      </h1>
      <p className="mt-4 max-w-[64ch] text-lg text-ink-dim">
        {t('Echo United Alliances is a multi-alliance group: each division runs its own roster and its own leadership, and members fly under one network.')}
      </p>

      {rows === null ? (
        <Loading />
      ) : (
        <div className="div-grid">
          {rows.map((d) => (
            <DivisionTile key={d.division_code} d={d} detailed />
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import Modal from './Modal'
import type { MemberSiteRow } from '../lib/types'

/**
 * The handoff to a member's own website.
 *
 * Several members have built sites for their airlines, and a few built one
 * site for a whole group of them. Where one exists it takes the place of the
 * "Contact airline for booking" placeholder on the carrier's page.
 *
 * It does not link straight out, and the interstitial is the point of the
 * component. These sites are hobby projects at very different stages: some
 * read the same live schedule this site does, some publish four sample routes
 * out of eighty-one, and some generate their results on every query. A fare
 * quoted by the last kind is not a fare. So before anyone leaves we say what
 * they are walking into, in one sentence written for that specific site, and
 * make the alliance page the stated fallback.
 *
 * The grade is set by hand and dated, because it was established by hand:
 * someone compared that site's output against our data on that day. It is not
 * a live check and should not read like one.
 */

/** What each grade means to somebody about to click through. */
const GRADE: Record<string, { label: string; tone: string; dot: string }> = {
  live: {
    label: 'Matches our data',
    tone: 'text-good',
    dot: 'var(--color-good)',
  },
  sample: {
    label: 'Only part of the network',
    tone: 'text-warn',
    dot: 'var(--color-warn)',
  },
  illustrative: {
    label: 'Results are illustrative',
    tone: 'text-danger',
    dot: 'var(--color-danger)',
  },
  showcase: {
    label: 'A design, not a booking site',
    tone: 'text-warn',
    dot: 'var(--color-warn)',
  },
  unverified: {
    label: 'We could not check it',
    tone: 'text-ink-faint',
    dot: 'var(--color-ink-faint)',
  },
}

/**
 * "A", "A and B", "A, B and C" -- a plain join reads as "A and B and C" once
 * a group site carries more than two carriers, which the Starliner one does.
 */
function list(xs: string[]): string {
  if (xs.length < 2) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

const KIND: Record<string, string> = {
  booking: 'has its own booking search',
  brochure: 'is an information site',
  aggregator: 'searches several airlines at once',
  account: 'asks you to sign in first',
}

export default function MemberSite({
  site,
  accent,
}: {
  site: MemberSiteRow
  accent: string
}) {
  const [asking, setAsking] = useState(false)
  const grade = GRADE[site.data_grade] ?? GRADE.unverified
  const kind = KIND[site.kind] ?? ''
  const also = site.also_serves ?? []

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mono px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90"
        style={{ background: accent }}
      >
        Visit {site.site_name} ↗
      </button>

      {asking && (
        <Modal title={`Before you go to ${site.site_name}`} onClose={() => setAsking(false)}>
          <p className="mb-4 text-sm leading-relaxed text-ink-dim">
            Not all member websites may be complete, and the most accurate schedule and
            fare information remains the alliance webpage.
          </p>

          <div className="border-l-2 pl-4" style={{ borderColor: grade.dot }}>
            <p className={`eyebrow mb-1.5 ${grade.tone}`}>{grade.label}</p>
            <p className="text-sm leading-relaxed text-ink">{site.data_note}</p>
            <p className="mt-2 text-[12px] text-ink-faint">
              {site.site_name} {kind}. Checked against our data on{' '}
              {new Date(site.checked_on).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              .
            </p>
          </div>

          {also.length > 0 && (
            <p className="mt-4 text-[12px] text-ink-faint">
              The same site also sells {list(also)}.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAsking(false)}
              className="mono px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713]"
              style={{ background: accent }}
            >
              Continue to {site.site_name} ↗
            </a>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
            >
              Stay here
            </button>
          </div>

          {site.alt_url && site.alt_label && (
            <p className="mt-4 text-[12px] text-ink-faint">
              {site.alt_label}:{' '}
              <a
                href={site.alt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan underline underline-offset-2"
              >
                {site.alt_url.replace(/^https:\/\//, '').replace(/\/$/, '')}
              </a>
            </p>
          )}
        </Modal>
      )}
    </>
  )
}

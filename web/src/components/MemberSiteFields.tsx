import type { ReactNode } from 'react'
import { GRADE, KIND, NoticeBody } from './MemberSite'
import { supabase } from '../lib/supabase'
import type { AdminMemberSite, MemberSiteRow } from '../lib/types'

/**
 * One member website's details, and the notice they add up to.
 *
 * Used in two places: on a carrier's page, where an admin chooses which
 * website that carrier offers, and in the list of every website on the
 * account page. The notice a traveller reads before leaving is assembled from
 * all of these fields, but the sentence written for this one site -- the
 * embedding text -- is data_note, and it is the field that matters most.
 *
 * The preview underneath is the real notice component fed the draft, so the
 * admin approves exactly what a traveller will read.
 *
 * The server checks every rule again (admin_save_member_site). The limits
 * here only stop the box before the server has to say no.
 */

export type SiteDraft = {
  /** Null for a website that does not exist yet. */
  site_slug: string | null
  site_name: string
  url: string
  kind: MemberSiteRow['kind']
  data_grade: MemberSiteRow['data_grade']
  data_note: string
  checked_on: string
  alt_url: string
  alt_label: string
}

/**
 * A carrier as a person would name it. Trimmed: 55 scraped names carry a
 * stray space, which otherwise lands before the full stop -- "Vaultera ."
 */
export const carrierLabel = (c: { airline_name: string | null; carrier_code: string }) =>
  c.airline_name?.trim() || c.carrier_code

/** Today as the server sees it: current_date on Supabase is UTC. */
export const todayUtc = () => new Date().toISOString().slice(0, 10)

export function blankDraft(): SiteDraft {
  return {
    site_slug: null,
    site_name: '',
    url: 'https://',
    kind: 'booking',
    // Nobody has compared it against our data yet, so it starts out saying so.
    data_grade: 'unverified',
    data_note: '',
    checked_on: todayUtc(),
    alt_url: '',
    alt_label: '',
  }
}

export function draftOf(s: AdminMemberSite): SiteDraft {
  return {
    site_slug: s.site_slug,
    site_name: s.site_name,
    url: s.url,
    kind: s.kind,
    data_grade: s.data_grade,
    data_note: s.data_note,
    checked_on: s.checked_on,
    alt_url: s.alt_url ?? '',
    alt_label: s.alt_label ?? '',
  }
}

/** True when saving would change nothing. */
export function sameDraft(a: SiteDraft, b: SiteDraft): boolean {
  const keys: (keyof SiteDraft)[] = [
    'site_slug', 'site_name', 'url', 'kind', 'data_grade',
    'data_note', 'checked_on', 'alt_url', 'alt_label',
  ]
  return keys.every((k) => (a[k] ?? '').trim() === (b[k] ?? '').trim())
}

/** Creates the website when the draft has no slug. Returns the slug either way. */
export async function saveDraft(d: SiteDraft): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_member_site', {
    p_site_slug: d.site_slug,
    p_site_name: d.site_name.trim(),
    p_url: d.url.trim(),
    p_kind: d.kind,
    p_data_grade: d.data_grade,
    p_data_note: d.data_note.trim(),
    p_alt_url: d.alt_url.trim() || null,
    p_alt_label: d.alt_label.trim() || null,
    p_checked_on: d.checked_on || null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

/** What each grade means to the admin choosing it. The traveller sees GRADE's label. */
const GRADE_HELP: Record<SiteDraft['data_grade'], string> = {
  live: 'schedules and fares trace to the live game data',
  sample: 'real, but only a small slice of the network is on it',
  illustrative: 'results are generated, so times and fares are decoration',
  showcase: 'a design rather than a booking site',
  unverified: 'sign-in required or not yet compared, so unchecked',
}

const GRADES: SiteDraft['data_grade'][] = ['live', 'sample', 'illustrative', 'showcase', 'unverified']
const KINDS: SiteDraft['kind'][] = ['booking', 'brochure', 'aggregator', 'account']

const input =
  'w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent'

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div>
      <label className="eyebrow mb-1.5 block text-ink-faint" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  )
}

export default function MemberSiteFields({
  draft,
  onChange,
  alsoServes,
  accent,
  idPrefix,
}: {
  draft: SiteDraft
  onChange: (next: SiteDraft) => void
  /** The carriers the notice will name as sold by the same site. */
  alsoServes: string[]
  accent: string
  /** Keeps label/input ids unique when two editors could share a page. */
  idPrefix: string
}) {
  const set = (patch: Partial<SiteDraft>) => onChange({ ...draft, ...patch })
  const id = (name: string) => `${idPrefix}-${name}`
  const name = draft.site_name.trim() || 'this website'

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('name')} label="Website name">
          <input
            id={id('name')}
            value={draft.site_name}
            maxLength={80}
            onChange={(e) => set({ site_name: e.target.value })}
            placeholder="What the button says: Visit …"
            className={`mono ${input}`}
          />
        </Field>
        <Field id={id('url')} label="Address">
          <input
            id={id('url')}
            value={draft.url}
            maxLength={500}
            inputMode="url"
            spellCheck={false}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://"
            className={`mono ${input}`}
          />
        </Field>
        <Field id={id('kind')} label="What it is">
          <select
            id={id('kind')}
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as SiteDraft['kind'] })}
            className={input}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                It {KIND[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id('grade')} label="How far its data can be trusted">
          <select
            id={id('grade')}
            value={draft.data_grade}
            onChange={(e) => set({ data_grade: e.target.value as SiteDraft['data_grade'] })}
            className={input}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {GRADE[g].label} — {GRADE_HELP[g]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field
          id={id('note')}
          label="Embedding text"
          hint={
            <>
              {draft.data_note.length}/1000 · what a traveller reads about this website
              before they leave for it
            </>
          }
        >
          <textarea
            id={id('note')}
            value={draft.data_note}
            maxLength={1000}
            rows={4}
            onChange={(e) => set({ data_note: e.target.value })}
            placeholder="One or two sentences, written to a traveller: what the site does, and how far its schedules and fares match ours."
            className={`text-sm leading-relaxed ${input}`}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field id={id('checked')} label="Checked against our data on">
          <input
            id={id('checked')}
            type="date"
            value={draft.checked_on}
            max={todayUtc()}
            onChange={(e) => set({ checked_on: e.target.value })}
            className={`mono ${input}`}
          />
        </Field>
        <p className="self-end pb-2.5 text-[12px] leading-relaxed text-ink-faint">
          The notice dates its verdict, because the verdict is a comparison somebody made on a
          day. Move it on only after comparing again.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field id={id('alt-label')} label="Second link (optional)">
          <input
            id={id('alt-label')}
            value={draft.alt_label}
            maxLength={40}
            onChange={(e) => set({ alt_label: e.target.value })}
            placeholder="Label, e.g. Older site"
            className={input}
          />
        </Field>
        <Field id={id('alt-url')} label="Second link's address">
          <input
            id={id('alt-url')}
            value={draft.alt_url}
            maxLength={500}
            inputMode="url"
            spellCheck={false}
            onChange={(e) => set({ alt_url: e.target.value })}
            placeholder="https://"
            className={`mono ${input}`}
          />
        </Field>
      </div>

      <div className="mt-6 border border-edge p-4 sm:p-5">
        <p className="eyebrow mb-3 text-ink-faint">What a traveller will see</p>
        <p className="display mb-4 text-xl leading-tight">Before you go to {name}</p>
        <NoticeBody
          site={{
            site_name: name,
            data_grade: draft.data_grade,
            data_note: draft.data_note.trim() || '(The embedding text goes here.)',
            kind: draft.kind,
            checked_on: draft.checked_on || todayUtc(),
            alt_url: draft.alt_url.trim() || null,
            alt_label: draft.alt_label.trim() || null,
            also_serves: alsoServes,
          }}
          actions={
            // Inert: this is a picture of the buttons, not the buttons.
            <>
              <span
                className="mono px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713]"
                style={{ background: accent }}
              >
                Continue to {name} ↗
              </span>
              <span className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                Stay here
              </span>
            </>
          }
        />
      </div>
    </>
  )
}

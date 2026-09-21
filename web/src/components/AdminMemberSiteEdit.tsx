import { useState } from 'react'
import Modal from './Modal'
import MemberSiteFields, {
  blankDraft,
  carrierLabel,
  draftOf,
  sameDraft,
  saveDraft,
  type SiteDraft,
} from './MemberSiteFields'
import { Loading } from './ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { AdminMemberSite, Airline, MemberSiteRow } from '../lib/types'

/**
 * Which member website a carrier's page offers, and what its notice says.
 *
 * A carrier offers one website at most, and one website can serve several
 * carriers -- Starliner Group sells four. So a save is two steps, in order:
 * the website's own details, which every carrier on it shares, and then which
 * website this carrier points at. The details go first so that a failed link
 * leaves a website that says the right thing rather than a carrier pointing
 * at one that does not yet.
 *
 * It appears only for an admin, and every RPC checks again on the server.
 */

const NONE = ''
const NEW = '__new__'

const host = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '')

export default function AdminMemberSiteEdit({
  airline,
  site,
  accent,
  onSaved,
}: {
  airline: Airline
  /** What the page offers now, as airline_site() returned it. */
  site: MemberSiteRow | null
  accent: string
  onSaved: (site: MemberSiteRow | null) => void
}) {
  const { resonant } = useAuth()
  const [open, setOpen] = useState(false)
  const [sites, setSites] = useState<AdminMemberSite[] | null>(null)
  const [choice, setChoice] = useState<string>(NONE)
  const [draft, setDraft] = useState<SiteDraft>(blankDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hooks above every return, always.
  if (!(resonant?.is_admin ?? false)) return null

  const name = carrierLabel(airline)
  const current = site?.site_slug ?? NONE
  const chosen = sites?.find((s) => s.site_slug === choice) ?? null
  const currentSite = sites?.find((s) => s.site_slug === current) ?? null

  const load = async (): Promise<AdminMemberSite[]> => {
    const { data, error: e } = await supabase.rpc('admin_member_sites')
    if (e) throw new Error(e.message)
    const list = (data as AdminMemberSite[]) ?? []
    setSites(list)
    return list
  }

  const start = async () => {
    setOpen(true)
    setError(null)
    setSites(null)
    setChoice(current)
    try {
      const list = await load()
      const s = list.find((x) => x.site_slug === current)
      setDraft(s ? draftOf(s) : blankDraft())
    } catch (e) {
      setSites([])
      setError(e instanceof Error ? e.message : 'The websites could not be loaded.')
    }
  }

  const pick = (value: string) => {
    setChoice(value)
    setError(null)
    if (value === NEW) {
      // Most members name the site after the airline; start there.
      setDraft({ ...blankDraft(), site_name: airline.airline_name?.trim() ?? '' })
    } else {
      const s = sites?.find((x) => x.site_slug === value)
      setDraft(s ? draftOf(s) : blankDraft())
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      let slug: string | null = null
      if (choice === NEW) {
        slug = await saveDraft(draft)
        // Created. From here a retry must edit it, not create a second one.
        await load()
        setChoice(slug)
        setDraft({ ...draft, site_slug: slug })
      } else if (choice !== NONE) {
        slug = choice
        if (!chosen || !sameDraft(draftOf(chosen), draft)) await saveDraft(draft)
      }

      let row: MemberSiteRow | null
      if (slug !== (site?.site_slug ?? null)) {
        const { data, error: e } = await supabase.rpc('admin_set_airline_site', {
          p_uid: airline.uid,
          p_site_slug: slug,
        })
        if (e) throw new Error(e.message)
        row = ((data as MemberSiteRow[]) ?? [])[0] ?? null
      } else if (slug) {
        // Same website, new details: read back what the page will now show.
        const { data, error: e } = await supabase.rpc('airline_site', { p_uid: airline.uid })
        if (e) throw new Error(e.message)
        row = ((data as MemberSiteRow[]) ?? [])[0] ?? null
      } else {
        row = null
      }
      onSaved(row)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  // The carriers this page's notice will say the same site also sells.
  const others = (chosen?.carriers ?? []).filter((c) => c.uid !== airline.uid)
  const otherNames = others.map(carrierLabel)
  const leaving = current !== NONE && choice !== current ? currentSite : null
  const leftBehind = (leaving?.carriers ?? []).filter((c) => c.uid !== airline.uid)

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className="mono border border-[color:var(--color-warn)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-warn transition-colors hover:bg-[color:var(--color-warn)] hover:text-[#0B0713]"
      >
        {site ? 'Change website' : 'Add a website'}
      </button>

      {open && (
        <Modal wide title={`Website for ${name}`} onClose={() => setOpen(false)}>
          <p className="mb-5 text-sm leading-relaxed text-ink-dim">
            A member's own website takes the place of "Contact airline for booking" on this
            page, behind a notice that tells travellers what they are walking into. A carrier
            offers one website at most; one website can serve several carriers.
          </p>

          {sites === null ? (
            <Loading label="Loading websites" />
          ) : (
            <>
              <label className="eyebrow mb-1.5 block text-ink-faint" htmlFor="site-choice">
                Website on this page
              </label>
              <select
                id="site-choice"
                value={choice}
                onChange={(e) => pick(e.target.value)}
                className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
              >
                <option value={NONE}>None: the page says "Contact airline for booking"</option>
                {sites.map((s) => (
                  <option key={s.site_slug} value={s.site_slug}>
                    {s.site_name} · {host(s.url)}
                    {s.carriers.length > 0 &&
                      ` · ${s.carriers.length} carrier${s.carriers.length === 1 ? '' : 's'}`}
                  </option>
                ))}
                <option value={NEW}>A new website…</option>
              </select>

              {leaving && (
                <p className="mt-2 border-l-2 border-l-[color:var(--color-warn)] pl-3 text-[12px] leading-relaxed text-ink-dim">
                  This takes {name} off the {leaving.site_name} website.
                  {leftBehind.length > 0
                    ? ` ${leftBehind.map(carrierLabel).join(', ')} ${leftBehind.length === 1 ? 'keeps' : 'keep'} it.`
                    : ' Nothing else uses it; the website stays in the list on your account page until you remove it there.'}
                </p>
              )}

              {choice !== NONE && others.length > 0 && (
                <p className="mt-2 border-l-2 border-l-[color:var(--color-warn)] pl-3 text-[12px] leading-relaxed text-ink-dim">
                  Shared with {otherNames.join(', ')}. The details below belong to the website,
                  so a change shows on {others.length === 1 ? 'that page' : 'those pages'} too.
                </p>
              )}

              {choice !== NONE && (
                <div className="mt-5">
                  <MemberSiteFields
                    draft={draft}
                    onChange={setDraft}
                    alsoServes={otherNames}
                    accent={accent}
                    idPrefix="carrier-site"
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || sites === null}
              onClick={() => void save()}
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

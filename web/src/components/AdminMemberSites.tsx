import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import MemberSiteFields, {
  blankDraft,
  carrierLabel,
  draftOf,
  sameDraft,
  saveDraft,
  type SiteDraft,
} from './MemberSiteFields'
import { GRADE, KIND } from './MemberSite'
import { Loading } from './ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { AdminMemberSite, Airline } from '../lib/types'

/**
 * Every member website in one list, for admins.
 *
 * The carrier page can already change which website that one carrier offers.
 * This is the other way in: from the website. It is where a website's notice
 * is easiest to find and rewrite, where a website that serves several
 * carriers can be pointed at all of them in one sitting, and the only place a
 * website nothing links to any more can be seen, let alone removed.
 *
 * Linking and unlinking carriers happens as it is clicked, because each is one
 * self-contained change. The website's details wait for Save.
 */

const NEW = '__new__'

const host = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '')

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const ACCENT = 'var(--color-accent)'

export default function AdminMemberSites() {
  const { resonant } = useAuth()
  const [sites, setSites] = useState<AdminMemberSite[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** The website being edited: a slug, NEW for one being created, or null. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<SiteDraft>(blankDraft)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Airline[]>([])

  const [removing, setRemoving] = useState<string | null>(null)

  const isAdmin = resonant?.is_admin ?? false

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_member_sites')
    if (e) {
      setError(e.message)
      setSites([])
      return [] as AdminMemberSite[]
    }
    setError(null)
    const list = (data as AdminMemberSite[]) ?? []
    setSites(list)
    return list
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    void load()
  }, [isAdmin, load])

  // Carrier search for linking, debounced like the airport box on this page.
  useEffect(() => {
    const q = query.trim()
    if (!editing || editing === NEW || q.length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_airlines', {
        p_query: q,
        p_division: null,
        p_country: null,
        p_limit: 8,
        p_offset: 0,
      })
      setHits((data as Airline[]) ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [query, editing])

  // Hooks above this line, always.
  if (!isAdmin) return null

  const site = sites?.find((s) => s.site_slug === editing) ?? null
  /** Which website each carrier is on, so linking can say what it moves. */
  const siteOf = new Map<string, AdminMemberSite>()
  for (const s of sites ?? []) for (const c of s.carriers) siteOf.set(c.uid, s)

  const edit = (s: AdminMemberSite | null) => {
    setEditing(s ? s.site_slug : NEW)
    setDraft(s ? draftOf(s) : blankDraft())
    setFormError(null)
    setQuery('')
    setHits([])
    setRemoving(null)
  }

  const save = async () => {
    setBusy(true)
    setFormError(null)
    try {
      if (site && sameDraft(draftOf(site), draft)) {
        setEditing(null)
        return
      }
      const slug = await saveDraft(draft)
      const list = await load()
      if (editing === NEW) {
        // Stay open on the new website, so its carriers can be linked now.
        const created = list.find((s) => s.site_slug === slug)
        setEditing(slug)
        if (created) setDraft(draftOf(created))
      } else {
        setEditing(null)
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'The website could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const link = async (uid: string, slug: string | null) => {
    setBusy(true)
    setFormError(null)
    try {
      const { error: e } = await supabase.rpc('admin_set_airline_site', {
        p_uid: uid,
        p_site_slug: slug,
      })
      if (e) throw new Error(e.message)
      await load()
      setQuery('')
      setHits([])
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'The carrier could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (slug: string) => {
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('admin_delete_member_site', { p_site_slug: slug })
      if (e) throw new Error(e.message)
      setRemoving(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The website could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const carrierNames = (site?.carriers ?? []).map(carrierLabel)

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Member websites
          {sites && sites.length > 0 && <span className="ml-3 text-ink-dim">{sites.length}</span>}
        </h2>
        <button type="button" onClick={() => edit(null)} className="btn btn-ghost">
          Add a website
        </button>
      </div>
      <p className="mt-2 max-w-[62ch] text-sm text-ink-dim">
        The websites members built for their airlines, each behind a notice on the carrier's
        page. Edit what a notice says here, or open a carrier's page to change which website
        it offers.
      </p>

      {error && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
          {error}
        </p>
      )}

      {sites === null ? (
        <Loading label="Loading websites" />
      ) : sites.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">No member websites yet.</p>
      ) : (
        <ul className="mt-4 border-t border-edge-soft">
          {sites.map((s) => {
            const grade = GRADE[s.data_grade] ?? GRADE.unverified
            return (
              <li key={s.site_slug} className="border-b border-edge-soft py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <span className="text-ink">{s.site_name}</span>{' '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono break-all text-[12px] text-cyan"
                    >
                      {host(s.url)} ↗
                    </a>
                  </div>
                  <span className={`eyebrow ${grade.tone}`}>{grade.label}</span>
                </div>

                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-dim">
                  {s.data_note}
                </p>

                <p className="mt-1.5 text-[12px] text-ink-faint">
                  {s.carriers.length === 0 ? (
                    <span className="text-warn">No carrier offers it.</span>
                  ) : (
                    <>
                      Offered by{' '}
                      {s.carriers.map((c, i) => (
                        <span key={c.uid}>
                          {i > 0 && ', '}
                          <Link
                            to={`/d/${c.division_code}/${c.airline_slug}`}
                            className="text-ink-dim underline-offset-2 hover:underline"
                          >
                            {carrierLabel(c)}
                          </Link>
                        </span>
                      ))}
                      .
                    </>
                  )}{' '}
                  It {KIND[s.kind]}. Checked {day(s.checked_on)}
                  {s.updated_at && <>, edited {day(s.updated_at)}</>}.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => edit(s)}
                    className="mono border border-edge px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
                  >
                    Edit
                  </button>
                  {removing === s.site_slug ? (
                    <>
                      <span className="text-[12px] text-ink-dim">
                        Remove it?{' '}
                        {s.carriers.length > 0 &&
                          `${s.carriers.length === 1 ? 'Its carrier goes' : `Its ${s.carriers.length} carriers go`} back to "Contact airline for booking".`}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(s.site_slug)}
                        className="mono border border-[color:var(--color-danger)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-danger transition-colors hover:bg-[color:var(--color-danger)] hover:text-[#0B0713] disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(null)}
                        className="mono px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoving(s.site_slug)}
                      className="mono px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-danger"
                    >
                      Remove…
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing !== null && (
        <Modal
          wide
          title={editing === NEW ? 'A new member website' : `Edit ${site?.site_name ?? 'website'}`}
          onClose={() => setEditing(null)}
        >
          {editing !== NEW && site && (
            <div className="mb-6">
              <p className="eyebrow mb-2 text-ink-faint">Carriers that offer it</p>
              {site.carriers.length === 0 ? (
                <p className="text-sm text-ink-faint">None yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {site.carriers.map((c) => (
                    <li
                      key={c.uid}
                      className="mono flex items-center gap-2 border border-edge px-2.5 py-1 text-[12px] text-ink-dim"
                    >
                      {carrierLabel(c)}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void link(c.uid, null)}
                        aria-label={`Take ${carrierLabel(c)} off this website`}
                        className="text-ink-faint transition-colors hover:text-danger disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="relative mt-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Link another carrier: type its name or code"
                  aria-label="Find a carrier to link"
                  className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
                {hits.length > 0 && (
                  <ul className="panel absolute z-30 mt-1 max-h-64 w-full overflow-auto py-1">
                    {hits.map((h) => {
                      const on = siteOf.get(h.uid)
                      const here = on?.site_slug === site.site_slug
                      return (
                        <li key={h.uid}>
                          <button
                            type="button"
                            disabled={busy || here}
                            onClick={() => void link(h.uid, site.site_slug)}
                            className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                          >
                            <span className="mono w-14 shrink-0 text-cyan">{h.carrier_code}</span>
                            <span className="truncate text-sm text-ink">
                              {carrierLabel(h)}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-ink-faint">
                              {here ? 'already on it' : on ? `moves from ${on.site_name}` : h.division_name}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                A carrier offers one website at most, so linking one that has another moves it.
                These take effect as you click them.
              </p>
            </div>
          )}

          <MemberSiteFields
            draft={draft}
            onChange={setDraft}
            // A carrier on this website sees the others named in its notice;
            // the preview shows the list as any one of them would read it.
            alsoServes={carrierNames.slice(1)}
            accent={ACCENT}
            idPrefix="site-list"
          />

          {formError && (
            <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : editing === NEW ? 'Create website' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="mono border border-edge px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
            >
              {editing === NEW ? 'Cancel' : 'Close'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

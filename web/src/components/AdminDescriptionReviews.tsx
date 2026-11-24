import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { divisionPath } from '../lib/alliance'

/**
 * The word filter in front of claimed airlines' descriptions
 * (66_description_moderation.sql): the descriptions it held back, for an
 * admin to publish or turn down, and the list of terms it checks against.
 * Admin-only, English-only, like the rest of the dashboard.
 */
type Review = {
  review_id: number
  airline_uid: string
  airline_name: string | null
  carrier_code: string | null
  division_code: string | null
  airline_slug: string | null
  submitted_by: string | null
  description_md: string
  current_md: string | null
  matched: string[]
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  submitted_at: string
  decided_at: string | null
  decision_note: string | null
}

type Term = { term: string; kind: 'word' | 'contains' | 'regex'; category: string; added_at: string }

const CATEGORIES = ['slur', 'profanity', 'attack', 'alliance', 'hate', 'politics', 'spam', 'other'] as const
const KINDS = [
  ['word', 'Whole word or phrase'],
  ['contains', 'Anywhere, even inside a word'],
  ['regex', 'Regular expression (links etc.)'],
] as const

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const TONE: Record<Review['status'], string> = {
  pending: 'text-warn',
  approved: 'text-good',
  rejected: 'text-ink-faint',
  superseded: 'text-ink-faint',
}

export default function AdminDescriptionReviews() {
  const { resonant } = useAuth()
  const isAdmin = resonant?.is_admin ?? false

  const [rows, setRows] = useState<Review[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})

  const [termsOpen, setTermsOpen] = useState(false)
  const [terms, setTerms] = useState<Term[] | null>(null)
  const [newTerm, setNewTerm] = useState('')
  const [newKind, setNewKind] = useState<Term['kind']>('word')
  const [newCategory, setNewCategory] = useState<string>('attack')
  const [trial, setTrial] = useState('')
  const [trialHits, setTrialHits] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_description_reviews_list', {
      p_status: showAll ? 'all' : 'pending',
    })
    if (e) {
      setError(e.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as Review[]) ?? [])
  }, [showAll])

  const loadTerms = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_moderation_terms_list')
    if (e) setError(e.message)
    else setTerms((data as Term[]) ?? [])
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  useEffect(() => {
    if (isAdmin && termsOpen && terms === null) void loadTerms()
  }, [isAdmin, termsOpen, terms, loadTerms])

  if (!isAdmin) return null

  const pending = (rows ?? []).filter((r) => r.status === 'pending').length

  const decide = async (id: number, approve: boolean) => {
    setBusy(id)
    setError(null)
    const { error: e } = await supabase.rpc('admin_decide_description_review', {
      p_review_id: id,
      p_approve: approve,
      p_note: notes[id]?.trim() || null,
    })
    setBusy(null)
    if (e) setError(e.message)
    else await load()
  }

  const addTerm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error: err } = await supabase.rpc('admin_moderation_terms_add', {
      p_term: newTerm,
      p_kind: newKind,
      p_category: newCategory,
    })
    if (err) setError(err.message)
    else {
      setNewTerm('')
      await loadTerms()
    }
  }

  const removeTerm = async (term: string) => {
    const { error: err } = await supabase.rpc('admin_moderation_terms_remove', { p_term: term })
    if (err) setError(err.message)
    else await loadTerms()
  }

  const test = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error: err } = await supabase.rpc('admin_moderation_test', { p_text: trial })
    if (err) setError(err.message)
    else setTrialHits((data as string[]) ?? [])
  }

  const field =
    'border border-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent'

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Held descriptions
          {pending > 0 && (
            <span className="ml-3 border border-[color:var(--color-warn)] px-2 py-0.5 text-warn">
              {pending} waiting
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTermsOpen((v) => !v)}
            aria-pressed={termsOpen}
            className={`chip ${termsOpen ? 'chip-on' : ''}`}
          >
            Filter terms
          </button>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            className={`chip ${showAll ? 'chip-on' : ''}`}
          >
            {showAll ? 'All' : 'Waiting only'}
          </button>
        </div>
      </div>

      <p className="mt-2 max-w-[70ch] text-[12px] text-ink-faint">
        A claimed airline's new description that matches a filter term is not published. It waits
        here, with the old description still up, until you publish it or turn it down. The owner
        sees that it is waiting, but not which words matched.
      </p>

      {error && (
        <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">{error}</p>
      )}

      {termsOpen && (
        <div className="mt-4 border border-edge p-4">
          <form onSubmit={(e) => void addTerm(e)} className="flex flex-wrap items-end gap-3">
            <input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              placeholder="Word, phrase or pattern"
              className={`${field} min-w-[200px] flex-1`}
            />
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as Term['kind'])} className={field}>
              {KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={field}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!newTerm.trim()} className="btn btn-primary">
              Add
            </button>
          </form>

          <form onSubmit={(e) => void test(e)} className="mt-4 flex flex-wrap items-end gap-3">
            <input
              value={trial}
              onChange={(e) => {
                setTrial(e.target.value)
                setTrialHits(null)
              }}
              placeholder="Try a sentence against the list"
              className={`${field} min-w-[200px] flex-1`}
            />
            <button type="submit" disabled={!trial.trim()} className="btn">
              Test
            </button>
          </form>
          {trialHits && (
            <p className={`mt-2 text-[12px] ${trialHits.length ? 'text-warn' : 'text-good'}`}>
              {trialHits.length ? `Would be held: ${trialHits.join(', ')}` : 'Would be published.'}
            </p>
          )}

          {terms === null ? (
            <p className="mt-4 text-[12px] text-ink-faint">Loading…</p>
          ) : terms.length === 0 ? (
            <p className="mt-4 text-[12px] text-warn">The list is empty, so nothing is being held yet.</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {terms.map((t) => (
                <li key={t.term} className="mono flex items-center gap-2 border border-edge px-2 py-1 text-[11px]">
                  <span className="text-ink-faint">{t.category}</span>
                  <span className="text-ink">{t.term}</span>
                  {t.kind !== 'word' && <span className="text-ink-faint">({t.kind})</span>}
                  <button
                    type="button"
                    onClick={() => void removeTerm(t.term)}
                    aria-label={`Remove ${t.term}`}
                    className="text-ink-faint hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-dim">{showAll ? 'Nothing has been held yet.' : 'Nothing waiting.'}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.review_id} className="border border-edge p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-ink">
                  {r.division_code && r.airline_slug ? (
                    <Link to={divisionPath(r.division_code, r.airline_slug)} className="hover:text-cyan">
                      {r.airline_name ?? r.carrier_code ?? 'Unknown airline'}
                    </Link>
                  ) : (
                    (r.airline_name ?? 'Unknown airline')
                  )}
                  {r.carrier_code && <span className="mono ml-2 text-[11px] text-cyan">{r.carrier_code}</span>}
                </span>
                <span className={`mono text-[11px] uppercase tracking-[0.12em] ${TONE[r.status]}`}>
                  {r.status} · {when(r.submitted_at)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-ink-faint">By {r.submitted_by ?? 'unknown'}</p>
              <p className="mono mt-2 text-[11px] text-warn">Matched: {r.matched.join(', ')}</p>
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-l-[color:var(--color-warn)] pl-3 text-sm text-ink">
                {r.description_md}
              </p>
              {r.status === 'pending' && (
                <>
                  <details className="mt-2 text-[12px] text-ink-faint">
                    <summary className="cursor-pointer">Description currently shown</summary>
                    <p className="mt-1 whitespace-pre-wrap">{r.current_md || '(none)'}</p>
                  </details>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      value={notes[r.review_id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.review_id]: e.target.value }))}
                      placeholder="Note to the owner (optional, shown if turned down)"
                      className={`${field} min-w-[220px] flex-1`}
                    />
                    <button
                      type="button"
                      disabled={busy === r.review_id}
                      onClick={() => void decide(r.review_id, true)}
                      className="mono border border-[color:var(--color-good)] px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-good transition-colors hover:bg-[color:var(--color-good)] hover:text-[#050505]"
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.review_id}
                      onClick={() => void decide(r.review_id, false)}
                      className="mono border border-edge px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:border-[color:var(--color-danger)] hover:text-danger"
                    >
                      Turn down
                    </button>
                  </div>
                </>
              )}
              {r.status !== 'pending' && r.decision_note && (
                <p className="mt-2 text-[12px] text-ink-faint">Note: {r.decision_note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

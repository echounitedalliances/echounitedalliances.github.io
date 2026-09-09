import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Airline } from '../lib/types'

/**
 * The only thing an admin can change about a carrier: what it is called, and
 * the paragraph under the name.
 *
 * Everything else on the page — fleet, routes, hubs, fares — is scraped from
 * the game and rewritten by the next import, so editing it would produce a
 * value with a shelf life measured in days. Two fields is the whole feature,
 * and keeping it to two is the point rather than a limitation.
 *
 * Both fields revert rather than blank: clearing the name restores whatever
 * the game calls the airline, and clearing the description restores the
 * generated one. That is why neither is required, and why the placeholder
 * shows what you would get back.
 *
 * It appears only for an admin. A member who is not one never sees it, and
 * the RPC behind it checks again on the server — the hidden button is
 * courtesy, not security.
 */
export default function AdminAirlineEdit({
  airline,
  onSaved,
}: {
  airline: Airline
  onSaved: (updated: Airline) => void
}) {
  const { resonant } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!resonant?.is_admin) return null

  const start = () => {
    // Seed with what is overridden today, not with the generated text: the
    // boxes should be empty when nothing has been overridden, so that "empty"
    // consistently means "use what the game says".
    setName(airline.airline_name ?? '')
    setDescription(airline.description_is_custom ? (airline.description_md ?? '') : '')
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('admin_update_airline', {
        p_uid: airline.uid,
        p_airline_name: name.trim() || null,
        p_description_md: description.trim() || null,
      })
      if (error) throw new Error(error.message)
      const rows = (data as Airline[]) ?? []
      if (rows.length === 0) throw new Error('The carrier was not returned after saving.')
      onSaved(rows[0])
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="mono border border-[color:var(--color-warn)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-warn transition-colors hover:bg-[color:var(--color-warn)] hover:text-[#0B0713]"
      >
        Edit as admin
      </button>

      {open && (
        <Modal wide title={`Edit ${airline.airline_name ?? airline.carrier_code}`} onClose={() => setOpen(false)}>
          <p className="mb-5 text-sm leading-relaxed text-ink-dim">
            Only these two. Everything else on a carrier's page comes from the game
            and is rewritten by the next import, so it is not editable here.
          </p>

          <label className="eyebrow mb-1.5 block text-ink-faint" htmlFor="admin-name">
            Airline name
          </label>
          <input
            id="admin-name"
            value={name}
            autoFocus
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leave empty to use the name from the game"
            className="mono w-full border border-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-accent"
          />

          <label className="eyebrow mb-1.5 mt-5 block text-ink-faint" htmlFor="admin-desc">
            Description
          </label>
          <textarea
            id="admin-desc"
            value={description}
            maxLength={4000}
            rows={8}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Leave empty to use the description generated from what this carrier flies"
            className="w-full border border-edge bg-ground-2 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-accent"
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {description.length}/4000 · empty restores the generated description
          </p>

          {error && (
            <p className="mt-4 border-l-2 border-l-[color:var(--color-danger)] pl-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="mono bg-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[#0B0713] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Updating…' : 'Update'}
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

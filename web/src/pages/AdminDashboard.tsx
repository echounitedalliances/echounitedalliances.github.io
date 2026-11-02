import { Link } from 'react-router-dom'
import { isConfigured } from '../lib/supabase'
import { NotConfigured } from '../components/ui'
import { useAuth } from '../lib/auth'
import AdminStats from '../components/AdminStats'
import AdminSupportQueue from '../components/AdminSupportQueue'
import AdminMembers from '../components/AdminMembers'
import AdminCarrierSearch from '../components/AdminCarrierSearch'
import AdminApplications from '../components/AdminApplications'
import AdminMemberSites from '../components/AdminMemberSites'
import { usePageTitle } from '../lib/pageMeta'

/**
 * The admin dashboard: one page instead of the sections that used to sit on
 * /resonance (admin applications, member websites -- both moved here
 * unchanged) plus what was missing without opening psql: the support
 * inbox, browsing and managing members, a carrier search that edits in
 * place, and the numbers behind all of it.
 *
 * English only, on purpose: the board is the one audience this site does
 * not translate for (see web/src/lib/i18n.tsx). Every section here already
 * hides itself from anyone who is not an admin, so this page does the same
 * at the top rather than flashing admin-only panels at everyone else first.
 */
export default function AdminDashboard() {
  usePageTitle('Admin dashboard')
  const { ready, resonant } = useAuth()

  if (!isConfigured) return <NotConfigured />
  if (!ready) return null

  if (!resonant?.is_admin) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-5">
        <h1 className="display text-[clamp(28px,4vw,40px)]">Admins only</h1>
        <p className="mt-4 text-ink-dim">
          This page is for alliance admins. If that should be you, apply from your{' '}
          <Link to="/resonance" className="text-cyan hover:underline">
            Resonance page
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-5 sm:py-14">
      <p className="eyebrow text-cyan">Admin</p>
      <h1 className="display mt-3 text-[clamp(30px,4vw,46px)]">Dashboard</h1>

      <AdminStats />
      <AdminSupportQueue />
      <AdminMembers />
      <AdminCarrierSearch />
      <AdminApplications />
      <AdminMemberSites />
    </div>
  )
}

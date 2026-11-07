import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Copy,
  ExternalLink,
  IndianRupee,
  Layers,
  Pencil,
  Receipt,
  Store,
  ToggleLeft,
  ToggleRight,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageLoader,
  StatCard,
} from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { dateTime, inr } from '../../lib/format'
import { RestaurantAvatar } from './AdminDashboard'
import { ResetPasswordButton } from './AdminRestaurantForm'

export default function AdminRestaurantDetail() {
  const { id } = useParams()
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get(`/api/superadmin/restaurants/${id}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id])

  useEffect(load, [load])
  useSocketEvent('restaurant:updated', load)

  async function toggleStatus() {
    const next = data.status === 'active' ? 'inactive' : 'active'
    setBusy(true)
    try {
      await api.patch(`/api/superadmin/restaurants/${id}/status`, { status: next })
      toast(next === 'active' ? 'Restaurant activated' : 'Restaurant deactivated')
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={Store}
        title="Could not load this restaurant"
        subtitle={error}
        action={
          <Link to="/admin/restaurants" className="btn-ghost btn-sm">
            Back to restaurants
          </Link>
        }
      />
    )
  }
  if (!data) return <PageLoader label="Loading restaurant…" />

  const active = data.status === 'active'
  const menuUrl = `${window.location.origin}${data.menu_url}`

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/admin/restaurants"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft size={15} /> Restaurants
      </Link>

      {/* Header ------------------------------------------------------- */}
      <div className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <RestaurantAvatar logo={data.logo_url} name={data.name} size={64} />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
                {data.name}
              </h1>
              <Badge tone={active ? 'emerald' : 'slate'}>{data.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {data.owner_name} · created {dateTime(data.created_at)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-ink-500">{data.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/admin/restaurants/${id}/edit`} className="btn btn-sm btn-ghost">
            <Pencil size={14} /> Edit
          </Link>
          <ResetPasswordButton restaurantId={id} onDone={() => {}} />
          <button
            onClick={toggleStatus}
            disabled={busy}
            className={active ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
          >
            {active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {!active && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          This restaurant is inactive — its owner cannot log in and customers cannot place orders.
        </div>
      )}

      {/* Stats -------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Layers} label="Tables" value={data.counts.tables} accent="blue" />
        <StatCard icon={UtensilsCrossed} label="Menu items" value={data.counts.menu_items} accent="brand" />
        <StatCard icon={Receipt} label="Orders" value={data.counts.orders} accent="violet" />
        <StatCard
          icon={IndianRupee}
          label="Revenue collected"
          value={inr(data.revenue_collected)}
          accent="emerald"
          sub={`${data.counts.paid_bills} paid bill${data.counts.paid_bills === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Owner account ------------------------------------------- */}
        <section className="panel p-6">
          <h2 className="font-display text-lg font-semibold">Owner account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow label="Username" value={data.username} mono />
            <InfoRow label="Owner name" value={data.owner_name} />
            <InfoRow label="Phone" value={data.phone || '—'} />
            <InfoRow label="Email" value={data.email || '—'} />
            <InfoRow
              label="Last login"
              value={data.owner_last_login ? dateTime(data.owner_last_login) : 'Never'}
            />
            <InfoRow
              label="Account created"
              value={data.owner_created_at ? dateTime(data.owner_created_at) : '—'}
            />
          </dl>
        </section>

        {/* Restaurant profile -------------------------------------- */}
        <section className="panel p-6">
          <h2 className="font-display text-lg font-semibold">Restaurant profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow label="Restaurant ID" value={data.id} mono />
            <InfoRow label="URL slug" value={data.slug} mono />
            <InfoRow label="Address" value={data.address || '—'} />
            <InfoRow label="Categories" value={String(data.counts.categories)} />
            <InfoRow label="Staff requests" value={String(data.counts.staff_requests)} />
          </dl>

          <div className="mt-5 rounded-2xl border border-cream-300 bg-cream-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
              Customer ordering website
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-[13px] text-ink-700 ring-1 ring-cream-300">
                {menuUrl}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(menuUrl)
                    .then(() => toast('Link copied'))
                    .catch(() => toast('Copy failed', 'error'))
                }}
                className="btn btn-sm btn-ghost"
              >
                <Copy size={14} />
              </button>
              <a href={data.menu_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-dark">
                <ExternalLink size={14} /> Open
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-cream-200 pb-3 last:border-0 last:pb-0">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className={`text-right font-semibold text-ink-800 ${mono ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

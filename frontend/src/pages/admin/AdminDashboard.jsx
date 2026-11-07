import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Building2,
  CircleCheck,
  Clock,
  IndianRupee,
  Plus,
  Receipt,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { Badge, EmptyState, PageLoader, StatCard } from '../../components/ui'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { dateTime, inr } from '../../lib/format'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/superadmin/stats')
      .then(setStats)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('stats:changed', load)
  useSocketEvent('restaurant:created', load)
  useSocketEvent('restaurant:updated', load)

  if (error) {
    return <EmptyState icon={Store} title="Could not load the platform" subtitle={error} />
  }
  if (!stats) return <PageLoader label="Loading platform overview…" />

  const cards = [
    { icon: Building2, label: 'Total restaurants', value: stats.total_restaurants, accent: 'brand' },
    { icon: CircleCheck, label: 'Active', value: stats.active_restaurants, accent: 'emerald' },
    { icon: Clock, label: 'Inactive', value: stats.inactive_restaurants, accent: 'amber' },
    { icon: UtensilsCrossed, label: 'Registered tables', value: stats.total_tables, accent: 'blue' },
    { icon: Receipt, label: 'Total orders', value: stats.total_orders, accent: 'violet' },
    { icon: IndianRupee, label: 'Revenue collected', value: inr(stats.total_revenue_collected), accent: 'slate' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Platform overview
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            Welcome back, Bivash
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Everything happening across your DineFlow restaurants.
          </p>
        </div>
        <Link to="/admin/restaurants/new" className="btn-primary self-start sm:self-auto">
          <Plus size={16} /> New restaurant
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
          <h2 className="font-display text-lg font-semibold">Recent restaurants</h2>
          <Link
            to="/admin/restaurants"
            className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-700"
          >
            View all <ArrowUpRight size={15} />
          </Link>
        </div>

        {stats.recent_restaurants.length === 0 ? (
          <EmptyState
            compact
            icon={Store}
            title="No restaurants yet"
            subtitle="Create your first restaurant account to get it online."
            action={
              <Link to="/admin/restaurants/new" className="btn-primary btn-sm">
                <Plus size={15} /> Create restaurant
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-cream-200">
            {stats.recent_restaurants.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/admin/restaurants/${r.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-cream-50"
                >
                  <RestaurantAvatar logo={r.logo_url} name={r.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-800">{r.name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {r.url} · {r.owner_name} · added {dateTime(r.created_at)}
                    </p>
                  </div>
                  <Badge tone={r.status === 'active' ? 'emerald' : 'slate'}>{r.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function RestaurantAvatar({ logo, name = '', size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.36 }
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        style={style}
        className="shrink-0 rounded-xl object-cover ring-1 ring-cream-200"
      />
    )
  }
  return (
    <span
      style={style}
      className="grid shrink-0 place-items-center rounded-xl bg-brand-500 font-display font-bold text-white"
    >
      {(name || '?')[0].toUpperCase()}
    </span>
  )
}

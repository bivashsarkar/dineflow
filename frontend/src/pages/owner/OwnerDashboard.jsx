import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  BellRing,
  ClipboardList,
  ChefHat,
  IndianRupee,
  Layers,
  PackageCheck,
  Receipt,
  Timer,
  UtensilsCrossed,
} from 'lucide-react'
import { Badge, EmptyState, PageLoader, StatCard, StatusPill } from '../../components/ui'
import { REQUEST_TYPES } from '../../lib/constants'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { clockTime, inr, timeAgo } from '../../lib/format'

export default function OwnerDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/owner/dashboard')
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('order:new', load)
  useSocketEvent('order:update', load)
  useSocketEvent('request:new', load)
  useSocketEvent('request:update', load)
  useSocketEvent('bill:paid', load)
  useSocketEvent('tables:changed', load)

  if (error) return <EmptyState icon={ClipboardList} title="Could not load dashboard" subtitle={error} />
  if (!data) return <PageLoader label="Loading your restaurant…" />

  const s = data.stats

  const cards = [
    { icon: ClipboardList, label: "Today's orders", value: s.today_orders, accent: 'brand' },
    { icon: Timer, label: 'Pending', value: s.pending, accent: 'amber' },
    { icon: ChefHat, label: 'In the kitchen', value: s.preparing, accent: 'violet' },
    { icon: PackageCheck, label: 'Completed today', value: s.completed, accent: 'emerald' },
    { icon: IndianRupee, label: "Today's revenue", value: inr(s.today_revenue), accent: 'blue', sub: `${inr(s.collected_today)} collected` },
    { icon: UtensilsCrossed, label: 'Menu items', value: s.menu_items, accent: 'slate' },
    { icon: Layers, label: 'Tables', value: s.tables, accent: 'slate', sub: `${s.open_sessions} open session${s.open_sessions === 1 ? '' : 's'}` },
    { icon: Receipt, label: 'Total orders', value: s.total_orders, accent: 'slate', sub: `${s.categories} categories` },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Overview</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            {data.restaurant.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{data.restaurant.address}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/owner/orders" className="btn-primary">
            <ClipboardList size={16} /> Live orders
            {s.pending > 0 && (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[11px] font-bold">{s.pending}</span>
            )}
          </Link>
          <Link to={`/r/${data.restaurant.slug}`} target="_blank" className="btn-ghost">
            Customer site
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent orders -------------------------------------------- */}
        <section className="panel overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Recent orders</h2>
            <Link
              to="/owner/orders"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-700"
            >
              View all <ArrowUpRight size={15} />
            </Link>
          </div>

          {data.recent_orders.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardList}
              title="No orders yet"
              subtitle="Share your table QR codes — new orders will appear here instantly."
              action={
                <Link to="/owner/tables" className="btn-primary btn-sm">
                  Open table QR codes
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-cream-200">
              {data.recent_orders.map((o) => (
                <li key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-100 font-display text-sm font-bold text-ink-700">
                    T{o.table_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                    </p>
                    <p className="text-xs text-ink-500">
                      {o.id.slice(0, 10)} · {timeAgo(o.created_at)} · {clockTime(o.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink-800">{inr(o.total)}</p>
                    <div className="mt-1">
                      <StatusPill status={o.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending requests ----------------------------------------- */}
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
            <h2 className="font-display text-lg font-semibold">Customer requests</h2>
            <Link to="/owner/requests" className="text-sm font-bold text-brand-600 hover:text-brand-700">
              All
            </Link>
          </div>
          {data.pending_requests.length === 0 ? (
            <EmptyState compact icon={BellRing} title="Nothing pending" subtitle="No table needs attention right now." />
          ) : (
            <ul className="divide-y divide-cream-200">
              {data.pending_requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-600">
                    T{r.table_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {REQUEST_TYPES[r.type] ? REQUEST_TYPES[r.type].label : r.type}
                    </p>
                    <p className="text-xs text-ink-500">{timeAgo(r.created_at)}</p>
                  </div>
                  <Badge tone="brand">new</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

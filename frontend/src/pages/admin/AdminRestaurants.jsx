import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink,
  Plus,
  Search,
  Store,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { RestaurantAvatar } from './AdminDashboard'

export default function AdminRestaurants() {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/superadmin/restaurants')
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('restaurant:created', load)
  useSocketEvent('restaurant:updated', load)

  async function toggleStatus(row) {
    const next = row.status === 'active' ? 'inactive' : 'active'
    setBusy(row.id)
    try {
      await api.patch(`/api/superadmin/restaurants/${row.id}/status`, { status: next })
      toast(
        next === 'active'
          ? `${row.name} is now active`
          : `${row.name} deactivated — orders and logins are blocked`,
      )
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (error) return <EmptyState icon={Store} title="Could not load restaurants" subtitle={error} />
  if (!rows) return <PageLoader label="Loading restaurants…" />

  const q = query.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    const matchesQuery =
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.owner_name || '').toLowerCase().includes(q) ||
      (r.username || '').toLowerCase().includes(q) ||
      (r.slug || '').toLowerCase().includes(q)
    const matchesFilter = filter === 'all' || r.status === filter
    return matchesQuery && matchesFilter
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Restaurant management
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            Restaurants
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {rows.length} account{rows.length === 1 ? '' : 's'} on DineFlow
          </p>
        </div>
        <Link to="/admin/restaurants/new" className="btn-primary self-start sm:self-auto">
          <Plus size={16} /> New restaurant
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, owner, username or URL…"
            className="field-input pl-10"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'inactive'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip capitalize ${
                filter === f
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-cream-300 bg-white text-ink-600 hover:border-cream-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Store}
            title={rows.length === 0 ? 'No restaurants yet' : 'No matches'}
            subtitle={
              rows.length === 0
                ? 'Create your first restaurant and its owner will get login credentials instantly.'
                : 'Try a different search or filter.'
            }
            action={
              rows.length === 0 ? (
                <Link to="/admin/restaurants/new" className="btn-primary btn-sm">
                  <Plus size={15} /> Create restaurant
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50 text-left text-[11px] font-bold uppercase tracking-widest text-ink-500">
                  <th className="px-5 py-3.5">Restaurant</th>
                  <th className="px-4 py-3.5">Owner login</th>
                  <th className="px-4 py-3.5 text-center">Tables</th>
                  <th className="px-4 py-3.5 text-center">Menu</th>
                  <th className="px-4 py-3.5 text-center">Orders</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {filtered.map((r) => (
                  <tr key={r.id} className="transition hover:bg-cream-50/70">
                    <td className="px-5 py-4">
                      <Link to={`/admin/restaurants/${r.id}`} className="flex items-center gap-3">
                        <RestaurantAvatar logo={r.logo_url} name={r.name} size={38} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-800">{r.name}</p>
                          <p className="flex items-center gap-1 text-xs text-ink-500">
                            {r.url}
                            <ExternalLink size={11} />
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-[13px] font-semibold text-ink-700">{r.username}</p>
                      <p className="text-xs text-ink-500">{r.owner_name}</p>
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-ink-700">{r.tables}</td>
                    <td className="px-4 py-4 text-center font-semibold text-ink-700">{r.menu_items}</td>
                    <td className="px-4 py-4 text-center font-semibold text-ink-700">{r.orders}</td>
                    <td className="px-4 py-4">
                      <Badge tone={r.status === 'active' ? 'emerald' : 'slate'}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleStatus(r)}
                          disabled={busy === r.id}
                          title={r.status === 'active' ? 'Deactivate' : 'Activate'}
                          className={`btn btn-sm ${r.status === 'active' ? 'btn-danger' : 'btn-ghost'}`}
                        >
                          {r.status === 'active' ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          {r.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <Link to={`/admin/restaurants/${r.id}`} className="btn btn-sm btn-ghost">
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

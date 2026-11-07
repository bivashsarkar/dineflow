import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChefHat,
  ClipboardList,
  Clock,
  Flame,
  FileText,
  PackageCheck,
  RefreshCw,
  Timer,
  X,
} from 'lucide-react'
import {
  Badge,
  EmptyState,
  Modal,
  PageLoader,
  StatusPill,
  VegMark,
} from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { ORDER_STATUS } from '../../lib/constants'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { chime } from '../../lib/sound'
import { clockTime, inr, timeAgo } from '../../lib/format'

const FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']

const NEXT_ACTION = {
  PENDING: [
    { status: 'ACCEPTED', label: 'Accept order', icon: Check, cls: 'btn-primary' },
    { status: 'REJECTED', label: 'Reject', icon: X, cls: 'btn-danger' },
  ],
  ACCEPTED: [{ status: 'PREPARING', label: 'Start preparing', icon: ChefHat, cls: 'btn-dark' }],
  PREPARING: [{ status: 'READY', label: 'Mark ready', icon: Flame, cls: 'btn-primary' }],
  READY: [{ status: 'SERVED', label: 'Mark served', icon: PackageCheck, cls: 'btn-dark' }],
  SERVED: [{ status: 'COMPLETED', label: 'Complete order', icon: Check, cls: 'btn-primary' }],
}

export default function OwnerOrders() {
  const { toast } = useToast()
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/owner/orders?limit=200')
      .then(setOrders)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  useSocketEvent('order:new', (order) => {
    setOrders((list) => {
      if (!list) return [order]
      return list.some((o) => o.id === order.id) ? list : [order, ...list]
    })
    chime()
    toast(`New order · Table ${order.table_number}`, 'success', 6000)
  })

  useSocketEvent('order:update', (order) => {
    setOrders((list) =>
      list ? list.map((o) => (o.id === order.id ? { ...o, ...order } : o)) : list,
    )
    setSelected((cur) => (cur && cur.id === order.id ? { ...cur, ...order } : cur))
  })

  async function advance(order, status) {
    setBusy(order.id + status)
    try {
      const updated = await api.patch(`/api/owner/orders/${order.id}/status`, { status })
      setOrders((list) => (list || []).map((o) => (o.id === updated.id ? updated : o)))
      setSelected((cur) => (cur && cur.id === updated.id ? updated : cur))
      toast(
        status === 'REJECTED'
          ? `Order ${order.id.slice(0, 8)} rejected`
          : `Table ${order.table_number} · ${ORDER_STATUS[status].label}`,
      )
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const counts = useMemo(() => {
    const c = { ALL: (orders || []).length }
    Object.keys(ORDER_STATUS).forEach((k) => (c[k] = 0))
    ;(orders || []).forEach((o) => {
      c[o.status] = (c[o.status] || 0) + 1
    })
    return c
  }, [orders])

  const visible = useMemo(() => {
    const list = orders || []
    return filter === 'ALL' ? list : list.filter((o) => o.status === filter)
  }, [orders, filter])

  if (error) return <EmptyState icon={ClipboardList} title="Could not load orders" subtitle={error} />
  if (!orders) return <PageLoader label="Connecting to live orders…" />

  const pending = counts.PENDING || 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Live kitchen</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulseDot" /> Real-time
            </span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">Orders</h1>
          <p className="mt-1 text-sm text-ink-500">
            {pending > 0 ? (
              <span className="font-semibold text-brand-600">
                {pending} order{pending === 1 ? '' : 's'} waiting for you
              </span>
            ) : (
              'Everything is up to date.'
            )}
          </p>
        </div>
        <button onClick={load} className="btn-ghost self-start sm:self-auto">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Filters ------------------------------------------------------ */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip shrink-0 ${
              filter === f
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-cream-300 bg-white text-ink-600 hover:border-cream-400'
            }`}
          >
            {f === 'ALL' ? 'All' : ORDER_STATUS[f].label}
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                filter === f ? 'bg-white/25' : 'bg-cream-200 text-ink-600'
              }`}
            >
              {counts[f] || 0}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Clock}
            title={filter === 'ALL' ? 'No orders yet' : `No ${ORDER_STATUS[filter]?.label.toLowerCase()} orders`}
            subtitle="Orders arrive here the moment a guest checks out from their table QR."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busy}
              onAdvance={advance}
              onOpen={() => setSelected(order)}
            />
          ))}
        </div>
      )}

      <OrderDetail
        order={selected}
        busy={busy}
        onClose={() => setSelected(null)}
        onAdvance={advance}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function OrderCard({ order, busy, onAdvance, onOpen }) {
  const actions = NEXT_ACTION[order.status] || []
  const isPending = order.status === 'PENDING'

  return (
    <article
      className={`panel flex flex-col overflow-hidden animate-fadeUp ${
        isPending ? 'ring-2 ring-brand-400/70' : ''
      }`}
    >
      <header
        className={`flex items-start justify-between gap-3 px-4 py-3.5 ${
          isPending ? 'bg-brand-50' : 'bg-cream-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-800 font-display text-sm font-bold text-white">
            T{order.table_number}
          </span>
          <div>
            <p className="font-mono text-[13px] font-bold text-ink-800">
              #{order.id.slice(-6).toUpperCase()}
            </p>
            <p className="flex items-center gap-1 text-xs text-ink-500">
              <Clock size={11} /> {timeAgo(order.created_at)} · {clockTime(order.created_at)}
            </p>
          </div>
        </div>
        <StatusPill status={order.status} />
      </header>

      <button onClick={onOpen} className="flex-1 px-4 py-3.5 text-left">
        <ul className="space-y-2">
          {order.items.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <VegMark veg={line.veg} />
              <span className="flex-1">
                <span className="font-semibold text-ink-800">{line.name}</span>
                {line.replaced_from && (
                  <span className="ml-1 text-xs text-ink-500">(replaced {line.replaced_from})</span>
                )}
                {line.instructions && (
                  <span className="mt-0.5 block text-xs italic text-brand-600">
                    “{line.instructions}”
                  </span>
                )}
              </span>
              <span className="font-semibold text-ink-700">×{line.qty}</span>
            </li>
          ))}
        </ul>

        {order.note && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <FileText size={13} className="mt-0.5 shrink-0" />
            {order.note}
          </p>
        )}
      </button>

      <footer className="flex items-center justify-between gap-3 border-t border-cream-200 px-4 py-3">
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{inr(order.total)}</p>
          <p className="text-[11px] uppercase tracking-wide text-ink-500">
            {order.items.reduce((n, i) => n + i.qty, 0)} items
          </p>
        </div>
        <div className="flex gap-2">
          {actions.map((a) => (
            <button
              key={a.status}
              onClick={() => onAdvance(order, a.status)}
              disabled={busy === order.id + a.status}
              className={`${a.cls} btn-sm`}
            >
              <a.icon size={14} />
              {busy === order.id + a.status ? '…' : a.label}
            </button>
          ))}
        </div>
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */

function OrderDetail({ order, busy, onClose, onAdvance }) {
  if (!order) return null
  const actions = NEXT_ACTION[order.status] || []

  return (
    <Modal
      open
      onClose={onClose}
      title={`Table ${order.table_number} · #${order.id.slice(-6).toUpperCase()}`}
      subtitle={`Placed ${clockTime(order.created_at)} (${timeAgo(order.created_at)})`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
          {actions.map((a) => (
            <button
              key={a.status}
              onClick={() => onAdvance(order, a.status)}
              disabled={busy === order.id + a.status}
              className={a.cls}
            >
              <a.icon size={15} />
              {a.label}
            </button>
          ))}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <StatusPill status={order.status} />
          <span className="font-display text-2xl font-bold text-ink-900">{inr(order.total)}</span>
        </div>

        <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Items</p>
          <ul className="mt-3 divide-y divide-cream-200">
            {order.items.map((line, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                <VegMark veg={line.veg} />
                <div className="flex-1">
                  <p className="font-semibold text-ink-800">{line.name}</p>
                  {line.instructions && (
                    <p className="text-xs italic text-brand-600">“{line.instructions}”</p>
                  )}
                  {line.replaced_from && (
                    <p className="text-xs text-ink-500">replaced {line.replaced_from}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink-800">{line.qty} × {inr(line.price)}</p>
                  <p className="text-xs text-ink-500">{inr(line.amount)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {order.note && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
              Special instructions
            </p>
            <p className="mt-1.5 text-sm text-amber-900">{order.note}</p>
          </div>
        )}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">History</p>
          <ol className="mt-3 space-y-2.5">
            {(order.history || []).map((h, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cream-200 text-[10px] font-bold text-ink-600">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink-700">
                  {ORDER_STATUS[h.status] ? ORDER_STATUS[h.status].label : h.status.replace('REPLACEMENT_', 'Replacement ')}
                </span>
                <span className="ml-auto text-xs text-ink-500">
                  {clockTime(h.at)} {h.by ? `· ${h.by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-cream-100 px-4 py-3 text-sm">
          <span className="text-ink-500">Session</span>
          <span className="font-mono font-semibold text-ink-700">{order.session_id}</span>
        </div>
      </div>
    </Modal>
  )
}

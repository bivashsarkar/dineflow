import { useCallback, useEffect, useState } from 'react'
import {
  BellRing,
  Check,
  ChevronRight,
  Clock,
  Droplets,
  HandHelping,
  Package,
  RefreshCw,
  Scissors,
  UtensilsCrossed,
} from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { REQUEST_TYPES } from '../../lib/constants'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { timeAgo } from '../../lib/format'

const TYPE_ICON = {
  call_staff: BellRing,
  water: Droplets,
  cutlery: Scissors,
  assistance: HandHelping,
  bill: UtensilsCrossed,
}

export default function OwnerRequests() {
  const { toast } = useToast()
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState(null)
  const [replacements, setReplacements] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    Promise.all([
      api.get('/api/owner/requests').catch((e) => {
        throw e
      }),
      api.get('/api/owner/replacements').catch(() => []),
    ])
      .then(([reqs, repls]) => {
        setRequests(reqs)
        setReplacements(repls)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('request:new', load)
  useSocketEvent('request:update', load)

  async function resolve(record) {
    setBusy(record.id)
    try {
      await api.patch(`/api/owner/requests/${record.id}/resolve`, {})
      toast('Request marked as resolved')
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (error) {
    return <EmptyState icon={BellRing} title="Could not load requests" subtitle={error} />
  }
  if (!requests || !replacements) return <PageLoader label="Loading requests…" />

  const pending = requests.filter((r) => r.status === 'pending')
  const done = requests.filter((r) => r.status !== 'pending')
  const pendingRepls = replacements.filter((r) => r.status === 'pending')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">From the floor</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            Customer requests
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {pending.length} pending · {pendingRepls.length} replacement awaiting a guest
          </p>
        </div>
        <button onClick={load} className="btn-ghost self-start sm:self-auto">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'requests', label: 'Staff requests', count: pending.length },
          { key: 'replacements', label: 'Food replacements', count: pendingRepls.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip ${
              tab === t.key
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-cream-300 bg-white text-ink-600 hover:border-cream-400'
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                tab === t.key ? 'bg-white/25' : 'bg-cream-200 text-ink-600'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'requests' ? (
        <div className="space-y-5">
          <Section title="Needs attention" count={pending.length}>
            {pending.length === 0 ? (
              <EmptyState
                compact
                icon={Check}
                title="All clear"
                subtitle="No table is waiting for anything."
              />
            ) : (
              <ul className="divide-y divide-cream-200">
                {pending.map((r) => {
                  const Icon = TYPE_ICON[r.type] || BellRing
                  const meta = REQUEST_TYPES[r.type] || { label: r.type }
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink-800">
                          {meta.label} · Table {r.table_number}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-ink-500">
                          <Clock size={11} /> {timeAgo(r.created_at)}
                          {r.note ? ` · “${r.note}”` : ''}
                        </p>
                      </div>
                      <Badge tone="brand">pending</Badge>
                      <button
                        onClick={() => resolve(r)}
                        disabled={busy === r.id}
                        className="btn btn-primary btn-sm"
                      >
                        <Check size={14} />
                        {busy === r.id ? '…' : 'Resolve'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="Recently resolved" count={done.length}>
            {done.length === 0 ? (
              <EmptyState compact icon={Clock} title="Nothing yet" subtitle="Resolved requests appear here." />
            ) : (
              <ul className="divide-y divide-cream-200">
                {done.slice(0, 25).map((r) => {
                  const Icon = TYPE_ICON[r.type] || BellRing
                  const meta = REQUEST_TYPES[r.type] || { label: r.type }
                  return (
                    <li key={r.id} className="flex items-center gap-4 px-5 py-3.5 opacity-70">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-cream-100 text-ink-500">
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-700">
                          {meta.label} · Table {r.table_number}
                        </p>
                        <p className="text-xs text-ink-500">{timeAgo(r.resolved_at || r.created_at)}</p>
                      </div>
                      <Badge tone="emerald">resolved</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>
      ) : (
        <Section title="Replacement suggestions" count={replacements.length}>
          {replacements.length === 0 ? (
            <EmptyState
              compact
              icon={Package}
              title="No replacements"
              subtitle="Mark a dish unavailable from the Menu page to offer an alternative here."
            />
          ) : (
            <ul className="divide-y divide-cream-200">
              {replacements.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {r.original_name} <ChevronRight size={13} className="inline text-ink-500" />{' '}
                      {r.replacement_name || 'removed'}
                    </p>
                    <p className="text-xs text-ink-500">
                      Table {r.table_number} · order #{(r.order_id || '').slice(-6).toUpperCase()} ·{' '}
                      {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      r.status === 'accepted'
                        ? 'emerald'
                        : r.status === 'pending'
                          ? 'amber'
                          : 'red'
                    }
                  >
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-sm font-semibold text-ink-500">{count}</span>
      </div>
      {children}
    </section>
  )
}

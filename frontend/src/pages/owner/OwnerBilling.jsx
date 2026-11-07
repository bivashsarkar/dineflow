import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Receipt,
  RefreshCw,
  Smartphone,
  Tag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Badge,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  StatusPill,
} from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { PAYMENT_METHODS } from '../../lib/constants'
import { api, downloadAuthed } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { dateTime, inr, timeAgo } from '../../lib/format'

const METHOD_ICON = { cash: Banknote, upi: Smartphone, card: CreditCard }

export default function OwnerBilling() {
  const { toast } = useToast()
  const [tab, setTab] = useState('sessions')
  const [sessions, setSessions] = useState(null)
  const [bills, setBills] = useState(null)
  const [selected, setSelected] = useState(null)
  const [bill, setBill] = useState(null)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      api.get('/api/owner/sessions').catch((e) => {
        throw e
      }),
      api.get('/api/owner/bills').catch(() => []),
    ])
      .then(([sess, bils]) => {
        setSessions(sess)
        setBills(bils)
        if (!selected && sess.length) {
          const open = sess.find((s) => s.status !== 'closed') || sess[0]
          setSelected(open.id)
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const loadBill = useCallback((sessionId) => {
    if (!sessionId) {
      setBill(null)
      return
    }
    api
      .get(`/api/owner/sessions/${sessionId}/bill`)
      .then((data) => {
        setBill(data.bill)
        setPreview(data.preview)
      })
      .catch(() => {
        setBill(null)
        setPreview(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadBill(selected)
  }, [selected, loadBill])

  useSocketEvent('order:update', load)
  useSocketEvent('bill:updated', (b) => {
    load()
    if (selected && b.session_id === selected) loadBill(selected)
  })
  useSocketEvent('bill:paid', (b) => {
    load()
    if (selected && b.session_id === selected) loadBill(selected)
    toast(`Table ${b.table_number} · payment recorded`, 'success', 5000)
  })
  useSocketEvent('tables:changed', load)

  async function generateBill() {
    setBusy(true)
    try {
      const data = await api.post(`/api/owner/sessions/${selected}/bill`, {})
      setBill(data.bill)
      setPreview(false)
      toast('Bill generated')
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveTerms(payload) {
    setBusy(true)
    try {
      const updated = await api.put(`/api/owner/bills/${bill.id}`, payload)
      setBill(updated)
      setDiscountOpen(false)
      toast('Bill updated')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function markPaid(method) {
    setBusy(true)
    try {
      const updated = await api.post(`/api/owner/bills/${bill.id}/pay`, { method })
      setBill(updated)
      setPayOpen(false)
      toast(`Rs ${updated.total} received via ${method.toUpperCase()}`)
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function voidBill() {
    if (!window.confirm('Void this bill? The table session reopens.')) return
    setBusy(true)
    try {
      await api.del(`/api/owner/bills/${bill.id}`)
      toast('Bill voided')
      setDiscountOpen(false)
      loadBill(selected)
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function downloadPdf() {
    try {
      await downloadAuthed(`/api/owner/bills/${bill.id}/pdf`, `${bill.bill_number}.pdf`)
      toast('Invoice downloaded')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (error) return <EmptyState icon={Receipt} title="Could not load billing" subtitle={error} />
  if (!sessions || !bills) return <PageLoader label="Loading billing…" />

  const activeSessions = sessions.filter((s) => s.status !== 'closed')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Pay at counter</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">Billing</h1>
          <p className="mt-1 text-sm text-ink-500">
            Combine a table's orders into one GST bill and record the payment you receive.
          </p>
        </div>
        <button onClick={load} className="btn-ghost self-start sm:self-auto">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'sessions', label: 'Open tables', count: activeSessions.length },
          { key: 'bills', label: 'All bills', count: bills.length },
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

      {tab === 'sessions' ? (
        <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          {/* Session list ------------------------------------------- */}
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="panel">
                <EmptyState
                  compact
                  icon={UtensilsCrossed}
                  title="No table sessions"
                  subtitle="A session opens as soon as a guest places an order."
                />
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`panel w-full p-4 text-left transition ${
                    selected === s.id
                      ? 'border-brand-400 ring-2 ring-brand-100'
                      : 'hover:border-cream-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-lg font-bold text-ink-900">
                      Table {s.table_number}
                    </p>
                    <Badge
                      tone={
                        s.status === 'closed'
                          ? 'slate'
                          : s.status === 'billed'
                            ? 'amber'
                            : 'emerald'
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {s.order_count} order{s.order_count === 1 ? '' : 's'} · opened{' '}
                    {timeAgo(s.opened_at)}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-xl font-bold text-ink-800">
                      {inr(s.bill_total || s.total)}
                    </span>
                    {s.bill_requested && (
                      <span className="chip border-brand-200 bg-brand-50 text-brand-700">
                        Bill requested
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Bill detail -------------------------------------------- */}
          <div className="panel min-h-[420px] p-6">
            {!selected ? (
              <EmptyState
                icon={Receipt}
                title="Select a table"
                subtitle="Pick a table session on the left to see its bill."
              />
            ) : !bill ? (
              <PageLoader label="Loading bill…" />
            ) : (
              <BillPanel
                bill={bill}
                preview={preview}
                busy={busy}
                onGenerate={generateBill}
                onDiscount={() => setDiscountOpen(true)}
                onPay={() => setPayOpen(true)}
                onPdf={downloadPdf}
              />
            )}
          </div>
        </div>
      ) : bills.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={FileText}
            title="No bills yet"
            subtitle="Generate a bill from an open table session and it will appear here."
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-50 text-left text-[11px] font-bold uppercase tracking-widest text-ink-500">
                <th className="px-5 py-3.5">Bill</th>
                <th className="px-4 py-3.5">Table</th>
                <th className="px-4 py-3.5">Created</th>
                <th className="px-4 py-3.5 text-right">Amount</th>
                <th className="px-4 py-3.5">Payment</th>
                <th className="px-5 py-3.5 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-cream-50/70">
                  <td className="px-5 py-4 font-mono text-[13px] font-semibold text-ink-700">
                    {b.bill_number}
                  </td>
                  <td className="px-4 py-4 font-semibold text-ink-700">{b.table_number}</td>
                  <td className="px-4 py-4 text-ink-500">{dateTime(b.created_at)}</td>
                  <td className="px-4 py-4 text-right font-display font-bold text-ink-800">
                    {inr(b.total)}
                  </td>
                  <td className="px-4 py-4">
                    {b.status === 'paid' ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                        <CheckCircle2 size={15} /> {b.payment_method.toUpperCase()}
                      </span>
                    ) : (
                      <Badge tone="amber">unpaid</Badge>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await downloadAuthed(
                            `/api/owner/bills/${b.id}/pdf`,
                            `${b.bill_number}.pdf`,
                          )
                          toast('Invoice downloaded')
                        } catch (e) {
                          toast(e.message, 'error')
                        }
                      }}
                      className="btn btn-sm btn-ghost"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DiscountModal
        open={discountOpen}
        bill={bill}
        busy={busy}
        onClose={() => setDiscountOpen(false)}
        onSave={saveTerms}
        onVoid={voidBill}
      />

      <PayModal
        open={payOpen}
        bill={bill}
        busy={busy}
        onClose={() => setPayOpen(false)}
        onPay={markPaid}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function BillPanel({ bill, preview, busy, onGenerate, onDiscount, onPay, onPdf }) {
  const items = bill.items || []
  const hasBill = !preview && bill.id

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-2xl font-bold text-ink-900">
              Table {bill.table_number}
            </h2>
            {hasBill ? (
              <Badge tone={bill.status === 'paid' ? 'emerald' : 'amber'}>{bill.status}</Badge>
            ) : (
              <Badge tone="slate">preview</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {hasBill ? (
              <>
                Bill <span className="font-mono font-semibold">{bill.bill_number}</span> · created{' '}
                {dateTime(bill.created_at)}
              </>
            ) : (
              'Combine every order at this table into a single invoice.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!hasBill && (
            <button onClick={onGenerate} disabled={busy || items.length === 0} className="btn-primary">
              <Receipt size={16} /> Generate bill
            </button>
          )}
          {hasBill && bill.status !== 'paid' && (
            <>
              <button onClick={onDiscount} className="btn-ghost">
                <Tag size={15} /> GST & discount
              </button>
              <button onClick={onPdf} className="btn-ghost">
                <Download size={15} /> PDF
              </button>
              <button onClick={onPay} className="btn-primary">
                <CheckCircle2 size={16} /> Mark as paid
              </button>
            </>
          )}
          {hasBill && bill.status === 'paid' && (
            <>
              <button onClick={onPdf} className="btn-ghost">
                <Download size={15} /> PDF invoice
              </button>
              <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
                Paid via {bill.payment_method.toUpperCase()} · {dateTime(bill.paid_at)}
              </span>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          compact
          icon={UtensilsCrossed}
          title="Nothing to bill"
          subtitle="This session has no billable orders yet."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cream-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-50 text-left text-[11px] font-bold uppercase tracking-widest text-ink-500">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 font-semibold text-ink-800">{i.name}</td>
                  <td className="px-4 py-3 text-center text-ink-600">{i.qty}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{inr(i.price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-800">
                    {inr(i.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ml-auto max-w-xs space-y-2 text-sm">
        <Row label="Subtotal" value={inr(bill.subtotal)} />
        <Row label={`GST (${Number(bill.gst_rate || 0).toFixed(0)}%)`} value={inr(bill.gst)} />
        {Number(bill.discount) > 0 && (
          <Row label="Discount" value={`− ${inr(bill.discount)}`} accent />
        )}
        <div className="flex items-center justify-between border-t-2 border-ink-800 pt-2.5">
          <span className="font-display text-lg font-bold text-ink-900">Total</span>
          <span className="font-display text-2xl font-bold text-brand-600">{inr(bill.total)}</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className={`font-semibold ${accent ? 'text-emerald-600' : 'text-ink-800'}`}>{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function DiscountModal({ open, bill, busy, onClose, onSave, onVoid }) {
  const [gstRate, setGstRate] = useState('5')
  const [type, setType] = useState('flat')
  const [value, setValue] = useState('0')

  useEffect(() => {
    if (bill) {
      setGstRate(String(bill.gst_rate ?? 5))
      setType(bill.discount_type || 'flat')
      setValue(String(bill.discount_value ?? 0))
    }
  }, [bill])

  if (!open || !bill) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="GST & discount"
      subtitle={`Bill ${bill.bill_number}`}
      size="sm"
      footer={
        <>
          {bill.status !== 'paid' && (
            <button onClick={onVoid} className="btn-danger mr-auto" disabled={busy}>
              <Trash2 size={15} /> Void bill
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                gst_rate: Number(gstRate),
                discount_type: type,
                discount_value: Number(value || 0),
              })
            }
            disabled={busy}
            className="btn-primary"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="GST rate (%)" hint="Restaurant GST is typically 5%.">
          <Input
            type="number"
            min="0"
            max="100"
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
          />
        </Field>

        <Field label="Discount">
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="field-input w-32"
            >
              <option value="flat">Flat ₹</option>
              <option value="percent">Percent %</option>
            </select>
            <Input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="flex-1"
            />
          </div>
        </Field>

        <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm">
          <Row label="Subtotal" value={inr(bill.subtotal)} />
          <Row
            label={`GST (${Number(gstRate || 0).toFixed(0)}%)`}
            value={inr((bill.subtotal * Number(gstRate || 0)) / 100)}
          />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function PayModal({ open, bill, busy, onClose, onPay }) {
  const [method, setMethod] = useState('cash')

  if (!open || !bill) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Record counter payment"
      subtitle={`Table ${bill.table_number} · ${inr(bill.total)}`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => onPay(method)} disabled={busy} className="btn-primary">
            <CheckCircle2 size={16} />
            {busy ? 'Recording…' : 'Mark as paid'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote>
          No online payment is processed. Collect the money at the counter, then record how it was
          paid.
        </ErrorNote>

        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICON[m.key]
            const active = method === m.key
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition ${
                  active
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                    : 'border-cream-200 bg-white hover:border-cream-400'
                }`}
              >
                <Icon size={22} className={active ? 'text-brand-600' : 'text-ink-500'} />
                <span className={`text-sm font-bold ${active ? 'text-brand-700' : 'text-ink-700'}`}>
                  {m.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="rounded-xl bg-cream-100 px-4 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
            Amount received
          </p>
          <p className="font-display text-3xl font-bold text-ink-900">{inr(bill.total)}</p>
        </div>
      </div>
    </Modal>
  )
}

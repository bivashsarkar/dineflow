import { useCallback, useEffect, useState } from 'react'
import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Badge, EmptyState, ErrorNote, Field, Input, Modal, PageLoader } from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { downloadAuthed, fetchAuthedText, getToken, api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'

export default function OwnerTables() {
  const { toast } = useToast()
  const [tables, setTables] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [qrFor, setQrFor] = useState(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/owner/tables')
      .then(setTables)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('tables:changed', load)

  async function remove(table) {
    if (!window.confirm(`Delete Table ${table.number}?`)) return
    setBusy(table.id)
    try {
      await api.del(`/api/owner/tables/${table.id}`)
      toast(`Table ${table.number} deleted`)
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (error) return <EmptyState icon={QrCode} title="Could not load tables" subtitle={error} />
  if (!tables) return <PageLoader label="Loading tables & QR codes…" />

  const occupied = tables.filter((t) => t.status === 'occupied').length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">QR ordering</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            Tables & QR codes
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {tables.length} table{tables.length === 1 ? '' : 's'} · {occupied} currently occupied
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary">
            <Plus size={16} /> Add table
          </button>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={QrCode}
            title="No tables yet"
            subtitle="Add your first table and DineFlow generates a unique QR code for it automatically."
            action={
              <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
                <Plus size={15} /> Add table
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <article key={table.id} className="panel overflow-hidden">
              <div className="flex items-start justify-between bg-cream-50 px-4 py-3.5">
                <div>
                  <p className="font-display text-2xl font-bold text-ink-900">
                    Table {table.number}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-500">{table.token}</p>
                </div>
                <Badge tone={table.status === 'occupied' ? 'brand' : 'emerald'}>
                  {table.status}
                </Badge>
              </div>

              <div className="grid place-items-center px-4 py-4">
                <button
                  onClick={() => setQrFor(table)}
                  className="group rounded-2xl border border-cream-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-soft"
                  title="Enlarge QR code"
                >
                  {table.qr_image ? (
                    <img
                      src={table.qr_image}
                      alt={`QR code for table ${table.number}`}
                      className="h-[132px] w-[132px]"
                    />
                  ) : (
                    <QrCode size={132} strokeWidth={1.4} className="text-ink-800" />
                  )}
                </button>
                <p className="mt-3 text-center text-xs text-ink-500">
                  {table.open_orders > 0
                    ? `${table.open_orders} live order${table.open_orders === 1 ? '' : 's'}`
                    : 'Guests scan to browse & order'}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-1.5 border-t border-cream-200 p-3">
                <button onClick={() => setQrFor(table)} className="btn btn-sm btn-ghost justify-center" title="View">
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => downloadQr(table, toast)}
                  className="btn btn-sm btn-ghost justify-center"
                  title="Download PNG"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => printQr(table)}
                  className="btn btn-sm btn-ghost justify-center"
                  title="Print"
                >
                  <Printer size={14} />
                </button>
                <button
                  onClick={() => setEditing(table)}
                  className="btn btn-sm btn-ghost justify-center"
                  title="Edit number"
                >
                  <Pencil size={14} />
                </button>
              </div>

              <div className="border-t border-cream-200 px-3 py-2.5">
                <button
                  onClick={() => remove(table)}
                  disabled={busy === table.id}
                  className="btn btn-sm btn-danger w-full justify-center"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {adding && (
        <TableForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            load()
          }}
        />
      )}
      {editing && (
        <TableForm
          table={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {qrFor && <QrModal table={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */

async function downloadQr(table, toast) {
  try {
    await downloadAuthed(`/api/owner/tables/${table.id}/qr/download`, `table-${table.number}-qr.png`)
    toast('QR code downloaded')
  } catch (e) {
    toast(e.message, 'error')
  }
}

function printQr(table) {
  const win = window.open('', '_blank')
  if (!win) {
    toastBlock()
    return
  }
  fetchAuthedText(`/api/owner/tables/${table.id}/qr/print`)
    .then((html) => {
      win.document.open()
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 450)
    })
    .catch(() => win.close())
}

function toastBlock() {
  window.alert('Please allow pop-ups for this site to print QR codes.')
}

/* ------------------------------------------------------------------ */

function TableForm({ table, onClose, onSaved }) {
  const { toast } = useToast()
  const [number, setNumber] = useState(table ? String(table.number) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = number === '' ? {} : { number: Number(number) }
      if (table) {
        await api.put(`/api/owner/tables/${table.id}`, payload)
        toast(`Table updated to ${payload.number ?? table.number}`)
      } else {
        const created = await api.post('/api/owner/tables', payload)
        toast(`Table ${created.number} created with a unique QR code`)
      }
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={table ? `Edit Table ${table.number}` : 'Add a table'}
      subtitle="A unique QR code is generated automatically."
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : table ? 'Save' : 'Create table'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field
          label="Table number"
          hint={table ? undefined : 'Leave blank to auto-number the next table.'}
        >
          <Input
            autoFocus
            type="number"
            min="1"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={table ? String(table.number) : 'Auto'}
          />
        </Field>
        {table && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
              QR target
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink-700">{table.menu_url}</p>
            <p className="mt-2 text-[11px] text-ink-500">
              Renumbering the table regenerates its QR code.
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function QrModal({ table, onClose }) {
  const { toast } = useToast()
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get(`/api/owner/tables/${table.id}/qr`)
      .then((d) => setDataUrl(d.qr_data_url))
      .catch((e) => setError(e.message))
  }, [table.id])

  return (
    <Modal
      open
      onClose={onClose}
      title={`Table ${table.number} QR code`}
      subtitle="Print it and place it on the table."
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
          <button onClick={() => downloadQr(table, toast)} className="btn-ghost">
            <Download size={15} /> Download
          </button>
          <button onClick={() => printQr(table)} className="btn-primary">
            <Printer size={15} /> Print
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mx-auto w-full max-w-[300px] rounded-3xl border border-cream-200 bg-white p-6 text-center shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            Scan to order
          </p>
          <p className="mt-1 font-display text-3xl font-bold text-brand-500">
            Table {table.number}
          </p>
          <div className="mt-4 grid place-items-center">
            {dataUrl ? (
              <img src={dataUrl} alt={`QR code for table ${table.number}`} className="h-56 w-56" />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-xl bg-cream-100" />
            )}
          </div>
          <p className="mt-4 break-all font-mono text-[11px] text-ink-500">{table.menu_url}</p>
        </div>
      </div>
    </Modal>
  )
}

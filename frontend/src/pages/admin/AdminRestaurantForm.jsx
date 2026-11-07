import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, KeyRound, Save } from 'lucide-react'
import ImagePicker from '../../components/ImagePicker'
import {
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  TextArea,
} from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

const EMPTY = {
  name: '',
  owner_name: '',
  phone: '',
  email: '',
  address: '',
  logo_url: '',
  username: '',
  password: '',
}

export default function AdminRestaurantForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { toast } = useToast()

  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    if (!editing) return undefined
    api
      .get(`/api/superadmin/restaurants/${id}`)
      .then((data) =>
        setForm({
          name: data.name || '',
          owner_name: data.owner_name || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          logo_url: data.logo_url || '',
          username: data.username || '',
          password: '',
        }),
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    return undefined
  }, [id, editing])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) return setError('Restaurant name is required')
    if (!form.owner_name.trim()) return setError('Owner name is required')
    if (editing && !form.username.trim()) return setError('Owner username is required')

    setBusy(true)
    try {
      if (editing) {
        await api.put(`/api/superadmin/restaurants/${id}`, {
          name: form.name.trim(),
          owner_name: form.owner_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          logo_url: form.logo_url,
        })
        await api.put(`/api/superadmin/restaurants/${id}/username`, {
          username: form.username.trim(),
        })
        if (form.password) {
          if (form.password.length < 6) throw new Error('Password must be at least 6 characters')
          await api.post(`/api/superadmin/restaurants/${id}/reset-password`, {
            password: form.password,
          })
        }
        toast('Restaurant updated')
        navigate(`/admin/restaurants/${id}`)
      } else {
        const payload = {
          name: form.name.trim(),
          owner_name: form.owner_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          logo_url: form.logo_url,
        }
        if (form.username.trim()) payload.username = form.username.trim()
        if (form.password) payload.password = form.password
        const data = await api.post('/api/superadmin/restaurants', payload)
        setCreated(data)
        toast('Restaurant created')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader label="Loading restaurant…" />

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={editing ? `/admin/restaurants/${id}` : '/admin/restaurants'}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft size={15} /> {editing ? 'Restaurant details' : 'Restaurants'}
      </Link>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
          {editing ? 'Edit restaurant' : 'New restaurant'}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
          {editing ? form.name || 'Restaurant' : 'Create a restaurant account'}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {editing
            ? 'Update the restaurant profile and owner credentials.'
            : 'The owner gets their own dashboard, menu site and QR tables the moment you create this.'}
        </p>
      </div>

      <form onSubmit={submit} className="panel mt-6 space-y-5 p-6">
        <ErrorNote>{error}</ErrorNote>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Restaurant name" required>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Food Corner"
            />
          </Field>
          <Field label="Owner name" required>
            <Input
              value={form.owner_name}
              onChange={(e) => set('owner_name', e.target.value)}
              placeholder="Rahul Sharma"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="9876543210"
              inputMode="tel"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="owner@restaurant.com"
            />
          </Field>
        </div>

        <Field label="Address">
          <TextArea
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="12 MG Road, Bengaluru"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Owner username"
            required={editing}
            hint={editing ? 'Used for the owner dashboard login.' : 'Leave blank to auto-generate.'}
          >
            <Input
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="foodcorner_admin"
              disabled={false}
            />
          </Field>
          <Field
            label={editing ? 'New owner password' : 'Owner password'}
            hint={editing ? 'Leave blank to keep the current password.' : 'Leave blank to auto-generate.'}
          >
            <Input
              type="text"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="••••••••"
            />
          </Field>
        </div>

        <ImagePicker
          label="Restaurant logo"
          folder="logos"
          ratio="aspect-[16/9]"
          value={form.logo_url}
          onChange={(url) => set('logo_url', url)}
        />

        <div className="flex flex-col-reverse gap-2 border-t border-cream-200 pt-5 sm:flex-row sm:justify-end">
          <Link
            to={editing ? `/admin/restaurants/${id}` : '/admin/restaurants'}
            className="btn-ghost"
          >
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? <><Save size={16} /> Save changes</> : <><Check size={16} /> Create restaurant</>}
          </button>
        </div>
      </form>

      <CredentialsModal
        data={created}
        onClose={() => {
          const rid = created && created.restaurant && created.restaurant.id
          setCreated(null)
          if (rid) navigate(`/admin/restaurants/${rid}`)
        }}
      />
    </div>
  )
}

/** One-time reveal of the freshly generated owner credentials. */
export function CredentialsModal({ data, onClose, title = 'Restaurant created' }) {
  const { toast } = useToast()
  if (!data) return null
  const { restaurant, credentials } = data

  function copy(text, label) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(`${label} copied`))
      .catch(() => toast('Copy failed', 'error'))
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            {restaurant.name} is live. Share these credentials with the owner — they are shown once.
          </p>
        </div>

        <div className="space-y-3">
          <CredentialRow
            label="Restaurant ID"
            value={restaurant.id}
            onCopy={() => copy(restaurant.id, 'Restaurant ID')}
          />
          <CredentialRow
            label="Customer URL"
            value={restaurant.url}
            onCopy={() => copy(window.location.origin + restaurant.url, 'URL')}
          />
          <CredentialRow
            label="Owner username"
            value={credentials.username}
            onCopy={() => copy(credentials.username, 'Username')}
          />
          <CredentialRow
            label="Owner password"
            value={credentials.password}
            onCopy={() => copy(credentials.password, 'Password')}
            highlight
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/owner/login" className="btn-ghost justify-center">
            Open owner login
          </Link>
          <button onClick={onClose} className="btn-primary justify-center">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CredentialRow({ label, value, onCopy, highlight }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">{label}</p>
        <p
          className={`truncate font-mono text-sm font-semibold ${
            highlight ? 'text-brand-600' : 'text-ink-800'
          }`}
        >
          {value}
        </p>
      </div>
      <button type="button" onClick={onCopy} className="btn btn-sm btn-ghost shrink-0">
        <Copy size={14} /> Copy
      </button>
    </div>
  )
}

export function ResetPasswordButton({ restaurantId, onDone }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      const data = await api.post(`/api/superadmin/restaurants/${restaurantId}/reset-password`, {
        password: password || undefined,
      })
      setPassword(data.password)
      toast('New password generated')
      if (onDone) onDone()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-sm btn-ghost">
        <KeyRound size={14} /> Reset password
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setPassword('')
        }}
        title="Reset owner password"
        subtitle="The owner must use the new password at their next login."
        size="sm"
      >
        <div className="space-y-4">
          {password ? (
            <div className="rounded-2xl border border-cream-300 bg-cream-100 p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                New password
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-brand-600">{password}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(password)
                  toast('Password copied')
                }}
                className="btn btn-sm btn-ghost mt-3"
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          ) : (
            <Field label="New password (optional)">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to generate one"
              />
            </Field>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => {
                setOpen(false)
                setPassword('')
              }}
              className="btn-ghost"
            >
              Close
            </button>
            {!password && (
              <button onClick={reset} disabled={busy} className="btn-primary">
                {busy ? 'Generating…' : 'Generate password'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

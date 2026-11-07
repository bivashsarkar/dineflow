import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Lock, UtensilsCrossed, User } from 'lucide-react'
import AuthShell from '../../components/AuthShell'
import { ErrorNote, Field, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

export default function OwnerLogin() {
  const { signedIn, role, signIn } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (signedIn && role === 'owner') {
    return <Navigate to="/owner/dashboard" replace />
  }
  if (signedIn && role === 'super_admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Enter your username and password')
      return
    }
    setBusy(true)
    try {
      const data = await api.post('/api/owner/login', {
        username: username.trim(),
        password,
      })
      signIn(data.token, 'owner')
      toast(data.message || 'Welcome back')
      navigate('/owner/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Your restaurant, under control."
      subtitle="Live orders, menu, table QR codes, customer requests and billing — everything for one restaurant in one dashboard."
      badge={[
        'Incoming orders update in real time',
        'Generate and print unique QR codes per table',
        'Combine table orders into one GST bill',
      ]}
      footer="DineFlow · Built by Bivash"
    >
      <span className="chip border-brand-200 bg-brand-50 text-brand-700">
        <UtensilsCrossed size={13} /> Restaurant owner
      </span>
      <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900">
        Sign in to your dashboard
      </h2>
      <p className="mt-1.5 text-sm text-ink-500">
        Your username and password were issued by the DineFlow platform owner.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <ErrorNote>{error}</ErrorNote>

        <Field label="Username" required>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourrestaurant_admin"
              autoComplete="username"
              className="pl-10"
            />
          </div>
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <Input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pl-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-500 hover:text-ink-800"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : <><KeyRound size={16} /> Sign in</>}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-500">
        Lost your password? Ask the DineFlow platform owner to reset it.
      </p>
    </AuthShell>
  )
}

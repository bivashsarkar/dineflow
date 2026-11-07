import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BellRing,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  QrCode,
  Receipt,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { BrandTagline, Logo } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { RestaurantAvatar } from '../admin/AdminDashboard'

const NAV = [
  { to: '/owner/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/owner/orders', label: 'Orders', icon: ClipboardList, badge: 'orders' },
  { to: '/owner/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/owner/tables', label: 'Tables & QR', icon: QrCode },
  { to: '/owner/requests', label: 'Requests', icon: BellRing, badge: 'requests' },
  { to: '/owner/billing', label: 'Billing', icon: Receipt },
]

export default function OwnerLayout() {
  const { signOut } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState(null)
  const [counts, setCounts] = useState({ orders: 0, requests: 0 })
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/owner/me')
      .then(setMe)
      .catch((e) => {
        setError(e.message)
        if (e.status === 403 || e.status === 401) {
          signOut()
          navigate('/owner/login', { replace: true })
        }
      })
  }, [navigate, signOut])

  const loadCounts = useCallback(() => {
    Promise.all([
      api.get('/api/owner/orders?status=PENDING').catch(() => []),
      api.get('/api/owner/requests?status=pending').catch(() => []),
    ]).then(([orders, requests]) =>
      setCounts({ orders: orders.length, requests: requests.length }),
    )
  }, [])

  useEffect(() => {
    load()
    loadCounts()
  }, [load, loadCounts])

  useSocketEvent('order:new', loadCounts)
  useSocketEvent('order:update', loadCounts)
  useSocketEvent('request:new', loadCounts)
  useSocketEvent('request:update', loadCounts)
  useSocketEvent('order:rejected', loadCounts)

  async function logout() {
    try {
      await api.post('/api/owner/logout')
    } catch {
      /* ignore */
    }
    signOut()
    toast('Signed out')
    navigate('/owner/login', { replace: true })
  }

  const restaurant = me && me.restaurant

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex items-center justify-between px-5 py-6">
        <Logo dark />
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/60">
          Owner
        </span>
      </div>

      {restaurant && (
        <div className="mx-3 mb-4 rounded-2xl bg-white/[0.06] p-3.5">
          <div className="flex items-center gap-3">
            <RestaurantAvatar logo={restaurant.logo_url} name={restaurant.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{restaurant.name}</p>
              <p className="truncate text-[11px] text-white/45">{restaurant.address || '—'}</p>
            </div>
          </div>
          <a
            href={restaurant.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[12px] font-semibold text-white/75 transition hover:bg-white/15 hover:text-white"
          >
            View customer site <ExternalLink size={12} />
          </a>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand-500 text-white shadow-[0_10px_20px_-14px_rgba(249,106,22,1)]'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon size={17} />
            <span className="flex-1">{item.label}</span>
            {item.badge && counts[item.badge] > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-[11px] font-bold text-ink-900">
                {counts[item.badge] > 99 ? '99+' : counts[item.badge]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/55 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </div>
  )

  if (error && !me) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-50 px-6 text-center">
        <div>
          <Logo />
          <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>
          <button onClick={() => navigate('/owner/login')} className="btn-primary mt-5">
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slideIn">{sidebar}</aside>
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-200 bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700" aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
          <div className="flex items-center gap-2">
            {counts.orders > 0 && (
              <span className="chip border-brand-200 bg-brand-50 text-brand-700">
                {counts.orders} pending
              </span>
            )}
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-ink-500" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          <Outlet context={{ restaurant, reload: load }} />
        </main>

        <footer className="px-6 pb-8 text-center text-xs text-ink-500 lg:text-left">
          <div className="mx-auto flex max-w-6xl items-center justify-between border-t border-cream-200 pt-5">
            <span>{restaurant ? restaurant.name : 'DineFlow'} · Owner dashboard</span>
            <span className="flex items-center gap-1.5">
              <BrandTagline /> · Built by Bivash
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  QrCode,
  X,
} from 'lucide-react'
import { BrandTagline, Logo } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/restaurants', label: 'Restaurants', icon: Building2 },
]

export default function AdminLayout() {
  const { signOut } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [])

  async function logout() {
    try {
      await api.post('/api/superadmin/logout')
    } catch {
      /* session already gone */
    }
    signOut()
    toast('Signed out')
    navigate('/admin/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="px-5 py-6">
        <Logo dark />
        <p className="mt-2 pl-1">
          <BrandTagline dark />
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-white/35">
          Platform
        </p>
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
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-sm font-bold">
            B
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Bivash</p>
            <p className="truncate text-[11px] uppercase tracking-wide text-white/40">
              Platform Owner
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/55 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
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
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-200 bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700" aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
          <Logo size={30} />
          <button onClick={logout} className="rounded-lg p-2 text-ink-500" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          <Outlet />
        </main>

        <footer className="px-6 pb-8 text-center text-xs text-ink-500 lg:text-left">
          <div className="mx-auto flex max-w-6xl items-center justify-between border-t border-cream-200 pt-5">
            <span>DineFlow — Smart QR ordering platform</span>
            <span className="flex items-center gap-1.5">
              <QrCode size={13} /> Built by Bivash
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}

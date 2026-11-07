import { Link } from 'react-router-dom'
import { ArrowRight, ChefHat, QrCode, ShieldCheck, Sparkles, UtensilsCrossed, Zap } from 'lucide-react'
import { BrandTagline, Logo } from '../components/ui'
import { BRAND } from '../lib/constants'

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Platform Control',
    text: 'Create restaurant accounts, issue owner credentials and switch restaurants on or off from one console.',
    to: '/admin/login',
    cta: 'Super Admin',
  },
  {
    icon: ChefHat,
    title: 'Restaurant Dashboard',
    text: 'Live orders, menu & categories, table QR codes, customer requests and counter billing.',
    to: '/owner/login',
    cta: 'Owner Login',
  },
  {
    icon: QrCode,
    title: 'Scan & Order',
    text: 'Guests scan the table QR, browse the menu, order and track progress — no app, no login.',
    to: '#how',
    cta: 'How it works',
  },
]

const STEPS = [
  { icon: QrCode, title: 'Scan', text: 'Guest scans the QR code on the table.' },
  { icon: UtensilsCrossed, title: 'Order', text: 'Browse the menu, add to cart, place the order.' },
  { icon: Zap, title: 'Serve', text: 'Kitchen updates progress live on the guest screen.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream-50 text-ink-800">
      {/* ---------------------------------------------------------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/admin/login" className="btn-ghost btn-sm">Super Admin</Link>
          <Link to="/owner/login" className="btn-primary btn-sm">Owner Login</Link>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:pt-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="animate-fadeUp">
            <span className="chip border-brand-200 bg-brand-50 text-brand-700">
              <Sparkles size={13} /> Multi-restaurant QR ordering platform
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.06] tracking-tight text-ink-900 sm:text-6xl">
              Every restaurant,
              <br />
              its own <span className="text-brand-500">ordering world.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-500">
              DineFlow gives each restaurant an independent menu, tables, QR codes, live orders and
              billing — all managed from a single platform. {BRAND.tagline}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/admin/login" className="btn-primary">
                Open Super Admin <ArrowRight size={16} />
              </Link>
              <Link to="/owner/login" className="btn-ghost">
                Restaurant Owner
              </Link>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-ink-500">
              {BRAND.creator}
            </p>
          </div>

          <div className="relative animate-fadeUp" style={{ animationDelay: '120ms' }}>
            <div className="absolute -inset-6 rounded-[34px] bg-gradient-to-br from-brand-100 via-cream-100 to-cream-200" />
            <div className="relative panel overflow-hidden p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                    Platform overview
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">DineFlow Console</p>
                </div>
                <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulseDot" /> Live
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { name: 'Food Corner', slug: '/r/food-corner', orders: 128, tone: 'brand' },
                  { name: 'Royal Cafe', slug: '/r/royal-cafe', orders: 86, tone: 'blue' },
                ].map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-xl font-display text-sm font-bold text-white ${
                          r.tone === 'brand' ? 'bg-brand-500' : 'bg-blue-500'
                        }`}
                      >
                        {r.name[0]}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-ink-800">{r.name}</p>
                        <p className="text-xs text-ink-500">{r.slug}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold">{r.orders}</p>
                      <p className="text-[11px] uppercase tracking-wide text-ink-500">orders</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {[
                  ['Menus', '100%'],
                  ['QR Tables', 'Unique'],
                  ['Payments', 'At counter'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white py-3 ring-1 ring-cream-200">
                    <p className="font-display text-base font-bold text-ink-800">{v}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-500">{k}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="panel p-6 animate-fadeUp" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <s.icon size={20} />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel flex flex-col p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-800 text-white">
                <f.icon size={20} />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold">{f.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500">{f.text}</p>
              <Link to={f.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-700">
                {f.cta} <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      <footer className="mx-auto max-w-6xl px-5 pb-12 pt-6">
        <div className="flex flex-col items-center justify-between gap-4 rounded-3xl bg-ink-800 px-7 py-7 text-white sm:flex-row">
          <div>
            <Logo dark />
            <p className="mt-2 text-sm text-white/60">
              <BrandTagline dark />
            </p>
          </div>
          <p className="text-sm text-white/60">
            © {new Date().getFullYear()} DineFlow · {BRAND.creator}
          </p>
        </div>
      </footer>
    </div>
  )
}

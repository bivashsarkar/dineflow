import { Link } from 'react-router-dom'
import { ArrowLeft, ScanLine } from 'lucide-react'
import { BrandTagline, Logo } from './ui'
import { BRAND } from '../lib/constants'

/**
 * Shared split-screen shell for the Super Admin and Owner login pages.
 */
export default function AuthShell({ title, subtitle, badge, children, footer }) {
  return (
    <div className="min-h-screen bg-cream-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------- */}
      <div className="relative hidden overflow-hidden bg-ink-900 px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-brand-700/25 blur-3xl" />

        <Link to="/" className="relative inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition hover:text-white">
          <ArrowLeft size={15} /> Back to home
        </Link>

        <div className="relative mt-auto max-w-lg">
          <span className="chip border-white/15 bg-white/5 text-white/70">
            <ScanLine size={13} /> {BRAND.tagline}
          </span>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">{subtitle}</p>

          <ul className="mt-9 space-y-3">
            {(badge || []).map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/75">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-12 flex items-center justify-between text-xs text-white/40">
          <BrandTagline dark />
          <span>{BRAND.creator}</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="flex min-h-screen flex-col px-5 py-8 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between lg:justify-end">
          <Link to="/" className="lg:hidden">
            <Logo />
          </Link>
          <Link to="/" className="hidden text-sm font-semibold text-ink-500 hover:text-ink-800 lg:inline-flex lg:items-center lg:gap-1.5">
            <ArrowLeft size={15} /> Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px] animate-fadeUp">
            <div className="mb-7 lg:hidden">
              <Logo />
            </div>
            {children}
          </div>
        </div>

        <p className="text-center text-xs text-ink-500">{footer}</p>
      </div>
    </div>
  )
}

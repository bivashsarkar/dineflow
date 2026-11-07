import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { ORDER_STATUS, STATUS_STYLE, BRAND } from '../lib/constants'

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner size={26} className="text-brand-500" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}

export function ButtonSpinner() {
  return <Spinner size={16} />
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export function Badge({ children, tone = 'slate', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[tone] || STATUS_STYLE.slate} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusPill({ status, className = '' }) {
  const meta = ORDER_STATUS[status] || { label: status, color: 'slate' }
  return <Badge tone={meta.color} className={className}>{meta.label}</Badge>
}

export function VegMark({ veg, size = 15 }) {
  const color = veg ? 'border-emerald-600' : 'border-red-600'
  const dot = veg ? 'bg-emerald-600' : 'bg-red-600'
  return (
    <span
      className={`inline-grid place-items-center border-2 ${color} rounded-[3px]`}
      style={{ width: size, height: size }}
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose && onClose()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  const width =
    size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : size === 'sm' ? 'max-w-md' : 'max-w-xl'

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-[3px] animate-fadeUp"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft animate-popIn sm:rounded-3xl ${width}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-ink-500 transition hover:bg-cream-100 hover:text-ink-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-cream-200 bg-cream-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, error, required, children }) {
  return (
    <div>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="ml-0.5 text-brand-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`field-input ${className}`} {...props} />
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`field-input min-h-[92px] resize-y ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`field-input appearance-none pr-9 ${className}`} {...props}>
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      className="inline-flex items-center gap-2.5 disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-brand-500' : 'bg-cream-400'
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
          style={{ height: 18, width: 18 }}
        />
      </span>
      {label && <span className="text-sm font-medium text-ink-700">{label}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon: Icon, title, subtitle, action, compact }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8' : 'py-16'
      }`}
    >
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-cream-100 text-ink-500">
          <Icon size={24} />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-ink-700">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-ink-500">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Logo({ size = 34, dark = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-xl font-display font-bold text-white shadow-[0_8px_18px_-10px_rgba(249,106,22,.9)]"
        style={{ width: size, height: size, fontSize: size * 0.5, background: '#F96A16' }}
      >
        D
      </span>
      <span
        className={`font-display text-lg font-bold tracking-tight ${dark ? 'text-white' : 'text-ink-800'}`}
      >
        Dine<span className="text-brand-500">Flow</span>
      </span>
    </span>
  )
}

export function BrandTagline({ dark = false }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${dark ? 'text-white/50' : 'text-ink-500'}`}>
      {BRAND.tagline}
    </span>
  )
}

export function StatCard({ icon: Icon, label, value, accent = 'brand', sub }) {
  const accents = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-cream-100 text-ink-600',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-ink-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-800">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
        </div>
        {Icon && (
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${accents[accent]}`}>
            <Icon size={20} />
          </span>
        )}
      </div>
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
      {children}
    </div>
  )
}

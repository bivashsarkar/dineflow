import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-cream-300 bg-white text-ink-700',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, type = 'success', ttl = 3800) => {
      const id = ++counter.current
      setToasts((list) => [...list, { id, message, type }])
      if (ttl > 0) setTimeout(() => dismiss(id), ttl)
      return id
    },
    [dismiss],
  )

  const value = { toast, dismiss }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-6 sm:left-auto">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-soft animate-slideIn ${TONES[t.type]}`}
              role="status"
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 opacity-50 transition hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

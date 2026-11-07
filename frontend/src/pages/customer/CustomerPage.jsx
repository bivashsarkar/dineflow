import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Droplets,
  HandHelping,
  Leaf,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { Badge, EmptyState, ErrorNote, Spinner, VegMark } from '../../components/ui'
import { CUSTOMER_TRACKING_STEPS, REQUEST_TYPES } from '../../lib/constants'
import { api } from '../../lib/api'
import { useRoom, useSocketEvent } from '../../lib/socket'
import { clockTime, inr, timeAgo } from '../../lib/format'

const REQUEST_ICON = {
  call_staff: BellRing,
  water: Droplets,
  cutlery: Scissors,
  assistance: HandHelping,
  bill: UtensilsCrossed,
}

const cartKey = (token) => `dineflow_cart_${token || 'browse'}`

/* ================================================================== */
/* Main page                                                           */
/* ================================================================== */

export default function CustomerPage() {
  const { slug, token } = useParams()

  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [billOpen, setBillOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [replacement, setReplacement] = useState(null)

  /* -------------------------------------------------------------- */
  const load = useCallback(() => {
    const path = token
      ? `/api/customer/table/${token}`
      : `/api/customer/restaurant/${slug}`
    api
      .get(path)
      .then((data) => {
        setState(data)
        setError('')
      })
      .catch((e) => setError(e.message))
  }, [slug, token])

  useEffect(load, [load])

  // Restore the cart for this table after a refresh.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(token))
      setCart(raw ? JSON.parse(raw) : [])
    } catch {
      setCart([])
    }
  }, [token])

  useEffect(() => {
    try {
      localStorage.setItem(cartKey(token), JSON.stringify(cart))
    } catch {
      /* ignore */
    }
  }, [cart, token])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(t)
  }, [toast])

  /* -------------------------------------------------------------- */
  useRoom(
    state && token
      ? {
          role: 'customer',
          restaurant_id: state.restaurant.id,
          table_token: token,
        }
      : null,
    Boolean(state && token),
  )

  const upsertOrder = useCallback((order) => {
    setState((s) => {
      if (!s) return s
      const list = s.orders || []
      const exists = list.some((o) => o.id === order.id)
      return {
        ...s,
        orders: exists ? list.map((o) => (o.id === order.id ? order : o)) : [...list, order],
      }
    })
  }, [])

  useSocketEvent('order:update', upsertOrder)
  useSocketEvent('bill:updated', (bill) => setState((s) => (s ? { ...s, bill } : s)))
  useSocketEvent('bill:paid', (bill) => {
    setState((s) => (s ? { ...s, bill } : s))
    setToast('Payment received — thank you!')
  })
  useSocketEvent('request:update', (record) =>
    setState((s) => {
      if (!s) return s
      const open = (s.open_requests || []).filter((r) => r.id !== record.id)
      if (record.status === 'pending') open.push(record)
      return { ...s, open_requests: open }
    }),
  )
  useSocketEvent('replacement:new', (r) => {
    setState((s) => (s ? { ...s, pending_replacements: [...(s.pending_replacements || []), r] } : s))
    setReplacement(r)
  })

  /* -------------------------------------------------------------- */
  const items = (state && state.items) || []
  const categories = (state && state.categories) || []

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      const catOk = category === 'ALL' || i.category_id === category
      const qOk = !q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
      return catOk && qOk
    })
  }, [items, category, search])

  const cartCount = cart.reduce((n, l) => n + l.qty, 0)
  const cartTotal = cart.reduce((n, l) => n + l.qty * l.price, 0)

  function addToCart(item) {
    setCart((list) => {
      const found = list.find((l) => l.menu_item_id === item.id)
      if (found) {
        return list.map((l) =>
          l.menu_item_id === item.id ? { ...l, qty: Math.min(50, l.qty + 1) } : l,
        )
      }
      return [
        ...list,
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          veg: item.veg,
          image_url: item.image_url,
          qty: 1,
          instructions: '',
        },
      ]
    })
    setToast(`${item.name} added`)
  }

  function changeQty(menuItemId, delta) {
    setCart((list) =>
      list
        .map((l) =>
          l.menu_item_id === menuItemId ? { ...l, qty: l.qty + delta } : l,
        )
        .filter((l) => l.qty > 0),
    )
  }

  function setInstruction(menuItemId, text) {
    setCart((list) =>
      list.map((l) => (l.menu_item_id === menuItemId ? { ...l, instructions: text } : l)),
    )
  }

  async function placeOrder(note) {
    if (!token) {
      setToast('Scan the QR code at your table to place an order', 'info')
      return
    }
    setBusy('order')
    try {
      const order = await api.post('/api/customer/orders', {
        table_token: token,
        note,
        items: cart.map((l) => ({
          menu_item_id: l.menu_item_id,
          qty: l.qty,
          instructions: l.instructions,
        })),
      })
      upsertOrder(order)
      setCart([])
      setCartOpen(false)
      setToast('Order placed! The kitchen has been notified.')
      setTimeout(() => {
        const el = document.getElementById('my-orders')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 250)
    } catch (e) {
      setToast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  async function sendRequest(type) {
    if (!token) {
      setToast('Scan the QR code at your table first', 'info')
      return
    }
    setBusy(type)
    try {
      const record = await api.post('/api/customer/requests', { table_token: token, type })
      setState((s) => {
        if (!s) return s
        const open = (s.open_requests || []).filter((r) => r.id !== record.id)
        open.push(record)
        return { ...s, open_requests: open }
      })
      setToast(record.message || `${REQUEST_TYPES[type].label} requested`)
    } catch (e) {
      setToast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  async function respondReplacement(action) {
    if (!replacement) return
    setBusy('replacement')
    try {
      const order = await api.post(
        `/api/customer/replacements/${replacement.id}/respond`,
        { action },
      )
      upsertOrder(order)
      setState((s) =>
        s
          ? {
              ...s,
              pending_replacements: (s.pending_replacements || []).filter(
                (r) => r.id !== replacement.id,
              ),
            }
          : s,
      )
      setReplacement(null)
      setToast(
        action === 'accept'
          ? 'Replacement accepted — your bill has been updated'
          : 'Item removed — your bill has been updated',
      )
      if (token) load()
    } catch (e) {
      setToast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  /* -------------------------------------------------------------- */
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-50 px-6 text-center">
        <div className="max-w-md">
          <CircleAlert size={40} className="mx-auto text-brand-500" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">We couldn't load this menu</h1>
          <p className="mt-2 text-sm text-ink-500">{error}</p>
          <button onClick={load} className="btn-primary mt-6">
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-50">
        <div className="text-center">
          <Spinner size={28} className="mx-auto text-brand-500" />
          <p className="mt-3 text-sm font-semibold text-ink-500">Setting your table…</p>
        </div>
      </div>
    )
  }

  const restaurant = state.restaurant
  const orders = state.orders || []
  const pendingReplacements = state.pending_replacements || []
  const openRequests = state.open_requests || []
  const activeOrders = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'REJECTED')

  return (
    <div className="min-h-screen bg-cream-50 pb-32">
      {/* ============================================================ */}
      {/* Header                                                       */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-cream-200" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500 font-display text-lg font-bold text-white">
              {restaurant.name[0]}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold leading-tight text-ink-900">
              {restaurant.name}
            </h1>
            <p className="truncate text-[12px] text-ink-500">{restaurant.address}</p>
          </div>
          {token && state.table ? (
            <span className="shrink-0 rounded-xl bg-ink-800 px-3 py-1.5 text-center text-white">
              <span className="block text-[9px] font-bold uppercase tracking-widest text-white/50">
                Table
              </span>
              <span className="block font-display text-base font-bold leading-none">
                {state.table.number}
              </span>
            </span>
          ) : (
            <span className="chip shrink-0 border-amber-200 bg-amber-50 text-amber-700">
              Browse only
            </span>
          )}
        </div>

        {!token && (
          <div className="bg-brand-500 px-4 py-2 text-center text-[13px] font-semibold text-white">
            Scan the QR code on your table to start ordering
          </div>
        )}
      </header>

      {/* ============================================================ */}
      <main className="mx-auto max-w-3xl px-4">
        {/* Hero ---------------------------------------------------- */}
        <section className="pt-6">
          <span className="chip border-brand-200 bg-brand-50 text-brand-700">
            <Sparkles size={13} /> {restaurant.tagline}
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            What are you craving today?
          </h2>
          {restaurant.phone && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-500">
              <Phone size={13} /> {restaurant.phone}
            </p>
          )}
        </section>

        {/* Replacement alert --------------------------------------- */}
        {pendingReplacements.length > 0 && (
          <button
            onClick={() => setReplacement(pendingReplacements[0])}
            className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-left animate-fadeUp"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Leaf size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-amber-900">
                {pendingReplacements.length} dish{pendingReplacements.length === 1 ? '' : 's'} ran out
              </span>
              <span className="block text-xs text-amber-700">
                Tap to choose a replacement
              </span>
            </span>
            <ArrowRight size={17} className="text-amber-700" />
          </button>
        )}

        {/* My orders ----------------------------------------------- */}
        {orders.length > 0 && (
          <section id="my-orders" className="mt-7 scroll-mt-28">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-ink-900">Your order</h3>
              <span className="text-xs font-semibold text-ink-500">
                {activeOrders.length > 0
                  ? `${activeOrders.length} in progress`
                  : 'No active orders'}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {orders
                .slice()
                .reverse()
                .map((o) => (
                  <OrderTracker key={o.id} order={o} />
                ))}
            </div>
          </section>
        )}

        {/* Search + categories ------------------------------------- */}
        <section className="sticky top-[73px] z-30 -mx-4 mt-7 bg-cream-50/95 px-4 pb-3 pt-3 backdrop-blur">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for dishes…"
              className="field-input rounded-full pl-11 pr-10"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-500 hover:text-ink-800"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
            <button
              onClick={() => setCategory('ALL')}
              className={`chip shrink-0 ${
                category === 'ALL'
                  ? 'border-ink-800 bg-ink-800 text-white'
                  : 'border-cream-300 bg-white text-ink-600'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`chip shrink-0 ${
                  category === c.id
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-cream-300 bg-white text-ink-600'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>

        {/* Menu ---------------------------------------------------- */}
        <section className="mt-4">
          {visibleItems.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={UtensilsCrossed}
                title={items.length === 0 ? 'Menu coming shortly' : 'No dishes found'}
                subtitle={
                  items.length === 0
                    ? 'The restaurant is still plating up its menu. Check back in a moment.'
                    : 'Try a different search or category.'
                }
              />
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {visibleItems.map((item) => (
                <FoodCard
                  key={item.id}
                  item={item}
                  qty={(cart.find((l) => l.menu_item_id === item.id) || {}).qty || 0}
                  onAdd={() => addToCart(item)}
                  onIncrement={() => changeQty(item.id, 1)}
                  onDecrement={() => changeQty(item.id, -1)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Footer -------------------------------------------------- */}
        <footer className="mt-12 border-t border-cream-200 pt-6 text-center">
          <p className="font-display text-lg font-bold text-ink-800">{restaurant.name}</p>
          <p className="mt-1 text-xs text-ink-500">{restaurant.address}</p>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
            DineFlow · Scan. Order. Serve.
          </p>
        </footer>
      </main>

      {/* ============================================================ */}
      {/* Staff request bar                                           */}
      {/* ============================================================ */}
      {token && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-white/95 backdrop-blur no-print">
          <div className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-3 py-2.5 no-scrollbar">
            {Object.entries(REQUEST_TYPES).map(([key, meta]) => {
              const Icon = REQUEST_ICON[key]
              const pending = openRequests.some((r) => r.type === key)
              return (
                <button
                  key={key}
                  onClick={() => sendRequest(key)}
                  disabled={busy === key}
                  className={`chip shrink-0 flex-col gap-1 rounded-2xl px-3.5 py-2.5 ${
                    pending
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-cream-300 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {busy === key ? <Spinner size={13} /> : <Icon size={15} />}
                    <span className="text-[12px] font-bold">{meta.label}</span>
                  </span>
                  {pending && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-brand-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulseDot" />
                      Sent
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Floating cart                                                */}
      {/* ============================================================ */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-3 rounded-2xl bg-brand-500 px-5 py-3.5 text-white shadow-[0_18px_36px_-16px_rgba(249,106,22,1)] transition hover:bg-brand-600 active:scale-95 no-print sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/25 text-sm font-bold">
            {cartCount}
          </span>
          <span className="text-sm font-bold">View cart</span>
          <span className="text-sm font-bold">{inr(cartTotal)}</span>
        </button>
      )}

      {/* ============================================================ */}
      {cartOpen && (
        <CartSheet
          cart={cart}
          total={cartTotal}
          busy={busy === 'order'}
          hasTable={Boolean(token)}
          onClose={() => setCartOpen(false)}
          onQty={changeQty}
          onInstruction={setInstruction}
          onPlaceOrder={placeOrder}
          onClear={() => setCart([])}
        />
      )}

      {state.bill && (
        <BillSheet
          open={billOpen}
          bill={state.bill}
          tableNumber={state.table ? state.table.number : ''}
          onClose={() => setBillOpen(false)}
        />
      )}
      {state.bill && state.bill.status === 'unpaid' && !cartOpen && (
        <button
          onClick={() => setBillOpen(true)}
          className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-2xl bg-ink-800 px-4 py-3 text-white shadow-soft transition hover:bg-ink-900 active:scale-95 no-print"
        >
          <ShoppingBag size={16} />
          <span className="text-sm font-bold">View bill · {inr(state.bill.total)}</span>
        </button>
      )}

      <ReplacementDialog
        record={replacement}
        busy={busy === 'replacement'}
        onRespond={respondReplacement}
        onClose={() => setReplacement(null)}
      />

      {/* Toast ------------------------------------------------------ */}
      {toast && (
        <div className="fixed inset-x-0 top-24 z-50 flex justify-center px-4 no-print">
          <div className="pointer-events-none flex max-w-sm items-center gap-2.5 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-soft animate-slideIn">
            <CheckCircle2 size={16} className="text-brand-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* Food card                                                           */
/* ================================================================== */

function FoodCard({ item, qty, onAdd, onIncrement, onDecrement }) {
  return (
    <article className="panel flex animate-fadeUp overflow-hidden">
      <div className="relative w-28 shrink-0 bg-cream-100 sm:w-32">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-cream-100 to-cream-200 text-ink-500/40">
            <UtensilsCrossed size={26} />
          </div>
        )}
        {item.special_offer && Number(item.mrp) > Number(item.price) && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            SAVE {inr(Number(item.mrp) - Number(item.price))}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <div className="flex items-start gap-2">
          <VegMark veg={item.veg} />
          <h3 className="flex-1 text-[15px] font-bold leading-snug text-ink-900">{item.name}</h3>
        </div>

        <div className="mt-1 flex flex-wrap gap-1.5">
          {item.bestseller && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <Leaf size={9} /> Bestseller
            </span>
          )}
          {item.special_offer && item.offer_text && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
              <Sparkles size={9} /> {item.offer_text}
            </span>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">
          {item.description || 'Freshly prepared, just for you.'}
        </p>

        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            <p className="font-display text-lg font-bold text-ink-900">{inr(item.price)}</p>
            {Number(item.mrp) > Number(item.price) && (
              <p className="text-[11px] text-ink-500 line-through">{inr(item.mrp)}</p>
            )}
          </div>

          {qty > 0 ? (
            <div className="flex items-center gap-1 rounded-xl border border-brand-500 bg-brand-50 p-1">
              <button
                onClick={onDecrement}
                className="grid h-8 w-8 place-items-center rounded-lg bg-white text-brand-600 shadow-sm"
                aria-label="Remove one"
              >
                <Minus size={15} />
              </button>
              <span className="w-6 text-center text-sm font-bold text-brand-700">{qty}</span>
              <button
                onClick={onIncrement}
                className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white shadow-sm"
                aria-label="Add one"
              >
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="rounded-xl border border-brand-500 bg-white px-4 py-2 text-sm font-bold text-brand-600 transition hover:bg-brand-500 hover:text-white active:scale-95"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/* ================================================================== */
/* Order tracker                                                       */
/* ================================================================== */

function OrderTracker({ order }) {
  const rejected = order.status === 'REJECTED'
  const currentIndex = CUSTOMER_TRACKING_STEPS.findIndex((s) => s.key === order.status)

  return (
    <div className="panel p-4 animate-fadeUp">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-ink-700">
            #{order.id.slice(-6).toUpperCase()}
          </span>
          <span className="text-xs text-ink-500">· {timeAgo(order.created_at)}</span>
        </div>
        {rejected ? (
          <span className="chip border-red-200 bg-red-50 text-red-600">Rejected</span>
        ) : (
          <span className="chip border-brand-200 bg-brand-50 text-brand-700">
            {order.status_label}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {order.items.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <VegMark veg={line.veg} size={13} />
            <span className="flex-1 text-ink-700">
              <span className="font-semibold">{line.qty}×</span> {line.name}
              {line.replaced_from && (
                <span className="text-ink-500"> (replaced {line.replaced_from})</span>
              )}
              {line.instructions && (
                <span className="block text-xs italic text-brand-600">“{line.instructions}”</span>
              )}
            </span>
            <span className="text-ink-600">{inr(line.amount)}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mt-2.5 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-600">
          Note: {order.note}
        </p>
      )}

      {rejected ? (
        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          This order was rejected by the restaurant. Please talk to the staff.
        </p>
      ) : (
        <ol className="mt-4 flex items-center">
          {CUSTOMER_TRACKING_STEPS.map((step, i) => {
            const done = i <= currentIndex
            const isLast = i === CUSTOMER_TRACKING_STEPS.length - 1
            return (
              <li key={step.key} className={`flex ${isLast ? '' : 'flex-1'} items-center`}>
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-bold transition ${
                      done
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-cream-300 bg-white text-ink-500'
                    }`}
                  >
                    {done ? <CheckCircle2 size={13} /> : i + 1}
                  </span>
                  <span
                    className={`mt-1.5 w-14 text-center text-[9px] font-bold uppercase tracking-wide ${
                      done ? 'text-brand-600' : 'text-ink-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <span
                    className={`mb-5 h-0.5 flex-1 ${i < currentIndex ? 'bg-brand-500' : 'bg-cream-200'}`}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-cream-200 pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-ink-500">
          <Clock size={13} /> {clockTime(order.created_at)}
        </span>
        <span className="font-display text-lg font-bold text-ink-900">{inr(order.total)}</span>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Cart sheet                                                          */
/* ================================================================== */

function CartSheet({
  cart,
  total,
  busy,
  hasTable,
  onClose,
  onQty,
  onInstruction,
  onPlaceOrder,
  onClear,
}) {
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center no-print">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-soft animate-popIn">
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">Your order</h3>
            <p className="text-xs text-ink-500">
              {cart.reduce((n, l) => n + l.qty, 0)} item
              {cart.reduce((n, l) => n + l.qty, 0) === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="btn btn-sm btn-danger">
              <Trash2 size={14} /> Clear
            </button>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-cream-100 text-ink-600"
              aria-label="Close cart"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-4">
            {cart.map((line) => (
              <li key={line.menu_item_id} className="border-b border-cream-200 pb-4 last:border-0">
                <div className="flex items-start gap-3">
                  <VegMark veg={line.veg} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-900">{line.name}</p>
                    <p className="text-xs text-ink-500">{inr(line.price)} each</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-cream-300 p-1">
                    <button
                      onClick={() => onQty(line.menu_item_id, -1)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-cream-100 text-ink-700"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{line.qty}</span>
                    <button
                      onClick={() => onQty(line.menu_item_id, 1)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-white"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm font-bold text-ink-900">
                    {inr(line.price * line.qty)}
                  </span>
                </div>

                <input
                  value={line.instructions}
                  onChange={(e) => onInstruction(line.menu_item_id, e.target.value)}
                  placeholder="Add instructions (less spicy, no onions…)"
                  className="mt-2.5 w-full rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-xs outline-none focus:border-brand-400"
                  maxLength={300}
                />
              </li>
            ))}
          </ul>

          {showNote ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything else the kitchen should know?"
              className="mt-4 min-h-[80px] w-full rounded-xl border border-cream-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              maxLength={500}
            />
          ) : (
            <button
              onClick={() => setShowNote(true)}
              className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              + Add a note for the kitchen
            </button>
          )}
        </div>

        <div className="border-t border-cream-200 bg-cream-50 px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-ink-500">Item total</span>
            <span className="font-display text-xl font-bold text-ink-900">{inr(total)}</span>
          </div>

          {!hasTable && (
            <ErrorNote>Scan the table QR code to place your order.</ErrorNote>
          )}

          <button
            onClick={() => onPlaceOrder(note)}
            disabled={busy || cart.length === 0 || !hasTable}
            className="btn-primary w-full py-3"
          >
            {busy ? (
              <>
                <Spinner size={16} /> Placing order…
              </>
            ) : (
              <>
                Place order · {inr(total)} <ArrowRight size={16} />
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-ink-500">
            Pay at the restaurant counter after your meal
          </p>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Bill sheet                                                          */
/* ================================================================== */

function BillSheet({ open, bill, tableNumber, onClose }) {
  if (!open) return null
  const paid = bill.status === 'paid'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center no-print">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-soft animate-popIn">
        <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">
              {paid ? 'Payment receipt' : 'Table bill'}
            </h3>
            <p className="text-xs text-ink-500">
              Table {tableNumber} · {bill.bill_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-cream-100 text-ink-600"
            aria-label="Close bill"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-2.5">
            {(bill.items || []).map((i, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-ink-700">
                  <span className="font-semibold text-ink-900">{i.qty}×</span> {i.name}
                </span>
                <span className="font-semibold text-ink-800">{inr(i.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2 border-t border-cream-200 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Subtotal</span>
              <span className="font-semibold">{inr(bill.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">GST ({Number(bill.gst_rate || 0).toFixed(0)}%)</span>
              <span className="font-semibold">{inr(bill.gst)}</span>
            </div>
            {Number(bill.discount) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span className="font-semibold">− {inr(bill.discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t-2 border-ink-800 pt-3">
              <span className="font-display text-lg font-bold">Total</span>
              <span className="font-display text-2xl font-bold text-brand-600">{inr(bill.total)}</span>
            </div>
          </div>

          {paid ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-600" />
              <p className="mt-1.5 font-display text-lg font-bold text-emerald-800">
                Paid via {String(bill.payment_method || '').toUpperCase()}
              </p>
              <p className="text-xs text-emerald-700">{timeAgo(bill.paid_at)} ago</p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm font-bold text-amber-800">Payment pending</p>
              <p className="mt-1 text-xs text-amber-700">
                Please settle this bill at the restaurant counter.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-cream-200 bg-cream-50 px-5 py-4">
          <button onClick={onClose} className="btn-ghost w-full">
            Back to menu
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Replacement dialog                                                  */
/* ================================================================== */

function ReplacementDialog({ record, busy, onRespond, onClose }) {
  if (!record) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 no-print">
      <div className="absolute inset-0 bg-ink-900/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-soft animate-popIn">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Leaf size={22} />
        </span>
        <h3 className="mt-4 font-display text-xl font-bold text-ink-900">
          {record.original_name} just ran out
        </h3>
        <p className="mt-1.5 text-sm text-ink-500">
          The kitchen suggests this instead. Your bill updates automatically.
        </p>

        <div className="mt-5 rounded-2xl border border-cream-200 bg-cream-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Instead you get
              </p>
              <p className="mt-1 font-display text-lg font-bold text-ink-900">
                {record.replacement_name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold text-brand-600">
                {inr(record.replacement_price)}
              </p>
              {Number(record.replacement_price) !== Number(record.original_price) && (
                <p className="text-xs text-ink-500 line-through">{inr(record.original_price)}</p>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Quantity: {record.original_qty} · your bill is recalculated either way.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => onRespond('reject')}
            disabled={busy}
            className="btn-ghost flex-1 justify-center"
          >
            No thanks, remove it
          </button>
          <button
            onClick={() => onRespond('accept')}
            disabled={busy}
            className="btn-primary flex-1 justify-center"
          >
            {busy ? 'Sending…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Flame,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Badge,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageLoader,
  TextArea,
  Toggle,
  VegMark,
} from '../../components/ui'
import ImagePicker from '../../components/ImagePicker'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'
import { useSocketEvent } from '../../lib/socket'
import { inr } from '../../lib/format'

const BLANK = {
  name: '',
  description: '',
  price: '',
  offer_price: '',
  offer_text: '',
  category_id: '',
  image_url: '',
  veg: false,
  bestseller: false,
  special_offer: false,
  available: true,
}

export default function OwnerMenu() {
  const { toast } = useToast()
  const [items, setItems] = useState(null)
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // item object | 'new' | null
  const [replacementFor, setReplacementFor] = useState(null)
  const [catModal, setCatModal] = useState(null) // {id?, name} | null
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    Promise.all([
      api.get('/api/owner/menu').catch((e) => {
        throw e
      }),
      api.get('/api/owner/categories').catch(() => []),
    ])
      .then(([menu, cats]) => {
        setItems(menu)
        setCategories(cats)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])
  useSocketEvent('menu:changed', load)

  /* -------------------------------------------------------------- */
  async function toggleAvailability(item) {
    setBusy(item.id)
    try {
      if (item.available) {
        await api.post(`/api/owner/menu/${item.id}/unavailable`, {})
        toast(`“${item.name}” marked unavailable`)
        load()
      } else {
        await api.patch(`/api/owner/menu/${item.id}/availability`, { available: true })
        toast(`“${item.name}” is available again`)
        load()
      }
    } catch (e) {
      if (e.code === 'replacement_required') {
        setReplacementFor(item)
      } else {
        toast(e.message, 'error')
      }
    } finally {
      setBusy('')
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Delete “${item.name}” permanently?`)) return
    setBusy(item.id)
    try {
      await api.del(`/api/owner/menu/${item.id}`)
      toast('Menu item deleted')
      load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  async function saveCategory(payload) {
    try {
      if (payload.id) {
        await api.put(`/api/owner/categories/${payload.id}`, { name: payload.name })
        toast('Category updated')
      } else {
        await api.post('/api/owner/categories', { name: payload.name })
        toast('Category added')
      }
      setCatModal(null)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function deleteCategory(cat) {
    try {
      await api.del(`/api/owner/categories/${cat.id}`)
      toast('Category deleted')
      if (activeCategory === cat.id) setActiveCategory('ALL')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  /* -------------------------------------------------------------- */
  const filtered = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      const catOk = activeCategory === 'ALL' || i.category_id === activeCategory
      const qOk = !q || i.name.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      return catOk && qOk
    })
  }, [items, activeCategory, search])

  if (error) return <EmptyState icon={UtensilsCrossed} title="Could not load menu" subtitle={error} />
  if (!items || !categories) return <PageLoader label="Loading your menu…" />

  const catName = (id) => {
    const c = categories.find((x) => x.id === id)
    return c ? c.name : 'Uncategorised'
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">Menu management</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900">
            Food & categories
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {items.length} item{items.length === 1 ? '' : 's'} · {categories.length} categor
            {categories.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal({ name: '' })} className="btn-ghost">
            <Tag size={15} /> New category
          </button>
          <button onClick={() => setEditing('new')} className="btn-primary">
            <Plus size={16} /> Add food
          </button>
        </div>
      </div>

      {/* Categories -------------------------------------------------- */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`chip shrink-0 ${
            activeCategory === 'ALL'
              ? 'border-ink-800 bg-ink-800 text-white'
              : 'border-cream-300 bg-white text-ink-600 hover:border-cream-400'
          }`}
        >
          All
          <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{items.length}</span>
        </button>

        {categories.map((c) => (
          <span key={c.id} className="group flex shrink-0 items-center">
            <button
              onClick={() => setActiveCategory(c.id)}
              className={`chip rounded-r-none border-r-0 ${
                activeCategory === c.id
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-cream-300 bg-white text-ink-600 hover:border-cream-400'
              }`}
            >
              {c.name}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  activeCategory === c.id ? 'bg-white/25' : 'bg-cream-200 text-ink-600'
                }`}
              >
                {c.item_count ?? 0}
              </span>
            </button>
            <button
              onClick={() => setCatModal({ id: c.id, name: c.name })}
              title="Edit category"
              className={`grid h-9 w-8 place-items-center border transition ${
                activeCategory === c.id
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-cream-300 bg-white text-ink-500 hover:text-ink-800'
              }`}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => deleteCategory(c)}
              title="Delete category"
              className={`-ml-px grid h-9 w-8 place-items-center rounded-r-lg border transition ${
                activeCategory === c.id
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-cream-300 bg-white text-ink-500 hover:text-red-600'
              }`}
            >
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>

      {/* Search ------------------------------------------------------ */}
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your menu…"
          className="pl-4"
        />
      </div>

      {/* Items ------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={UtensilsCrossed}
            title={items.length === 0 ? 'Your menu is empty' : 'Nothing matches'}
            subtitle={
              items.length === 0
                ? 'Add your first dish — it appears on the customer site straight away.'
                : 'Try another search or category.'
            }
            action={
              items.length === 0 ? (
                <button onClick={() => setEditing('new')} className="btn-primary btn-sm">
                  <Plus size={15} /> Add food
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className={`panel flex overflow-hidden animate-fadeUp ${
                item.available ? '' : 'opacity-70'
              }`}
            >
              <div className="relative h-auto w-28 shrink-0 bg-cream-100 sm:w-32">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-ink-500/50">
                    <UtensilsCrossed size={22} />
                  </div>
                )}
                {!item.available && (
                  <span className="absolute inset-0 grid place-items-center bg-ink-900/65 text-[11px] font-bold uppercase tracking-widest text-white">
                    Unavailable
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col p-4">
                <div className="flex items-start gap-2">
                  <VegMark veg={item.veg} />
                  <h3 className="flex-1 truncate font-semibold text-ink-800" title={item.name}>
                    {item.name}
                  </h3>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                  {item.description || 'No description'}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.bestseller && (
                    <Badge tone="amber">
                      <Star size={9} /> Bestseller
                    </Badge>
                  )}
                  {item.special_offer && (
                    <Badge tone="brand">
                      <Flame size={9} /> {item.offer_text || 'Offer'}
                    </Badge>
                  )}
                  <Badge tone="slate">{catName(item.category_id)}</Badge>
                </div>

                <div className="mt-auto flex items-end justify-between pt-3">
                  <div>
                    {item.special_offer && Number(item.offer_price) > 0 ? (
                      <>
                        <p className="font-display text-lg font-bold text-brand-600">
                          {inr(item.offer_price)}
                        </p>
                        <p className="text-xs text-ink-500 line-through">{inr(item.price)}</p>
                      </>
                    ) : (
                      <p className="font-display text-lg font-bold text-ink-900">{inr(item.price)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleAvailability(item)}
                      disabled={busy === item.id}
                      title={item.available ? 'Mark unavailable' : 'Mark available'}
                      className={`btn btn-sm ${
                        item.available ? 'btn-ghost' : 'btn-primary'
                      }`}
                    >
                      {busy === item.id ? '…' : item.available ? 'Available' : 'Unavailable'}
                    </button>
                    <button
                      onClick={() => setEditing(item)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-cream-300 text-ink-600 transition hover:bg-cream-100"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(item)}
                      disabled={busy === item.id}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-red-100 text-red-500 transition hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modals ------------------------------------------------------ */}
      {editing && (
        <ItemModal
          item={editing === 'new' ? null : editing}
          categories={categories}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      <CategoryModal
        value={catModal}
        onClose={() => setCatModal(null)}
        onSave={saveCategory}
      />

      {replacementFor && (
        <ReplacementModal
          item={replacementFor}
          items={items}
          onClose={() => setReplacementFor(null)}
          onDone={() => {
            setReplacementFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Item form                                                           */
/* ------------------------------------------------------------------ */

function ItemModal({ item, categories, items, onClose, onSaved }) {
  const { toast } = useToast()
  const [form, setForm] = useState(() =>
    item
      ? {
          ...BLANK,
          ...item,
          price: String(item.price ?? ''),
          offer_price: String(item.offer_price ?? ''),
        }
      : {
          ...BLANK,
          category_id: categories[0] ? categories[0].id : '',
        },
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Food name is required')
    if (form.price === '' || Number(form.price) < 0) return setError('Enter a valid price')

    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        category_id: form.category_id,
        image_url: form.image_url,
        veg: form.veg,
        bestseller: form.bestseller,
        special_offer: form.special_offer,
        offer_text: form.offer_text.trim(),
        offer_price: Number(form.offer_price || 0),
        available: form.available,
      }
      if (item) {
        await api.put(`/api/owner/menu/${item.id}`, payload)
        toast('Menu item updated')
      } else {
        await api.post('/api/owner/menu', payload)
        toast('Menu item added')
      }
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const suggestions = items.filter((i) => i.id !== (item && item.id))

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit food item' : 'Add food item'}
      subtitle={item ? item.name : 'It goes live on the customer site immediately.'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <ErrorNote>{error}</ErrorNote>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Food name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Chicken Biryani" />
          </Field>
          <Field label="Category">
            <div className="flex gap-2">
              <select
                value={form.category_id}
                onChange={(e) => set('category_id', e.target.value)}
                className="field-input flex-1"
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        <Field label="Description">
          <TextArea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Fragrant basmati rice cooked with tender chicken and spices"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Price (₹)" required>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="180"
            />
          </Field>
          <Field label="Category filter preview" hint="Tip: set a category so guests can filter.">
            <div className="flex h-[42px] items-center gap-2 rounded-xl border border-cream-200 bg-cream-50 px-3.5 text-sm text-ink-500">
              <Tag size={14} />
              {form.category_id
                ? (categories.find((c) => c.id === form.category_id) || {}).name
                : 'No category'}
            </div>
          </Field>
        </div>

        <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
          <div className="flex flex-wrap items-center gap-5">
            <Toggle checked={form.veg} onChange={(v) => set('veg', v)} label="Vegetarian" />
            <Toggle checked={form.bestseller} onChange={(v) => set('bestseller', v)} label="Bestseller" />
            <Toggle
              checked={form.available}
              onChange={(v) => set('available', v)}
              label="Available"
            />
          </div>

          <div className="mt-4 border-t border-cream-200 pt-4">
            <Toggle
              checked={form.special_offer}
              onChange={(v) => set('special_offer', v)}
              label="Special offer"
            />
            {form.special_offer && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Offer label">
                  <Input
                    value={form.offer_text}
                    onChange={(e) => set('offer_text', e.target.value)}
                    placeholder="Today only · 20% off"
                  />
                </Field>
                <Field label="Offer price (₹)">
                  <Input
                    type="number"
                    min="0"
                    value={form.offer_price}
                    onChange={(e) => set('offer_price', e.target.value)}
                    placeholder="144"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <ImagePicker
          label="Food photo"
          folder="food"
          value={form.image_url}
          onChange={(url) => set('image_url', url)}
        />

        {suggestions.length === 0 && (
          <p className="text-xs text-ink-500">
            Add at least two dishes so you can offer replacements when something runs out.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-cream-200 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add to menu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Category form                                                       */
/* ------------------------------------------------------------------ */

function CategoryModal({ value, onClose, onSave }) {
  const [name, setName] = useState(value ? value.name : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!value) return null

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Category name is required')
    setBusy(true)
    try {
      await onSave({ id: value.id, name: name.trim() })
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
      title={value.id ? 'Rename category' : 'New category'}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Category name" required>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Starters"
          />
        </Field>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Replacement picker                                                  */
/* ------------------------------------------------------------------ */

function ReplacementModal({ item, items, onClose, onDone }) {
  const { toast } = useToast()
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const options = items.filter(
    (i) => i.id !== item.id && i.available && i.category_id === item.category_id,
  )
  const fallback = items.filter((i) => i.id !== item.id && i.available)

  const list = options.length ? options : fallback

  async function confirm(withReplacement) {
    setBusy(true)
    setError('')
    try {
      const payload = withReplacement ? { replacement_item_id: choice } : {}
      await api.post(`/api/owner/menu/${item.id}/unavailable`, payload)
      toast(`“${item.name}” marked unavailable`)
      onDone()
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
      title="Item is inside live orders"
      subtitle={`“${item.name}” is currently being prepared for a table.`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => confirm(true)} disabled={!choice || busy} className="btn-primary">
            <ArrowLeftRight size={15} />
            {busy ? 'Saving…' : 'Offer replacement'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <p className="text-sm text-ink-600">
          The guest is asked to accept or reject your suggestion. Their order and bill update
          automatically.
        </p>

        {list.length === 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            No other available dish to offer — add or enable one first.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {list.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => setChoice(i.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                    choice === i.id
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-cream-200 bg-white hover:border-cream-400'
                  }`}
                >
                  <VegMark veg={i.veg} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink-800">{i.name}</span>
                    <span className="truncate text-xs text-ink-500">
                      {i.description || 'Available now'}
                    </span>
                  </span>
                  <span className="font-semibold text-ink-800">{inr(i.price)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

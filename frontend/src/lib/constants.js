/** Domain constants mirrored from the backend. */

export const ORDER_STATUS = {
  PENDING: { label: 'Pending', color: 'amber', next: ['ACCEPTED', 'REJECTED'] },
  ACCEPTED: { label: 'Accepted', color: 'blue', next: ['PREPARING'] },
  PREPARING: { label: 'Preparing', color: 'violet', next: ['READY'] },
  READY: { label: 'Ready', color: 'cyan', next: ['SERVED'] },
  SERVED: { label: 'Served', color: 'emerald', next: ['COMPLETED'] },
  COMPLETED: { label: 'Completed', color: 'slate', next: [] },
  REJECTED: { label: 'Rejected', color: 'red', next: [] },
}

/** The step a customer sees while tracking an order. */
export const CUSTOMER_TRACKING_STEPS = [
  { key: 'PENDING', label: 'Placed', hint: 'We received your order' },
  { key: 'ACCEPTED', label: 'Accepted', hint: 'The kitchen confirmed it' },
  { key: 'PREPARING', label: 'Preparing', hint: 'Your food is being cooked' },
  { key: 'READY', label: 'Ready', hint: 'Ready to be served' },
  { key: 'SERVED', label: 'Served', hint: 'Enjoy your meal' },
  { key: 'COMPLETED', label: 'Completed', hint: 'Thank you!' },
]

export const REQUEST_TYPES = {
  call_staff: { label: 'Call Staff', hint: 'Someone to the table' },
  water: { label: 'Water', hint: 'Bring water' },
  cutlery: { label: 'Cutlery', hint: 'Spoons & forks' },
  assistance: { label: 'Assistance', hint: 'Need help' },
  bill: { label: 'Bill', hint: 'Request the bill' },
}

export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
]

/** Colour classes for a status name. */
export const STATUS_STYLE = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
}

export const BRAND = {
  name: 'DineFlow',
  tagline: 'Scan. Order. Serve.',
  creator: 'Built by Bivash',
}

/**
 * Tiny fetch wrapper for the DineFlow API.
 * Stores the session token in localStorage and attaches it automatically.
 */

const TOKEN_KEY = 'dineflow_token'
const ROLE_KEY = 'dineflow_role'

export function setAuth(token, role) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, role)
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getRole() {
  return localStorage.getItem(ROLE_KEY) || ''
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request(method, path, body) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let payload
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      payload = body
    } else {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
  }

  let res
  try {
    res = await fetch(path, { method, headers, body: payload })
  } catch {
    throw new ApiError('Cannot reach the DineFlow server. Is the backend running?', 0, 'network')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.status === 401 && getToken()) {
    clearAuth()
    if (!window.location.pathname.startsWith('/owner/login') &&
        !window.location.pathname.startsWith('/admin/login')) {
      const role = getRole()
      window.location.href = role === 'super_admin' ? '/admin/login' : '/owner/login'
    }
  }

  if (!res.ok || (data && data.success === false)) {
    throw new ApiError(
      (data && data.message) || `Request failed (${res.status})`,
      res.status,
      data && data.code,
    )
  }
  return data ? data.data : null
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),
}

/** Upload a File/FormData payload. */
export const upload = (path, formData) => request('POST', path, formData)

/** Fetch a protected file (PDF invoice, QR PNG) and save it to disk. */
export async function downloadAuthed(url, filename) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    let message = 'Download failed'
    try {
      const body = await res.json()
      message = body.message || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 5000)
}

/** Fetch a protected document and return its text (used for print views). */
export async function fetchAuthedText(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Request failed')
  return res.text()
}

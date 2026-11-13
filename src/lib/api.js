// Small fetch wrapper for the /api backend. Throws ApiError with the server message.
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const type = res.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data)
  return data
}

export const api = {
  get: (url, params) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : ''
    return request('GET', qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url)
  },
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
}

export function formatDate(v, withTime = false) {
  if (!v) return ''
  const d = new Date(v)
  return withTime ? d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('en-US', { dateStyle: 'medium' })
}

export function usd(n) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Downscale an uploaded image and return a JPEG data URL (stored in the DB).
export function fileToDataUrl(file, max = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale)
        c.height = Math.round(img.height * scale)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

import crypto from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra)
export const notFound = (msg = 'Not found') => new HttpError(404, msg)
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg)
export const unauthorized = (msg = 'Please log in') => new HttpError(401, msg)

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d }
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
export const bool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on'
export const str = (v, max = 4000) => (v == null ? '' : String(v)).trim().slice(0, max)

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item'
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''))

// ---- passwords (scrypt) ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false
  const [, salt, hash] = stored.split('$')
  const test = crypto.scryptSync(String(pw), salt, 32)
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'))
}

// ---- signed cookie session ----
const SECRET = () => process.env.SESSION_SECRET || 'dev-only-secret-change-me'
export function sign(value) {
  const mac = crypto.createHmac('sha256', SECRET()).update(String(value)).digest('base64url').slice(0, 32)
  return `${value}.${mac}`
}
export function unsign(token) {
  if (!token || typeof token !== 'string') return null
  const i = token.lastIndexOf('.')
  if (i < 1) return null
  const value = token.slice(0, i)
  const expected = sign(value)
  if (expected.length !== token.length) return null
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? value : null
}
export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
export function cookie(name, value, { maxAge = 60 * 60 * 24 * 365, secure = false } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export const randomCode = (len = 12) => crypto.randomBytes(len).toString('hex').slice(0, len).toUpperCase()
export const randomToken = () => crypto.randomBytes(24).toString('base64url')

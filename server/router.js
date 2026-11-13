import { HttpError } from './util.js'
import { loadCustomer } from './core.js'
import { ensureSchema } from './migrate.js'
import { q } from './db.js'
import storeRoutes from './routes/store.js'
import accountRoutes from './routes/account.js'
import checkoutRoutes from './routes/checkout.js'
import adminRoutes from './routes/admin.js'

const routes = []
function add(method, path, handler) {
  const keys = []
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '/?$')
  routes.push({ method, re, keys, handler })
}
const api = {
  get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), put: (p, h) => add('PUT', p, h),
  patch: (p, h) => add('PATCH', p, h), del: (p, h) => add('DELETE', p, h),
}
storeRoutes(api)
accountRoutes(api)
checkoutRoutes(api)
adminRoutes(api)

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? safeJson(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? safeJson(raw) : {}
}
function safeJson(s) { try { return JSON.parse(s) } catch { return {} } }

function send(res, status, data, headers = {}) {
  if (res.headersSent) return
  res.statusCode = status
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  if (data && data.__raw) {
    res.setHeader('Content-Type', data.type)
    if (data.filename) res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`)
    res.end(data.body)
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data ?? {}))
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://local')
  let path = url.pathname.replace(/^\/api/, '') || '/'
  if (url.searchParams.has('__path')) { path = '/' + url.searchParams.get('__path'); url.searchParams.delete('__path') }
  const method = req.method === 'HEAD' ? 'GET' : req.method
  const route = routes.find((r) => r.method === method && r.re.test(path))
  if (!route) return send(res, 404, { error: `No route ${method} ${path}` })
  try {
    await ensureSchema()
    const m = path.match(route.re)
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
    const query = Object.fromEntries(url.searchParams.entries())
    req.ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || ''
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await readBody(req) : {}
    const ctx = { req, res, params, query, body, customer: await loadCustomer(req) }
    const out = await route.handler(ctx)
    send(res, 200, out)
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) })
    console.error(e)
    q('insert into system_log (level, short_message, full_message, page_url) values ($1,$2,$3,$4)', ['Error', String(e.message).slice(0, 300), String(e.stack || ''), path]).catch(() => {})
    send(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}

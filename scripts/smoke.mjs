import { handle } from '../server/router.js'
let cookie = ''
async function call(method, url, body) {
  return new Promise((resolve) => {
    const req = { method, url, headers: { cookie }, body, socket: {} }
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(b) { 
      if (this.headers['set-cookie']) cookie = this.headers['set-cookie'].split(';')[0]
      let d = b; try { d = JSON.parse(b) } catch {}
      resolve({ status: this.statusCode, data: d }) } }
    handle(req, res)
  })
}
const t0 = Date.now()
const show = (label, r, f = (d) => d) => console.log(label, r.status, JSON.stringify(f(r.data)).slice(0, 300))
show('bootstrap', await call('GET', '/api/bootstrap'), (d) => ({ cats: d.categories?.length, err: d.error }))
console.log('ms', Date.now() - t0)
show('home', await call('GET', '/api/home'), (d) => ({ f: d.featured?.length, b: d.bestsellers?.length, polls: d.polls?.length, err: d.error }))
show('catalog', await call('GET', '/api/catalog?category=notebooks&sort=price_asc'), (d) => ({ total: d.total, first: d.products?.[0]?.name, specs: d.filters?.specs?.length, err: d.error }))
show('search', await call('GET', '/api/catalog?q=aurora'), (d) => ({ total: d.total, err: d.error }))
const pd = await call('GET', '/api/products/aurora-tower-pro'); show('product', pd, (d) => ({ attrs: d.attributes?.length, tiers: d.tierPrices?.length, err: d.error }))
const a = pd.data.attributes
const sel = {}; for (const m of a) { const v = m.values.find(v => v.preselected) || m.values[0]; if (v) sel[m.id] = m.control === 'checkbox' ? [v.id] : v.id }
show('add', await call('POST', '/api/cart', { productId: pd.data.id, quantity: 2, attributes: sel }))
show('add simple', await call('POST', '/api/cart', { productId: 2, quantity: 1, fromList: true }))
show('coupon', await call('POST', '/api/cart/coupon', { code: 'WELCOME10' }))
show('cart', await call('GET', '/api/cart'), (d) => ({ n: d.items?.length, totals: d.totals, w: d.items?.map(i=>i.warnings), err: d.error }))
show('opts', await call('GET', '/api/checkout/options'), (d) => ({ ship: d.shippingOptions, pay: d.paymentMethods?.length, err: d.error }))
const addr = { firstName: 'Test', lastName: 'User', email: 't@example.com', countryId: 2, city: 'HCMC', address1: '1 A', zip: '70000', phone: '0900' }
show('confirm', await call('POST', '/api/checkout/confirm', { billingAddress: addr, shipToSameAddress: true, shippingMethodId: 1, paymentMethod: 'Payments.Manual', paymentInfo: { cardholderName: 'T', cardNumber: '4111111111111111', expireMonth: 12, expireYear: 2030, cardCode: '123' } }))
show('login', await call('POST', '/api/auth/login', { email: 'admin@yourstore.com', password: 'admin' }))
show('dash', await call('GET', '/api/admin/dashboard'), (d) => ({ counts: d.counts, err: d.error }))
show('orders', await call('GET', '/api/admin/orders'), (d) => ({ total: d.total, err: d.error }))
show('cats', await call('GET', '/api/admin/e/categories'), (d) => ({ total: d.total, err: d.error }))
show('disc', await call('GET', '/api/admin/e/discounts/1'), (d) => ({ name: d.name, err: d.error }))
show('report', await call('GET', '/api/admin/reports/sales?groupBy=month'), (d) => d)
show('emails', await call('GET', '/api/admin/e/queued_emails'), (d) => ({ total: d.total, s: d.rows?.map(r=>r.subject) }))
process.exit(0)

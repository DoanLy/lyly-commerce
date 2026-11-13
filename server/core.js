import { q, one } from './db.js'
import { round2, unsign, sign, parseCookies, cookie, bad, HttpError } from './util.js'

// ---------------- settings ----------------
export const DEFAULT_SETTINGS = {
  store: {
    name: 'LyLy Commerce', tagline: 'Everyday tech, style & gifts', url: 'https://lyly-commerce.vercel.app',
    companyName: 'LyLy Commerce Co.', companyAddress: '12 Nguyen Hue, District 1, Ho Chi Minh City', companyPhone: '+84 28 0000 1234',
    email: 'hello@lyly-commerce.example', storeClosed: false, announcement: 'Free shipping on orders over $100 · 30-day returns',
  },
  catalog: {
    showSku: true, showManufacturerPartNumber: false, showGtin: false, reviewsMustBeApproved: false, allowAnonymousReviews: false,
    emailAFriendEnabled: true, allowAnonymousEmailAFriend: false, compareEnabled: true, compareMax: 4, recentlyViewedEnabled: true,
    recentlyViewedCount: 4, newProductsEnabled: true, newProductsCount: 6, searchMinLength: 3, searchAutocomplete: true,
    alsoPurchasedEnabled: true, alsoPurchasedCount: 4, bestsellersOnHome: 4, showProductsFromSubcategories: true,
    productTagsEnabled: true, wishlistEnabled: true, emailWishlistEnabled: true, defaultViewMode: 'grid', showDiscountBadge: true,
  },
  orders: {
    minOrderSubtotal: 0, termsOfServiceOnCart: true, termsOfServiceOnConfirm: false, anonymousCheckoutAllowed: true,
    returnRequestsEnabled: true, returnDays: 365, reorderAllowed: true, giftCardsActivatedOnPaid: true, cancelRestoresStock: true,
    returnReasons: ['Received wrong product', 'Wrong product ordered', 'There was a problem with the product'],
    returnActions: ['Repair', 'Replacement', 'Store credit'],
  },
  shipping: { freeShippingOverEnabled: true, freeShippingOver: 100, allowPickupInStore: true, estimateEnabled: true, shipToSameAddressDefault: true },
  tax: { pricesIncludeTax: false, displayTaxSuffix: true, shippingTaxable: false, paymentFeeTaxable: false, displayTaxRates: true },
  rewardPoints: { enabled: true, pointsForRegistration: 50, earnPerAmount: 10, earnPoints: 1, exchangeRate: 0.01, minimumToUse: 0, awardWhen: 'Paid' },
  customer: {
    usernamesEnabled: false, genderEnabled: true, dobEnabled: true, companyEnabled: true, phoneEnabled: true, newsletterEnabled: true,
    passwordMinLength: 6, allowChangeEmail: true, onlineMinutes: 20,
  },
  newsletter: { enabled: true, popupEnabled: false },
  polls: { enabled: true, showOnHome: true },
  blog: { enabled: true, commentsMustBeApproved: false, postsPageSize: 5 },
  news: { enabled: true, commentsMustBeApproved: false, onHome: 3, pageSize: 6 },
  seo: { title: 'LyLy Commerce', description: 'LyLy Commerce — demo e-commerce storefront' },
}

let settingsCache = null
let settingsAt = 0
export async function getSettings() {
  if (settingsCache && Date.now() - settingsAt < 15000) return settingsCache
  const rows = await q('select key, value from settings')
  const merged = structuredClone(DEFAULT_SETTINGS)
  for (const r of rows) merged[r.key] = { ...(merged[r.key] || {}), ...(r.value || {}) }
  settingsCache = merged
  settingsAt = Date.now()
  return merged
}
export function clearSettingsCache() { settingsCache = null }

// ---------------- customer context ----------------
const COOKIE = 'lyc'

export async function loadCustomer(req) {
  const cookies = parseCookies(req.headers.cookie)
  const id = Number(unsign(cookies[COOKIE]))
  if (!id) return null
  const c = await one('select * from customers where id = $1 and deleted = false', [id])
  if (!c || !c.active) return null
  c.roles = (await q('select r.* from customer_roles r join customer_role_map m on m.role_id = r.id where m.customer_id = $1', [id]))
  c.isAdmin = c.roles.some((r) => r.system_name === 'Administrators' && r.active)
  c.isRegistered = !c.is_guest
  if (!c.last_activity_at || Date.now() - new Date(c.last_activity_at).getTime() > 60000) {
    q('update customers set last_activity_at = now(), last_ip = $2, last_page = $3 where id = $1', [id, req.ip || '', req.headers.referer || '']).catch(() => {})
  }
  return c
}

export function setSessionCookie(res, customerId) {
  res.setHeader('Set-Cookie', cookie(COOKIE, sign(String(customerId)), { secure: process.env.NODE_ENV === 'production' }))
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookie(COOKIE, '', { maxAge: 0 }))
}

export async function ensureCustomer(ctx) {
  if (ctx.customer) return ctx.customer
  const c = await one("insert into customers (is_guest, last_ip) values (true, $1) returning *", [ctx.req.ip || ''])
  const guest = await one("select id from customer_roles where system_name = 'Guests'")
  if (guest) await q('insert into customer_role_map values ($1,$2) on conflict do nothing', [c.id, guest.id])
  c.roles = []; c.isAdmin = false; c.isRegistered = false
  setSessionCookie(ctx.res, c.id)
  ctx.customer = c
  return c
}

export function requireRegistered(ctx) {
  if (!ctx.customer || ctx.customer.is_guest) throw new HttpError(401, 'Please log in to continue')
  return ctx.customer
}
export function requireAdmin(ctx) {
  if (!ctx.customer || !ctx.customer.isAdmin) throw new HttpError(401, 'Administrator login required')
  return ctx.customer
}

export async function logActivity(customerId, type, comment = '', entity = '', entityId = null, ip = '') {
  await q('insert into activity_log (customer_id, type, comment, entity, entity_id, ip) values ($1,$2,$3,$4,$5,$6)', [customerId || null, type, comment, entity, entityId, ip]).catch(() => {})
}

export async function queueEmail(to, subject, body, toName = '') {
  const s = await getSettings()
  await q('insert into queued_emails (from_email, to_email, to_name, subject, body) values ($1,$2,$3,$4,$5)', [s.store.email, to, toName, subject, body])
}

// Message templates: admin-editable, with %Token% replacement.
export async function sendTemplate(name, to, tokens = {}, toName = '') {
  const t = await one('select * from message_templates where name = $1', [name])
  if (t && !t.active) return
  const s = await getSettings()
  const all = { 'Store.Name': s.store.name, 'Store.URL': s.store.url, 'Store.Email': s.store.email, ...tokens }
  const fill = (txt) => String(txt || '').replace(/%([\w.]+)%/g, (m, k) => (all[k] ?? m))
  const subject = fill(t?.subject || tokens.__subject || name)
  const body = fill(t?.body || tokens.__body || '')
  await queueEmail(to, subject, body, toName)
}

// ---------------- product helpers ----------------
export async function productPictures(ids) {
  if (!ids.length) return {}
  const rows = await q('select product_id, url, alt from product_pictures where product_id = any($1::int[]) order by display_order, id', [ids])
  const map = {}
  for (const r of rows) (map[r.product_id] ||= []).push(r)
  return map
}

export async function productCategoryMap(ids) {
  if (!ids.length) return {}
  const rows = await q(`select pc.product_id, c.id, c.name, c.slug from product_categories pc join categories c on c.id = pc.category_id
    where pc.product_id = any($1::int[]) order by pc.display_order`, [ids])
  const map = {}
  for (const r of rows) (map[r.product_id] ||= []).push({ id: r.id, name: r.name, slug: r.slug })
  return map
}

export function isMarkedNew(p) {
  if (!p.mark_as_new) return false
  const now = Date.now()
  if (p.mark_new_start && new Date(p.mark_new_start).getTime() > now) return false
  if (p.mark_new_end && new Date(p.mark_new_end).getTime() < now) return false
  return true
}

export function stockInfo(p) {
  if (p.product_type === 'grouped') return { inStock: true, text: '' }
  if (!p.manage_stock) return { inStock: true, text: p.display_stock_availability ? 'In stock' : '' }
  if (p.stock_qty > 0) return { inStock: true, qty: p.stock_qty, text: p.display_stock_availability ? (p.display_stock_quantity ? `${p.stock_qty} in stock` : 'In stock') : '' }
  if (p.backorders !== 'none') return { inStock: true, text: 'On backorder' }
  return { inStock: false, text: 'Out of stock' }
}

// ---------------- discounts ----------------
export async function loadActiveDiscounts() {
  const list = await q(`select * from discounts where active = true and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now())`)
  if (!list.length) return []
  const ids = list.map((d) => d.id)
  const [dp, dc, dm, catTree] = await Promise.all([
    q('select * from discount_products where discount_id = any($1::int[])', [ids]),
    q('select * from discount_categories where discount_id = any($1::int[])', [ids]),
    q('select * from discount_manufacturers where discount_id = any($1::int[])', [ids]),
    q('select id, parent_id from categories where deleted = false'),
  ])
  const children = {}
  for (const c of catTree) (children[c.parent_id || 0] ||= []).push(c.id)
  const expand = (id, acc = new Set()) => { acc.add(id); for (const ch of children[id] || []) expand(ch, acc); return acc }
  for (const d of list) {
    d.productIds = new Set(dp.filter((x) => x.discount_id === d.id).map((x) => x.product_id))
    const cats = dc.filter((x) => x.discount_id === d.id).map((x) => x.category_id)
    d.categoryIds = new Set()
    for (const c of cats) (d.apply_to_subcategories ? expand(c) : new Set([c])).forEach((x) => d.categoryIds.add(x))
    d.manufacturerIds = new Set(dm.filter((x) => x.discount_id === d.id).map((x) => x.manufacturer_id))
  }
  return list
}

async function discountUsable(d, customer, codes) {
  if (d.requires_coupon) {
    const code = String(d.coupon_code || '').toLowerCase()
    if (!code || !codes.some((c) => c.toLowerCase() === code)) return false
  }
  if (d.required_role_id && !(customer?.roles || []).some((r) => r.id === d.required_role_id)) return false
  if (d.limitation === 'n_times') {
    const u = await one('select count(*)::int n from discount_usage where discount_id = $1', [d.id])
    if (u.n >= d.limitation_times) return false
  } else if (d.limitation === 'n_times_per_customer') {
    if (!customer) return false
    const u = await one('select count(*)::int n from discount_usage where discount_id = $1 and customer_id = $2', [d.id, customer.id])
    if (u.n >= d.limitation_times) return false
  }
  return true
}

function discountAmount(d, base) {
  let a = d.use_percentage ? base * (d.percentage / 100) : d.amount
  if (d.use_percentage && d.max_amount) a = Math.min(a, d.max_amount)
  return round2(Math.min(a, base))
}

function bestDiscounts(list, base) {
  if (!list.length || base <= 0) return { amount: 0, applied: [] }
  const cumul = list.filter((d) => d.is_cumulative)
  let best = { amount: 0, applied: [] }
  for (const d of list) {
    const a = discountAmount(d, base)
    if (a > best.amount) best = { amount: a, applied: [d] }
  }
  if (cumul.length > 1) {
    const sum = round2(Math.min(base, cumul.reduce((s, d) => s + discountAmount(d, base), 0)))
    if (sum > best.amount) best = { amount: sum, applied: cumul }
  }
  return best
}

// ---------------- attributes ----------------
export async function loadProductAttributes(productIds) {
  if (!productIds.length) return {}
  const maps = await q(`select m.*, a.name as attribute_name from product_attribute_mappings m join product_attributes a on a.id = m.attribute_id
    where m.product_id = any($1::int[]) order by m.display_order, m.id`, [productIds])
  const vals = maps.length ? await q('select * from product_attribute_values where mapping_id = any($1::int[]) order by display_order, id', [maps.map((m) => m.id)]) : []
  const out = {}
  for (const m of maps) {
    m.values = vals.filter((v) => v.mapping_id === m.id)
    ;(out[m.product_id] ||= []).push(m)
  }
  return out
}

// Validates selected attributes and returns { adjustment, weight, desc, errors }
export function evaluateAttributes(product, mappings = [], selected = {}) {
  let adjustment = 0
  let weight = 0
  const desc = []
  const errors = []
  for (const m of mappings) {
    const label = m.text_prompt || m.attribute_name
    const raw = selected?.[m.id]
    if (['textbox', 'multiline'].includes(m.control_type)) {
      const text = String(raw || '').trim()
      if (m.is_required && !text) errors.push(`Please enter ${label}`)
      if (text) desc.push(`${m.attribute_name}: ${text.slice(0, 200)}`)
      continue
    }
    const ids = (Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : []).map(Number)
    const chosen = m.values.filter((v) => ids.includes(v.id))
    if (m.is_required && !chosen.length) errors.push(`Please select ${label}`)
    for (const v of chosen) {
      const adj = v.price_adjustment_percent ? product.price * (v.price_adjustment / 100) : v.price_adjustment
      adjustment += adj
      weight += v.weight_adjustment || 0
      desc.push(`${m.attribute_name}: ${v.name}${adj ? ` [${adj > 0 ? '+' : '-'}$${Math.abs(round2(adj)).toFixed(2)}]` : ''}`)
    }
  }
  if (product.is_gift_card) {
    const g = selected?.giftCard || {}
    if (!String(g.recipientName || '').trim()) errors.push('Enter the recipient name')
    if (!String(g.senderName || '').trim()) errors.push('Enter your name')
    if (product.gift_card_type === 'virtual') {
      if (!/^\S+@\S+\.\S+$/.test(g.recipientEmail || '')) errors.push('Enter a valid recipient email')
      if (!/^\S+@\S+\.\S+$/.test(g.senderEmail || '')) errors.push('Enter a valid sender email')
    }
    desc.push(`From: ${g.senderName || ''}${g.senderEmail ? ` <${g.senderEmail}>` : ''}`)
    desc.push(`For: ${g.recipientName || ''}${g.recipientEmail ? ` <${g.recipientEmail}>` : ''}`)
  }
  return { adjustment: round2(adjustment), weight, desc: desc.join('\n'), errors }
}

export async function tierPrice(productId, qty, customer) {
  const roleIds = (customer?.roles || []).map((r) => r.id)
  const r = await one(`select price from tier_prices where product_id = $1 and quantity <= $2
     and (role_id is null or role_id = any($3::int[])) and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now())
     order by quantity desc limit 1`, [productId, qty, roleIds])
  return r ? r.price : null
}

// ---------------- cart & totals ----------------
export async function loadCart(customerId, type = 'cart') {
  if (!customerId) return []
  const rows = await q(`select ci.*, p.name, p.slug, p.sku, p.price as base_price, p.old_price, p.is_shipping_enabled, p.is_free_shipping,
      p.additional_shipping_charge, p.weight, p.tax_category_id, p.is_tax_exempt, p.is_download, p.is_gift_card, p.gift_card_type,
      p.manage_stock, p.stock_qty, p.backorders, p.order_min_qty, p.order_max_qty, p.published, p.deleted, p.disable_buy,
      p.customer_enters_price, p.call_for_price, p.allowed_quantities, p.price
    from cart_items ci join products p on p.id = ci.product_id where ci.customer_id = $1 and ci.cart_type = $2 order by ci.id`, [customerId, type])
  return rows
}

export async function cartLineWarnings(item) {
  const w = []
  if (item.deleted || !item.published) w.push('Product is not available')
  if (item.disable_buy || item.call_for_price) w.push('Buying is disabled for this product')
  if (item.quantity < item.order_min_qty) w.push(`The minimum quantity allowed for purchase is ${item.order_min_qty}`)
  if (item.quantity > item.order_max_qty) w.push(`The maximum quantity allowed for purchase is ${item.order_max_qty}`)
  if (item.allowed_quantities) {
    const allowed = item.allowed_quantities.split(',').map((x) => parseInt(x, 10)).filter(Boolean)
    if (allowed.length && !allowed.includes(item.quantity)) w.push(`Allowed quantities are: ${allowed.join(', ')}`)
  }
  if (item.manage_stock && item.backorders === 'none' && item.quantity > item.stock_qty) {
    w.push(item.stock_qty > 0 ? `Your quantity exceeds stock on hand. The maximum quantity that can be added is ${item.stock_qty}` : 'Out of stock')
  }
  return w
}

export async function computeTotals(ctx, { items, state = {}, forCheckout = false } = {}) {
  const customer = ctx.customer
  const settings = await getSettings()
  if (!items) items = await loadCart(customer?.id, 'cart')
  state = { couponCodes: [], giftCardCodes: [], checkoutAttributes: {}, ...(customer?.checkout_state || {}), ...state }
  const productIds = [...new Set(items.map((i) => i.product_id))]
  const [attrMap, pics, catRows, mfrRows, taxCats, discounts] = await Promise.all([
    loadProductAttributes(productIds),
    productPictures(productIds),
    productIds.length ? q('select product_id, category_id from product_categories where product_id = any($1::int[])', [productIds]) : [],
    productIds.length ? q('select product_id, manufacturer_id from product_manufacturers where product_id = any($1::int[])', [productIds]) : [],
    q('select * from tax_categories'),
    loadActiveDiscounts(),
  ])
  const codes = state.couponCodes || []
  const usable = []
  for (const d of discounts) if (await discountUsable(d, customer, codes)) usable.push(d)

  const lines = []
  let rawSubtotal = 0
  for (const it of items) {
    const prod = { ...it, id: it.product_id }
    const ev = evaluateAttributes(prod, attrMap[it.product_id], it.attributes)
    let base = it.customer_enters_price ? it.customer_price : it.base_price
    const tp = it.customer_enters_price ? null : await tierPrice(it.product_id, it.quantity, customer)
    if (tp != null) base = tp
    const unit = round2(base + ev.adjustment)
    rawSubtotal += unit * it.quantity
    lines.push({ it, unit, ev })
  }
  // Product / category / manufacturer level discounts per unit
  let productDiscount = 0
  const appliedDiscounts = new Map()
  for (const l of lines) {
    const pid = l.it.product_id
    const cats = catRows.filter((r) => r.product_id === pid).map((r) => r.category_id)
    const mfrs = mfrRows.filter((r) => r.product_id === pid).map((r) => r.manufacturer_id)
    const relevant = usable.filter((d) =>
      (d.discount_type === 'products' && d.productIds.has(pid)) ||
      (d.discount_type === 'categories' && cats.some((c) => d.categoryIds.has(c))) ||
      (d.discount_type === 'manufacturers' && mfrs.some((m) => d.manufacturerIds.has(m))))
      .filter((d) => rawSubtotal >= (d.min_subtotal || 0))
    const best = bestDiscounts(relevant, l.unit)
    l.unitDiscount = best.amount
    l.lineTotal = round2((l.unit - best.amount) * l.it.quantity)
    productDiscount += best.amount * l.it.quantity
    for (const d of best.applied) appliedDiscounts.set(d.id, d)
  }
  // checkout attributes
  const caRows = await q('select a.*, coalesce(json_agg(v order by v.display_order) filter (where v.id is not null), \'[]\') as values from checkout_attributes a left join checkout_attribute_values v on v.attribute_id = a.id group by a.id order by a.display_order')
  let checkoutAttrAmount = 0
  const caDesc = []
  const caErrors = []
  const shippable = lines.some((l) => l.it.is_shipping_enabled && !l.it.is_download && !(l.it.is_gift_card && l.it.gift_card_type === 'virtual'))
  for (const a of caRows) {
    if (a.shippable_only && !shippable) continue
    const raw = state.checkoutAttributes?.[a.id]
    if (['textbox', 'multiline'].includes(a.control_type)) {
      if (a.is_required && !String(raw || '').trim()) caErrors.push(`Please enter ${a.text_prompt || a.name}`)
      if (raw) caDesc.push(`${a.name}: ${String(raw).slice(0, 200)}`)
      continue
    }
    const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(Number)
    const values = typeof a.values === 'string' ? JSON.parse(a.values) : a.values
    const chosen = values.filter((v) => ids.includes(v.id))
    if (a.is_required && !chosen.length) caErrors.push(`Please select ${a.text_prompt || a.name}`)
    for (const v of chosen) { checkoutAttrAmount += v.price_adjustment; caDesc.push(`${a.name}: ${v.name}${v.price_adjustment ? ` [+$${v.price_adjustment.toFixed(2)}]` : ''}`) }
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0) + checkoutAttrAmount)
  const subDiscs = usable.filter((d) => d.discount_type === 'order_subtotal' && subtotal >= (d.min_subtotal || 0))
  const subBest = bestDiscounts(subDiscs, subtotal)
  subBest.applied.forEach((d) => appliedDiscounts.set(d.id, d))
  const subAfter = round2(subtotal - subBest.amount)

  // shipping
  const roleFree = (customer?.roles || []).some((r) => r.free_shipping)
  let shipping = null
  let shippingDiscount = 0
  let shippingMethodName = ''
  const allFree = lines.every((l) => !l.it.is_shipping_enabled || l.it.is_free_shipping || l.it.is_download)
  const overFree = settings.shipping.freeShippingOverEnabled && subAfter >= settings.shipping.freeShippingOver
  const weight = lines.reduce((s, l) => s + (l.it.weight + l.ev.weight) * l.it.quantity, 0)
  if (!shippable) { shipping = 0; shippingMethodName = 'Shipping not required' }
  else if (state.pickup && state.pickupPointId) {
    const pp = await one('select * from pickup_points where id = $1 and active = true', [state.pickupPointId])
    if (pp) { shipping = pp.fee; shippingMethodName = `Pickup at ${pp.name}` }
  } else if (state.shippingMethodId) {
    const sm = await one('select * from shipping_methods where id = $1 and active = true', [state.shippingMethodId])
    if (sm) {
      shippingMethodName = sm.name
      const extra = lines.reduce((s, l) => s + (l.it.additional_shipping_charge || 0) * l.it.quantity, 0)
      shipping = (allFree || overFree || roleFree) ? round2(extra) : round2(sm.rate + sm.rate_per_kg * weight + extra)
    }
  }
  if (shipping != null && shipping > 0) {
    const sb = bestDiscounts(usable.filter((d) => d.discount_type === 'shipping' && subtotal >= (d.min_subtotal || 0)), shipping)
    shippingDiscount = sb.amount
    sb.applied.forEach((d) => appliedDiscounts.set(d.id, d))
    shipping = round2(shipping - shippingDiscount)
  }

  // payment fee
  let paymentFee = 0
  let paymentMethodName = ''
  if (state.paymentMethod) {
    const pm = await one('select * from payment_methods where system_name = $1 and active = true', [state.paymentMethod])
    if (pm) { paymentMethodName = pm.name; paymentFee = round2(pm.fee_percentage ? subAfter * pm.additional_fee / 100 : pm.additional_fee) }
  }

  // tax
  const rate = (id) => taxCats.find((t) => t.id === id)?.rate || 0
  const taxExemptRole = (customer?.roles || []).some((r) => r.tax_exempt)
  const ratio = subtotal > 0 ? subAfter / subtotal : 1
  const taxRates = {}
  let tax = 0
  if (!taxExemptRole) {
    for (const l of lines) {
      if (l.it.is_tax_exempt) continue
      const r = rate(l.it.tax_category_id)
      if (!r) continue
      const t = l.lineTotal * ratio * r / 100
      tax += t
      taxRates[r] = round2((taxRates[r] || 0) + t)
    }
    if (settings.tax.shippingTaxable && shipping) tax += shipping * 0.1
  }
  tax = round2(tax)

  let total = shipping == null && shippable ? null : round2(subAfter + (shipping || 0) + paymentFee + tax)
  let orderDiscount = 0
  let giftCards = []
  let rewardPoints = null
  let giftCardAmount = 0
  if (total != null) {
    const ob = bestDiscounts(usable.filter((d) => d.discount_type === 'order_total' && subtotal >= (d.min_subtotal || 0)), total)
    orderDiscount = ob.amount
    ob.applied.forEach((d) => appliedDiscounts.set(d.id, d))
    total = round2(total - orderDiscount)
    for (const code of state.giftCardCodes || []) {
      const g = await one('select g.*, coalesce((select sum(used_value) from gift_card_usage u where u.gift_card_id = g.id),0) as used from gift_cards g where lower(code) = lower($1)', [code])
      if (!g || !g.is_activated) continue
      const remaining = round2(g.amount - g.used)
      const use = round2(Math.min(remaining, total))
      if (use <= 0) { giftCards.push({ id: g.id, code: g.code, amount: 0, remaining }); continue }
      total = round2(total - use)
      giftCardAmount += use
      giftCards.push({ id: g.id, code: g.code, amount: use, remaining: round2(remaining - use) })
    }
    if (settings.rewardPoints.enabled && customer && !customer.is_guest) {
      const bal = await one('select coalesce((select points_balance from reward_points where customer_id = $1 order by id desc limit 1),0)::int as b', [customer.id])
      rewardPoints = { balance: bal.b, balanceAmount: round2(bal.b * settings.rewardPoints.exchangeRate), used: 0, usedAmount: 0 }
      if (state.useRewardPoints && bal.b >= settings.rewardPoints.minimumToUse && total > 0) {
        const amt = round2(Math.min(total, bal.b * settings.rewardPoints.exchangeRate))
        const pts = Math.ceil(amt / settings.rewardPoints.exchangeRate)
        rewardPoints.used = pts
        rewardPoints.usedAmount = amt
        total = round2(total - amt)
      }
    }
  }
  const warnings = []
  if (settings.orders.minOrderSubtotal && subtotal < settings.orders.minOrderSubtotal) warnings.push(`Minimum order sub-total amount is $${settings.orders.minOrderSubtotal.toFixed(2)}`)
  const lineOut = []
  for (const l of lines) {
    lineOut.push({
      id: l.it.id, productId: l.it.product_id, name: l.it.name, slug: l.it.slug, sku: l.it.sku, quantity: l.it.quantity,
      attributes: l.it.attributes, attributesDesc: l.ev.desc, unitPrice: l.unit, unitDiscount: l.unitDiscount, lineTotal: l.lineTotal,
      oldPrice: l.it.old_price, picture: pics[l.it.product_id]?.[0]?.url || '', isDownload: l.it.is_download, isGiftCard: l.it.is_gift_card,
      giftCardType: l.it.gift_card_type, weight: l.it.weight + l.ev.weight, warnings: [...l.ev.errors, ...(await cartLineWarnings(l.it))],
    })
  }
  const invalidCodes = codes.filter((c) => !usable.some((d) => d.requires_coupon && d.coupon_code.toLowerCase() === c.toLowerCase()))
  return {
    items: lineOut,
    state,
    shippable,
    totals: {
      rawSubtotal: round2(rawSubtotal), productDiscount: round2(productDiscount), checkoutAttributesAmount: round2(checkoutAttrAmount),
      subtotal, subtotalDiscount: subBest.amount, shipping, shippingDiscount, shippingMethodName, paymentFee, paymentMethodName,
      tax, taxRates, orderDiscount, giftCardAmount: round2(giftCardAmount), giftCards, rewardPoints, total, weight: round2(weight),
    },
    discounts: [...appliedDiscounts.values()].map((d) => ({ id: d.id, name: d.name, code: d.requires_coupon ? d.coupon_code : '' })),
    couponCodes: codes.map((c) => ({ code: c, valid: !invalidCodes.includes(c) })),
    checkoutAttributesDesc: caDesc.join('\n'),
    checkoutAttributeErrors: caErrors,
    warnings,
    freeShippingRemaining: settings.shipping.freeShippingOverEnabled ? round2(Math.max(0, settings.shipping.freeShippingOver - subAfter)) : null,
    _usable: forCheckout ? usable : undefined,
    _lines: forCheckout ? lines : undefined,
  }
}

export async function saveState(customer, patch) {
  const next = { ...(customer.checkout_state || {}), ...patch }
  await q('update customers set checkout_state = $2::jsonb where id = $1', [customer.id, next])
  customer.checkout_state = next
  return next
}

export function assertNoErrors(errors) {
  if (errors?.length) throw bad(errors[0], { errors })
}

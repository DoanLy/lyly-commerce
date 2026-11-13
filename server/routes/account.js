import { q, one, tx } from '../db.js'
import {
  getSettings, ensureCustomer, setSessionCookie, clearSessionCookie, requireRegistered, logActivity, sendTemplate,
  loadProductAttributes, evaluateAttributes, computeTotals, saveState, loadCart, cartLineWarnings, productPictures,
} from '../core.js'
import { bad, notFound, int, num, str, isEmail, hashPassword, verifyPassword, randomToken, round2 } from '../util.js'

const ADDRESS_FIELDS = ['first_name', 'last_name', 'email', 'company', 'country_id', 'state_id', 'city', 'address1', 'address2', 'zip', 'phone', 'fax']

export function validateAddress(a = {}) {
  const errors = []
  if (!str(a.firstName)) errors.push('First name is required')
  if (!str(a.lastName)) errors.push('Last name is required')
  if (!isEmail(a.email)) errors.push('Valid email is required')
  if (!int(a.countryId)) errors.push('Country is required')
  if (!str(a.city)) errors.push('City is required')
  if (!str(a.address1)) errors.push('Street address is required')
  if (!str(a.zip)) errors.push('Zip / postal code is required')
  if (!str(a.phone)) errors.push('Phone is required')
  return errors
}
function addrParams(a) {
  return [str(a.firstName, 100), str(a.lastName, 100), str(a.email, 200), str(a.company, 200), int(a.countryId) || null, int(a.stateId) || null,
    str(a.city, 100), str(a.address1, 300), str(a.address2, 300), str(a.zip, 30), str(a.phone, 50), str(a.fax, 50)]
}
export async function addressOut(r) {
  if (!r) return null
  const c = r.country_id ? await one('select name from countries where id = $1', [r.country_id]) : null
  const s = r.state_id ? await one('select name from states where id = $1', [r.state_id]) : null
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, company: r.company, countryId: r.country_id, stateId: r.state_id,
    country: c?.name || '', state: s?.name || '', city: r.city, address1: r.address1, address2: r.address2, zip: r.zip, phone: r.phone, fax: r.fax,
  }
}

function customerOut(c) {
  return {
    id: c.id, email: c.email, firstName: c.first_name, lastName: c.last_name, gender: c.gender, dob: c.dob, company: c.company,
    phone: c.phone, newsletter: c.newsletter, isAdmin: !!c.isAdmin, createdAt: c.created_at,
  }
}

async function mergeGuestCart(fromId, toId) {
  if (!fromId || fromId === toId) return
  const items = await q('select * from cart_items where customer_id = $1', [fromId])
  for (const it of items) {
    const ex = await one('select id from cart_items where customer_id = $1 and cart_type = $2 and product_id = $3 and attributes::text = $4::jsonb::text', [toId, it.cart_type, it.product_id, it.attributes])
    if (ex) await q('update cart_items set quantity = quantity + $2 where id = $1', [ex.id, it.quantity])
    else await q('update cart_items set customer_id = $2 where id = $1', [it.id, toId])
  }
}

export default function accountRoutes(api) {
  // -------- auth --------
  api.post('/auth/register', async (ctx) => {
    const s = await getSettings()
    const b = ctx.body
    const email = str(b.email, 200).toLowerCase()
    const errors = []
    if (!str(b.firstName)) errors.push('First name is required.')
    if (!str(b.lastName)) errors.push('Last name is required.')
    if (!isEmail(email)) errors.push('Wrong email')
    if (String(b.password || '').length < s.customer.passwordMinLength) errors.push(`Password must have at least ${s.customer.passwordMinLength} characters.`)
    if (b.password !== b.confirmPassword) errors.push('The password and confirmation password do not match.')
    if (errors.length) throw bad(errors[0], { errors })
    if (await one('select id from customers where lower(email) = $1 and deleted = false', [email])) throw bad('The specified email already exists')
    const guest = ctx.customer
    const c = await tx(async (t) => {
      let row
      if (guest && guest.is_guest) {
        ;[row] = await t(`update customers set email=$2, password_hash=$3, first_name=$4, last_name=$5, gender=$6, dob=$7, company=$8, phone=$9, newsletter=$10, is_guest=false
          where id=$1 returning *`, [guest.id, email, hashPassword(b.password), str(b.firstName, 100), str(b.lastName, 100), str(b.gender, 1), b.dob || null, str(b.company, 200), str(b.phone, 50), !!b.newsletter])
        await t("delete from customer_role_map where customer_id = $1 and role_id = (select id from customer_roles where system_name='Guests')", [row.id])
      } else {
        ;[row] = await t(`insert into customers (email, password_hash, first_name, last_name, gender, dob, company, phone, newsletter, is_guest)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) returning *`, [email, hashPassword(b.password), str(b.firstName, 100), str(b.lastName, 100), str(b.gender, 1), b.dob || null, str(b.company, 200), str(b.phone, 50), !!b.newsletter])
      }
      await t("insert into customer_role_map (customer_id, role_id) select $1, id from customer_roles where system_name='Registered' on conflict do nothing", [row.id])
      if (s.rewardPoints.enabled && s.rewardPoints.pointsForRegistration) {
        await t('insert into reward_points (customer_id, points, points_balance, message) values ($1,$2,$2,$3)', [row.id, s.rewardPoints.pointsForRegistration, 'Registered as customer'])
      }
      if (b.newsletter) await t('insert into newsletter_subscriptions (email) values ($1) on conflict (email) do update set active = true', [email])
      return row
    })
    setSessionCookie(ctx.res, c.id)
    await sendTemplate('Customer.WelcomeMessage', email, { 'Customer.FullName': `${c.first_name} ${c.last_name}`, 'Customer.Email': email })
    await logActivity(c.id, 'PublicStore.Register', 'Registered a new account', 'Customer', c.id, ctx.req.ip)
    return { ok: true, customer: customerOut(c) }
  })

  api.post('/auth/login', async (ctx) => {
    const email = str(ctx.body.email, 200).toLowerCase()
    const pw = String(ctx.body.password || '')
    if (!email) throw bad('Please enter your email')
    const c = await one('select * from customers where lower(email) = $1 and deleted = false and is_guest = false', [email])
    if (!c) throw bad('Login was unsuccessful. Please correct the errors and try again. No customer account found')
    if (!c.active) throw bad('Login was unsuccessful. Account is not active')
    if (!verifyPassword(pw, c.password_hash)) throw bad('Login was unsuccessful. Please correct the errors and try again. The credentials provided are incorrect')
    await mergeGuestCart(ctx.customer?.is_guest ? ctx.customer.id : null, c.id)
    await q('update customers set last_login_at = now(), last_activity_at = now(), last_ip = $2 where id = $1', [c.id, ctx.req.ip])
    setSessionCookie(ctx.res, c.id)
    await logActivity(c.id, 'PublicStore.Login', 'Login', 'Customer', c.id, ctx.req.ip)
    const roles = await q('select r.system_name from customer_roles r join customer_role_map m on m.role_id = r.id where m.customer_id = $1', [c.id])
    return { ok: true, customer: { ...customerOut(c), isAdmin: roles.some((r) => r.system_name === 'Administrators') } }
  })

  api.post('/auth/logout', async (ctx) => {
    if (ctx.customer) await logActivity(ctx.customer.id, 'PublicStore.Logout', 'Logout', 'Customer', ctx.customer.id, ctx.req.ip)
    clearSessionCookie(ctx.res)
    return { ok: true }
  })

  api.post('/auth/password-recovery', async (ctx) => {
    const s = await getSettings()
    const email = str(ctx.body.email, 200).toLowerCase()
    if (!isEmail(email)) throw bad('Wrong email')
    const c = await one('select * from customers where lower(email) = $1 and deleted = false and is_guest = false', [email])
    if (c) {
      const token = randomToken()
      await q("update customers set reset_token = $2, reset_token_expires = now() + interval '1 day' where id = $1", [c.id, token])
      await sendTemplate('Customer.PasswordRecovery', email, { 'Customer.PasswordRecoveryURL': `${s.store.url}/passwordrecovery/confirm?token=${token}&email=${encodeURIComponent(email)}` })
    }
    return { ok: true, message: 'Email with instructions has been sent to you.' }
  })

  api.post('/auth/password-recovery/confirm', async (ctx) => {
    const s = await getSettings()
    const email = str(ctx.body.email, 200).toLowerCase()
    const c = await one('select * from customers where lower(email) = $1 and reset_token = $2 and reset_token_expires > now()', [email, str(ctx.body.token, 100)])
    if (!c) throw bad('Wrong password recovery token or the link has expired')
    if (String(ctx.body.newPassword || '').length < s.customer.passwordMinLength) throw bad(`Password must have at least ${s.customer.passwordMinLength} characters.`)
    if (ctx.body.newPassword !== ctx.body.confirmPassword) throw bad('The new password and confirmation password do not match.')
    await q('update customers set password_hash = $2, reset_token = null where id = $1', [c.id, hashPassword(ctx.body.newPassword)])
    return { ok: true, message: 'Your password has been changed' }
  })

  // -------- account --------
  api.get('/account/info', async (ctx) => customerOut(requireRegistered(ctx)))
  api.put('/account/info', async (ctx) => {
    const s = await getSettings()
    const c = requireRegistered(ctx)
    const b = ctx.body
    const email = str(b.email, 200).toLowerCase()
    if (!str(b.firstName) || !str(b.lastName)) throw bad('First and last name are required')
    if (!isEmail(email)) throw bad('Wrong email')
    if (email !== c.email.toLowerCase()) {
      if (!s.customer.allowChangeEmail) throw bad('Changing email is not allowed')
      if (await one('select id from customers where lower(email) = $1 and id <> $2 and deleted = false', [email, c.id])) throw bad('The e-mail address is already in use')
    }
    const r = await one(`update customers set email=$2, first_name=$3, last_name=$4, gender=$5, dob=$6, company=$7, phone=$8, newsletter=$9 where id=$1 returning *`,
      [c.id, email, str(b.firstName, 100), str(b.lastName, 100), str(b.gender, 1), b.dob || null, str(b.company, 200), str(b.phone, 50), !!b.newsletter])
    if (b.newsletter) await q('insert into newsletter_subscriptions (email) values ($1) on conflict (email) do update set active = true', [email])
    else await q('update newsletter_subscriptions set active = false where email = $1', [email])
    return { ok: true, customer: customerOut({ ...r, isAdmin: c.isAdmin }), message: 'The customer info has been updated successfully.' }
  })
  api.post('/account/change-password', async (ctx) => {
    const s = await getSettings()
    const c = requireRegistered(ctx)
    const { oldPassword, newPassword, confirmPassword } = ctx.body
    if (!verifyPassword(oldPassword, c.password_hash)) throw bad('Old password doesn\'t match')
    if (String(newPassword || '').length < s.customer.passwordMinLength) throw bad(`Password must have at least ${s.customer.passwordMinLength} characters.`)
    if (newPassword !== confirmPassword) throw bad('The new password and confirmation password do not match.')
    await q('update customers set password_hash = $2 where id = $1', [c.id, hashPassword(newPassword)])
    return { ok: true, message: 'Password was changed' }
  })

  api.get('/account/addresses', async (ctx) => {
    const c = requireRegistered(ctx)
    const rows = await q('select * from addresses where customer_id = $1 order by id', [c.id])
    return Promise.all(rows.map(addressOut))
  })
  api.post('/account/addresses', async (ctx) => {
    const c = requireRegistered(ctx)
    const errs = validateAddress(ctx.body)
    if (errs.length) throw bad(errs[0], { errors: errs })
    const r = await one(`insert into addresses (customer_id, ${ADDRESS_FIELDS.join(',')}) values ($1,${ADDRESS_FIELDS.map((_, i) => `$${i + 2}`).join(',')}) returning *`, [c.id, ...addrParams(ctx.body)])
    return addressOut(r)
  })
  api.put('/account/addresses/:id', async (ctx) => {
    const c = requireRegistered(ctx)
    const errs = validateAddress(ctx.body)
    if (errs.length) throw bad(errs[0], { errors: errs })
    const r = await one(`update addresses set ${ADDRESS_FIELDS.map((f, i) => `${f}=$${i + 3}`).join(',')} where id=$1 and customer_id=$2 returning *`, [int(ctx.params.id), c.id, ...addrParams(ctx.body)])
    if (!r) throw notFound()
    return addressOut(r)
  })
  api.del('/account/addresses/:id', async (ctx) => {
    const c = requireRegistered(ctx)
    await q('delete from addresses where id = $1 and customer_id = $2', [int(ctx.params.id), c.id])
    return { ok: true }
  })

  api.get('/countries', async () => {
    const cs = await q('select id, name, code, allows_billing, allows_shipping from countries where published order by display_order, name')
    const st = await q('select id, country_id, name from states order by display_order, name')
    return cs.map((c) => ({ ...c, states: st.filter((s) => s.country_id === c.id) }))
  })

  api.get('/account/orders', async (ctx) => {
    const c = requireRegistered(ctx)
    return q(`select id, custom_number, order_status, shipping_status, payment_status, total, currency_code, currency_rate, created_at,
      (select count(*)::int from order_items i where i.order_id = o.id) as items from orders o where customer_id = $1 and deleted = false order by created_at desc`, [c.id])
  })
  api.get('/account/orders/:id', async (ctx) => {
    const c = requireRegistered(ctx)
    const s = await getSettings()
    const o = await one('select * from orders where id = $1 and customer_id = $2 and deleted = false', [int(ctx.params.id), c.id])
    if (!o) throw notFound('Order not found')
    const [items, notes, shipments] = await Promise.all([
      q('select oi.*, p.slug from order_items oi left join products p on p.id = oi.product_id where order_id = $1 order by id', [o.id]),
      q('select id, note, created_at from order_notes where order_id = $1 and display_to_customer order by created_at', [o.id]),
      q('select id, tracking_number, shipped_at, delivered_at, created_at from shipments where order_id = $1 order by id', [o.id]),
    ])
    const pics = await productPictures(items.map((i) => i.product_id).filter(Boolean))
    const returnable = s.orders.returnRequestsEnabled && o.order_status === 'Complete' && (Date.now() - new Date(o.created_at).getTime()) / 864e5 <= s.orders.returnDays
    return { ...o, items: items.map((i) => ({ ...i, picture: pics[i.product_id]?.[0]?.url || '' })), notes, shipments, returnable, reorderAllowed: s.orders.reorderAllowed }
  })
  api.post('/account/orders/:id/reorder', async (ctx) => {
    const c = requireRegistered(ctx)
    const o = await one('select * from orders where id = $1 and customer_id = $2', [int(ctx.params.id), c.id])
    if (!o) throw notFound()
    const items = await q('select * from order_items where order_id = $1 and product_id is not null', [o.id])
    for (const it of items) await q("insert into cart_items (customer_id, cart_type, product_id, quantity, attributes, attributes_desc) values ($1,'cart',$2,$3,$4::jsonb,$5)", [c.id, it.product_id, it.quantity, it.attributes || {}, it.attributes_desc])
    return { ok: true }
  })
  api.post('/account/orders/:id/return', async (ctx) => {
    const c = requireRegistered(ctx)
    const s = await getSettings()
    const o = await one("select * from orders where id = $1 and customer_id = $2 and order_status = 'Complete'", [int(ctx.params.id), c.id])
    if (!o) throw bad('Returns are only available for completed orders')
    const lines = (ctx.body.items || []).filter((x) => int(x.quantity) > 0)
    if (!lines.length) throw bad('Your return request has not been submitted because you haven\'t chosen any items.')
    const reason = str(ctx.body.reason, 200)
    const action = str(ctx.body.action, 200)
    const created = []
    for (const l of lines) {
      const it = await one('select * from order_items where id = $1 and order_id = $2', [int(l.orderItemId), o.id])
      if (!it) continue
      const already = await one("select coalesce(sum(quantity),0)::int n from return_requests where order_item_id = $1 and status not in ('Cancelled','RequestRejected')", [it.id])
      const qty = Math.min(int(l.quantity), it.quantity - already.n)
      if (qty <= 0) continue
      const r = await one('insert into return_requests (order_item_id, customer_id, quantity, reason, requested_action, comments) values ($1,$2,$3,$4,$5,$6) returning *', [it.id, c.id, qty, reason, action, str(ctx.body.comments, 2000)])
      await q('update return_requests set custom_number = id::text where id = $1', [r.id])
      created.push(r.id)
      await sendTemplate('NewReturnRequest.CustomerNotification', c.email, { 'ReturnRequest.CustomNumber': r.id })
    }
    if (!created.length) throw bad('Selected items were already returned')
    void s
    return { ok: true, message: 'Your return request has been submitted successfully.', ids: created }
  })
  api.get('/account/returns', async (ctx) => {
    const c = requireRegistered(ctx)
    return q(`select r.*, oi.product_name, oi.order_id, p.slug from return_requests r join order_items oi on oi.id = r.order_item_id left join products p on p.id = oi.product_id
      where r.customer_id = $1 order by r.created_at desc`, [c.id])
  })
  api.get('/account/downloads', async (ctx) => {
    const c = requireRegistered(ctx)
    return q(`select oi.id, oi.guid, oi.product_name, oi.download_count, oi.attributes_desc, o.id as order_id, o.created_at, o.payment_status, p.slug
      from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
      where o.customer_id = $1 and oi.is_download and o.deleted = false and o.order_status <> 'Cancelled' order by o.created_at desc`, [c.id])
  })
  api.get('/download/:guid', async (ctx) => {
    const c = requireRegistered(ctx)
    const it = await one(`select oi.*, o.payment_status, p.slug from order_items oi join orders o on o.id = oi.order_id left join products p on p.id = oi.product_id
      where oi.guid::text = $1 and o.customer_id = $2`, [ctx.params.guid, c.id])
    if (!it) throw notFound('Download not found')
    if (it.payment_status !== 'Paid') throw bad('Download is available once the order is paid')
    await q('update order_items set download_count = download_count + 1 where id = $1', [it.id])
    const file = `${it.slug || 'download'}.txt`
    return { __raw: true, type: 'text/plain; charset=utf-8', filename: file, body: `Thank you for your purchase!\n\nProduct: ${it.product_name}\nOrder: #${it.order_id}\nLicense key: ${String(it.guid).toUpperCase()}\n` }
  })
  api.get('/account/reward-points', async (ctx) => {
    const c = requireRegistered(ctx)
    const s = await getSettings()
    const rows = await q('select * from reward_points where customer_id = $1 order by id desc', [c.id])
    const bal = rows[0]?.points_balance || 0
    return { balance: bal, balanceAmount: round2(bal * s.rewardPoints.exchangeRate), history: rows, settings: s.rewardPoints }
  })
  api.get('/account/back-in-stock', async (ctx) => {
    const c = requireRegistered(ctx)
    return q('select b.id, b.created_at, p.name, p.slug, p.id as product_id from back_in_stock b join products p on p.id = b.product_id where b.customer_id = $1 order by b.id desc', [c.id])
  })
  api.post('/account/back-in-stock/delete', async (ctx) => {
    const c = requireRegistered(ctx)
    const ids = (ctx.body.ids || []).map(Number)
    await q('delete from back_in_stock where customer_id = $1 and id = any($2::int[])', [c.id, ids])
    return { ok: true }
  })
  api.get('/account/reviews', async (ctx) => {
    const c = requireRegistered(ctx)
    return q('select r.*, p.name as product_name, p.slug from product_reviews r join products p on p.id = r.product_id where r.customer_id = $1 order by r.created_at desc', [c.id])
  })

  // -------- cart & wishlist --------
  api.get('/cart', async (ctx) => {
    const type = ctx.query.type === 'wishlist' ? 'wishlist' : 'cart'
    if (type === 'wishlist') return wishlistOut(ctx.customer?.id)
    const t = await computeTotals(ctx)
    const cross = ctx.customer && t.items.length ? await q(`select distinct p.id from cross_sell_products x join products p on p.id = x.cross_id
      where x.product_id = any($1::int[]) and p.published and not p.deleted and p.id <> all($1::int[]) limit 4`, [t.items.map((i) => i.productId)]) : []
    const attrs = await q("select a.*, coalesce(json_agg(v order by v.display_order) filter (where v.id is not null), '[]') as values from checkout_attributes a left join checkout_attribute_values v on v.attribute_id = a.id group by a.id order by a.display_order")
    return { ...t, crossSellIds: cross.map((x) => x.id), checkoutAttributes: t.shippable ? attrs : attrs.filter((a) => !a.shippable_only) }
  })

  api.post('/cart', async (ctx) => {
    const s = await getSettings()
    const b = ctx.body
    const type = b.type === 'wishlist' ? 'wishlist' : 'cart'
    const p = await one('select * from products where id = $1 and deleted = false and published = true', [int(b.productId)])
    if (!p) throw notFound('Product not found')
    if (type === 'cart' && (p.disable_buy || p.call_for_price)) throw bad('Buying is disabled for this product')
    if (type === 'wishlist' && (p.disable_wishlist || !s.catalog.wishlistEnabled)) throw bad('Wishlist is disabled for this product')
    if (p.product_type === 'grouped') throw bad('Please select a product from the group')
    const qty = Math.max(1, int(b.quantity, 1))
    const attrs = b.attributes || {}
    const maps = (await loadProductAttributes([p.id]))[p.id] || []
    // From catalog lists: if attributes are required, send customer to the product page
    if (b.fromList && (maps.some((m) => m.is_required) || p.is_gift_card || p.customer_enters_price)) return { redirect: `/product/${p.slug}` }
    if (b.fromList) for (const m of maps) { const pre = m.values.filter((v) => v.is_preselected).map((v) => v.id); if (pre.length) attrs[m.id] = m.control_type === 'checkbox' ? pre : pre[0] }
    const ev = evaluateAttributes(p, maps, attrs)
    if (ev.errors.length) throw bad(ev.errors[0], { errors: ev.errors })
    let customerPrice = 0
    if (p.customer_enters_price) {
      customerPrice = num(b.customerPrice)
      if (customerPrice < p.min_customer_price || customerPrice > p.max_customer_price) throw bad(`The price must be from ${p.min_customer_price} to ${p.max_customer_price}`)
    }
    const c = await ensureCustomer(ctx)
    const ex = await one('select * from cart_items where customer_id = $1 and cart_type = $2 and product_id = $3 and attributes::text = $4::jsonb::text and customer_price = $5', [c.id, type, p.id, attrs, customerPrice])
    const newQty = (ex?.quantity || 0) + qty
    if (type === 'cart') {
      const warn = await cartLineWarnings({ ...p, quantity: newQty })
      if (warn.length) throw bad(warn[0], { errors: warn })
    }
    if (ex) await q('update cart_items set quantity = $2, updated_at = now() where id = $1', [ex.id, newQty])
    else await q('insert into cart_items (customer_id, cart_type, product_id, quantity, attributes, attributes_desc, customer_price) values ($1,$2,$3,$4,$5::jsonb,$6,$7)', [c.id, type, p.id, qty, attrs, ev.desc, customerPrice])
    await logActivity(c.id, type === 'cart' ? 'PublicStore.AddToShoppingCart' : 'PublicStore.AddToWishlist', `Added a product to ${type === 'cart' ? 'shopping cart' : 'wishlist'} ('${p.name}')`, 'Product', p.id, ctx.req.ip)
    const counts = await one("select coalesce(sum(quantity) filter (where cart_type='cart'),0)::int as cart, count(*) filter (where cart_type='wishlist')::int as wish from cart_items where customer_id = $1", [c.id])
    return { ok: true, message: type === 'cart' ? 'The product has been added to your shopping cart' : 'The product has been added to your wishlist', cartCount: counts.cart, wishlistCount: counts.wish }
  })

  api.patch('/cart/:id', async (ctx) => {
    const c = ctx.customer
    if (!c) throw notFound()
    const it = await one('select ci.*, p.* , ci.id as id, ci.quantity as quantity from cart_items ci join products p on p.id = ci.product_id where ci.id = $1 and ci.customer_id = $2', [int(ctx.params.id), c.id])
    if (!it) throw notFound()
    const qty = int(ctx.body.quantity, 1)
    if (qty <= 0) { await q('delete from cart_items where id = $1', [it.id]); return { ok: true } }
    if (it.cart_type === 'cart') {
      const warn = await cartLineWarnings({ ...it, quantity: qty })
      if (warn.length) throw bad(warn[0], { errors: warn })
    }
    await q('update cart_items set quantity = $2, updated_at = now() where id = $1', [it.id, qty])
    return { ok: true }
  })
  api.del('/cart/:id', async (ctx) => {
    if (ctx.customer) await q('delete from cart_items where id = $1 and customer_id = $2', [int(ctx.params.id), ctx.customer.id])
    return { ok: true }
  })
  api.post('/cart/clear', async (ctx) => {
    if (ctx.customer) await q('delete from cart_items where customer_id = $1 and cart_type = $2', [ctx.customer.id, ctx.body.type === 'wishlist' ? 'wishlist' : 'cart'])
    return { ok: true }
  })
  api.post('/wishlist/move-to-cart', async (ctx) => {
    const c = ctx.customer
    if (!c) throw notFound()
    const ids = (ctx.body.ids || []).map(Number)
    const errors = []
    for (const id of ids) {
      const it = await one("select ci.*, p.name, p.manage_stock, p.stock_qty, p.backorders, p.order_min_qty, p.order_max_qty, p.published, p.deleted, p.disable_buy, p.call_for_price, p.allowed_quantities from cart_items ci join products p on p.id = ci.product_id where ci.id = $1 and ci.customer_id = $2 and ci.cart_type = 'wishlist'", [id, c.id])
      if (!it) continue
      const w = await cartLineWarnings(it)
      if (w.length) { errors.push(`${it.name}: ${w[0]}`); continue }
      const ex = await one("select id from cart_items where customer_id = $1 and cart_type = 'cart' and product_id = $2 and attributes::text = $3::jsonb::text", [c.id, it.product_id, it.attributes])
      if (ex) await q('update cart_items set quantity = quantity + $2 where id = $1', [ex.id, it.quantity])
      else await q("insert into cart_items (customer_id, cart_type, product_id, quantity, attributes, attributes_desc, customer_price) values ($1,'cart',$2,$3,$4::jsonb,$5,$6)", [c.id, it.product_id, it.quantity, it.attributes, it.attributes_desc, it.customer_price])
      if (ctx.body.remove !== false) await q('delete from cart_items where id = $1', [id])
    }
    return { ok: true, errors }
  })
  api.get('/wishlist/shared/:guid', async (ctx) => {
    const c = await one('select id, first_name, last_name from customers where guid::text = $1', [ctx.params.guid])
    if (!c) throw notFound('Wishlist not found')
    return { ...(await wishlistOut(c.id)), owner: `${c.first_name} ${c.last_name}`.trim(), readOnly: true }
  })
  api.post('/wishlist/email', async (ctx) => {
    const s = await getSettings()
    const c = requireRegistered(ctx)
    const friend = str(ctx.body.friendEmail, 200)
    if (!isEmail(friend)) throw bad("Enter friend's email")
    await sendTemplate('Wishlist.EmailAFriend', friend, { 'Wishlist.Email': c.email, 'Wishlist.PersonalMessage': str(ctx.body.message, 1000), 'Wishlist.URLForCustomer': `${s.store.url}/wishlist/${c.guid}` })
    return { ok: true, message: 'Your message has been sent.' }
  })

  api.post('/cart/coupon', async (ctx) => {
    const c = await ensureCustomer(ctx)
    const code = str(ctx.body.code, 100)
    const state = c.checkout_state || {}
    if (ctx.body.remove) {
      await saveState(c, { couponCodes: (state.couponCodes || []).filter((x) => x.toLowerCase() !== code.toLowerCase()) })
      return { ok: true }
    }
    if (!code) throw bad('Please enter a discount code')
    const d = await one('select * from discounts where lower(coupon_code) = lower($1) and requires_coupon and active', [code])
    if (!d) throw bad("The coupon code cannot be found")
    if (d.start_at && new Date(d.start_at) > new Date()) throw bad('Sorry, this offer is not started yet')
    if (d.end_at && new Date(d.end_at) < new Date()) throw bad('Sorry, this offer is expired')
    const codes = [...new Set([...(state.couponCodes || []), d.coupon_code])]
    await saveState(c, { couponCodes: codes })
    const t = await computeTotals(ctx)
    if (!t.discounts.some((x) => x.id === d.id)) {
      const reason = d.min_subtotal && t.totals.rawSubtotal < d.min_subtotal ? `Minimum order sub-total for this coupon is $${d.min_subtotal}` : 'The coupon code cannot be applied to your cart'
      if (d.limitation !== 'unlimited' || d.min_subtotal || d.discount_type !== 'order_subtotal') return { ok: true, warning: reason, message: 'The coupon code was entered' }
    }
    return { ok: true, message: 'The coupon code was applied' }
  })
  api.post('/cart/gift-card', async (ctx) => {
    const c = await ensureCustomer(ctx)
    const code = str(ctx.body.code, 100)
    const state = c.checkout_state || {}
    if (ctx.body.remove) { await saveState(c, { giftCardCodes: (state.giftCardCodes || []).filter((x) => x.toLowerCase() !== code.toLowerCase()) }); return { ok: true } }
    const g = await one('select g.*, coalesce((select sum(used_value) from gift_card_usage u where u.gift_card_id = g.id),0) as used from gift_cards g where lower(code) = lower($1)', [code])
    if (!g || !g.is_activated) throw bad('The coupon code you entered couldn\'t be applied to your order')
    if (g.amount - g.used <= 0) throw bad('This gift card has no remaining balance')
    await saveState(c, { giftCardCodes: [...new Set([...(state.giftCardCodes || []), g.code])] })
    return { ok: true, message: 'The gift card code was applied' }
  })
  api.post('/cart/checkout-attributes', async (ctx) => {
    const c = await ensureCustomer(ctx)
    await saveState(c, { checkoutAttributes: ctx.body.attributes || {} })
    return { ok: true }
  })
  api.post('/cart/estimate-shipping', async (ctx) => {
    const t = await computeTotals(ctx)
    if (!t.shippable) return { options: [], message: 'Shipping is not required' }
    const methods = await q('select * from shipping_methods where active order by display_order')
    const out = []
    for (const m of methods) {
      const tt = await computeTotals(ctx, { state: { shippingMethodId: m.id, pickup: false } })
      out.push({ id: m.id, name: m.name, description: m.description, rate: tt.totals.shipping })
    }
    void num
    return { options: out }
  })
}

async function wishlistOut(customerId) {
  const items = await loadCart(customerId, 'wishlist')
  const pics = await productPictures(items.map((i) => i.product_id))
  const out = []
  for (const it of items) {
    const maps = (await loadProductAttributes([it.product_id]))[it.product_id] || []
    const ev = evaluateAttributes(it, maps, it.attributes)
    const unit = round2((it.customer_enters_price ? it.customer_price : it.base_price) + ev.adjustment)
    out.push({ id: it.id, productId: it.product_id, name: it.name, slug: it.slug, sku: it.sku, quantity: it.quantity, attributesDesc: ev.desc, unitPrice: unit, lineTotal: round2(unit * it.quantity), picture: pics[it.product_id]?.[0]?.url || '', warnings: await cartLineWarnings(it) })
  }
  const c = customerId ? await one('select guid from customers where id = $1', [customerId]) : null
  return { items: out, guid: c?.guid || null }
}

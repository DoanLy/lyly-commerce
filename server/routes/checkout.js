import { q, one, tx } from '../db.js'
import { getSettings, ensureCustomer, computeTotals, saveState, logActivity, sendTemplate, loadCart } from '../core.js'
import { markPaid, addNote, createGiftCardsForItem, orderTokens } from '../orders.js'
import { validateAddress, addressOut } from './account.js'
import { bad, notFound, int, str, round2 } from '../util.js'

function luhn(num) {
  const s = String(num).replace(/\D/g, '')
  if (s.length < 12 || s.length > 19) return false
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i])
    if (i % 2) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}
function cardType(n) {
  const s = String(n).replace(/\D/g, '')
  if (/^4/.test(s)) return 'Visa'
  if (/^5[1-5]|^2[2-7]/.test(s)) return 'MasterCard'
  if (/^3[47]/.test(s)) return 'Amex'
  if (/^6/.test(s)) return 'Discover'
  return 'Card'
}

async function addressSnapshot(a) {
  const c = a.countryId ? await one('select name from countries where id = $1', [int(a.countryId)]) : null
  const s = a.stateId ? await one('select name from states where id = $1', [int(a.stateId)]) : null
  return {
    firstName: str(a.firstName, 100), lastName: str(a.lastName, 100), email: str(a.email, 200), company: str(a.company, 200), countryId: int(a.countryId) || null,
    country: c?.name || '', stateId: int(a.stateId) || null, state: s?.name || '', city: str(a.city, 100), address1: str(a.address1, 300), address2: str(a.address2, 300),
    zip: str(a.zip, 30), phone: str(a.phone, 50), fax: str(a.fax, 50),
  }
}

export default function checkoutRoutes(api) {
  api.get('/checkout/options', async (ctx) => {
    const s = await getSettings()
    const c = ctx.customer
    if ((!c || c.is_guest) && !s.orders.anonymousCheckoutAllowed) return { loginRequired: true }
    const t = await computeTotals(ctx)
    const [methods, pickups, payments, addresses] = await Promise.all([
      q('select * from shipping_methods where active order by display_order'),
      s.shipping.allowPickupInStore ? q('select * from pickup_points where active order by display_order') : [],
      q('select system_name, name, description, additional_fee, fee_percentage, kind from payment_methods where active order by display_order'),
      c && !c.is_guest ? q('select * from addresses where customer_id = $1 order by id', [c.id]) : [],
    ])
    const shippingOptions = []
    if (t.shippable) for (const m of methods) {
      const tt = await computeTotals(ctx, { state: { shippingMethodId: m.id, pickup: false } })
      shippingOptions.push({ id: m.id, name: m.name, description: m.description, rate: tt.totals.shipping })
    }
    return {
      cart: t, shippingOptions, pickupPoints: pickups, paymentMethods: payments, addresses: await Promise.all(addresses.map(addressOut)),
      customer: c && !c.is_guest ? { email: c.email, firstName: c.first_name, lastName: c.last_name, phone: c.phone, company: c.company } : null,
      termsRequired: s.orders.termsOfServiceOnConfirm,
    }
  })

  // updates checkout selections (shipping/payment/reward points) and returns fresh totals
  api.post('/checkout/state', async (ctx) => {
    const c = await ensureCustomer(ctx)
    const allowed = ['shippingMethodId', 'pickup', 'pickupPointId', 'paymentMethod', 'useRewardPoints']
    const patch = Object.fromEntries(Object.entries(ctx.body || {}).filter(([k]) => allowed.includes(k)))
    await saveState(c, patch)
    return computeTotals(ctx)
  })

  api.post('/checkout/confirm', async (ctx) => {
    const s = await getSettings()
    const b = ctx.body
    if ((!ctx.customer || ctx.customer.is_guest) && !s.orders.anonymousCheckoutAllowed) throw bad('Anonymous checkout is not allowed')
    const c = await ensureCustomer(ctx)
    const items = await loadCart(c.id, 'cart')
    if (!items.length) throw bad('Your Shopping Cart is empty!')
    // persist selections then compute totals
    await saveState(c, { shippingMethodId: int(b.shippingMethodId) || null, pickup: !!b.pickup, pickupPointId: int(b.pickupPointId) || null, paymentMethod: str(b.paymentMethod, 100), useRewardPoints: !!b.useRewardPoints })
    const t = await computeTotals(ctx, { items, forCheckout: true })
    const lineWarn = t.items.flatMap((i) => i.warnings.map((w) => `${i.name}: ${w}`))
    if (lineWarn.length) throw bad(lineWarn[0], { errors: lineWarn })
    if (t.checkoutAttributeErrors.length) throw bad(t.checkoutAttributeErrors[0])
    if (t.warnings.length) throw bad(t.warnings[0])
    const billErr = validateAddress(b.billingAddress)
    if (billErr.length) throw bad(`Billing address: ${billErr[0]}`, { errors: billErr })
    const billing = await addressSnapshot(b.billingAddress)
    let shipping = null
    let pickupPoint = null
    if (t.shippable) {
      if (b.pickup) {
        pickupPoint = await one('select * from pickup_points where id = $1 and active', [int(b.pickupPointId)])
        if (!pickupPoint) throw bad('Please select a pickup point')
      } else {
        const src = b.shipToSameAddress ? b.billingAddress : b.shippingAddress
        const err = validateAddress(src)
        if (err.length) throw bad(`Shipping address: ${err[0]}`, { errors: err })
        shipping = await addressSnapshot(src)
        if (t.totals.shipping == null) throw bad('Please select a shipping method')
      }
    }
    const total = t.totals.total ?? 0
    let pm = null
    let card = {}
    if (total > 0) {
      pm = await one('select * from payment_methods where system_name = $1 and active', [str(b.paymentMethod, 100)])
      if (!pm) throw bad('Please select a payment method')
      if (pm.kind === 'card') {
        const p = b.paymentInfo || {}
        const number = String(p.cardNumber || '').replace(/\s/g, '')
        if (!str(p.cardholderName)) throw bad('Enter cardholder name')
        if (!luhn(number)) throw bad('Wrong card number')
        const m = int(p.expireMonth)
        const y = int(p.expireYear)
        const now = new Date()
        if (!m || !y || y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1)) throw bad('Card is expired')
        if (!/^\d{3,4}$/.test(String(p.cardCode || ''))) throw bad('Wrong card code')
        card = { type: cardType(number), name: str(p.cardholderName, 100), masked: `${'*'.repeat(number.length - 4)}${number.slice(-4)}` }
      }
    }
    const currency = await one('select code, rate from currencies where code = $1', [str(b.currency, 5) || 'USD'])
    const giftCards = t.totals.giftCards.filter((g) => g.amount > 0)
    const order = await tx(async (T) => {
      const [o] = await T(`insert into orders (customer_id, customer_email, order_status, shipping_status, payment_status, payment_method, payment_method_name,
          card_type, card_name, card_masked, currency_code, currency_rate, subtotal, subtotal_discount, shipping_amount, shipping_discount, payment_fee, tax,
          order_discount, gift_card_amount, reward_points_used, reward_points_amount, total, checkout_attributes_desc, checkout_attributes,
          billing_address, shipping_address, shipping_method, pickup_in_store, pickup_point, customer_ip)
        values ($1,$2,'Pending',$3,'Pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,$25::jsonb,$26,$27,$28::jsonb,$29) returning *`, [
        c.id, billing.email, t.shippable ? 'NotYetShipped' : 'ShippingNotRequired', pm?.system_name || '', pm?.name || '', card.type || '', card.name || '', card.masked || '',
        currency?.code || 'USD', currency?.rate || 1, t.totals.subtotal, t.totals.subtotalDiscount, t.totals.shipping || 0, t.totals.shippingDiscount, t.totals.paymentFee, t.totals.tax,
        t.totals.orderDiscount, t.totals.giftCardAmount, t.totals.rewardPoints?.used || 0, t.totals.rewardPoints?.usedAmount || 0, total, t.checkoutAttributesDesc, t.state.checkoutAttributes || {},
        billing, shipping, b.pickup ? `Pickup in store` : t.totals.shippingMethodName, !!b.pickup, pickupPoint ? { name: pickupPoint.name, address: pickupPoint.address, city: pickupPoint.city, country: pickupPoint.country } : null, ctx.req.ip,
      ])
      await T('update orders set custom_number = id::text where id = $1', [o.id])
      for (const l of t._lines) {
        const it = l.it
        const upd = await T(`update products set stock_qty = stock_qty - $2, updated_at = now() where id = $1 and (not manage_stock or backorders <> 'none' or stock_qty >= $2) returning id, stock_qty, manage_stock, min_stock_qty, low_stock_activity, notify_admin_below, name`, [it.product_id, it.quantity])
        if (!upd.length) throw bad(`${it.name}: Out of stock`)
        const p = upd[0]
        if (p.manage_stock && p.stock_qty <= p.min_stock_qty) {
          if (p.low_stock_activity === 'disable_buy') await T('update products set disable_buy = true, disable_wishlist = true where id = $1', [p.id])
          if (p.low_stock_activity === 'unpublish') await T('update products set published = false where id = $1', [p.id])
        }
        const [oi] = await T(`insert into order_items (order_id, product_id, product_name, sku, quantity, unit_price, price, discount_amount, attributes_desc, attributes, weight, is_download)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) returning *`, [o.id, it.product_id, it.name, it.sku, it.quantity, round2(l.unit - l.unitDiscount), l.lineTotal,
          round2(l.unitDiscount * it.quantity), l.ev.desc, it.attributes || {}, it.weight + l.ev.weight, it.is_download])
        oi._product = it
      }
      for (const d of t.discounts) await T('insert into discount_usage (discount_id, order_id, customer_id) values ($1,$2,$3)', [d.id, o.id, c.id])
      for (const g of giftCards) await T('insert into gift_card_usage (gift_card_id, order_id, used_value) values ($1,$2,$3)', [g.id, o.id, g.amount])
      if (t.totals.rewardPoints?.used) {
        const bal = t.totals.rewardPoints.balance - t.totals.rewardPoints.used
        await T('insert into reward_points (customer_id, points, points_balance, used_amount, message, order_id) values ($1,$2,$3,$4,$5,$6)', [c.id, -t.totals.rewardPoints.used, bal, t.totals.rewardPoints.usedAmount, `Redeemed for order #${o.id}`, o.id])
      }
      await T("delete from cart_items where customer_id = $1 and cart_type = 'cart'", [c.id])
      const st = { ...(c.checkout_state || {}), couponCodes: [], giftCardCodes: [], checkoutAttributes: {}, useRewardPoints: false }
      await T('update customers set checkout_state = $2::jsonb where id = $1', [c.id, st])
      if (c.is_guest && !c.email) await T('update customers set first_name = $2, last_name = $3 where id = $1', [c.id, billing.firstName, billing.lastName])
      return o
    })
    // post-transaction work
    const orderItems = await q('select oi.*, p.gift_card_type, p.is_gift_card from order_items oi left join products p on p.id = oi.product_id where order_id = $1', [order.id])
    for (const oi of orderItems) if (oi.is_gift_card) await createGiftCardsForItem(oi, { gift_card_type: oi.gift_card_type }, oi.attributes)
    if (!c.is_guest && b.saveAddresses !== false) {
      for (const a of [b.billingAddress, shipping && !b.shipToSameAddress ? b.shippingAddress : null].filter(Boolean)) {
        if (a.id) continue
        const dup = await one('select id from addresses where customer_id = $1 and lower(address1) = lower($2) and lower(city) = lower($3) and first_name = $4', [c.id, str(a.address1), str(a.city), str(a.firstName)])
        if (!dup) await q('insert into addresses (customer_id, first_name, last_name, email, company, country_id, state_id, city, address1, address2, zip, phone) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [c.id, str(a.firstName), str(a.lastName), str(a.email), str(a.company), int(a.countryId) || null, int(a.stateId) || null, str(a.city), str(a.address1), str(a.address2), str(a.zip), str(a.phone)])
      }
    }
    await addNote(order.id, 'Order placed')
    if (str(b.comment)) await addNote(order.id, `Customer comment: ${str(b.comment, 1000)}`, true)
    const productsTxt = orderItems.map((i) => `${i.quantity} x ${i.product_name} — $${i.price.toFixed(2)}`).join('\n')
    await sendTemplate('OrderPlaced.CustomerNotification', billing.email, { ...orderTokens(order), 'Order.Product(s)': productsTxt })
    await sendTemplate('OrderPlaced.StoreOwnerNotification', s.store.email, orderTokens(order))
    await logActivity(c.id, 'PublicStore.PlaceOrder', `Placed a new order (ID = ${order.id})`, 'Order', order.id, ctx.req.ip)
    let redirect = null
    if (total <= 0 || pm?.kind === 'card') await markPaid(order.id, total <= 0 ? 'Order total is zero — marked as paid' : `Payment captured (${card.type} ${card.masked})`)
    if (pm?.kind === 'redirect') redirect = `/checkout/paypal/${order.guid}`
    return { ok: true, orderId: order.id, orderNumber: order.id, guid: order.guid, redirect }
  })

  api.get('/checkout/paypal/:guid', async (ctx) => {
    const o = await one('select id, guid, total, payment_status, customer_email from orders where guid::text = $1', [ctx.params.guid])
    if (!o) throw notFound()
    return o
  })
  api.post('/checkout/paypal/:guid', async (ctx) => {
    const o = await one('select * from orders where guid::text = $1', [ctx.params.guid])
    if (!o) throw notFound()
    if (ctx.body.approve) await markPaid(o.id, 'PayPal (sandbox) payment approved')
    else await addNote(o.id, 'PayPal (sandbox) payment was cancelled by the customer')
    return { ok: true, orderId: o.id }
  })

  api.get('/checkout/completed/:id', async (ctx) => {
    const c = ctx.customer
    const o = c ? await one('select id, custom_number, total, payment_status, payment_method_name from orders where id = $1 and customer_id = $2', [int(ctx.params.id), c.id]) : null
    if (!o) throw notFound('Order not found')
    return o
  })
  void sendTemplate
}

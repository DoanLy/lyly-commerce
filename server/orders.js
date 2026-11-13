import { q, one } from './db.js'
import { getSettings, sendTemplate } from './core.js'
import { round2, randomCode } from './util.js'

export const ORDER_STATUSES = ['Pending', 'Processing', 'Complete', 'Cancelled']
export const PAYMENT_STATUSES = ['Pending', 'Authorized', 'Paid', 'PartiallyRefunded', 'Refunded', 'Voided']
export const SHIPPING_STATUSES = ['ShippingNotRequired', 'NotYetShipped', 'PartiallyShipped', 'Shipped', 'Delivered']

export async function addNote(orderId, note, display = false) {
  await q('insert into order_notes (order_id, note, display_to_customer) values ($1,$2,$3)', [orderId, note, display])
}

function tokens(o) {
  const name = `${o.billing_address?.firstName || ''} ${o.billing_address?.lastName || ''}`.trim()
  return { 'Order.OrderNumber': o.custom_number || o.id, 'Order.OrderTotal': `$${Number(o.total).toFixed(2)}`, 'Order.CustomerFullName': name, 'Order.CustomerEmail': o.customer_email }
}

export async function markPaid(orderId, note = 'Order has been marked as paid') {
  const s = await getSettings()
  const o = await one('select * from orders where id = $1', [orderId])
  if (!o || o.payment_status === 'Paid') return o
  await q("update orders set payment_status = 'Paid', paid_at = now(), order_status = case when order_status = 'Pending' then 'Processing' else order_status end where id = $1", [orderId])
  await addNote(orderId, note)
  if (s.orders.giftCardsActivatedOnPaid) {
    const cards = await q('select g.* from gift_cards g join order_items oi on oi.id = g.order_item_id where oi.order_id = $1 and not g.is_activated', [orderId])
    for (const g of cards) {
      await q('update gift_cards set is_activated = true, is_notified = true where id = $1', [g.id])
      if (g.recipient_email) await sendTemplate('GiftCard.Notification', g.recipient_email, { 'GiftCard.SenderName': g.sender_name, 'GiftCard.Amount': `$${g.amount.toFixed(2)}`, 'GiftCard.CouponCode': g.code, 'GiftCard.Message': g.message })
    }
  }
  if (s.rewardPoints.enabled && s.rewardPoints.awardWhen === 'Paid') await awardPoints(o)
  await sendTemplate('OrderPaid.CustomerNotification', o.customer_email, tokens(o))
  await checkComplete(orderId)
  return one('select * from orders where id = $1', [orderId])
}

export async function awardPoints(o) {
  const s = await getSettings()
  if (!o.customer_id) return
  const c = await one('select is_guest from customers where id = $1', [o.customer_id])
  if (!c || c.is_guest) return
  if (await one("select id from reward_points where order_id = $1 and points > 0", [o.id])) return
  const pts = Math.floor((o.total - o.shipping_amount) / s.rewardPoints.earnPerAmount) * s.rewardPoints.earnPoints
  if (pts <= 0) return
  const bal = await one('select coalesce((select points_balance from reward_points where customer_id = $1 order by id desc limit 1),0)::int as b', [o.customer_id])
  await q('insert into reward_points (customer_id, points, points_balance, message, order_id) values ($1,$2,$3,$4,$5)', [o.customer_id, pts, bal.b + pts, `Earned promotion points for order #${o.custom_number || o.id}`, o.id])
}

export async function checkComplete(orderId) {
  const o = await one('select * from orders where id = $1', [orderId])
  if (!o || o.order_status === 'Cancelled' || o.order_status === 'Complete') return
  const shippedOk = ['Delivered', 'ShippingNotRequired'].includes(o.shipping_status)
  if (o.payment_status === 'Paid' && shippedOk) {
    await q("update orders set order_status = 'Complete' where id = $1", [orderId])
    await addNote(orderId, 'Order status has been changed to Complete')
    await sendTemplate('OrderCompleted.CustomerNotification', o.customer_email, tokens(o))
    const s = await getSettings()
    if (s.rewardPoints.enabled && s.rewardPoints.awardWhen === 'Complete') await awardPoints(o)
  }
}

export async function cancelOrder(orderId, restock = true) {
  const s = await getSettings()
  const o = await one('select * from orders where id = $1', [orderId])
  if (!o || o.order_status === 'Cancelled') return
  await q("update orders set order_status = 'Cancelled', payment_status = case when payment_status in ('Pending','Authorized') then 'Voided' else payment_status end where id = $1", [orderId])
  if (restock && s.orders.cancelRestoresStock) {
    const items = await q('select product_id, quantity from order_items where order_id = $1', [orderId])
    for (const it of items) await q('update products set stock_qty = stock_qty + $2 where id = $1 and manage_stock', [it.product_id, it.quantity])
  }
  await q('delete from gift_card_usage where order_id = $1', [orderId])
  await q('delete from discount_usage where order_id = $1', [orderId])
  if (o.reward_points_used && o.customer_id) {
    const bal = await one('select coalesce((select points_balance from reward_points where customer_id = $1 order by id desc limit 1),0)::int as b', [o.customer_id])
    await q('insert into reward_points (customer_id, points, points_balance, message, order_id) values ($1,$2,$3,$4,$5)', [o.customer_id, o.reward_points_used, bal.b + o.reward_points_used, `Returned points for cancelled order #${o.id}`, o.id])
  }
  await addNote(orderId, 'Order has been cancelled')
  await sendTemplate('OrderCancelled.CustomerNotification', o.customer_email, tokens(o))
}

export async function refundOrder(orderId, amount) {
  const o = await one('select * from orders where id = $1', [orderId])
  if (!o) return
  const max = round2(o.total - o.refunded_amount)
  const a = round2(Math.min(amount ?? max, max))
  if (a <= 0) return
  const refunded = round2(o.refunded_amount + a)
  const status = refunded >= o.total ? 'Refunded' : 'PartiallyRefunded'
  await q('update orders set refunded_amount = $2, payment_status = $3 where id = $1', [orderId, refunded, status])
  await addNote(orderId, `Order has been refunded. Amount = $${a.toFixed(2)}`)
  await sendTemplate('OrderRefunded.CustomerNotification', o.customer_email, { ...tokens(o), 'Order.AmountRefunded': `$${a.toFixed(2)}` })
}

export async function createGiftCardsForItem(orderItem, product, attributes) {
  const g = attributes?.giftCard || {}
  for (let i = 0; i < orderItem.quantity; i++) {
    await q(`insert into gift_cards (order_item_id, gift_card_type, amount, is_activated, code, recipient_name, recipient_email, sender_name, sender_email, message)
      values ($1,$2,$3,false,$4,$5,$6,$7,$8,$9)`, [orderItem.id, product.gift_card_type, orderItem.unit_price, `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`,
      g.recipientName || '', g.recipientEmail || '', g.senderName || '', g.senderEmail || '', String(g.message || '').slice(0, 1000)])
  }
}

export { tokens as orderTokens }

import { q, one, tx } from '../db.js'
import { requireAdmin, getSettings, clearSettingsCache, logActivity, sendTemplate, queueEmail, DEFAULT_SETTINGS } from '../core.js'
import { markPaid, cancelOrder, refundOrder, addNote, checkComplete, orderTokens, ORDER_STATUSES, PAYMENT_STATUSES, SHIPPING_STATUSES } from '../orders.js'
import { bad, notFound, int, num, str, bool, slugify, hashPassword, isEmail, round2, randomCode } from '../util.js'

// ---------- generic CRUD config ----------
// col types: t=text i=int n=number b=bool d=timestamp j=json
const E = {
  categories: { table: 'categories', cols: 'name:t slug:t description:t parent_id:i picture:t display_order:i published:b show_on_home:b include_in_top_menu:b page_size:i allow_page_size:b page_size_options:t price_from:n price_to:n meta_title:t', search: ['name'], order: 'display_order, name', soft: true, slug: 'name',
    select: `select e.*, (select count(*)::int from product_categories pc where pc.category_id = e.id) as products from categories e` },
  manufacturers: { table: 'manufacturers', cols: 'name:t slug:t description:t picture:t display_order:i published:b', search: ['name'], order: 'display_order, name', soft: true, slug: 'name',
    select: `select e.*, (select count(*)::int from product_manufacturers pm where pm.manufacturer_id = e.id) as products from manufacturers e` },
  product_attributes: { table: 'product_attributes', cols: 'name:t description:t', search: ['name'], order: 'name',
    select: 'select e.*, (select count(*)::int from product_attribute_mappings m where m.attribute_id = e.id) as used_by from product_attributes e' },
  spec_attributes: { table: 'spec_attributes', cols: 'name:t display_order:i', search: ['name'], order: 'display_order, name',
    children: { key: 'options', table: 'spec_options', fk: 'spec_attribute_id', cols: 'name:t color_rgb:t display_order:i' } },
  checkout_attributes: { table: 'checkout_attributes', cols: 'name:t text_prompt:t is_required:b shippable_only:b control_type:t display_order:i', search: ['name'], order: 'display_order',
    children: { key: 'values', table: 'checkout_attribute_values', fk: 'attribute_id', cols: 'name:t price_adjustment:n is_preselected:b display_order:i' } },
  product_tags: { table: 'product_tags', cols: 'name:t', search: ['name'], order: 'name',
    select: 'select e.*, (select count(*)::int from product_tag_map m where m.tag_id = e.id) as products from product_tags e' },
  reviews: { table: 'product_reviews', cols: 'title:t body:t rating:i approved:b reply_text:t', search: ['e.title', 'e.body', 'p.name'], order: 'e.created_at desc',
    select: `select e.*, p.name as product_name, p.slug as product_slug, coalesce(c.email, 'Guest') as customer_email from product_reviews e
      join products p on p.id = e.product_id left join customers c on c.id = e.customer_id`, filters: { approved: 'b', product_id: 'i' }, after: 'review' },
  customer_roles: { table: 'customer_roles', cols: 'name:t system_name:t active:b free_shipping:b tax_exempt:b', search: ['name'], order: 'id', protect: 'is_system' },
  discounts: { table: 'discounts', cols: 'name:t discount_type:t use_percentage:b percentage:n amount:n max_amount:n max_qty:i requires_coupon:b coupon_code:t is_cumulative:b start_at:d end_at:d limitation:t limitation_times:i min_subtotal:n required_role_id:i apply_to_subcategories:b admin_comment:t active:b',
    search: ['name', 'coupon_code'], order: 'id desc', filters: { discount_type: 't' },
    select: 'select e.*, (select count(*)::int from discount_usage u where u.discount_id = e.id) as times_used from discounts e',
    maps: [{ key: 'productIds', table: 'discount_products', fk: 'discount_id', other: 'product_id' }, { key: 'categoryIds', table: 'discount_categories', fk: 'discount_id', other: 'category_id' }, { key: 'manufacturerIds', table: 'discount_manufacturers', fk: 'discount_id', other: 'manufacturer_id' }] },
  gift_cards: { table: 'gift_cards', cols: 'gift_card_type:t amount:n is_activated:b code:t recipient_name:t recipient_email:t sender_name:t sender_email:t message:t', search: ['code', 'recipient_name', 'recipient_email'], order: 'id desc',
    select: `select e.*, round((e.amount - coalesce((select sum(used_value) from gift_card_usage u where u.gift_card_id = e.id),0))::numeric, 2)::float8 as remaining,
      (select oi.order_id from order_items oi where oi.id = e.order_item_id) as order_id from gift_cards e`, filters: { is_activated: 'b' } },
  newsletter: { table: 'newsletter_subscriptions', cols: 'email:t active:b', search: ['email'], order: 'created_at desc', filters: { active: 'b' } },
  campaigns: { table: 'campaigns', cols: 'name:t subject:t body:t', search: ['name', 'subject'], order: 'id desc' },
  topics: { table: 'topics', cols: 'system_name:t title:t slug:t body:t include_in_top_menu:b footer_column:i published:b display_order:i', search: ['title', 'system_name'], order: 'display_order', slug: 'title' },
  news: { table: 'news', cols: 'title:t slug:t short:t full_text:t published:b allow_comments:b start_at:d end_at:d', search: ['title'], order: 'created_at desc', slug: 'title',
    select: 'select e.*, (select count(*)::int from news_comments c where c.news_id = e.id) as comments from news e' },
  news_comments: { table: 'news_comments', cols: 'title:t body:t approved:b', search: ['e.title', 'e.body'], order: 'e.created_at desc', filters: { approved: 'b' },
    select: 'select e.*, n.title as news_title, c.email as customer_email from news_comments e join news n on n.id = e.news_id left join customers c on c.id = e.customer_id' },
  blog: { table: 'blog_posts', cols: 'title:t slug:t body:t overview:t tags:t published:b allow_comments:b created_at:d', search: ['title', 'tags'], order: 'created_at desc', slug: 'title',
    select: 'select e.*, (select count(*)::int from blog_comments c where c.post_id = e.id) as comments from blog_posts e' },
  blog_comments: { table: 'blog_comments', cols: 'body:t approved:b', search: ['e.body'], order: 'e.created_at desc', filters: { approved: 'b' },
    select: 'select e.*, b.title as post_title, c.email as customer_email from blog_comments e join blog_posts b on b.id = e.post_id left join customers c on c.id = e.customer_id' },
  polls: { table: 'polls', cols: 'name:t system_keyword:t published:b show_on_home:b allow_guests:b display_order:i start_at:d end_at:d', search: ['name'], order: 'display_order',
    children: { key: 'answers', table: 'poll_answers', fk: 'poll_id', cols: 'name:t votes:i display_order:i' } },
  shipping_methods: { table: 'shipping_methods', cols: 'name:t description:t rate:n rate_per_kg:n display_order:i active:b', search: ['name'], order: 'display_order' },
  pickup_points: { table: 'pickup_points', cols: 'name:t description:t address:t city:t country:t opening_hours:t fee:n display_order:i active:b', search: ['name'], order: 'display_order' },
  payment_methods: { table: 'payment_methods', pk: 'system_name', cols: 'name:t description:t additional_fee:n fee_percentage:b active:b display_order:i', search: ['name'], order: 'display_order', noCreate: true, noDelete: true },
  countries: { table: 'countries', cols: 'name:t code:t allows_billing:b allows_shipping:b published:b display_order:i', search: ['name', 'code'], order: 'display_order, name',
    children: { key: 'states', table: 'states', fk: 'country_id', cols: 'name:t abbreviation:t display_order:i' } },
  currencies: { table: 'currencies', cols: 'name:t code:t symbol:t rate:n published:b is_primary:b display_order:i custom_format:t', search: ['name', 'code'], order: 'display_order' },
  tax_categories: { table: 'tax_categories', cols: 'name:t rate:n display_order:i', search: ['name'], order: 'display_order' },
  message_templates: { table: 'message_templates', cols: 'name:t subject:t body:t active:b', search: ['name', 'subject'], order: 'name' },
  queued_emails: { table: 'queued_emails', cols: 'to_email:t to_name:t subject:t body:t priority:t sent_at:d', search: ['to_email', 'subject'], order: 'id desc' },
  activity_log: { table: 'activity_log', cols: 'comment:t', search: ['e.type', 'e.comment', 'c.email'], order: 'e.id desc', noCreate: true, filters: { type: 't', customer_id: 'i' },
    select: 'select e.*, c.email as customer_email from activity_log e left join customers c on c.id = e.customer_id' },
  system_log: { table: 'system_log', cols: 'short_message:t full_message:t level:t', search: ['short_message'], order: 'id desc', noCreate: true, filters: { level: 't' } },
  search_terms: { table: 'search_terms', pk: 'term', cols: 'count:i', search: ['term'], order: 'count desc', noCreate: true },
  return_requests: { table: 'return_requests', cols: 'quantity:i returned_qty:i reason:t requested_action:t comments:t staff_notes:t status:t', search: ['oi.product_name', 'c.email', 'e.custom_number'], order: 'e.created_at desc', filters: { status: 't' }, after: 'returnRequest',
    select: 'select e.*, oi.product_name, oi.order_id, c.email as customer_email from return_requests e join order_items oi on oi.id = e.order_item_id left join customers c on c.id = e.customer_id' },
  shipments: { table: 'shipments', cols: 'tracking_number:t admin_comment:t total_weight:n', search: ['e.tracking_number'], order: 'e.id desc', noCreate: true, filters: { order_id: 'i' },
    select: `select e.*, o.custom_number, o.customer_email, (select coalesce(sum(si.quantity),0)::int from shipment_items si where si.shipment_id = e.id) as items from shipments e join orders o on o.id = e.order_id` },
  back_in_stock: { table: 'back_in_stock', cols: '', search: ['p.name', 'c.email'], order: 'e.id desc', noCreate: true,
    select: 'select e.*, p.name as product_name, c.email as customer_email from back_in_stock e join products p on p.id = e.product_id join customers c on c.id = e.customer_id' },
}

function parseCols(spec) { return spec.split(' ').filter(Boolean).map((x) => { const [k, t] = x.split(':'); return { k, t } }) }
for (const e of Object.values(E)) { e.colList = parseCols(e.cols); if (e.children) e.children.colList = parseCols(e.children.cols) }

function coerce(t, v) {
  if (t === 'i') return v === '' || v == null ? null : int(v, null)
  if (t === 'n') return v === '' || v == null ? null : num(v, null)
  if (t === 'b') return bool(v)
  if (t === 'd') return v ? new Date(v).toISOString() : null
  if (t === 'j') return v ?? {}
  return v == null ? '' : String(v)
}

function camel(r) { return r }

async function listEntity(e, query) {
  const params = []
  const where = []
  const alias = e.select ? 'e' : 'e'
  if (e.soft) where.push(`${alias}.deleted = false`)
  const search = str(query.search, 100)
  if (search && e.search?.length) {
    params.push(`%${search}%`)
    where.push(`(${e.search.map((f) => `${f.includes('.') ? f : `${alias}.${f}`}::text ilike $${params.length}`).join(' or ')})`)
  }
  for (const [f, t] of Object.entries(e.filters || {})) {
    const v = query[`f_${f}`]
    if (v === undefined || v === '') continue
    params.push(coerce(t, v))
    where.push(`${alias}.${f} = $${params.length}`)
  }
  const base = e.select || `select e.* from ${e.table} e`
  const w = where.length ? ` where ${where.join(' and ')}` : ''
  const size = Math.min(500, int(query.size, 15))
  const page = Math.max(1, int(query.page, 1))
  const order = e.order.includes('.') ? e.order : e.order.split(',').map((x) => `e.${x.trim()}`).join(', ')
  const rows = await q(`${base}${w} order by ${order} limit ${size} offset ${(page - 1) * size}`, params)
  const total = await one(`select count(*)::int n from (${base}${w}) x`, params)
  return { rows: rows.map(camel), total: total.n, page, size }
}

async function getEntity(e, id) {
  const pk = e.pk || 'id'
  const base = e.select || `select e.* from ${e.table} e`
  const row = await one(`${base} where e.${pk} = $1`, [pk === 'id' ? int(id) : id])
  if (!row) throw notFound()
  if (e.children) row[e.children.key] = await q(`select * from ${e.children.table} where ${e.children.fk} = $1 order by ${e.children.colList.some((c) => c.k === 'display_order') ? 'display_order, ' : ''}id`, [row.id])
  for (const m of e.maps || []) row[m.key] = (await q(`select ${m.other} as v from ${m.table} where ${m.fk} = $1`, [row.id])).map((x) => x.v)
  return row
}

async function saveEntity(e, id, body) {
  const cols = e.colList.filter((c) => body[c.k] !== undefined)
  if (e.slug && cols.some((c) => c.k === 'slug') && !str(body.slug)) body.slug = slugify(body[e.slug])
  if (e.slug && !cols.some((c) => c.k === 'slug') && !id) { body.slug = slugify(body[e.slug]); cols.push({ k: 'slug', t: 't' }) }
  if (e.slug && body.slug) {
    let s = slugify(body.slug); let n = 1
    while (await one(`select 1 from ${e.table} where slug = $1 ${id ? `and id <> ${int(id)}` : ''}`, [s])) s = `${slugify(body.slug)}-${++n}`
    body.slug = s
  }
  if (e.colList.some((c) => c.k === 'name') && body.name !== undefined && !str(body.name)) throw bad('Name is required')
  if (e.colList.some((c) => c.k === 'title') && body.title !== undefined && !str(body.title)) throw bad('Title is required')
  const vals = cols.map((c) => coerce(c.t, body[c.k]))
  const pk = e.pk || 'id'
  let row
  if (id) {
    if (!cols.length) row = await one(`select * from ${e.table} where ${pk} = $1`, [pk === 'id' ? int(id) : id])
    else row = await one(`update ${e.table} set ${cols.map((c, i) => `${c.k} = $${i + 2}${c.t === 'j' ? '::jsonb' : ''}`).join(', ')} where ${pk} = $1 returning *`, [pk === 'id' ? int(id) : id, ...vals])
    if (!row) throw notFound()
  } else {
    if (e.noCreate) throw bad('Not supported')
    row = await one(`insert into ${e.table} (${cols.map((c) => c.k).join(',')}) values (${cols.map((c, i) => `$${i + 1}${c.t === 'j' ? '::jsonb' : ''}`).join(',')}) returning *`, vals)
  }
  if (e.children && Array.isArray(body[e.children.key])) {
    const ch = e.children
    const keep = body[e.children.key].filter((x) => x.id).map((x) => int(x.id))
    await q(`delete from ${ch.table} where ${ch.fk} = $1 and not (id = any($2::int[]))`, [row.id, keep])
    for (const [i, item] of body[e.children.key].entries()) {
      if (!str(item.name)) continue
      if (ch.colList.some((c) => c.k === 'display_order') && item.display_order == null) item.display_order = i
      const cv = ch.colList.map((c) => coerce(c.t, item[c.k]))
      if (item.id) await q(`update ${ch.table} set ${ch.colList.map((c, j) => `${c.k} = $${j + 3}`).join(', ')} where id = $1 and ${ch.fk} = $2`, [int(item.id), row.id, ...cv])
      else await q(`insert into ${ch.table} (${ch.fk}, ${ch.colList.map((c) => c.k).join(',')}) values ($1, ${ch.colList.map((_, j) => `$${j + 2}`).join(',')})`, [row.id, ...cv])
    }
  }
  for (const m of e.maps || []) {
    if (!Array.isArray(body[m.key])) continue
    await q(`delete from ${m.table} where ${m.fk} = $1`, [row.id])
    for (const v of [...new Set(body[m.key].map(Number).filter(Boolean))]) await q(`insert into ${m.table} (${m.fk}, ${m.other}) values ($1,$2) on conflict do nothing`, [row.id, v])
  }
  return row
}

async function deleteEntity(e, id) {
  if (e.noDelete) throw bad('This item cannot be deleted')
  const pk = e.pk || 'id'
  const key = pk === 'id' ? int(id) : id
  if (e.protect) { const r = await one(`select ${e.protect} as p from ${e.table} where ${pk} = $1`, [key]); if (r?.p) throw bad('System items cannot be deleted') }
  if (e.soft) await q(`update ${e.table} set deleted = true where ${pk} = $1`, [key])
  else await q(`delete from ${e.table} where ${pk} = $1`, [key])
}

async function afterSave(kind, row) {
  if (kind === 'review') await q('update products set rating_sum = (select coalesce(sum(rating),0) from product_reviews where product_id = $1 and approved), total_reviews = (select count(*) from product_reviews where product_id = $1 and approved) where id = $1', [row.product_id])
  if (kind === 'returnRequest') {
    await q('update return_requests set updated_at = now() where id = $1', [row.id])
    const c = row.customer_id ? await one('select email from customers where id = $1', [row.customer_id]) : null
    if (c) await sendTemplate('ReturnRequestStatusChanged.CustomerNotification', c.email, { 'ReturnRequest.CustomNumber': row.custom_number || row.id, 'ReturnRequest.Status': row.status })
  }
}

// ---------- products ----------
const PRODUCT_COLS = parseCols(`name:t slug:t sku:t gtin:t mpn:t short_description:t full_description:t product_type:t parent_grouped_id:i visible_individually:b
  price:n old_price:n product_cost:n call_for_price:b customer_enters_price:b min_customer_price:n max_customer_price:n is_gift_card:b gift_card_type:t
  is_download:b download_url:t has_sample:b is_shipping_enabled:b is_free_shipping:b additional_shipping_charge:n weight:n length:n width:n height:n
  is_tax_exempt:b tax_category_id:i manage_stock:b stock_qty:i display_stock_availability:b display_stock_quantity:b min_stock_qty:i low_stock_activity:t
  notify_admin_below:i backorders:t allow_back_in_stock:b order_min_qty:i order_max_qty:i allowed_quantities:t disable_buy:b disable_wishlist:b
  available_for_preorder:b mark_as_new:b mark_new_start:d mark_new_end:d available_start:d available_end:d allow_reviews:b show_on_home:b published:b
  display_order:i admin_comment:t meta_title:t`.replace(/\s+/g, ' '))

async function productDetail(id) {
  const p = await one('select * from products where id = $1 and deleted = false', [id])
  if (!p) throw notFound('Product not found')
  const [cats, mfrs, tags, pics, maps, specs, tiers, rel, cross, children] = await Promise.all([
    q('select category_id, is_featured from product_categories where product_id = $1 order by display_order', [id]),
    q('select manufacturer_id from product_manufacturers where product_id = $1', [id]),
    q('select t.name from product_tag_map m join product_tags t on t.id = m.tag_id where m.product_id = $1 order by t.name', [id]),
    q('select id, url, alt, display_order from product_pictures where product_id = $1 order by display_order, id', [id]),
    q('select m.*, a.name as attribute_name from product_attribute_mappings m join product_attributes a on a.id = m.attribute_id where product_id = $1 order by display_order, id', [id]),
    q(`select sm.*, so.name as option_name, so.spec_attribute_id, sa.name as attribute_name from product_spec_map sm join spec_options so on so.id = sm.option_id
       join spec_attributes sa on sa.id = so.spec_attribute_id where sm.product_id = $1 order by sm.display_order, sm.id`, [id]),
    q('select * from tier_prices where product_id = $1 order by quantity', [id]),
    q('select r.related_id as id, p.name from related_products r join products p on p.id = r.related_id where r.product_id = $1 order by r.display_order', [id]),
    q('select x.cross_id as id, p.name from cross_sell_products x join products p on p.id = x.cross_id where x.product_id = $1', [id]),
    q('select id, name, price, published from products where parent_grouped_id = $1 and not deleted order by display_order', [id]),
  ])
  const vals = maps.length ? await q('select * from product_attribute_values where mapping_id = any($1::int[]) order by display_order, id', [maps.map((m) => m.id)]) : []
  return {
    ...p, categoryIds: cats.map((c) => c.category_id), featuredCategoryIds: cats.filter((c) => c.is_featured).map((c) => c.category_id),
    manufacturerIds: mfrs.map((m) => m.manufacturer_id), tags: tags.map((t) => t.name).join(', '), pictures: pics,
    attributes: maps.map((m) => ({ id: m.id, attribute_id: m.attribute_id, attribute_name: m.attribute_name, text_prompt: m.text_prompt, is_required: m.is_required, control_type: m.control_type, display_order: m.display_order, values: vals.filter((v) => v.mapping_id === m.id) })),
    specs, tierPrices: tiers, related: rel, crossSells: cross, associated: children,
  }
}

async function saveProduct(id, b, adminId) {
  if (!str(b.name)) throw bad('Product name is required')
  if (b.price !== undefined && num(b.price) < 0) throw bad('Price cannot be negative')
  const before = id ? await one('select stock_qty, name from products where id = $1', [id]) : null
  let slug = slugify(str(b.slug) || b.name)
  let n = 1
  while (await one(`select 1 from products where slug = $1 ${id ? `and id <> ${int(id)}` : ''}`, [slug])) slug = `${slugify(str(b.slug) || b.name)}-${++n}`
  b.slug = slug
  if (b.sku) {
    const dup = await one(`select id from products where lower(sku) = lower($1) and deleted = false ${id ? `and id <> ${int(id)}` : ''}`, [str(b.sku)])
    if (dup) throw bad(`SKU "${b.sku}" is already used by product #${dup.id}`)
  }
  const cols = PRODUCT_COLS.filter((c) => b[c.k] !== undefined)
  const vals = cols.map((c) => coerce(c.t, b[c.k]))
  let row
  if (id) row = await one(`update products set ${cols.map((c, i) => `${c.k} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1 returning *`, [id, ...vals])
  else row = await one(`insert into products (${cols.map((c) => c.k).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`, vals)
  const pid = row.id
  if (Array.isArray(b.categoryIds)) {
    await q('delete from product_categories where product_id = $1', [pid])
    for (const [i, c] of b.categoryIds.entries()) await q('insert into product_categories (product_id, category_id, is_featured, display_order) values ($1,$2,$3,$4) on conflict do nothing', [pid, int(c), (b.featuredCategoryIds || []).map(Number).includes(int(c)), i])
  }
  if (Array.isArray(b.manufacturerIds)) {
    await q('delete from product_manufacturers where product_id = $1', [pid])
    for (const m of b.manufacturerIds) await q('insert into product_manufacturers (product_id, manufacturer_id) values ($1,$2) on conflict do nothing', [pid, int(m)])
  }
  if (b.tags !== undefined) {
    await q('delete from product_tag_map where product_id = $1', [pid])
    for (const t of [...new Set(String(b.tags).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))]) {
      const tag = await one('insert into product_tags (name) values ($1) on conflict (name) do update set name = excluded.name returning id', [t])
      await q('insert into product_tag_map values ($1,$2) on conflict do nothing', [pid, tag.id])
    }
  }
  if (Array.isArray(b.pictures)) {
    await q('delete from product_pictures where product_id = $1', [pid])
    for (const [i, p] of b.pictures.entries()) if (p.url) await q('insert into product_pictures (product_id, url, alt, display_order) values ($1,$2,$3,$4)', [pid, p.url, str(p.alt, 200), p.display_order ?? i])
  }
  if (Array.isArray(b.attributes)) {
    const keep = b.attributes.filter((a) => a.id).map((a) => int(a.id))
    await q('delete from product_attribute_mappings where product_id = $1 and not (id = any($2::int[]))', [pid, keep])
    for (const [i, a] of b.attributes.entries()) {
      if (!int(a.attribute_id)) continue
      let mid = int(a.id)
      const args = [int(a.attribute_id), str(a.text_prompt), bool(a.is_required), str(a.control_type) || 'dropdown', a.display_order ?? i]
      if (mid) await q('update product_attribute_mappings set attribute_id=$3, text_prompt=$4, is_required=$5, control_type=$6, display_order=$7 where id=$1 and product_id=$2', [mid, pid, ...args])
      else mid = (await one('insert into product_attribute_mappings (product_id, attribute_id, text_prompt, is_required, control_type, display_order) values ($1,$2,$3,$4,$5,$6) returning id', [pid, ...args])).id
      const values = Array.isArray(a.values) ? a.values : []
      await q('delete from product_attribute_values where mapping_id = $1 and not (id = any($2::int[]))', [mid, values.filter((v) => v.id).map((v) => int(v.id))])
      for (const [j, v] of values.entries()) {
        if (!str(v.name)) continue
        const va = [str(v.name), str(v.color_rgb), num(v.price_adjustment), bool(v.price_adjustment_percent), num(v.weight_adjustment), bool(v.is_preselected), v.display_order ?? j]
        if (v.id) await q('update product_attribute_values set name=$3, color_rgb=$4, price_adjustment=$5, price_adjustment_percent=$6, weight_adjustment=$7, is_preselected=$8, display_order=$9 where id=$1 and mapping_id=$2', [int(v.id), mid, ...va])
        else await q('insert into product_attribute_values (mapping_id, name, color_rgb, price_adjustment, price_adjustment_percent, weight_adjustment, is_preselected, display_order) values ($1,$2,$3,$4,$5,$6,$7,$8)', [mid, ...va])
      }
    }
  }
  if (Array.isArray(b.specs)) {
    await q('delete from product_spec_map where product_id = $1', [pid])
    for (const [i, s] of b.specs.entries()) if (int(s.option_id)) await q('insert into product_spec_map (product_id, option_id, custom_value, allow_filtering, show_on_product_page, display_order) values ($1,$2,$3,$4,$5,$6)', [pid, int(s.option_id), str(s.custom_value), s.allow_filtering !== false, s.show_on_product_page !== false, i])
  }
  if (Array.isArray(b.tierPrices)) {
    await q('delete from tier_prices where product_id = $1', [pid])
    for (const t of b.tierPrices) if (int(t.quantity) > 0) await q('insert into tier_prices (product_id, quantity, price, role_id, start_at, end_at) values ($1,$2,$3,$4,$5,$6)', [pid, int(t.quantity), num(t.price), int(t.role_id) || null, t.start_at || null, t.end_at || null])
  }
  if (Array.isArray(b.relatedIds)) {
    await q('delete from related_products where product_id = $1', [pid])
    for (const [i, r] of b.relatedIds.entries()) if (int(r) !== pid) await q('insert into related_products (product_id, related_id, display_order) values ($1,$2,$3) on conflict do nothing', [pid, int(r), i])
  }
  if (Array.isArray(b.crossSellIds)) {
    await q('delete from cross_sell_products where product_id = $1', [pid])
    for (const r of b.crossSellIds) if (int(r) !== pid) await q('insert into cross_sell_products values ($1,$2) on conflict do nothing', [pid, int(r)])
  }
  // back in stock notifications
  if (before && before.stock_qty <= 0 && row.stock_qty > 0) {
    const subs = await q('select b.id, c.email from back_in_stock b join customers c on c.id = b.customer_id where b.product_id = $1', [pid])
    for (const s of subs) await sendTemplate('Customer.BackInStock', s.email, { 'Product.Name': row.name, 'BackInStockSubscription.ProductUrl': `/product/${row.slug}` })
    await q('delete from back_in_stock where product_id = $1', [pid])
  }
  await logActivity(adminId, id ? 'EditProduct' : 'AddNewProduct', `${id ? 'Edited' : 'Added a new'} product ('${row.name}')`, 'Product', pid)
  return row
}

// ---------- orders ----------
async function orderDetail(id) {
  const o = await one('select o.*, c.email as account_email, c.is_guest from orders o left join customers c on c.id = o.customer_id where o.id = $1', [id])
  if (!o) throw notFound('Order not found')
  const [items, notes, shipments, gcu, du, rr, gcs] = await Promise.all([
    q('select oi.*, p.slug, (select coalesce(sum(si.quantity),0)::int from shipment_items si where si.order_item_id = oi.id) as shipped_qty from order_items oi left join products p on p.id = oi.product_id where order_id = $1 order by id', [id]),
    q('select * from order_notes where order_id = $1 order by created_at desc, id desc', [id]),
    q('select s.*, (select coalesce(sum(quantity),0)::int from shipment_items si where si.shipment_id = s.id) as items from shipments s where order_id = $1 order by id', [id]),
    q('select u.used_value, g.code from gift_card_usage u join gift_cards g on g.id = u.gift_card_id where u.order_id = $1', [id]),
    q('select d.name, d.coupon_code from discount_usage u join discounts d on d.id = u.discount_id where u.order_id = $1', [id]),
    q('select r.* from return_requests r join order_items oi on oi.id = r.order_item_id where oi.order_id = $1', [id]),
    q('select g.* from gift_cards g join order_items oi on oi.id = g.order_item_id where oi.order_id = $1', [id]),
  ])
  return { ...o, items, notes, shipments, giftCardUsage: gcu, discounts: du, returnRequests: rr, purchasedGiftCards: gcs }
}

function rangeWhere(query, col, params, where) {
  if (query.from) { params.push(query.from); where.push(`${col} >= $${params.length}::date`) }
  if (query.to) { params.push(query.to); where.push(`${col} < ($${params.length}::date + 1)`) }
}

export default function adminRoutes(api) {
  const A = (fn) => async (ctx) => { requireAdmin(ctx); return fn(ctx) }

  api.get('/admin/me', async (ctx) => {
    const c = ctx.customer
    if (!c?.isAdmin) return { admin: null }
    return { admin: { id: c.id, email: c.email, name: `${c.first_name} ${c.last_name}`.trim() } }
  })

  // ---- dashboard ----
  api.get('/admin/dashboard', A(async () => {
    const [counts, byDay, latest, keywords, bestQty, bestAmt, incomplete, customersByDay] = await Promise.all([
      one(`select (select count(*)::int from orders where not deleted) as orders,
        (select count(*)::int from return_requests where status = 'Pending') as pending_returns,
        (select count(*)::int from customers where not is_guest and not deleted) as customers,
        (select count(*)::int from products where manage_stock and stock_qty <= min_stock_qty and not deleted) as low_stock,
        (select count(*)::int from product_reviews where not approved) as pending_reviews,
        (select count(*)::int from customers where last_activity_at > now() - interval '20 minutes') as online`),
      q(`select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(o.total),0)::float8 as amount, count(o.id)::int as orders
         from generate_series(current_date - 29, current_date, interval '1 day') d
         left join orders o on o.created_at::date = d::date and not o.deleted and o.order_status <> 'Cancelled' group by d order by d`),
      q('select id, custom_number, customer_email, order_status, payment_status, total, created_at from orders where not deleted order by created_at desc limit 6'),
      q('select term, count from search_terms order by count desc limit 6'),
      q(`select oi.product_id, oi.product_name, sum(oi.quantity)::int as qty, sum(oi.price)::float8 as amount from order_items oi join orders o on o.id = oi.order_id
         where o.order_status <> 'Cancelled' and not o.deleted group by oi.product_id, oi.product_name order by qty desc limit 6`),
      q(`select oi.product_id, oi.product_name, sum(oi.quantity)::int as qty, sum(oi.price)::float8 as amount from order_items oi join orders o on o.id = oi.order_id
         where o.order_status <> 'Cancelled' and not o.deleted group by oi.product_id, oi.product_name order by amount desc limit 6`),
      one(`select count(*) filter (where payment_status = 'Pending')::int as unpaid, coalesce(sum(total) filter (where payment_status = 'Pending'),0)::float8 as unpaid_amount,
          count(*) filter (where shipping_status = 'NotYetShipped')::int as not_shipped, coalesce(sum(total) filter (where shipping_status = 'NotYetShipped'),0)::float8 as not_shipped_amount,
          count(*) filter (where order_status = 'Pending')::int as pending, coalesce(sum(total) filter (where order_status = 'Pending'),0)::float8 as pending_amount
          from orders where not deleted and order_status <> 'Cancelled'`),
      q(`select to_char(d, 'YYYY-MM-DD') as day, count(c.id)::int as n from generate_series(current_date - 29, current_date, interval '1 day') d
         left join customers c on c.created_at::date = d::date and not c.is_guest group by d order by d`),
    ])
    const totals = await q(`select order_status as status,
        coalesce(sum(total) filter (where created_at::date = current_date),0)::float8 as today,
        coalesce(sum(total) filter (where created_at > now() - interval '7 days'),0)::float8 as week,
        coalesce(sum(total) filter (where created_at > now() - interval '30 days'),0)::float8 as month,
        coalesce(sum(total) filter (where created_at > now() - interval '365 days'),0)::float8 as year,
        coalesce(sum(total),0)::float8 as all_time from orders where not deleted group by order_status`)
    return { counts, byDay, latest, keywords, bestQty, bestAmt, incomplete, totals, customersByDay }
  }))

  // ---- generic CRUD ----
  api.get('/admin/e/:entity', A(async (ctx) => { const e = E[ctx.params.entity]; if (!e) throw notFound(); return listEntity(e, ctx.query) }))
  api.get('/admin/e/:entity/:id', A(async (ctx) => { const e = E[ctx.params.entity]; if (!e) throw notFound(); return getEntity(e, ctx.params.id) }))
  api.post('/admin/e/:entity', A(async (ctx) => {
    const e = E[ctx.params.entity]; if (!e) throw notFound()
    const row = await saveEntity(e, null, ctx.body)
    if (e.after) await afterSave(e.after, row)
    await logActivity(ctx.customer.id, `AddNew.${ctx.params.entity}`, `Added ${ctx.params.entity} #${row.id ?? ''}`, ctx.params.entity, row.id)
    return row
  }))
  api.put('/admin/e/:entity/:id', A(async (ctx) => {
    const e = E[ctx.params.entity]; if (!e) throw notFound()
    if (ctx.params.entity === 'currencies' && ctx.body.is_primary) await q('update currencies set is_primary = false')
    const row = await saveEntity(e, ctx.params.id, ctx.body)
    if (e.after) await afterSave(e.after, row)
    await logActivity(ctx.customer.id, `Edit.${ctx.params.entity}`, `Edited ${ctx.params.entity} #${ctx.params.id}`, ctx.params.entity, row.id)
    return row
  }))
  api.del('/admin/e/:entity/:id', A(async (ctx) => {
    const e = E[ctx.params.entity]; if (!e) throw notFound()
    await deleteEntity(e, ctx.params.id)
    await logActivity(ctx.customer.id, `Delete.${ctx.params.entity}`, `Deleted ${ctx.params.entity} #${ctx.params.id}`, ctx.params.entity, int(ctx.params.id))
    return { ok: true }
  }))
  api.post('/admin/e/:entity/bulk', A(async (ctx) => {
    const e = E[ctx.params.entity]; if (!e) throw notFound()
    const ids = (ctx.body.ids || [])
    if (ctx.body.action === 'delete') for (const id of ids) await deleteEntity(e, id)
    else if (ctx.body.action === 'set') for (const id of ids) await saveEntity(e, id, { ...ctx.body.values })
    if (e.after) for (const id of ids) { const r = await one(`select * from ${e.table} where ${e.pk || 'id'} = $1`, [id]); if (r) await afterSave(e.after, r) }
    return { ok: true, count: ids.length }
  }))
  api.post('/admin/e/:entity/clear', A(async (ctx) => {
    if (!['queued_emails', 'activity_log', 'system_log', 'search_terms'].includes(ctx.params.entity)) throw bad('Not supported')
    await q(`delete from ${E[ctx.params.entity].table}`)
    return { ok: true }
  }))

  // lookups for selects
  api.get('/admin/lookups', A(async () => {
    const [categories, manufacturers, roles, taxCategories, attributes, specOptions, products, countries] = await Promise.all([
      q('select id, name, parent_id from categories where not deleted order by display_order, name'),
      q('select id, name from manufacturers where not deleted order by name'),
      q('select id, name, system_name from customer_roles order by id'),
      q('select id, name, rate from tax_categories order by display_order'),
      q('select id, name from product_attributes order by name'),
      q('select so.id, so.name, sa.id as attribute_id, sa.name as attribute_name from spec_options so join spec_attributes sa on sa.id = so.spec_attribute_id order by sa.display_order, so.display_order'),
      q('select id, name, sku, price from products where not deleted order by name'),
      q('select id, name from countries order by display_order, name'),
    ])
    return { categories, manufacturers, roles, taxCategories, attributes, specOptions, products, countries, orderStatuses: ORDER_STATUSES, paymentStatuses: PAYMENT_STATUSES, shippingStatuses: SHIPPING_STATUSES }
  }))

  // ---- products ----
  api.get('/admin/products', A(async (ctx) => {
    const Q = ctx.query
    const params = []
    const where = ['p.deleted = false']
    if (Q.search) { params.push(`%${Q.search}%`); where.push(`(p.name ilike $${params.length} or p.sku ilike $${params.length})`) }
    if (Q.categoryId) { params.push(int(Q.categoryId)); where.push(`exists (select 1 from product_categories pc where pc.product_id = p.id and pc.category_id = $${params.length})`) }
    if (Q.manufacturerId) { params.push(int(Q.manufacturerId)); where.push(`exists (select 1 from product_manufacturers pm where pm.product_id = p.id and pm.manufacturer_id = $${params.length})`) }
    if (Q.productType) { params.push(Q.productType); where.push(`p.product_type = $${params.length}`) }
    if (Q.published === 'true' || Q.published === 'false') { params.push(Q.published === 'true'); where.push(`p.published = $${params.length}`) }
    if (Q.lowStock === 'true') where.push('p.manage_stock and p.stock_qty <= p.min_stock_qty')
    const size = Math.min(500, int(Q.size, 15))
    const page = Math.max(1, int(Q.page, 1))
    const sort = { name: 'p.name', price: 'p.price', stock: 'p.stock_qty', created: 'p.created_at desc', id: 'p.id desc' }[Q.sort] || 'p.display_order, p.id'
    const w = where.join(' and ')
    const rows = await q(`select p.id, p.name, p.slug, p.sku, p.price, p.old_price, p.stock_qty, p.manage_stock, p.published, p.product_type, p.show_on_home, p.created_at,
        (select url from product_pictures pp where pp.product_id = p.id order by display_order, id limit 1) as picture,
        (select string_agg(c.name, ', ') from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id) as categories
        from products p where ${w} order by ${sort} limit ${size} offset ${(page - 1) * size}`, params)
    const t = await one(`select count(*)::int n from products p where ${w}`, params)
    return { rows, total: t.n, page, size }
  }))
  api.get('/admin/products/:id', A(async (ctx) => productDetail(int(ctx.params.id))))
  api.post('/admin/products', A(async (ctx) => productDetail((await saveProduct(null, ctx.body, ctx.customer.id)).id)))
  api.put('/admin/products/:id', A(async (ctx) => productDetail((await saveProduct(int(ctx.params.id), ctx.body, ctx.customer.id)).id)))
  api.del('/admin/products/:id', A(async (ctx) => {
    await q('update products set deleted = true, published = false where id = $1', [int(ctx.params.id)])
    await q('delete from cart_items where product_id = $1', [int(ctx.params.id)])
    await logActivity(ctx.customer.id, 'DeleteProduct', `Deleted a product (ID = ${ctx.params.id})`, 'Product', int(ctx.params.id))
    return { ok: true }
  }))
  api.post('/admin/products/bulk', A(async (ctx) => {
    const ids = (ctx.body.ids || []).map(Number)
    if (ctx.body.action === 'delete') { await q('update products set deleted = true, published = false where id = any($1::int[])', [ids]); await q('delete from cart_items where product_id = any($1::int[])', [ids]) }
    if (ctx.body.action === 'publish') await q('update products set published = true where id = any($1::int[])', [ids])
    if (ctx.body.action === 'unpublish') await q('update products set published = false where id = any($1::int[])', [ids])
    if (ctx.body.action === 'edit') {
      for (const r of ctx.body.rows || []) await q('update products set price = $2, old_price = $3, stock_qty = $4, published = $5, updated_at = now() where id = $1', [int(r.id), num(r.price), num(r.old_price), int(r.stock_qty), bool(r.published)])
    }
    return { ok: true }
  }))
  api.post('/admin/products/:id/copy', A(async (ctx) => {
    const src = await productDetail(int(ctx.params.id))
    const copy = { ...src, name: str(ctx.body.name) || `Copy of ${src.name}`, slug: '', sku: src.sku ? `${src.sku}-COPY` : '', published: !!ctx.body.published,
      pictures: ctx.body.copyImages === false ? [] : src.pictures.map((p) => ({ url: p.url, alt: p.alt })),
      attributes: src.attributes.map((a) => ({ ...a, id: null, values: a.values.map((v) => ({ ...v, id: null })) })),
      relatedIds: src.related.map((r) => r.id), crossSellIds: src.crossSells.map((r) => r.id) }
    delete copy.id
    return productDetail((await saveProduct(null, copy, ctx.customer.id)).id)
  }))
  api.post('/admin/products/import', A(async (ctx) => {
    const rows = ctx.body.rows || []
    let created = 0, updated = 0
    for (const r of rows) {
      if (!str(r.name)) continue
      const ex = r.sku ? await one('select id from products where lower(sku) = lower($1) and not deleted', [str(r.sku)]) : null
      const data = { name: r.name, sku: r.sku, price: num(r.price), old_price: num(r.old_price), stock_qty: int(r.stock_qty, 0), short_description: r.short_description || '', published: r.published === undefined ? true : bool(r.published) }
      if (r.category) { const c = await one('select id from categories where lower(name) = lower($1) and not deleted', [str(r.category)]); if (c) data.categoryIds = [c.id] }
      await saveProduct(ex?.id || null, data, ctx.customer.id)
      ex ? updated++ : created++
    }
    return { ok: true, created, updated }
  }))
  api.get('/admin/products/:id/purchased', A(async (ctx) => {
    return q(`select o.id, o.custom_number, o.customer_email, o.order_status, o.created_at, oi.quantity, oi.price from order_items oi join orders o on o.id = oi.order_id where oi.product_id = $1 order by o.created_at desc limit 50`, [int(ctx.params.id)])
  }))

  // ---- customers ----
  api.get('/admin/customers', A(async (ctx) => {
    const Q = ctx.query
    const params = []
    const where = ['c.deleted = false']
    if (Q.guests !== 'true') where.push('c.is_guest = false')
    if (Q.email) { params.push(`%${Q.email}%`); where.push(`c.email ilike $${params.length}`) }
    if (Q.name) { params.push(`%${Q.name}%`); where.push(`(c.first_name || ' ' || c.last_name) ilike $${params.length}`) }
    if (Q.company) { params.push(`%${Q.company}%`); where.push(`c.company ilike $${params.length}`) }
    if (Q.phone) { params.push(`%${Q.phone}%`); where.push(`c.phone ilike $${params.length}`) }
    if (Q.roleId) { params.push(int(Q.roleId)); where.push(`exists (select 1 from customer_role_map m where m.customer_id = c.id and m.role_id = $${params.length})`) }
    if (Q.online === 'true') where.push("c.last_activity_at > now() - interval '20 minutes'")
    const size = Math.min(500, int(Q.size, 15))
    const page = Math.max(1, int(Q.page, 1))
    const w = where.join(' and ')
    const rows = await q(`select c.id, c.email, c.first_name, c.last_name, c.company, c.phone, c.active, c.is_guest, c.created_at, c.last_activity_at, c.last_ip, c.last_page,
      (select string_agg(r.name, ', ') from customer_role_map m join customer_roles r on r.id = m.role_id where m.customer_id = c.id) as roles,
      (select count(*)::int from orders o where o.customer_id = c.id and not o.deleted) as orders
      from customers c where ${w} order by ${Q.online === 'true' ? 'c.last_activity_at desc' : 'c.created_at desc'} limit ${size} offset ${(page - 1) * size}`, params)
    const t = await one(`select count(*)::int n from customers c where ${w}`, params)
    return { rows, total: t.n, page, size }
  }))
  api.get('/admin/customers/:id', A(async (ctx) => {
    const id = int(ctx.params.id)
    const c = await one('select * from customers where id = $1 and not deleted', [id])
    if (!c) throw notFound('Customer not found')
    delete c.password_hash
    const [roles, addresses, orders, cart, wishlist, activity, points, bis] = await Promise.all([
      q('select role_id from customer_role_map where customer_id = $1', [id]),
      q('select a.*, co.name as country, s.name as state from addresses a left join countries co on co.id = a.country_id left join states s on s.id = a.state_id where customer_id = $1 order by a.id', [id]),
      q('select id, custom_number, order_status, payment_status, shipping_status, total, created_at from orders where customer_id = $1 and not deleted order by created_at desc', [id]),
      q("select ci.*, p.name from cart_items ci join products p on p.id = ci.product_id where customer_id = $1 and cart_type = 'cart'", [id]),
      q("select ci.*, p.name from cart_items ci join products p on p.id = ci.product_id where customer_id = $1 and cart_type = 'wishlist'", [id]),
      q('select * from activity_log where customer_id = $1 order by id desc limit 50', [id]),
      q('select * from reward_points where customer_id = $1 order by id desc', [id]),
      q('select b.*, p.name from back_in_stock b join products p on p.id = b.product_id where b.customer_id = $1', [id]),
    ])
    return { ...c, roleIds: roles.map((r) => r.role_id), addresses, orders, cart, wishlist, activity, rewardPoints: points, backInStock: bis }
  }))
  const saveCustomer = async (ctx, id) => {
    const b = ctx.body
    const email = str(b.email, 200).toLowerCase()
    if (!isEmail(email)) throw bad('Valid email is required')
    if (await one(`select id from customers where lower(email) = $1 and not deleted ${id ? `and id <> ${id}` : ''}`, [email])) throw bad('Email is already registered')
    const roleIds = (b.roleIds || []).map(Number).filter(Boolean)
    if (!roleIds.length) throw bad('Add the customer to at least one role')
    const vals = [email, str(b.first_name, 100), str(b.last_name, 100), str(b.gender, 1), b.dob || null, str(b.company, 200), str(b.phone, 50), bool(b.newsletter), b.active !== false, str(b.admin_comment, 2000)]
    let row
    if (id) row = await one('update customers set email=$2, first_name=$3, last_name=$4, gender=$5, dob=$6, company=$7, phone=$8, newsletter=$9, active=$10, admin_comment=$11, is_guest=false where id=$1 returning *', [id, ...vals])
    else {
      if (!b.password) throw bad('Password is required')
      row = await one('insert into customers (email, first_name, last_name, gender, dob, company, phone, newsletter, active, admin_comment, is_guest, password_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) returning *', [...vals, hashPassword(b.password)])
    }
    if (b.password && id) await q('update customers set password_hash = $2 where id = $1', [id, hashPassword(b.password)])
    if (id === ctx.customer.id) {
      const adminRole = await one("select id from customer_roles where system_name = 'Administrators'")
      if (!roleIds.includes(adminRole.id)) throw bad('You cannot remove the Administrators role from your own account')
    }
    await q('delete from customer_role_map where customer_id = $1', [row.id])
    for (const r of roleIds) await q('insert into customer_role_map values ($1,$2) on conflict do nothing', [row.id, r])
    await logActivity(ctx.customer.id, id ? 'EditCustomer' : 'AddNewCustomer', `${id ? 'Edited' : 'Added'} customer ${email}`, 'Customer', row.id)
    return { id: row.id }
  }
  api.post('/admin/customers', A((ctx) => saveCustomer(ctx, null)))
  api.put('/admin/customers/:id', A((ctx) => saveCustomer(ctx, int(ctx.params.id))))
  api.del('/admin/customers/:id', A(async (ctx) => {
    const id = int(ctx.params.id)
    if (id === ctx.customer.id) throw bad('You cannot delete your own account')
    await q("update customers set deleted = true, email = email || '-DELETED-' || id where id = $1", [id])
    await logActivity(ctx.customer.id, 'DeleteCustomer', `Deleted customer #${id}`, 'Customer', id)
    return { ok: true }
  }))
  api.post('/admin/customers/:id/reward-points', A(async (ctx) => {
    const id = int(ctx.params.id)
    const pts = int(ctx.body.points)
    if (!pts) throw bad('Enter points')
    const bal = await one('select coalesce((select points_balance from reward_points where customer_id = $1 order by id desc limit 1),0)::int as b', [id])
    if (bal.b + pts < 0) throw bad('Not enough points')
    await q('insert into reward_points (customer_id, points, points_balance, message) values ($1,$2,$3,$4)', [id, pts, bal.b + pts, str(ctx.body.message) || 'Adjusted by administrator'])
    return { ok: true }
  }))
  api.post('/admin/customers/:id/email', A(async (ctx) => {
    const c = await one('select email from customers where id = $1', [int(ctx.params.id)])
    if (!c?.email) throw bad('Customer has no email')
    if (!str(ctx.body.subject) || !str(ctx.body.body)) throw bad('Subject and body are required')
    await queueEmail(c.email, str(ctx.body.subject, 300), str(ctx.body.body, 8000))
    return { ok: true, message: 'The email has been queued successfully.' }
  }))

  // ---- orders ----
  api.get('/admin/orders', A(async (ctx) => {
    const Q = ctx.query
    const params = []
    const where = ['o.deleted = false']
    rangeWhere(Q, 'o.created_at', params, where)
    for (const [k, col] of [['orderStatus', 'order_status'], ['paymentStatus', 'payment_status'], ['shippingStatus', 'shipping_status'], ['paymentMethod', 'payment_method']]) {
      if (Q[k]) { params.push(Q[k].split(',')); where.push(`o.${col} = any($${params.length}::text[])`) }
    }
    if (Q.email) { params.push(`%${Q.email}%`); where.push(`o.customer_email ilike $${params.length}`) }
    if (Q.lastName) { params.push(`%${Q.lastName}%`); where.push(`o.billing_address->>'lastName' ilike $${params.length}`) }
    if (Q.number) { params.push(Q.number); where.push(`o.custom_number = $${params.length}`) }
    if (Q.productId) { params.push(int(Q.productId)); where.push(`exists (select 1 from order_items i where i.order_id = o.id and i.product_id = $${params.length})`) }
    if (Q.customerId) { params.push(int(Q.customerId)); where.push(`o.customer_id = $${params.length}`) }
    const size = Math.min(500, int(Q.size, 15))
    const page = Math.max(1, int(Q.page, 1))
    const w = where.join(' and ')
    const rows = await q(`select o.id, o.custom_number, o.customer_email, o.order_status, o.payment_status, o.shipping_status, o.total, o.created_at, o.payment_method_name,
        o.billing_address->>'firstName' as first_name, o.billing_address->>'lastName' as last_name from orders o where ${w} order by o.created_at desc limit ${size} offset ${(page - 1) * size}`, params)
    const agg = await one(`select count(*)::int n, coalesce(sum(total),0)::float8 as total, coalesce(sum(tax),0)::float8 as tax, coalesce(sum(shipping_amount),0)::float8 as shipping,
       coalesce(sum(subtotal),0)::float8 as subtotal, coalesce(sum(o.total - (select coalesce(sum(p.product_cost * i.quantity),0) from order_items i join products p on p.id = i.product_id where i.order_id = o.id)),0)::float8 as profit
       from orders o where ${w}`, params)
    return { rows, total: agg.n, page, size, summary: agg }
  }))
  api.get('/admin/orders/:id', A(async (ctx) => orderDetail(int(ctx.params.id))))
  api.post('/admin/orders/:id/action', A(async (ctx) => {
    const id = int(ctx.params.id)
    const o = await one('select * from orders where id = $1', [id])
    if (!o) throw notFound()
    const b = ctx.body
    switch (b.action) {
      case 'markPaid': await markPaid(id, 'Order has been marked as paid by administrator'); break
      case 'cancel': await cancelOrder(id); break
      case 'void': await q("update orders set payment_status = 'Voided' where id = $1", [id]); await addNote(id, 'Order has been voided'); break
      case 'refund': await refundOrder(id, b.amount != null ? num(b.amount) : null); break
      case 'setStatus': {
        if (!ORDER_STATUSES.includes(b.status)) throw bad('Invalid status')
        if (b.status === 'Cancelled') await cancelOrder(id)
        else { await q('update orders set order_status = $2 where id = $1', [id, b.status]); await addNote(id, `Order status has been edited. New status: ${b.status}`) }
        break
      }
      case 'setPaymentStatus': {
        if (!PAYMENT_STATUSES.includes(b.status)) throw bad('Invalid status')
        if (b.status === 'Paid') await markPaid(id)
        else { await q('update orders set payment_status = $2 where id = $1', [id, b.status]); await addNote(id, `Payment status has been edited. New status: ${b.status}`) }
        break
      }
      case 'note': if (!str(b.note)) throw bad('Note is required'); await addNote(id, str(b.note, 4000), bool(b.displayToCustomer)); break
      case 'deleteNote': await q('delete from order_notes where id = $1 and order_id = $2', [int(b.noteId), id]); break
      case 'editTotals': {
        const f = ['subtotal', 'subtotal_discount', 'shipping_amount', 'payment_fee', 'tax', 'order_discount', 'total']
        await q(`update orders set ${f.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [id, ...f.map((k) => num(b.values?.[k], o[k]))])
        await addNote(id, 'Order totals have been edited'); break
      }
      case 'editItem': {
        const it = await one('select * from order_items where id = $1 and order_id = $2', [int(b.itemId), id])
        if (!it) throw notFound()
        if (int(b.quantity) <= 0) { await q('delete from order_items where id = $1', [it.id]); await addNote(id, `Order item "${it.product_name}" has been deleted`) }
        else {
          const qty = int(b.quantity)
          const unit = num(b.unitPrice, it.unit_price)
          await q('update order_items set quantity = $2, unit_price = $3, price = $4 where id = $1', [it.id, qty, unit, round2(unit * qty)])
          await q('update products set stock_qty = stock_qty - $2 where id = $1 and manage_stock', [it.product_id, qty - it.quantity])
          await addNote(id, `Order item "${it.product_name}" has been edited`)
        }
        if (b.recalculate !== false) {
          const sub = await one('select coalesce(sum(price),0)::float8 s from order_items where order_id = $1', [id])
          await q('update orders set subtotal = $2, total = greatest(0, $2 - subtotal_discount + shipping_amount + payment_fee + tax - order_discount - gift_card_amount - reward_points_amount) where id = $1', [id, sub.s])
        }
        break
      }
      case 'editAddress': {
        const col = b.type === 'shipping' ? 'shipping_address' : 'billing_address'
        await q(`update orders set ${col} = $2::jsonb where id = $1`, [id, b.address || {}])
        await addNote(id, `${b.type === 'shipping' ? 'Shipping' : 'Billing'} address has been edited`); break
      }
      case 'adminComment': await q('update orders set admin_comment = $2 where id = $1', [id, str(b.comment, 4000)]); break
      case 'delete': await q('update orders set deleted = true where id = $1', [id]); break
      default: throw bad('Unknown action')
    }
    await logActivity(ctx.customer.id, 'EditOrder', `Order #${id}: ${b.action}`, 'Order', id)
    return b.action === 'delete' ? { ok: true } : orderDetail(id)
  }))
  api.post('/admin/orders/bulk', A(async (ctx) => {
    const ids = (ctx.body.ids || []).map(Number)
    for (const id of ids) {
      if (ctx.body.action === 'markPaid') await markPaid(id)
      if (ctx.body.action === 'cancel') await cancelOrder(id)
      if (ctx.body.action === 'delete') await q('update orders set deleted = true where id = $1', [id])
      if (ctx.body.action === 'ship') await shipAll(id)
    }
    return { ok: true }
  }))
  async function shipAll(orderId, tracking = '') {
    const items = await q('select oi.id, oi.quantity - coalesce((select sum(si.quantity) from shipment_items si where si.order_item_id = oi.id),0)::int as remaining, oi.weight from order_items oi where order_id = $1 and not oi.is_download', [orderId])
    const lines = items.filter((i) => i.remaining > 0)
    if (!lines.length) return null
    const s = await one('insert into shipments (order_id, tracking_number, total_weight, shipped_at) values ($1,$2,$3, now()) returning *', [orderId, tracking, lines.reduce((x, i) => x + i.weight * i.remaining, 0)])
    for (const l of lines) await q('insert into shipment_items (shipment_id, order_item_id, quantity) values ($1,$2,$3)', [s.id, l.id, l.remaining])
    await refreshShipping(orderId)
    return s
  }
  async function refreshShipping(orderId) {
    const o = await one('select * from orders where id = $1', [orderId])
    if (o.shipping_status === 'ShippingNotRequired') return
    const st = await one(`select coalesce(sum(oi.quantity),0)::int as total,
        coalesce((select sum(si.quantity) from shipment_items si join shipments s on s.id = si.shipment_id where s.order_id = $1 and s.shipped_at is not null),0)::int as shipped,
        (select count(*)::int from shipments where order_id = $1) as shipments,
        (select count(*)::int from shipments where order_id = $1 and delivered_at is null) as undelivered
        from order_items oi where oi.order_id = $1 and not oi.is_download`, [orderId])
    let status = 'NotYetShipped'
    if (st.shipped > 0) status = st.shipped >= st.total ? 'Shipped' : 'PartiallyShipped'
    if (status === 'Shipped' && st.shipments > 0 && st.undelivered === 0) status = 'Delivered'
    if (status !== o.shipping_status) {
      await q('update orders set shipping_status = $2 where id = $1', [orderId, status])
      await addNote(orderId, `Shipping status changed to ${status}`)
      if (status === 'Shipped' || status === 'PartiallyShipped') {
        const s = await one('select tracking_number from shipments where order_id = $1 order by id desc limit 1', [orderId])
        await sendTemplate('ShipmentSent.CustomerNotification', o.customer_email, { ...orderTokens(o), 'Shipment.TrackingNumber': s?.tracking_number || '—' })
      }
      if (status === 'Delivered') await sendTemplate('ShipmentDelivered.CustomerNotification', o.customer_email, orderTokens(o))
    }
    await checkComplete(orderId)
  }
  api.post('/admin/orders/:id/shipments', A(async (ctx) => {
    const id = int(ctx.params.id)
    const lines = (ctx.body.items || []).filter((x) => int(x.quantity) > 0)
    if (!lines.length) { const s = await shipAll(id, str(ctx.body.trackingNumber)); if (!s) throw bad('No products selected'); return orderDetail(id) }
    const items = await q('select oi.id, oi.weight, oi.quantity - coalesce((select sum(si.quantity) from shipment_items si where si.order_item_id = oi.id),0)::int as remaining from order_items oi where order_id = $1', [id])
    let weight = 0
    for (const l of lines) {
      const it = items.find((i) => i.id === int(l.orderItemId))
      if (!it || int(l.quantity) > it.remaining) throw bad('Quantity exceeds the remaining quantity to ship')
      weight += it.weight * int(l.quantity)
    }
    const s = await one('insert into shipments (order_id, tracking_number, admin_comment, total_weight, shipped_at) values ($1,$2,$3,$4,$5) returning *', [id, str(ctx.body.trackingNumber), str(ctx.body.adminComment), weight, ctx.body.ship ? new Date().toISOString() : null])
    for (const l of lines) await q('insert into shipment_items (shipment_id, order_item_id, quantity) values ($1,$2,$3)', [s.id, int(l.orderItemId), int(l.quantity)])
    await refreshShipping(id)
    return orderDetail(id)
  }))
  api.post('/admin/shipments/:id/action', A(async (ctx) => {
    const s = await one('select * from shipments where id = $1', [int(ctx.params.id)])
    if (!s) throw notFound()
    if (ctx.body.action === 'ship') await q('update shipments set shipped_at = now() where id = $1', [s.id])
    if (ctx.body.action === 'deliver') await q('update shipments set delivered_at = now(), shipped_at = coalesce(shipped_at, now()) where id = $1', [s.id])
    if (ctx.body.action === 'tracking') await q('update shipments set tracking_number = $2 where id = $1', [s.id, str(ctx.body.trackingNumber)])
    if (ctx.body.action === 'delete') await q('delete from shipments where id = $1', [s.id])
    await refreshShipping(s.order_id)
    return { ok: true }
  }))
  api.get('/admin/shipments/:id', A(async (ctx) => {
    const s = await one('select s.*, o.custom_number, o.shipping_address, o.shipping_method from shipments s join orders o on o.id = s.order_id where s.id = $1', [int(ctx.params.id)])
    if (!s) throw notFound()
    s.items = await q('select si.quantity, oi.product_name, oi.sku, oi.attributes_desc from shipment_items si join order_items oi on oi.id = si.order_item_id where si.shipment_id = $1', [s.id])
    return s
  }))

  // ---- carts, online, campaigns ----
  api.get('/admin/carts', A(async (ctx) => {
    const type = ctx.query.type === 'wishlist' ? 'wishlist' : 'cart'
    const rows = await q(`select c.id as customer_id, coalesce(c.email, 'Guest #' || c.id) as customer, c.is_guest, sum(ci.quantity)::int as items, max(ci.updated_at) as updated_at,
        json_agg(json_build_object('name', p.name, 'quantity', ci.quantity, 'price', p.price, 'attributes', ci.attributes_desc) order by ci.id) as lines
        from cart_items ci join customers c on c.id = ci.customer_id join products p on p.id = ci.product_id where ci.cart_type = $1 group by c.id order by max(ci.updated_at) desc limit 200`, [type])
    return rows.map((r) => ({ ...r, lines: typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines }))
  }))
  api.post('/admin/campaigns/:id/send', A(async (ctx) => {
    const c = await one('select * from campaigns where id = $1', [int(ctx.params.id)])
    if (!c) throw notFound()
    const to = ctx.body.testEmail ? [{ email: str(ctx.body.testEmail) }] : await q('select email from newsletter_subscriptions where active')
    for (const r of to) await queueEmail(r.email, c.subject, c.body)
    if (!ctx.body.testEmail) await q('update campaigns set sent_count = sent_count + $2, sent_at = now() where id = $1', [c.id, to.length])
    return { ok: true, message: `${to.length} email(s) have been queued` }
  }))
  api.post('/admin/queued_emails/:id/send', A(async (ctx) => {
    await q('update queued_emails set sent_at = now(), sent_tries = sent_tries + 1 where id = $1', [int(ctx.params.id)])
    return { ok: true }
  }))
  api.post('/admin/gift_cards/generate-code', A(async () => ({ code: `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}` })))

  // ---- settings ----
  api.get('/admin/settings', A(async () => getSettings()))
  api.put('/admin/settings/:key', A(async (ctx) => {
    const key = ctx.params.key
    if (!DEFAULT_SETTINGS[key]) throw bad('Unknown settings group')
    const clean = {}
    for (const [k, def] of Object.entries(DEFAULT_SETTINGS[key])) {
      if (ctx.body[k] === undefined) continue
      const v = ctx.body[k]
      clean[k] = typeof def === 'boolean' ? bool(v) : typeof def === 'number' ? num(v, def) : Array.isArray(def) ? (Array.isArray(v) ? v.map(String) : String(v).split('\n').map((x) => x.trim()).filter(Boolean)) : String(v)
    }
    await q('insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = settings.value || excluded.value', [key, clean])
    clearSettingsCache()
    await logActivity(ctx.customer.id, 'EditSettings', `Edited ${key} settings`)
    return getSettings()
  }))

  // ---- reports ----
  api.get('/admin/reports/:name', A(async (ctx) => {
    const Q = ctx.query
    const params = []
    const where = ["o.deleted = false", "o.order_status <> 'Cancelled'"]
    rangeWhere(Q, 'o.created_at', params, where)
    if (Q.orderStatus) { params.push(Q.orderStatus); where.push(`o.order_status = $${params.length}`) }
    if (Q.paymentStatus) { params.push(Q.paymentStatus); where.push(`o.payment_status = $${params.length}`) }
    const w = where.join(' and ')
    switch (ctx.params.name) {
      case 'sales': {
        const unit = { day: 'YYYY-MM-DD', week: 'IYYY-"W"IW', month: 'YYYY-MM', year: 'YYYY' }[Q.groupBy] || 'YYYY-MM-DD'
        return q(`select to_char(o.created_at, '${unit}') as period, count(*)::int as orders, coalesce(sum(o.subtotal),0)::float8 as subtotal, coalesce(sum(o.shipping_amount),0)::float8 as shipping,
          coalesce(sum(o.tax),0)::float8 as tax, coalesce(sum(o.total),0)::float8 as total, coalesce(sum(o.subtotal_discount + o.order_discount),0)::float8 as discounts
          from orders o where ${w} group by period order by period desc`, params)
      }
      case 'low-stock': return q('select id, name, sku, stock_qty, min_stock_qty, published from products where manage_stock and stock_qty <= greatest(min_stock_qty, notify_admin_below) and not deleted order by stock_qty')
      case 'bestsellers': return q(`select oi.product_id, oi.product_name, sum(oi.quantity)::int as qty, sum(oi.price)::float8 as amount from order_items oi join orders o on o.id = oi.order_id where ${w}
          group by oi.product_id, oi.product_name order by ${Q.orderBy === 'amount' ? 'amount' : 'qty'} desc limit 100`, params)
      case 'never-purchased': return q(`select p.id, p.name, p.sku, p.price, p.created_at from products p where not p.deleted and not exists (select 1 from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.order_status <> 'Cancelled') order by p.name`)
      case 'country-sales': return q(`select coalesce(o.billing_address->>'country', 'Unknown') as country, count(*)::int as orders, coalesce(sum(o.total),0)::float8 as total from orders o where ${w} group by 1 order by total desc`, params)
      case 'customers-by-total': return q(`select c.id, c.email, c.first_name, c.last_name, count(o.id)::int as orders, coalesce(sum(o.total),0)::float8 as total from orders o join customers c on c.id = o.customer_id where ${w} group by c.id order by total desc limit 50`, params)
      case 'customers-by-orders': return q(`select c.id, c.email, c.first_name, c.last_name, count(o.id)::int as orders, coalesce(sum(o.total),0)::float8 as total from orders o join customers c on c.id = o.customer_id where ${w} group by c.id order by orders desc limit 50`, params)
      case 'registered-customers': return one(`select count(*) filter (where created_at > now() - interval '7 days')::int as week, count(*) filter (where created_at > now() - interval '14 days')::int as two_weeks,
          count(*) filter (where created_at > now() - interval '30 days')::int as month, count(*) filter (where created_at > now() - interval '365 days')::int as year from customers where not is_guest and not deleted`)
      case 'discounts': return q(`select d.id, d.name, d.coupon_code, count(u.id)::int as uses from discounts d left join discount_usage u on u.discount_id = d.id group by d.id order by uses desc`)
      default: throw notFound('Unknown report')
    }
  }))

  // ---- maintenance ----
  api.post('/admin/maintenance/:task', A(async (ctx) => {
    const t = ctx.params.task
    if (t === 'delete-guests') { const r = await q("delete from customers where is_guest and email is null and not exists (select 1 from orders o where o.customer_id = customers.id) and last_activity_at < now() - interval '1 day' returning id"); return { ok: true, message: `${r.length} guest customers deleted` } }
    if (t === 'clear-carts') { const r = await q("delete from cart_items where updated_at < now() - ($1 || ' days')::interval returning id", [String(int(ctx.body.days, 30))]); return { ok: true, message: `${r.length} cart items deleted` } }
    throw notFound()
  }))
  void tx
}

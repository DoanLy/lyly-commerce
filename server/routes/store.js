import { q, one } from '../db.js'
import {
  getSettings, productPictures, isMarkedNew, stockInfo, loadProductAttributes, loadActiveDiscounts, ensureCustomer,
  logActivity, sendTemplate, queueEmail,
} from '../core.js'
import { bad, notFound, int, num, str, isEmail, round2 } from '../util.js'

const VISIBLE = `p.published = true and p.deleted = false and p.visible_individually = true
  and (p.available_start is null or p.available_start <= now()) and (p.available_end is null or p.available_end >= now())`

// automatic (no-coupon) product level discounts for display prices
async function autoDiscountFor(rows) {
  const ds = (await loadActiveDiscounts()).filter((d) => !d.requires_coupon && ['products', 'categories', 'manufacturers'].includes(d.discount_type) && !d.min_subtotal && !d.required_role_id && d.limitation === 'unlimited')
  if (!ds.length || !rows.length) return {}
  const ids = rows.map((r) => r.id)
  const [pc, pm] = await Promise.all([
    q('select product_id, category_id from product_categories where product_id = any($1::int[])', [ids]),
    q('select product_id, manufacturer_id from product_manufacturers where product_id = any($1::int[])', [ids]),
  ])
  const out = {}
  for (const r of rows) {
    const cats = pc.filter((x) => x.product_id === r.id).map((x) => x.category_id)
    const mf = pm.filter((x) => x.product_id === r.id).map((x) => x.manufacturer_id)
    let best = 0
    for (const d of ds) {
      const hit = (d.discount_type === 'products' && d.productIds.has(r.id)) || (d.discount_type === 'categories' && cats.some((c) => d.categoryIds.has(c))) ||
        (d.discount_type === 'manufacturers' && mf.some((m) => d.manufacturerIds.has(m)))
      if (!hit) continue
      let a = d.use_percentage ? r.price * d.percentage / 100 : d.amount
      if (d.use_percentage && d.max_amount) a = Math.min(a, d.max_amount)
      best = Math.max(best, Math.min(a, r.price))
    }
    if (best > 0) out[r.id] = round2(best)
  }
  return out
}

export async function toCards(rows) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [pics, attrs, disc] = await Promise.all([
    productPictures(ids),
    q('select product_id, bool_or(is_required) as req, count(*)::int as n from product_attribute_mappings where product_id = any($1::int[]) group by product_id', [ids]),
    autoDiscountFor(rows),
  ])
  return rows.map((p) => {
    const a = attrs.find((x) => x.product_id === p.id)
    const d = disc[p.id] || 0
    return {
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, short: p.short_description, price: round2(p.price - d), basePrice: p.price,
      oldPrice: d ? p.price : p.old_price, discount: d, picture: pics[p.id]?.[0]?.url || '', pictureAlt: pics[p.id]?.[0]?.alt || '',
      rating: p.total_reviews ? round2(p.rating_sum / p.total_reviews) : 0, reviews: p.total_reviews, isNew: isMarkedNew(p),
      stock: stockInfo(p), callForPrice: p.call_for_price, disableBuy: p.disable_buy, disableWishlist: p.disable_wishlist,
      productType: p.product_type, hasAttributes: !!a?.n || p.is_gift_card || p.customer_enters_price, requiredAttributes: !!a?.req,
      isGiftCard: p.is_gift_card, isDownload: p.is_download, customerEntersPrice: p.customer_enters_price, createdAt: p.created_at,
      category: p.category_name || '',
    }
  })
}

async function categoryTree() {
  const rows = await q('select id, name, slug, parent_id, display_order, show_on_home, include_in_top_menu, picture, description from categories where published = true and deleted = false order by display_order, name')
  const counts = await q(`select pc.category_id, count(*)::int n from product_categories pc join products p on p.id = pc.product_id where ${VISIBLE} group by pc.category_id`)
  const byParent = {}
  for (const r of rows) { r.count = counts.find((c) => c.category_id === r.id)?.n || 0; (byParent[r.parent_id || 0] ||= []).push(r) }
  const build = (pid) => (byParent[pid] || []).map((c) => { const children = build(c.id); return { ...c, children, total: c.count + children.reduce((s, x) => s + x.total, 0) } })
  return build(0)
}

function descendants(tree, id) {
  const out = []
  const walk = (nodes, inside) => { for (const n of nodes) { const hit = inside || n.id === id; if (hit) out.push(n.id); walk(n.children, hit) } }
  walk(tree, false)
  return out
}
function pathTo(tree, id) {
  for (const n of tree) {
    if (n.id === id) return [n]
    const sub = pathTo(n.children, id)
    if (sub) return [n, ...sub]
  }
  return null
}

export default function storeRoutes(api) {
  api.get('/bootstrap', async (ctx) => {
    const s = await getSettings()
    const c = ctx.customer
    const [cats, topics, currencies, mfrs, cartCount, wishCount, pickup] = await Promise.all([
      categoryTree(),
      q('select system_name, title, slug, footer_column, include_in_top_menu from topics where published = true order by display_order'),
      q('select code, name, symbol, rate, is_primary from currencies where published = true order by display_order'),
      q('select id, name, slug from manufacturers where published = true and deleted = false order by display_order, name'),
      c ? one("select coalesce(sum(quantity),0)::int n from cart_items where customer_id = $1 and cart_type = 'cart'", [c.id]) : { n: 0 },
      c ? one("select count(*)::int n from cart_items where customer_id = $1 and cart_type = 'wishlist'", [c.id]) : { n: 0 },
      q('select count(*)::int n from pickup_points where active = true'),
    ])
    return {
      settings: { store: s.store, catalog: s.catalog, orders: s.orders, shipping: { ...s.shipping, pickupAvailable: pickup[0].n > 0 }, tax: s.tax, rewardPoints: s.rewardPoints, customer: s.customer, newsletter: s.newsletter, polls: s.polls, blog: s.blog, news: s.news },
      categories: cats, topics, currencies, manufacturers: mfrs,
      customer: c && !c.is_guest ? { id: c.id, email: c.email, firstName: c.first_name, lastName: c.last_name, isAdmin: c.isAdmin } : null,
      cartCount: cartCount.n, wishlistCount: wishCount.n,
    }
  })

  api.get('/home', async (ctx) => {
    const s = await getSettings()
    const [featured, homeCats, news, polls, best, text] = await Promise.all([
      q(`select p.* from products p where ${VISIBLE} and p.show_on_home = true order by p.display_order limit 8`),
      q('select id, name, slug, picture, description from categories where show_on_home = true and published = true and deleted = false order by display_order limit 6'),
      q('select id, title, slug, short, created_at from news where published = true and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now()) order by created_at desc limit $1', [s.news.onHome]),
      pollsFor(ctx, 'home'),
      q(`select p.*, sum(oi.quantity)::int as sold from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
         where o.order_status <> 'Cancelled' and o.deleted = false and ${VISIBLE} group by p.id order by sold desc limit $1`, [s.catalog.bestsellersOnHome]),
      one("select title, body from topics where system_name = 'HomepageText' and published = true"),
    ])
    return { featured: await toCards(featured), categories: homeCats, news, polls, bestsellers: await toCards(best), text }
  })

  api.get('/catalog', async (ctx) => {
    const s = await getSettings()
    const Q = ctx.query
    const where = [VISIBLE]
    const params = []
    const p = (v) => { params.push(v); return `$${params.length}` }
    let context = {}
    const tree = await categoryTree()
    if (Q.category) {
      const cat = await one('select * from categories where slug = $1 and deleted = false and published = true', [Q.category])
      if (!cat) throw notFound('Category not found')
      const ids = s.catalog.showProductsFromSubcategories ? descendants(tree, cat.id) : [cat.id]
      where.push(`exists (select 1 from product_categories pc where pc.product_id = p.id and pc.category_id = any(${p(ids)}::int[]))`)
      const node = (function find(nodes) { for (const n of nodes) { if (n.id === cat.id) return n; const f = find(n.children); if (f) return f } })(tree)
      context = { type: 'category', category: { ...cat, children: node?.children || [] }, breadcrumb: (pathTo(tree, cat.id) || []).map((c) => ({ name: c.name, slug: c.slug })) }
    }
    if (Q.manufacturer) {
      const m = await one('select * from manufacturers where slug = $1 and deleted = false and published = true', [Q.manufacturer])
      if (!m) throw notFound('Manufacturer not found')
      where.push(`exists (select 1 from product_manufacturers pm where pm.product_id = p.id and pm.manufacturer_id = ${p(m.id)})`)
      context = { type: 'manufacturer', manufacturer: m }
    }
    if (Q.tag) {
      const t = await one('select * from product_tags where lower(name) = lower($1)', [Q.tag])
      if (!t) throw notFound('Tag not found')
      where.push(`exists (select 1 from product_tag_map tm where tm.product_id = p.id and tm.tag_id = ${p(t.id)})`)
      context = { type: 'tag', tag: t }
    }
    if (Q.q != null) {
      const term = str(Q.q, 100)
      context = { type: 'search', term }
      if (term.length < s.catalog.searchMinLength) return { products: [], total: 0, context, warning: `Search term minimum length is ${s.catalog.searchMinLength} characters`, filters: {} }
      const like = p(`%${term}%`)
      const inDesc = Q.adv && Q.sid === 'true'
      where.push(`(p.name ilike ${like} or p.sku ilike ${like}${inDesc ? ` or p.short_description ilike ${like} or p.full_description ilike ${like}` : ''}
        or exists (select 1 from product_tag_map tm join product_tags t on t.id = tm.tag_id where tm.product_id = p.id and t.name ilike ${like}))`)
      if (Q.adv && Q.cid) {
        const cid = int(Q.cid)
        const ids = Q.isc === 'true' ? descendants(tree, cid) : [cid]
        where.push(`exists (select 1 from product_categories pc where pc.product_id = p.id and pc.category_id = any(${p(ids)}::int[]))`)
      }
      if (Q.adv && Q.mid) where.push(`exists (select 1 from product_manufacturers pm where pm.product_id = p.id and pm.manufacturer_id = ${p(int(Q.mid))})`)
      if (!Q.page || Q.page === '1') {
        q('insert into search_terms (term, count) values (lower($1), 1) on conflict (term) do update set count = search_terms.count + 1, updated_at = now()', [term]).catch(() => {})
      }
    }
    if (Q.new === 'true') {
      where.push('p.mark_as_new = true and (p.mark_new_start is null or p.mark_new_start <= now()) and (p.mark_new_end is null or p.mark_new_end >= now())')
      context = { type: 'new' }
    }
    // facets computed before price/spec/mfr filters
    const baseWhere = where.join(' and ')
    const baseParams = [...params]
    const [range, specRows, mfrRows] = await Promise.all([
      one(`select min(price) as min, max(price) as max from products p where ${baseWhere}`, baseParams),
      q(`select sa.id as attr_id, sa.name as attr, so.id, so.name, so.color_rgb, count(distinct p.id)::int as n
          from products p join product_spec_map sm on sm.product_id = p.id and sm.allow_filtering
          join spec_options so on so.id = sm.option_id join spec_attributes sa on sa.id = so.spec_attribute_id
          where ${baseWhere} group by sa.id, sa.name, so.id, so.name, so.color_rgb, sa.display_order, so.display_order order by sa.display_order, so.display_order`, baseParams),
      context.type === 'manufacturer' ? [] : q(`select m.id, m.name, count(distinct p.id)::int as n from products p join product_manufacturers pm on pm.product_id = p.id
          join manufacturers m on m.id = pm.manufacturer_id where ${baseWhere} group by m.id, m.name order by m.name`, baseParams),
    ])
    const pf = Q.pf ?? (Q.adv ? Q.pfrom : undefined)
    const pt = Q.pt ?? (Q.adv ? Q.pto : undefined)
    if (pf !== undefined && pf !== '') where.push(`p.price >= ${p(num(pf))}`)
    if (pt !== undefined && pt !== '') where.push(`p.price <= ${p(num(pt))}`)
    if (Q.specs) {
      const ids = Q.specs.split(',').map(Number).filter(Boolean)
      const byAttr = {}
      for (const id of ids) { const r = specRows.find((x) => x.id === id); if (r) (byAttr[r.attr_id] ||= []).push(id) }
      for (const group of Object.values(byAttr)) where.push(`exists (select 1 from product_spec_map sm where sm.product_id = p.id and sm.option_id = any(${p(group)}::int[]))`)
    }
    if (Q.mfrs) {
      const ids = Q.mfrs.split(',').map(Number).filter(Boolean)
      if (ids.length) where.push(`exists (select 1 from product_manufacturers pm where pm.product_id = p.id and pm.manufacturer_id = any(${p(ids)}::int[]))`)
    }
    const order = { name_asc: 'p.name asc', name_desc: 'p.name desc', price_asc: 'p.price asc', price_desc: 'p.price desc', created: 'p.created_at desc' }[Q.sort] || 'p.display_order, p.id'
    const size = Math.min(60, Math.max(1, int(Q.size, context.category?.page_size || 6)))
    const page = Math.max(1, int(Q.page, 1))
    const w = where.join(' and ')
    const [rows, total] = await Promise.all([
      q(`select p.* from products p where ${w} order by ${order} limit ${size} offset ${(page - 1) * size}`, params),
      one(`select count(*)::int n from products p where ${w}`, params),
    ])
    const specs = {}
    for (const r of specRows) (specs[r.attr_id] ||= { id: r.attr_id, name: r.attr, options: [] }).options.push({ id: r.id, name: r.name, color: r.color_rgb, count: r.n })
    let featured = []
    if (context.type === 'category' && page === 1) {
      featured = await toCards(await q(`select p.* from products p join product_categories pc on pc.product_id = p.id where pc.category_id = $1 and pc.is_featured and ${VISIBLE}`, [context.category.id]))
    }
    return {
      products: await toCards(rows), total: total.n, page, size, pages: Math.ceil(total.n / size), context, featured,
      filters: { price: { min: range?.min || 0, max: range?.max || 0 }, specs: Object.values(specs), manufacturers: mfrRows },
      pageSizeOptions: (context.category?.page_size_options || '6, 3, 9, 18').split(',').map((x) => int(x)).filter(Boolean),
    }
  })

  api.get('/search/suggest', async (ctx) => {
    const term = str(ctx.query.q, 60)
    if (term.length < 2) return []
    const rows = await q(`select p.* from products p where ${VISIBLE} and (p.name ilike $1 or p.sku ilike $1) order by p.name limit 8`, [`%${term}%`])
    return toCards(rows)
  })

  api.get('/products-by-ids', async (ctx) => {
    const ids = String(ctx.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 20)
    if (!ids.length) return []
    const rows = await q('select p.* from products p where p.id = any($1::int[]) and p.published and not p.deleted', [ids])
    const cards = await toCards(rows)
    if (ctx.query.full) {
      const specs = await q(`select sm.product_id, sa.name as attr, coalesce(nullif(sm.custom_value,''), so.name) as value from product_spec_map sm
        join spec_options so on so.id = sm.option_id join spec_attributes sa on sa.id = so.spec_attribute_id where sm.product_id = any($1::int[]) and sm.show_on_product_page order by sa.display_order`, [ids])
      const mfr = await q('select pm.product_id, m.name from product_manufacturers pm join manufacturers m on m.id = pm.manufacturer_id where pm.product_id = any($1::int[])', [ids])
      for (const c of cards) {
        c.specs = specs.filter((x) => x.product_id === c.id)
        c.manufacturer = mfr.filter((x) => x.product_id === c.id).map((x) => x.name).join(', ')
        c.weight = rows.find((r) => r.id === c.id)?.weight
      }
    }
    return ids.map((id) => cards.find((c) => c.id === id)).filter(Boolean)
  })

  api.get('/products/:slug', async (ctx) => {
    const s = await getSettings()
    const p = await one('select * from products p where (p.slug = $1 or p.id::text = $1) and p.deleted = false', [ctx.params.slug])
    if (!p || (!p.published && !ctx.customer?.isAdmin)) throw notFound('Product not found')
    const id = p.id
    const tree = await categoryTree()
    const [pics, cats, mfrs, tags, specs, attrMap, tiers, reviews, related, also, children, crossRows] = await Promise.all([
      q('select id, url, alt from product_pictures where product_id = $1 order by display_order, id', [id]),
      q('select c.id, c.name, c.slug from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = $1 order by pc.display_order', [id]),
      q('select m.id, m.name, m.slug from product_manufacturers pm join manufacturers m on m.id = pm.manufacturer_id where pm.product_id = $1', [id]),
      q('select t.id, t.name, (select count(*)::int from product_tag_map x where x.tag_id = t.id) as n from product_tag_map tm join product_tags t on t.id = tm.tag_id where tm.product_id = $1 order by t.name', [id]),
      q(`select sa.name as attr, coalesce(nullif(sm.custom_value,''), so.name) as value, so.color_rgb from product_spec_map sm join spec_options so on so.id = sm.option_id
          join spec_attributes sa on sa.id = so.spec_attribute_id where sm.product_id = $1 and sm.show_on_product_page order by sm.display_order, sa.display_order`, [id]),
      loadProductAttributes([id]),
      q('select quantity, price from tier_prices where product_id = $1 and role_id is null and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now()) order by quantity', [id]),
      q(`select r.id, r.title, r.body, r.rating, r.reply_text, r.helpful_yes, r.helpful_no, r.created_at, coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), 'Guest') as author
          from product_reviews r left join customers c on c.id = r.customer_id where r.product_id = $1 and r.approved order by r.created_at desc`, [id]),
      q(`select p.* from related_products r join products p on p.id = r.related_id where r.product_id = $1 and ${VISIBLE} order by r.display_order`, [id]),
      s.catalog.alsoPurchasedEnabled ? q(`select p.*, count(*) as n from order_items a join order_items b on a.order_id = b.order_id and b.product_id <> a.product_id
          join products p on p.id = b.product_id where a.product_id = $1 and ${VISIBLE} group by p.id order by n desc limit $2`, [id, s.catalog.alsoPurchasedCount]) : [],
      p.product_type === 'grouped' ? q(`select p.* from products p where p.parent_grouped_id = $1 and p.published and not p.deleted order by p.display_order`, [id]) : [],
      q('select cross_id from cross_sell_products where product_id = $1', [id]),
    ])
    const c = ctx.customer
    const [inWish, bis, myReview] = c ? await Promise.all([
      one("select id from cart_items where customer_id = $1 and product_id = $2 and cart_type = 'wishlist' limit 1", [c.id, id]),
      one('select id from back_in_stock where customer_id = $1 and product_id = $2', [c.id, id]),
      one('select id from product_reviews where customer_id = $1 and product_id = $2', [c.id, id]),
    ]) : [null, null, null]
    const [card] = await toCards([p])
    const childCards = await toCards(children)
    const childAttrs = children.length ? await loadProductAttributes(children.map((x) => x.id)) : {}
    void crossRows
    return {
      ...card,
      fullDescription: p.full_description, gtin: p.gtin, mpn: p.mpn, weight: p.weight, dimensions: [p.length, p.width, p.height],
      pictures: pics, categories: cats, manufacturers: mfrs, tags, specs, tierPrices: tiers,
      attributes: (attrMap[id] || []).map(cleanMapping),
      breadcrumb: cats[0] ? (pathTo(tree, cats[0].id) || []).map((x) => ({ name: x.name, slug: x.slug })) : [],
      reviewList: reviews, allowReviews: p.allow_reviews, alreadyReviewed: !!myReview,
      related: await toCards(related), alsoPurchased: await toCards(also),
      associated: childCards.map((x) => ({ ...x, attributes: (childAttrs[x.id] || []).map(cleanMapping) })),
      minQty: p.order_min_qty, maxQty: p.order_max_qty, allowedQuantities: p.allowed_quantities ? p.allowed_quantities.split(',').map((x) => int(x)).filter(Boolean) : [],
      minCustomerPrice: p.min_customer_price, maxCustomerPrice: p.max_customer_price, giftCardType: p.gift_card_type,
      isShippingEnabled: p.is_shipping_enabled, isFreeShipping: p.is_free_shipping, hasSample: p.has_sample,
      inWishlist: !!inWish, backInStockSubscribed: !!bis, allowBackInStock: p.allow_back_in_stock && p.manage_stock && p.stock_qty <= 0 && p.backorders === 'none',
      availableForPreorder: p.available_for_preorder,
    }
  })

  api.post('/products/:id/reviews', async (ctx) => {
    const s = await getSettings()
    const p = await one('select * from products where id = $1 and deleted = false', [int(ctx.params.id)])
    if (!p || !p.allow_reviews) throw notFound()
    const c = ctx.customer
    if ((!c || c.is_guest) && !s.catalog.allowAnonymousReviews) throw bad('Only registered customers can write reviews')
    const title = str(ctx.body.title, 200)
    const body = str(ctx.body.text, 4000)
    const rating = Math.min(5, Math.max(1, int(ctx.body.rating, 5)))
    if (!title) throw bad('Review title is required')
    if (!body) throw bad('Review text is required')
    if (c && await one('select id from product_reviews where product_id = $1 and customer_id = $2', [p.id, c.id])) throw bad('You have already reviewed this product')
    const approved = !s.catalog.reviewsMustBeApproved
    await q('insert into product_reviews (product_id, customer_id, title, body, rating, approved) values ($1,$2,$3,$4,$5,$6)', [p.id, c?.id || null, title, body, rating, approved])
    await q('update products set rating_sum = (select coalesce(sum(rating),0) from product_reviews where product_id = $1 and approved), total_reviews = (select count(*) from product_reviews where product_id = $1 and approved) where id = $1', [p.id])
    await sendTemplate('Product.ProductReview', s.store.email, { 'ProductReview.ProductName': p.name })
    await logActivity(c?.id, 'PublicStore.AddProductReview', `Added a product review ('${p.name}')`, 'Product', p.id, ctx.req.ip)
    return { ok: true, message: approved ? 'Product review is successfully added.' : 'You will see the product review after approving by a store administrator.' }
  })

  api.post('/reviews/:id/helpful', async (ctx) => {
    const c = ctx.customer
    if (!c || c.is_guest) throw bad('Only registered customers can set review helpfulness')
    const r = await one('select * from product_reviews where id = $1', [int(ctx.params.id)])
    if (!r) throw notFound()
    if (r.customer_id === c.id) throw bad('You cannot vote for your own review')
    const yes = !!ctx.body.helpful
    await q('insert into review_helpfulness values ($1,$2,$3) on conflict (review_id, customer_id) do update set was_helpful = excluded.was_helpful', [r.id, c.id, yes])
    const t = await one('update product_reviews set helpful_yes = (select count(*) from review_helpfulness where review_id = $1 and was_helpful), helpful_no = (select count(*) from review_helpfulness where review_id = $1 and not was_helpful) where id = $1 returning helpful_yes, helpful_no', [r.id])
    return { ok: true, yes: t.helpful_yes, no: t.helpful_no, message: 'Successfully voted' }
  })

  api.post('/products/:id/email-friend', async (ctx) => {
    const s = await getSettings()
    const c = ctx.customer
    if ((!c || c.is_guest) && !s.catalog.allowAnonymousEmailAFriend) throw bad('Only registered customers can use email a friend feature')
    const p = await one('select * from products where id = $1', [int(ctx.params.id)])
    if (!p) throw notFound()
    const friend = str(ctx.body.friendEmail, 200)
    const mine = str(ctx.body.yourEmail, 200) || c?.email
    if (!isEmail(friend)) throw bad("Enter friend's email")
    if (!isEmail(mine)) throw bad('Enter your email')
    await sendTemplate('Service.EmailAFriend', friend, { 'EmailAFriend.Email': mine, 'EmailAFriend.PersonalMessage': str(ctx.body.message, 1000), 'Product.Name': p.name, 'Product.ProductURLForCustomer': `${s.store.url}/product/${p.slug}` })
    return { ok: true, message: 'Your message has been sent.' }
  })

  api.post('/products/:id/back-in-stock', async (ctx) => {
    const c = ctx.customer
    if (!c || c.is_guest) throw bad('Please log in to subscribe')
    const pid = int(ctx.params.id)
    const ex = await one('select id from back_in_stock where customer_id = $1 and product_id = $2', [c.id, pid])
    if (ex) { await q('delete from back_in_stock where id = $1', [ex.id]); return { subscribed: false, message: 'You will no longer receive a notification for this product.' } }
    await q('insert into back_in_stock (customer_id, product_id) values ($1,$2)', [c.id, pid])
    return { subscribed: true, message: 'You will receive a one time e-mail when this product is available for ordering again.' }
  })

  api.get('/manufacturers', async () => {
    return q(`select m.id, m.name, m.slug, m.description, m.picture, (select count(*)::int from product_manufacturers pm join products p on p.id = pm.product_id where pm.manufacturer_id = m.id and ${VISIBLE}) as n
      from manufacturers m where m.published and not m.deleted order by m.display_order, m.name`)
  })
  api.get('/tags', async () => {
    return q(`select t.id, t.name, count(p.id)::int as n from product_tags t join product_tag_map tm on tm.tag_id = t.id join products p on p.id = tm.product_id where ${VISIBLE} group by t.id order by t.name`)
  })

  api.get('/topics/:slug', async (ctx) => {
    const t = await one('select title, body, system_name, slug from topics where (slug = $1 or lower(system_name) = lower($1)) and published', [ctx.params.slug])
    if (!t) throw notFound('Page not found')
    return t
  })

  // news
  api.get('/news', async (ctx) => {
    const s = await getSettings()
    const size = s.news.pageSize
    const page = Math.max(1, int(ctx.query.page, 1))
    const rows = await q(`select id, title, slug, short, created_at, (select count(*)::int from news_comments c where c.news_id = n.id and c.approved) as comments from news n where published
      and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now()) order by created_at desc limit ${size} offset ${(page - 1) * size}`)
    const t = await one('select count(*)::int n from news where published')
    return { items: rows, page, pages: Math.ceil(t.n / size) }
  })
  api.get('/news/:slug', async (ctx) => {
    const n = await one('select * from news where slug = $1 and published', [ctx.params.slug])
    if (!n) throw notFound()
    n.comments = await q(`select nc.id, nc.title, nc.body, nc.created_at, coalesce(nullif(trim(c.first_name||' '||c.last_name),''),'Guest') as author from news_comments nc left join customers c on c.id = nc.customer_id where nc.news_id = $1 and nc.approved order by nc.created_at`, [n.id])
    return n
  })
  api.post('/news/:id/comments', async (ctx) => {
    const s = await getSettings()
    const c = ctx.customer
    if (!c || c.is_guest) throw bad('Only registered users can leave comments.')
    const title = str(ctx.body.title, 200)
    const body = str(ctx.body.text, 2000)
    if (!title) throw bad('Title is required')
    if (!body) throw bad('Comment is required')
    const n = await one('select * from news where id = $1 and allow_comments', [int(ctx.params.id)])
    if (!n) throw notFound()
    await q('insert into news_comments (news_id, customer_id, title, body, approved) values ($1,$2,$3,$4,$5)', [n.id, c.id, title, body, !s.news.commentsMustBeApproved])
    return { ok: true, message: s.news.commentsMustBeApproved ? 'News comment is successfully added. You will see it after approving by a store administrator.' : 'News comment is successfully added.' }
  })

  // blog
  api.get('/blog', async (ctx) => {
    const s = await getSettings()
    const where = ['published']
    const params = []
    if (ctx.query.tag) { params.push(`%${ctx.query.tag.toLowerCase()}%`); where.push(`lower(tags) like $${params.length}`) }
    if (ctx.query.month) { params.push(ctx.query.month); where.push(`to_char(created_at, 'YYYY-MM') = $${params.length}`) }
    const size = s.blog.postsPageSize
    const page = Math.max(1, int(ctx.query.page, 1))
    const rows = await q(`select id, title, slug, overview, tags, created_at, (select count(*)::int from blog_comments c where c.post_id = b.id and c.approved) as comments from blog_posts b where ${where.join(' and ')} order by created_at desc limit ${size} offset ${(page - 1) * size}`, params)
    const t = await one(`select count(*)::int n from blog_posts where ${where.join(' and ')}`, params)
    const all = await q('select tags, created_at from blog_posts where published')
    const tagCount = {}
    const months = {}
    for (const r of all) {
      for (const t of String(r.tags || '').split(',').map((x) => x.trim()).filter(Boolean)) tagCount[t] = (tagCount[t] || 0) + 1
      const m = new Date(r.created_at).toISOString().slice(0, 7)
      months[m] = (months[m] || 0) + 1
    }
    return { items: rows, page, pages: Math.ceil(t.n / size), tags: tagCount, months }
  })
  api.get('/blog/:slug', async (ctx) => {
    const b = await one('select * from blog_posts where slug = $1 and published', [ctx.params.slug])
    if (!b) throw notFound()
    b.comments = await q(`select bc.id, bc.body, bc.created_at, coalesce(nullif(trim(c.first_name||' '||c.last_name),''),'Guest') as author from blog_comments bc left join customers c on c.id = bc.customer_id where bc.post_id = $1 and bc.approved order by bc.created_at`, [b.id])
    return b
  })
  api.post('/blog/:id/comments', async (ctx) => {
    const s = await getSettings()
    const c = ctx.customer
    if (!c || c.is_guest) throw bad('Only registered users can leave comments.')
    const body = str(ctx.body.text, 2000)
    if (!body) throw bad('Comment is required')
    const b = await one('select * from blog_posts where id = $1 and allow_comments', [int(ctx.params.id)])
    if (!b) throw notFound()
    await q('insert into blog_comments (post_id, customer_id, body, approved) values ($1,$2,$3,$4)', [b.id, c.id, body, !s.blog.commentsMustBeApproved])
    return { ok: true, message: 'Blog comment is successfully added.' }
  })

  // polls
  api.post('/polls/:id/vote', async (ctx) => {
    const poll = await one('select * from polls where id = $1 and published', [int(ctx.params.id)])
    if (!poll) throw notFound()
    if (!poll.allow_guests && (!ctx.customer || ctx.customer.is_guest)) throw bad('Only registered users can vote.')
    const c = await ensureCustomer(ctx)
    const answer = await one('select * from poll_answers where id = $1 and poll_id = $2', [int(ctx.body.answerId), poll.id])
    if (!answer) throw bad('Please select an answer')
    const voted = await one('select 1 from poll_votes v join poll_answers a on a.id = v.answer_id where a.poll_id = $1 and v.customer_id = $2', [poll.id, c.id])
    if (voted) throw bad('You have already voted for this poll')
    await q('insert into poll_votes (answer_id, customer_id) values ($1,$2)', [answer.id, c.id])
    await q('update poll_answers set votes = votes + 1 where id = $1', [answer.id])
    return (await pollsFor(ctx, poll.id))[0]
  })

  api.post('/contact', async (ctx) => {
    const s = await getSettings()
    const name = str(ctx.body.fullName, 200)
    const email = str(ctx.body.email, 200)
    const enquiry = str(ctx.body.enquiry, 4000)
    if (!name) throw bad('Enter your name')
    if (!isEmail(email)) throw bad('Wrong email')
    if (!enquiry) throw bad('Enter enquiry')
    await sendTemplate('Service.ContactUs', s.store.email, { 'ContactUs.SenderName': name, 'ContactUs.SenderEmail': email, 'ContactUs.Body': enquiry, __subject: str(ctx.body.subject) })
    await logActivity(ctx.customer?.id, 'PublicStore.ContactUs', 'Used contact us form', '', null, ctx.req.ip)
    return { ok: true, message: 'Your enquiry has been successfully sent to the store owner.' }
  })

  api.post('/newsletter', async (ctx) => {
    const email = str(ctx.body.email, 200).toLowerCase()
    if (!isEmail(email)) throw bad('Wrong email')
    if (ctx.body.subscribe === false) {
      await q('update newsletter_subscriptions set active = false where email = $1', [email])
      return { ok: true, message: 'You have been unsubscribed.' }
    }
    const ex = await one('select * from newsletter_subscriptions where email = $1', [email])
    if (ex?.active) return { ok: true, message: 'You are already subscribed.' }
    if (ex) await q('update newsletter_subscriptions set active = true where id = $1', [ex.id])
    else await q('insert into newsletter_subscriptions (email) values ($1)', [email])
    await sendTemplate('NewsLetterSubscription.ActivationMessage', email, { 'NewsLetterSubscription.DeactivationUrl': '/newsletter/unsubscribe' })
    return { ok: true, message: 'Thank you for signing up! You are now subscribed to our newsletter.' }
  })

  api.get('/sample-download/:file', async (ctx) => {
    const name = String(ctx.params.file).replace(/[^a-z0-9.-]/gi, '')
    return { __raw: true, type: 'text/plain; charset=utf-8', filename: name, body: `LyLy Commerce demo download\nFile: ${name}\nGenerated: ${new Date().toISOString()}\n` }
  })

  api.get('/sitemap', async () => {
    const [cats, mfrs, prods, topics] = await Promise.all([
      categoryTree(),
      q('select name, slug from manufacturers where published and not deleted order by name'),
      q(`select name, slug from products p where ${VISIBLE} order by name`),
      q('select title, slug from topics where published order by display_order'),
    ])
    return { categories: cats, manufacturers: mfrs, products: prods, topics }
  })

  void queueEmail
}

export async function pollsFor(ctx, which) {
  const s = await getSettings()
  if (!s.polls.enabled) return []
  const polls = which === 'home'
    ? await q('select * from polls where published and show_on_home and (start_at is null or start_at <= now()) and (end_at is null or end_at >= now()) order by display_order')
    : await q('select * from polls where id = $1', [which])
  const out = []
  for (const p of polls) {
    const answers = await q('select id, name, votes from poll_answers where poll_id = $1 order by display_order', [p.id])
    const voted = ctx.customer ? await one('select 1 from poll_votes v join poll_answers a on a.id = v.answer_id where a.poll_id = $1 and v.customer_id = $2', [p.id, ctx.customer.id]) : null
    const total = answers.reduce((x, a) => x + a.votes, 0)
    out.push({ id: p.id, name: p.name, allowGuests: p.allow_guests, voted: !!voted, total, answers })
  }
  return out
}

export function cleanMapping(m) {
  return {
    id: m.id, name: m.attribute_name, prompt: m.text_prompt || m.attribute_name, required: m.is_required, control: m.control_type,
    values: m.values.map((v) => ({ id: v.id, name: v.name, color: v.color_rgb, priceAdjustment: v.price_adjustment, percent: v.price_adjustment_percent, preselected: v.is_preselected })),
  }
}

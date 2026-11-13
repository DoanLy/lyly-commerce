// Adds the demo photos from server/product-images.js to products that have no picture yet.
// Usage: DOTENV_CONFIG_PATH=.env.production.local node scripts/apply-product-images.mjs
import 'dotenv/config'
import { q, db } from '../server/db.js'
import { ensureSchema } from '../server/migrate.js'
import IMAGES from '../server/product-images.js'

await ensureSchema()
let added = 0
for (const [slug, url] of Object.entries(IMAGES)) {
  const r = await q(`insert into nop.product_pictures (product_id, url, alt, display_order)
    select p.id, $2, p.name, 0 from nop.products p
    where p.slug = $1 and not exists (select 1 from nop.product_pictures pp where pp.product_id = p.id) returning id`, [slug, url])
  added += r.length
}
console.log(`added ${added} picture(s)`)
await (await db()).end()

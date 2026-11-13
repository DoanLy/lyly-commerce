// Creates the nop schema + demo data in the database from DATABASE_URL (idempotent).
// Usage: DOTENV_CONFIG_PATH=.env.production.local node scripts/migrate.mjs
import 'dotenv/config'
import { ensureSchema } from '../server/migrate.js'
import { one, db } from '../server/db.js'
const t0 = Date.now()
await ensureSchema()
const r = await one('select (select count(*)::int from nop.products) as products, (select count(*)::int from nop.orders) as orders, (select count(*)::int from nop.customers) as customers')
console.log('done in', Date.now() - t0, 'ms', r)
await (await db()).end()

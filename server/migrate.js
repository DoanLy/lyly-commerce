import { one, exec, q } from './db.js'
import schema from './schema.js'
import { seed } from './seed.js'

const SCHEMA_VERSION = 1
let ready = null

export function ensureSchema() {
  if (!ready) ready = run().catch((e) => { ready = null; throw e })
  return ready
}

async function run() {
  const t = await one("select to_regclass('nop.settings') as t")
  let version = 0
  if (t?.t) {
    const v = await one("select value from nop.settings where key = '__schema'")
    version = v?.value?.version || 0
  }
  if (version >= SCHEMA_VERSION) return
  await exec(schema)
  const hasData = await one('select count(*)::int as n from nop.products')
  if (!hasData.n) await seed()
  await q("insert into nop.settings (key, value) values ('__schema', $1::jsonb) on conflict (key) do update set value = excluded.value", [{ version: SCHEMA_VERSION, at: new Date().toISOString() }])
}

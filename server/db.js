// Database adapter.
// - DATABASE_URL set  -> real Postgres (Supabase pooler) via `postgres`
// - otherwise         -> embedded PGlite in ./.pglite (local development only)
// Every query goes through q(text, params) and returns an array of rows.
// All tables live in the `nop` schema so they never touch lyly-storefront's `public` tables.

let impl = null

async function init() {
  if (impl) return impl
  const url = process.env.DATABASE_URL
  if (url) {
    const { default: postgres } = await import('postgres')
    const sql = postgres(url, {
      ssl: url.includes('localhost') ? false : 'require',
      max: Number(process.env.DB_POOL_MAX || 3),
      idle_timeout: 20,
      prepare: false, // required by the Supabase transaction pooler
      connection: { search_path: 'nop,public' },
      onnotice: () => {},
    })
    const run = (s) => async (text, params = []) => [...(await s.unsafe(text, params.map(norm)))]
    impl = {
      kind: 'postgres',
      q: run(sql),
      tx: (fn) => sql.begin((t) => fn(run(t))),
      exec: (text) => sql.unsafe(text),
      end: () => sql.end(),
    }
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const dir = process.env.PGLITE_DIR || './.pglite'
    const db = new PGlite(dir)
    await db.waitReady
    await db.exec('create schema if not exists nop; set search_path to nop,public;')
    const run = (d) => async (text, params = []) => (await d.query(text, params.map(norm))).rows
    let chain = Promise.resolve()
    impl = {
      kind: 'pglite',
      q: run(db),
      // PGlite is single-connection: serialise transactions
      tx: (fn) => {
        const p = chain.then(() => db.transaction((t) => fn(run(t))))
        chain = p.catch(() => {})
        return p
      },
      exec: (text) => db.exec(text),
      end: () => db.close(),
    }
  }
  return impl
}

function norm(v) {
  if (v === undefined) return null
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v)
  return v
}

export async function db() { return init() }
export async function q(text, params) { return (await init()).q(text, params) }
export async function one(text, params) { return (await q(text, params))[0] || null }
export async function tx(fn) { return (await init()).tx(fn) }
export async function exec(text) { return (await init()).exec(text) }

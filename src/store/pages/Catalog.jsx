import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useStore, useAsync, Loading, Breadcrumb, Pager, PageTitle, Notice, useDocumentTitle, useMoney } from '../ui.jsx'
import { ProductGrid } from '../layout.jsx'

function flatten(tree, depth = 0, out = []) {
  for (const n of tree) { out.push({ ...n, depth }); flatten(n.children, depth + 1, out) }
  return out
}

function Filters({ data, params, set, onClose }) {
  const money = useMoney()
  const f = data.filters
  const specs = (params.get('specs') || '').split(',').filter(Boolean).map(Number)
  const mfrs = (params.get('mfrs') || '').split(',').filter(Boolean).map(Number)
  const [pf, setPf] = useState(params.get('pf') || '')
  const [pt, setPt] = useState(params.get('pt') || '')
  const toggle = (key, list, id) => set({ [key]: (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]).join(',') || null, page: null })
  const sub = data.context?.category?.children || []
  return (
    <aside className="filters" id="catalog-filters">
      <div className="filters-head mobile-only"><b>Filters</b><button className="icon-button" onClick={onClose} aria-label="Close filters" id="catalog-filters-close"><X /></button></div>
      {sub.length > 0 && (
        <div className="filter-block" id="catalog-subcategories">
          <h4>Sub-categories</h4>
          {sub.map((s) => <Link key={s.id} to={`/category/${s.slug}`} id={`catalog-subcategory-${s.slug}`}>{s.name} <small>({s.total})</small></Link>)}
        </div>
      )}
      {f.price.max > 0 && (
        <div className="filter-block" id="catalog-price-filter">
          <h4>Filter by price</h4>
          <p className="muted">{money(f.price.min)} – {money(f.price.max)}</p>
          <div className="price-inputs">
            <label htmlFor="catalog-price-from" className="sr-only">From</label>
            <input id="catalog-price-from" type="number" min="0" placeholder="From" value={pf} onChange={(e) => setPf(e.target.value)} />
            <span>–</span>
            <label htmlFor="catalog-price-to" className="sr-only">To</label>
            <input id="catalog-price-to" type="number" min="0" placeholder="To" value={pt} onChange={(e) => setPt(e.target.value)} />
          </div>
          <div className="row-gap">
            <button className="ghost-button small" id="catalog-price-apply" onClick={() => set({ pf: pf || null, pt: pt || null, page: null })}>Apply</button>
            {(params.get('pf') || params.get('pt')) && <button className="text-link" id="catalog-price-clear" onClick={() => { setPf(''); setPt(''); set({ pf: null, pt: null, page: null }) }}>Clear</button>}
          </div>
        </div>
      )}
      {f.manufacturers?.length > 0 && (
        <div className="filter-block" id="catalog-manufacturer-filter">
          <h4>Manufacturer</h4>
          {f.manufacturers.map((m) => (
            <label key={m.id} className="check" htmlFor={`catalog-mfr-${m.id}`}>
              <input type="checkbox" id={`catalog-mfr-${m.id}`} checked={mfrs.includes(m.id)} onChange={() => toggle('mfrs', mfrs, m.id)} /> {m.name} <small>({m.n})</small>
            </label>
          ))}
        </div>
      )}
      {f.specs.map((s) => (
        <div className="filter-block" key={s.id} id={`catalog-spec-filter-${s.id}`}>
          <h4>{s.name}</h4>
          {s.options.map((o) => (
            <label key={o.id} className="check" htmlFor={`catalog-spec-${o.id}`}>
              <input type="checkbox" id={`catalog-spec-${o.id}`} checked={specs.includes(o.id)} onChange={() => toggle('specs', specs, o.id)} /> {o.name} <small>({o.count})</small>
            </label>
          ))}
        </div>
      ))}
      {(specs.length > 0 || mfrs.length > 0) && <button className="text-link" id="catalog-clear-filters" onClick={() => set({ specs: null, mfrs: null, page: null })}>Remove all filters</button>}
    </aside>
  )
}

function AdvancedSearch({ params, set }) {
  const { boot } = useStore()
  const [form, setForm] = useState({ q: params.get('q') || '', adv: params.get('adv') === 'true', cid: params.get('cid') || '', isc: params.get('isc') === 'true', mid: params.get('mid') || '', pfrom: params.get('pfrom') || '', pto: params.get('pto') || '', sid: params.get('sid') === 'true' })
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = (e) => {
    e.preventDefault()
    set({ q: form.q, adv: form.adv ? 'true' : null, cid: form.adv ? form.cid || null : null, isc: form.adv && form.isc ? 'true' : null, mid: form.adv ? form.mid || null : null, pfrom: form.adv ? form.pfrom || null : null, pto: form.adv ? form.pto || null : null, sid: form.adv && form.sid ? 'true' : null, page: null }, true)
  }
  return (
    <form className="search-page-form card" id="search-form" onSubmit={submit}>
      <div className="row-gap wrap">
        <label htmlFor="search-q" className="sr-only">Search keyword</label>
        <input id="search-q" name="q" className="grow" value={form.q} onChange={up('q')} placeholder="Search keyword" />
        <button className="dark-button" id="search-submit">Search</button>
      </div>
      <label className="check" htmlFor="search-advanced"><input type="checkbox" id="search-advanced" checked={form.adv} onChange={up('adv')} /> Advanced search</label>
      {form.adv && (
        <div className="form-grid" id="search-advanced-panel">
          <div className="field"><label htmlFor="search-category">Category</label>
            <select id="search-category" value={form.cid} onChange={up('cid')}><option value="">All</option>{flatten(boot.categories).map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="search-manufacturer">Manufacturer</label>
            <select id="search-manufacturer" value={form.mid} onChange={up('mid')}><option value="">All</option>{boot.manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div className="field"><label htmlFor="search-price-from">Price from</label><input id="search-price-from" type="number" value={form.pfrom} onChange={up('pfrom')} /></div>
          <div className="field"><label htmlFor="search-price-to">Price to</label><input id="search-price-to" type="number" value={form.pto} onChange={up('pto')} /></div>
          <label className="check" htmlFor="search-include-sub"><input type="checkbox" id="search-include-sub" checked={form.isc} onChange={up('isc')} /> Automatically search sub categories</label>
          <label className="check" htmlFor="search-in-descriptions"><input type="checkbox" id="search-in-descriptions" checked={form.sid} onChange={up('sid')} /> Search in product descriptions</label>
        </div>
      )}
    </form>
  )
}

export function CatalogPage({ mode }) {
  const { slug, tag } = useParams()
  const { boot } = useStore()
  const [params, setParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const view = params.get('view') || boot.settings.catalog.defaultViewMode || 'grid'
  const query = Object.fromEntries(params.entries())
  if (mode === 'category') query.category = slug
  if (mode === 'manufacturer') query.manufacturer = slug
  if (mode === 'tag') query.tag = tag
  if (mode === 'new') query.new = 'true'
  const skipSearch = mode === 'search' && params.get('q') == null
  const [{ data, loading, error }] = useAsync(() => (skipSearch ? Promise.resolve(null) : api.get('/catalog', query)), [mode, slug, tag, params.toString()])
  const set = (patch, replaceAll = false) => {
    const next = new URLSearchParams(replaceAll ? '' : params)
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') next.delete(k); else next.set(k, v) }
    setParams(next)
  }
  useEffect(() => setShowFilters(false), [params])
  const ctx = data?.context || {}
  const title = mode === 'search' ? 'Search' : mode === 'new' ? 'New products' : ctx.category?.name || ctx.manufacturer?.name || (ctx.tag ? `Products tagged with '${ctx.tag.name}'` : '')
  useDocumentTitle(title)
  if (error) return <div className="container section"><Notice type="error">{error.message}</Notice></div>
  const crumbs = mode === 'category' ? (ctx.breadcrumb || []).map((c) => ({ label: c.name, to: `/category/${c.slug}` }))
    : mode === 'manufacturer' ? [{ label: 'Manufacturers', to: '/brands' }, { label: ctx.manufacturer?.name }]
      : [{ label: title }]
  const showSidebar = data && mode !== 'search' && mode !== 'new'
  return (
    <div className="container catalog-page" id={`catalog-${mode}`}>
      <Breadcrumb items={crumbs} />
      <PageTitle sub={ctx.category?.description || ctx.manufacturer?.description}>{title}</PageTitle>
      {mode === 'search' && <AdvancedSearch params={params} set={set} key={params.toString()} />}
      {loading && !data ? <Loading /> : data && (
        <div className={`catalog-layout ${showSidebar ? '' : 'no-sidebar'}`}>
          {showSidebar && <div className={`filters-wrap ${showFilters ? 'open' : ''}`}><Filters data={data} params={params} set={set} onClose={() => setShowFilters(false)} /></div>}
          <section className="catalog-results">
            {data.warning && <Notice type="warning" id="catalog-warning">{data.warning}</Notice>}
            {data.featured?.length > 0 && <><h3 className="block-title">Featured products</h3><ProductGrid products={data.featured} idPrefix="catalog-featured" /></>}
            <div className="catalog-toolbar" id="catalog-toolbar">
              {showSidebar && <button className="ghost-button small mobile-only" id="catalog-open-filters" onClick={() => setShowFilters(true)}><SlidersHorizontal size={15} /> Filters</button>}
              <span className="muted" id="catalog-total" data-total={data.total}>{data.total} product(s)</span>
              <div className="toolbar-controls">
                <label htmlFor="catalog-sort">Sort by</label>
                <select id="catalog-sort" value={params.get('sort') || 'position'} onChange={(e) => set({ sort: e.target.value === 'position' ? null : e.target.value, page: null })}>
                  <option value="position">Position</option><option value="name_asc">Name: A to Z</option><option value="name_desc">Name: Z to A</option>
                  <option value="price_asc">Price: Low to High</option><option value="price_desc">Price: High to Low</option><option value="created">Created on</option>
                </select>
                <label htmlFor="catalog-page-size">Display</label>
                <select id="catalog-page-size" value={data.size} onChange={(e) => set({ size: e.target.value, page: null })}>
                  {[...new Set([...data.pageSizeOptions, data.size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div className="view-toggle">
                  <button id="catalog-view-grid" className={view === 'grid' ? 'active' : ''} onClick={() => set({ view: 'grid' })} aria-label="Grid view"><LayoutGrid size={16} /></button>
                  <button id="catalog-view-list" className={view === 'list' ? 'active' : ''} onClick={() => set({ view: 'list' })} aria-label="List view"><List size={16} /></button>
                </div>
              </div>
            </div>
            {data.products.length ? <ProductGrid products={data.products} idPrefix="catalog-product" view={view} />
              : <div className="empty" id="catalog-empty">{mode === 'search' ? 'No products were found that matched your criteria.' : 'There are no products in this list.'}</div>}
            <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: p > 1 ? p : null })} id="catalog-pager" />
          </section>
        </div>
      )}
    </div>
  )
}

export function BrandsPage() {
  useDocumentTitle('Manufacturers')
  const [{ data, loading }] = useAsync(() => api.get('/manufacturers'), [])
  return (
    <div className="container section-sm" id="brands-page">
      <Breadcrumb items={[{ label: 'Manufacturers' }]} />
      <PageTitle>Manufacturers</PageTitle>
      {loading ? <Loading /> : (
        <div className="brand-grid">
          {data.map((m) => <Link key={m.id} to={`/manufacturer/${m.slug}`} className="brand-card" id={`brand-${m.slug}`}><b>{m.name}</b><small>{m.description}</small><span>{m.n} products</span></Link>)}
        </div>
      )}
    </div>
  )
}

export function TagsPage() {
  useDocumentTitle('All product tags')
  const [{ data, loading }] = useAsync(() => api.get('/tags'), [])
  return (
    <div className="container section-sm" id="tags-page">
      <Breadcrumb items={[{ label: 'Product tags' }]} />
      <PageTitle>All product tags</PageTitle>
      {loading ? <Loading /> : <div className="tag-cloud">{data.map((t) => <Link key={t.id} to={`/producttag/${encodeURIComponent(t.name)}`} id={`tag-${t.id}`} style={{ fontSize: `${13 + Math.min(10, t.n * 2)}px` }}>{t.name} <small>({t.n})</small></Link>)}</div>}
    </div>
  )
}

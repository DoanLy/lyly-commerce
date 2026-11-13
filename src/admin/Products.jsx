import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Pencil, Download, Upload, Search, Copy, Eye, Table2, CheckCircle2, EyeOff, Image as ImageIcon } from 'lucide-react'
import {
  api, usd, formatDate, kebab, useLoad, useUi, useAction, useLookups, PageHead, Card, Loading, ErrorBox, Badge, BoolBadge, Table, Pager, Tabs,
  Field, Input, Toggle, MultiPicker, Modal, toCsv, downloadText, parseCsv,
} from './ui.jsx'
import { FormFields, ChildEditor, EditButtons } from './EntityPage.jsx'
import { CONTROL_TYPES } from './entities.js'
import { fileToDataUrl } from '../lib/api.js'

const PT = [['', 'All'], ['simple', 'Simple'], ['grouped', 'Grouped (product with variants)']]
const PUB = [['', 'All'], ['true', 'Published only'], ['false', 'Unpublished only']]

// ---------------- list ----------------
export function ProductList() {
  const p = 'admin-products'
  const { lookups } = useLookups()
  const { confirm, ok } = useUi()
  const [run, busy] = useAction()
  const [f, setF] = useState({ search: '', categoryId: '', manufacturerId: '', productType: '', published: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(15)
  const [selected, setSelected] = useState([])
  const [bulkEdit, setBulkEdit] = useState(null)
  const fileRef = useRef(null)
  const params = useMemo(() => ({ ...applied, page, size }), [applied, page, size])
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/products', params), [params])
  useEffect(() => { setSelected([]) }, [params])

  const bulk = async (action) => {
    if (!selected.length) return
    if (action === 'delete' && !(await confirm(`Delete ${selected.length} selected product(s)?`))) return
    if (await run(() => api.post('/admin/products/bulk', { action, ids: selected }), `${selected.length} product(s) updated`)) reload()
  }
  const exportCsv = async () => {
    const all = await run(() => api.get('/admin/products', { ...applied, page: 1, size: 500 }))
    if (!all) return
    downloadText('products.csv', toCsv(all.rows, [
      { k: 'name' }, { k: 'sku' }, { k: 'price' }, { k: 'old_price' }, { k: 'stock_qty' },
      { k: 'category', get: (r) => (r.categories || '').split(', ')[0] }, { k: 'published' },
    ]))
  }
  const importCsv = async (file) => {
    const rows = parseCsv(await file.text()).filter((r) => r.name)
    if (!rows.length) return ok('The file contains no product rows (needs a "name" column)')
    if (!(await confirm(`Import ${rows.length} product row(s)? Existing products are matched by SKU.`, { danger: false, okText: 'Import' }))) return
    const r = await run(() => api.post('/admin/products/import', { rows }), (x) => `Import finished: ${x.created} created, ${x.updated} updated`)
    if (r) reload()
  }
  const saveBulkEdit = async () => {
    if (await run(() => api.post('/admin/products/bulk', { action: 'edit', rows: bulkEdit }), 'Products have been updated')) { setBulkEdit(null); reload() }
  }

  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title="Products">
        <Link to="/admin/products/create" className="ad-btn primary" id={`${p}-add-new`}><Plus size={15} />Add new</Link>
        <button type="button" className="ad-btn" id={`${p}-export`} onClick={exportCsv} disabled={busy}><Download size={15} />Export CSV</button>
        <label className="ad-btn" htmlFor={`${p}-import-file`} id={`${p}-import`}><Upload size={15} />Import CSV</label>
        <input ref={fileRef} type="file" accept=".csv,text/csv" id={`${p}-import-file`} className="ad-sr" onChange={(e) => { const file = e.target.files?.[0]; if (file) importCsv(file); e.target.value = '' }} />
        <button type="button" className="ad-btn" id={`${p}-bulk-edit`} disabled={!data?.rows?.length} onClick={() => setBulkEdit(data.rows.map((r) => ({ id: r.id, name: r.name, price: r.price, old_price: r.old_price, stock_qty: r.stock_qty, published: r.published })))}><Table2 size={15} />Bulk edit</button>
      </PageHead>

      <Card className="ad-filter-card">
        <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f) }}>
          <div className="ad-field-inline"><label htmlFor={`${p}-search`}>Product name / SKU</label>
            <input id={`${p}-search`} value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search products" /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-filter-category`}>Category</label>
            <Input id={`${p}-filter-category`} type="select" value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} options={[['', 'All'], ...(lookups.categoryOptions || []).map((c) => [c.id, c.name])]} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-filter-manufacturer`}>Manufacturer</label>
            <Input id={`${p}-filter-manufacturer`} type="select" value={f.manufacturerId} onChange={(v) => setF({ ...f, manufacturerId: v })} options={[['', 'All'], ...(lookups.manufacturers || []).map((c) => [c.id, c.name])]} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-filter-type`}>Product type</label>
            <Input id={`${p}-filter-type`} type="select" value={f.productType} onChange={(v) => setF({ ...f, productType: v })} options={PT} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-filter-published`}>Published</label>
            <Input id={`${p}-filter-published`} type="select" value={f.published} onChange={(v) => setF({ ...f, published: v })} options={PUB} /></div>
          <button type="submit" className="ad-btn primary" id={`${p}-search-button`}><Search size={14} />Search</button>
        </form>
      </Card>

      <Card>
        {selected.length > 0 && (
          <div className="ad-bulkbar" id={`${p}-bulkbar`}>
            <span>{selected.length} selected</span>
            <button type="button" className="ad-btn sm" id={`${p}-bulk-publish`} onClick={() => bulk('publish')} disabled={busy}><CheckCircle2 size={13} />Publish selected</button>
            <button type="button" className="ad-btn sm" id={`${p}-bulk-unpublish`} onClick={() => bulk('unpublish')} disabled={busy}><EyeOff size={13} />Unpublish selected</button>
            <button type="button" className="ad-btn sm danger" id={`${p}-bulk-delete`} onClick={() => bulk('delete')} disabled={busy}><Trash2 size={13} />Delete selected</button>
          </div>
        )}
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <Table idPrefix={p} rowId={(r) => `admin-product-row-${r.id}`} rows={data?.rows} selectable selected={selected} onSelect={setSelected} cols={[
              { k: 'picture', label: 'Picture', render: (r) => (r.picture ? <img className="ad-thumb" src={r.picture} alt="" /> : <span className="ad-thumb empty"><ImageIcon size={14} /></span>) },
              { k: 'name', label: 'Product name', render: (r) => <Link className="ad-link" to={`/admin/products/edit/${r.id}`} id={`admin-product-name-${r.id}`}>{r.name}</Link> },
              { k: 'sku', label: 'SKU' },
              { k: 'price', label: 'Price', className: 'num', render: (r) => usd(r.price) },
              { k: 'stock_qty', label: 'Stock quantity', className: 'num', render: (r) => (r.manage_stock ? r.stock_qty : '—') },
              { k: 'product_type', label: 'Type', render: (r) => <Badge tone="mute">{r.product_type}</Badge> },
              { k: 'published', label: 'Published', render: (r) => <BoolBadge v={r.published} /> },
              { k: 'edit', label: '', className: 'ad-actions-col', render: (r) => <Link to={`/admin/products/edit/${r.id}`} className="ad-btn sm" id={`admin-product-edit-${r.id}`}><Pencil size={13} />Edit</Link> },
            ]} />
            <Pager idPrefix={p} page={page} size={size} total={data?.total || 0} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
          </>
        )}
      </Card>

      {bulkEdit && (
        <Modal wide title="Bulk edit products" id="admin-products-bulk-edit-modal" onClose={() => setBulkEdit(null)} footer={<>
          <button type="button" className="ad-btn" id="admin-products-bulk-edit-cancel" onClick={() => setBulkEdit(null)}>Cancel</button>
          <button type="button" className="ad-btn primary" id="admin-products-bulk-edit-save" disabled={busy} onClick={saveBulkEdit}>Save changes</button>
        </>}>
          <div className="ad-table-wrap">
            <table className="ad-table compact" id="admin-products-bulk-edit-table">
              <thead><tr><th>Product</th><th>Price</th><th>Old price</th><th>Stock qty</th><th>Published</th></tr></thead>
              <tbody>{bulkEdit.map((r, i) => {
                const upd = (k, v) => setBulkEdit(bulkEdit.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                const id = `admin-products-bulk-${r.id}`
                return (
                  <tr key={r.id} id={`${id}-row`}>
                    <td>{r.name}</td>
                    {['price', 'old_price', 'stock_qty'].map((k) => (
                      <td key={k}><label className="ad-sr" htmlFor={`${id}-${kebab(k)}`}>{k}</label><Input id={`${id}-${kebab(k)}`} type={k === 'stock_qty' ? 'int' : 'money'} value={r[k]} onChange={(v) => upd(k, v)} /></td>
                    ))}
                    <td><Toggle id={`${id}-published`} checked={r.published} onChange={(v) => upd('published', v)} /></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------- edit ----------------
const NEW_PRODUCT = {
  name: '', product_type: 'simple', visible_individually: true, published: true, price: 0, old_price: 0, product_cost: 0, max_customer_price: 1000, min_customer_price: 0,
  manage_stock: true, stock_qty: 100, display_stock_availability: true, min_stock_qty: 0, low_stock_activity: 'nothing', notify_admin_below: 1, backorders: 'none',
  allow_back_in_stock: true, order_min_qty: 1, order_max_qty: 10000, allowed_quantities: '', is_shipping_enabled: true, additional_shipping_charge: 0, weight: 0, length: 0, width: 0, height: 0,
  gift_card_type: 'virtual', allow_reviews: true, display_order: 0, categoryIds: [], featuredCategoryIds: [], manufacturerIds: [], tags: '', pictures: [], attributes: [], specs: [], tierPrices: [], relatedIds: [], crossSellIds: [],
}
const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra })
const INFO = [
  F('name', 'Product name', 'text', { required: true }), F('short_description', 'Short description', 'textarea'), F('full_description', 'Full description', 'html', { rows: 10 }),
  F('sku', 'SKU'), F('gtin', 'GTIN (global trade item number)'), F('mpn', 'Manufacturer part number'),
  F('product_type', 'Product type', 'select', { options: PT.slice(1) }),
  F('parent_grouped_id', 'Associated to grouped product', 'select', { int: true, show: (r) => r.product_type !== 'grouped', options: (lk, r) => [['', '[None]'], ...(lk.products || []).filter((x) => x.id !== r.id).map((x) => [x.id, x.name])] }),
  F('visible_individually', 'Visible individually', 'bool'),
]
const INFO2 = [
  F('tags', 'Product tags', 'text', { hint: 'Comma separated' }), F('published', 'Published', 'bool'), F('show_on_home', 'Show on home page', 'bool'), F('display_order', 'Display order', 'int'),
  F('mark_as_new', 'Mark as new', 'bool'), F('mark_new_start', 'Mark as new. Start date', 'datetime', { show: (r) => r.mark_as_new }), F('mark_new_end', 'Mark as new. End date', 'datetime', { show: (r) => r.mark_as_new }),
  F('available_start', 'Available start date', 'datetime'), F('available_end', 'Available end date', 'datetime'), F('allow_reviews', 'Allow customer reviews', 'bool'),
  F('admin_comment', 'Admin comment', 'textarea'), F('slug', 'Search engine friendly page name', 'text', { hint: 'Leave empty to generate from the name' }), F('meta_title', 'Meta title'),
]
const PRICES = [
  F('price', 'Price', 'money'), F('old_price', 'Old price', 'money'), F('product_cost', 'Product cost', 'money'),
  F('disable_buy', 'Disable buy button', 'bool'), F('disable_wishlist', 'Disable wishlist button', 'bool'), F('available_for_preorder', 'Available for pre-order', 'bool'), F('call_for_price', 'Call for price', 'bool'),
  F('customer_enters_price', 'Customer enters price', 'bool'), F('min_customer_price', 'Minimum amount', 'money', { show: (r) => r.customer_enters_price }), F('max_customer_price', 'Maximum amount', 'money', { show: (r) => r.customer_enters_price }),
  F('is_tax_exempt', 'Tax exempt', 'bool'), F('tax_category_id', 'Tax category', 'select', { int: true, show: (r) => !r.is_tax_exempt, options: (lk) => [['', '[None]'], ...(lk.taxCategories || []).map((t) => [t.id, `${t.name} (${t.rate}%)`])] }),
]
const INVENTORY = [
  F('manage_stock', 'Manage inventory (track stock)', 'bool'),
  ...[F('stock_qty', 'Stock quantity', 'int'), F('display_stock_availability', 'Display availability', 'bool'), F('display_stock_quantity', 'Display stock quantity', 'bool', { show: (r) => r.manage_stock && r.display_stock_availability }),
    F('min_stock_qty', 'Minimum stock qty', 'int'), F('low_stock_activity', 'Low stock activity', 'select', { options: [['nothing', 'Nothing'], ['disable_buy', 'Disable buy button'], ['unpublish', 'Unpublish']] }),
    F('notify_admin_below', 'Notify admin for quantity below', 'int'), F('backorders', 'Backorders', 'select', { options: [['none', 'No backorders'], ['allow', 'Allow qty below 0'], ['allow_notify', 'Allow qty below 0 and notify customer']] }),
    F('allow_back_in_stock', 'Allow back in stock subscriptions', 'bool')].map((x) => ({ ...x, show: x.show || ((r) => r.manage_stock) })),
  F('order_min_qty', 'Minimum cart quantity', 'int'), F('order_max_qty', 'Maximum cart quantity', 'int'), F('allowed_quantities', 'Allowed quantities', 'text', { hint: 'Comma separated, e.g. 1, 5, 10. Leave empty to allow any.' }),
]
const SHIPPING = [
  F('is_shipping_enabled', 'Shipping enabled', 'bool'),
  ...[F('is_free_shipping', 'Free shipping', 'bool'), F('additional_shipping_charge', 'Additional shipping charge', 'money'), F('weight', 'Weight (kg)', 'number'), F('length', 'Length (cm)', 'number'), F('width', 'Width (cm)', 'number'), F('height', 'Height (cm)', 'number')]
    .map((x) => ({ ...x, show: (r) => r.is_shipping_enabled })),
]
const GIFT = [
  F('is_gift_card', 'Is gift card', 'bool'), F('gift_card_type', 'Gift card type', 'select', { options: [['virtual', 'Virtual'], ['physical', 'Physical']], show: (r) => r.is_gift_card }),
  F('is_download', 'Downloadable product', 'bool'), F('download_url', 'Download URL', 'text', { show: (r) => r.is_download }), F('has_sample', 'Has sample download', 'bool', { show: (r) => r.is_download }),
]
const VALUE_COLS = [F('name', 'Name'), F('price_adjustment', 'Price adj.', 'number'), F('price_adjustment_percent', 'Adj. is %', 'bool'), F('weight_adjustment', 'Weight adj.', 'number'), F('is_preselected', 'Pre-selected', 'bool'), F('color_rgb', 'Color', 'color'), F('display_order', 'Order', 'int')]

export function ProductEdit() {
  const { id } = useParams()
  const isNew = !id
  const p = 'admin-product'
  const nav = useNavigate()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const { lookups, refresh } = useLookups()
  const [tab, setTab] = useState('info')
  const [row, setRow] = useState(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const { data, loading, error, reload } = useLoad(() => (id ? api.get(`/admin/products/${id}`) : Promise.resolve(structuredClone(NEW_PRODUCT))), [id])
  useEffect(() => {
    if (data) setRow({ ...structuredClone(data), relatedIds: data.related ? data.related.map((r) => r.id) : data.relatedIds || [], crossSellIds: data.crossSells ? data.crossSells.map((r) => r.id) : data.crossSellIds || [] })
  }, [data])
  const set = (k, v) => setRow((r) => ({ ...r, [k]: v }))

  const save = async (cont) => {
    const body = { ...row }
    delete body.related; delete body.crossSells; delete body.associated
    const res = await run(() => (isNew ? api.post('/admin/products', body) : api.put(`/admin/products/${id}`, body)), `The product has been ${isNew ? 'added' : 'updated'} successfully.`)
    if (!res) return
    refresh()
    if (!cont) return nav('/admin/products')
    if (isNew) nav(`/admin/products/edit/${res.id}`, { replace: true })
    else reload()
  }
  const del = async () => {
    if (!(await confirm('Delete this product?'))) return
    if (await run(() => api.del(`/admin/products/${id}`), 'The product has been deleted.')) { refresh(); nav('/admin/products') }
  }

  if (error) return <div className="ad-page"><PageHead title="Product" back="/admin/products" /><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !row) return <Loading />

  const tabs = [
    { key: 'info', label: 'Product info' }, { key: 'prices', label: 'Prices' }, { key: 'inventory', label: 'Inventory' }, { key: 'shipping', label: 'Shipping' },
    { key: 'gift', label: 'Gift card & downloads' }, { key: 'pictures', label: 'Pictures', count: row.pictures?.length }, { key: 'attributes', label: 'Product attributes', count: row.attributes?.length },
    { key: 'specs', label: 'Specification attributes', count: row.specs?.length }, { key: 'related', label: 'Related & cross-sells' }, !isNew && { key: 'purchased', label: 'Purchased with orders' },
  ]
  const form = (fields) => <div className="ad-form"><FormFields fields={fields} row={row} set={set} prefix={p} lookups={lookups} /></div>
  const otherProducts = (lookups.products || []).filter((x) => x.id !== row.id).map((x) => ({ id: x.id, name: x.sku ? `${x.name} (${x.sku})` : x.name }))

  return (
    <div className="ad-page" id={`${p}-edit-page`}>
      <PageHead title={isNew ? 'Add a new product' : `Edit product details – ${data.name}`} back="/admin/products" backLabel="back to product list">
        {!isNew && <a href={`/product/${data.slug}`} target="_blank" rel="noreferrer" className="ad-btn" id={`${p}-preview`}><Eye size={15} />Preview</a>}
        {!isNew && <button type="button" className="ad-btn" id={`${p}-copy`} onClick={() => setCopyOpen(true)}><Copy size={15} />Copy product</button>}
        <EditButtons prefix={p} busy={busy} onSave={save} onDelete={!isNew ? del : null} />
      </PageHead>
      <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix={`${p}-tab`} />
      <form onSubmit={(e) => { e.preventDefault(); save(false) }}>
        {tab === 'info' && (
          <Card title="Product info" id={`${p}-section-info`}>
            {form(INFO)}
            <div className="ad-form">
              <Field id={`${p}-categories`} label="Categories"><MultiPicker id={`${p}-categories`} options={lookups.categoryOptions || []} value={row.categoryIds || []} onChange={(v) => set('categoryIds', v)} /></Field>
              <Field id={`${p}-featured-categories`} label="Featured in categories" hint="Featured products are shown at the top of the category page"><MultiPicker id={`${p}-featured-categories`} options={(lookups.categoryOptions || []).filter((c) => (row.categoryIds || []).map(Number).includes(c.id))} value={row.featuredCategoryIds || []} onChange={(v) => set('featuredCategoryIds', v)} /></Field>
              <Field id={`${p}-manufacturers`} label="Manufacturers"><MultiPicker id={`${p}-manufacturers`} options={lookups.manufacturers || []} value={row.manufacturerIds || []} onChange={(v) => set('manufacturerIds', v)} /></Field>
            </div>
            {form(INFO2)}
            {row.product_type === 'grouped' && !isNew && (
              <Card title="Associated products" id={`${p}-associated`}>
                <p className="ad-muted">Assign a product to this grouped product with the "Associated to grouped product" field on the child product.</p>
                <Table idPrefix={`${p}-associated`} rows={data.associated} empty="No associated products" cols={[
                  { k: 'name', label: 'Product', render: (r) => <Link className="ad-link" to={`/admin/products/edit/${r.id}`}>{r.name}</Link> }, { k: 'price', label: 'Price', render: (r) => usd(r.price) }, { k: 'published', label: 'Published', render: (r) => <BoolBadge v={r.published} /> },
                ]} />
              </Card>
            )}
          </Card>
        )}
        {tab === 'prices' && (
          <>
            <Card title="Prices" id={`${p}-section-prices`}>{form(PRICES)}</Card>
            <Card title="Tier prices" id={`${p}-section-tier-prices`}>
              <ChildEditor prefix={`${p}-tier-prices`} rows={row.tierPrices || []} onChange={(v) => set('tierPrices', v)} def={{ single: 'tier price', cols: [
                F('quantity', 'Quantity', 'int'), F('price', 'Price', 'money'), F('role_id', 'Customer role', 'select', { options: [['', 'All customer roles'], ...(lookups.roles || []).map((r) => [r.id, r.name])] }),
                F('start_at', 'Start date', 'datetime'), F('end_at', 'End date', 'datetime'),
              ] }} />
            </Card>
          </>
        )}
        {tab === 'inventory' && <Card title="Inventory" id={`${p}-section-inventory`}>{form(INVENTORY)}</Card>}
        {tab === 'shipping' && <Card title="Shipping" id={`${p}-section-shipping`}>{form(SHIPPING)}</Card>}
        {tab === 'gift' && <Card title="Gift card & downloadable product" id={`${p}-section-gift`}>{form(GIFT)}</Card>}
        {tab === 'pictures' && <Pictures prefix={p} pictures={row.pictures || []} onChange={(v) => set('pictures', v)} />}
        {tab === 'attributes' && <Attributes prefix={p} rows={row.attributes || []} onChange={(v) => set('attributes', v)} lookups={lookups} />}
        {tab === 'specs' && <Specs prefix={p} rows={row.specs || []} onChange={(v) => set('specs', v)} lookups={lookups} />}
        {tab === 'related' && (
          <>
            <Card title="Related products" id={`${p}-section-related`}>
              <Field id={`${p}-related`} label="Related products"><MultiPicker id={`${p}-related`} options={otherProducts} value={row.relatedIds || []} onChange={(v) => set('relatedIds', v)} /></Field>
            </Card>
            <Card title="Cross-sells" id={`${p}-section-cross-sells`}>
              <Field id={`${p}-cross-sells`} label="Cross-sell products" hint="Shown in the shopping cart"><MultiPicker id={`${p}-cross-sells`} options={otherProducts} value={row.crossSellIds || []} onChange={(v) => set('crossSellIds', v)} /></Field>
            </Card>
          </>
        )}
        {tab === 'purchased' && !isNew && <Purchased id={id} />}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {copyOpen && <CopyModal product={data} onClose={() => setCopyOpen(false)} onDone={(np) => { setCopyOpen(false); refresh(); nav(`/admin/products/edit/${np.id}`) }} />}
    </div>
  )
}

function Pictures({ prefix, pictures, onChange }) {
  const [url, setUrl] = useState('')
  const { fail } = useUi()
  const p = `${prefix}-pictures`
  const add = (u) => onChange([...pictures, { url: u, alt: '', display_order: pictures.length }])
  const upd = (i, k, v) => onChange(pictures.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <Card title="Pictures" id={`${p}-section`}>
      <div className="ad-pictures">
        {pictures.length ? pictures.map((pic, i) => (
          <div className="ad-picture" key={pic.id || `n${i}`} id={`${p}-item-${i}`}>
            <img src={pic.url} alt={pic.alt || ''} />
            <label htmlFor={`${p}-${i}-alt`}>Alt</label>
            <input id={`${p}-${i}-alt`} value={pic.alt || ''} onChange={(e) => upd(i, 'alt', e.target.value)} />
            <label htmlFor={`${p}-${i}-order`}>Display order</label>
            <input id={`${p}-${i}-order`} type="number" value={pic.display_order ?? i} onChange={(e) => upd(i, 'display_order', Number(e.target.value))} />
            <button type="button" className="ad-btn sm danger" id={`${p}-${i}-delete`} onClick={() => onChange(pictures.filter((_, j) => j !== i))}><Trash2 size={13} />Delete</button>
          </div>
        )) : <p className="ad-muted">No pictures yet.</p>}
      </div>
      <div className="ad-picture-add">
        <label className="ad-btn primary" htmlFor={`${p}-upload`}><Upload size={14} />Upload pictures</label>
        <input type="file" multiple accept="image/*" id={`${p}-upload`} className="ad-sr" onChange={async (e) => {
          const files = [...(e.target.files || [])]; e.target.value = ''
          try { const urls = await Promise.all(files.map((f) => fileToDataUrl(f))); onChange([...pictures, ...urls.map((u, k) => ({ url: u, alt: '', display_order: pictures.length + k }))]) } catch (er) { fail(er) }
        }} />
        <div className="ad-input-group">
          <label htmlFor={`${p}-url`} className="ad-sr">Picture URL</label>
          <input id={`${p}-url`} value={url} placeholder="…or paste an image URL" onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="ad-btn" id={`${p}-add-url`} disabled={!url.trim()} onClick={() => { add(url.trim()); setUrl('') }}><Plus size={14} />Add</button>
        </div>
      </div>
      <p className="ad-muted">Changes to pictures are stored when you save the product.</p>
    </Card>
  )
}

function Attributes({ prefix, rows, onChange, lookups }) {
  const p = `${prefix}-attributes`
  const upd = (i, k, v) => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <Card title="Product attributes" id={`${p}-section`}>
      {!rows.length && <p className="ad-muted">No attributes mapped. Attributes (e.g. color, size) let customers choose options with price adjustments.</p>}
      {rows.map((a, i) => (
        <div className="ad-subcard" key={a.id || `n${i}`} id={`${p}-mapping-${i}`}>
          <div className="ad-subcard-head">
            <b>{(lookups.attributes || []).find((x) => x.id === Number(a.attribute_id))?.name || 'New attribute'}</b>
            <button type="button" className="ad-btn sm danger" id={`${p}-${i}-delete`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={13} />Remove attribute</button>
          </div>
          <div className="ad-form cols-2">
            <Field id={`${p}-${i}-attribute`} label="Attribute"><Input id={`${p}-${i}-attribute`} type="select" value={a.attribute_id} onChange={(v) => upd(i, 'attribute_id', Number(v) || '')} options={[['', 'Select attribute'], ...(lookups.attributes || []).map((x) => [x.id, x.name])]} /></Field>
            <Field id={`${p}-${i}-prompt`} label="Text prompt"><Input id={`${p}-${i}-prompt`} value={a.text_prompt} onChange={(v) => upd(i, 'text_prompt', v)} /></Field>
            <Field id={`${p}-${i}-control`} label="Control type"><Input id={`${p}-${i}-control`} type="select" value={a.control_type || 'dropdown'} onChange={(v) => upd(i, 'control_type', v)} options={CONTROL_TYPES} /></Field>
            <Field id={`${p}-${i}-required`} label="Is required"><Toggle id={`${p}-${i}-required`} checked={a.is_required} onChange={(v) => upd(i, 'is_required', v)} /></Field>
            <Field id={`${p}-${i}-order`} label="Display order"><Input id={`${p}-${i}-order`} type="int" value={a.display_order} onChange={(v) => upd(i, 'display_order', v)} /></Field>
          </div>
          {!['textbox', 'multiline'].includes(a.control_type) && (
            <ChildEditor prefix={`${p}-${i}-values`} rows={a.values || []} onChange={(v) => upd(i, 'values', v)} def={{ single: 'value', cols: VALUE_COLS }} />
          )}
        </div>
      ))}
      <button type="button" className="ad-btn" id={`${p}-add`} onClick={() => onChange([...rows, { attribute_id: '', text_prompt: '', is_required: false, control_type: 'dropdown', display_order: rows.length, values: [] }])}><Plus size={14} />Add a new attribute</button>
    </Card>
  )
}

function Specs({ prefix, rows, onChange, lookups }) {
  const p = `${prefix}-specs`
  const upd = (i, k, v) => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const groups = useMemo(() => {
    const m = new Map()
    for (const o of lookups.specOptions || []) { if (!m.has(o.attribute_name)) m.set(o.attribute_name, []); m.get(o.attribute_name).push(o) }
    return [...m.entries()]
  }, [lookups.specOptions])
  return (
    <Card title="Specification attributes" id={`${p}-section`}>
      {rows.length ? (
        <div className="ad-table-wrap">
          <table className="ad-table compact" id={`${p}-table`}>
            <thead><tr><th>Attribute option</th><th>Custom value</th><th>Allow filtering</th><th>Show on product page</th><th /></tr></thead>
            <tbody>{rows.map((s, i) => (
              <tr key={s.id || `n${i}`} id={`${p}-row-${i}`}>
                <td><label className="ad-sr" htmlFor={`${p}-${i}-option`}>Option</label>
                  <select id={`${p}-${i}-option`} value={s.option_id || ''} onChange={(e) => upd(i, 'option_id', Number(e.target.value) || '')}>
                    <option value="">Select option</option>
                    {groups.map(([g, opts]) => <optgroup key={g} label={g}>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>)}
                  </select></td>
                <td><label className="ad-sr" htmlFor={`${p}-${i}-custom`}>Custom value</label><Input id={`${p}-${i}-custom`} value={s.custom_value} onChange={(v) => upd(i, 'custom_value', v)} /></td>
                <td><Toggle id={`${p}-${i}-filtering`} checked={s.allow_filtering !== false} onChange={(v) => upd(i, 'allow_filtering', v)} /></td>
                <td><Toggle id={`${p}-${i}-show`} checked={s.show_on_product_page !== false} onChange={(v) => upd(i, 'show_on_product_page', v)} /></td>
                <td className="ad-actions-col"><button type="button" className="ad-icon-btn danger" id={`${p}-${i}-delete`} aria-label="Delete" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="ad-muted">No specification attributes yet.</p>}
      <button type="button" className="ad-btn" id={`${p}-add`} onClick={() => onChange([...rows, { option_id: '', custom_value: '', allow_filtering: true, show_on_product_page: true }])}><Plus size={14} />Add attribute</button>
    </Card>
  )
}

function Purchased({ id }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/admin/products/${id}/purchased`), [id])
  return (
    <Card title="Purchased with orders" id="admin-product-section-purchased">
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? <Loading /> : (
        <Table idPrefix="admin-product-purchased" rowKey={(r) => `${r.id}-${r.quantity}-${r.price}`} rows={data} empty="This product has not been ordered yet" cols={[
          { k: 'id', label: 'Order #', render: (r) => <Link className="ad-link" to={`/admin/orders/edit/${r.id}`} id={`admin-product-purchased-order-${r.id}`}>{r.custom_number || r.id}</Link> },
          { k: 'order_status', label: 'Order status', render: (r) => <Badge>{r.order_status}</Badge> },
          { k: 'customer_email', label: 'Customer' }, { k: 'quantity', label: 'Quantity', className: 'num' },
          { k: 'price', label: 'Price', className: 'num', render: (r) => usd(r.price) }, { k: 'created_at', label: 'Created on', render: (r) => formatDate(r.created_at, true) },
        ]} />
      )}
    </Card>
  )
}

function CopyModal({ product, onClose, onDone }) {
  const [name, setName] = useState(`Copy of ${product.name}`)
  const [published, setPublished] = useState(false)
  const [copyImages, setCopyImages] = useState(true)
  const [run, busy] = useAction()
  return (
    <Modal title="Copy product" id="admin-product-copy-modal" onClose={onClose} footer={<>
      <button type="button" className="ad-btn" id="admin-product-copy-cancel" onClick={onClose}>Cancel</button>
      <button type="button" className="ad-btn primary" id="admin-product-copy-submit" disabled={busy || !name.trim()} onClick={async () => { const r = await run(() => api.post(`/admin/products/${product.id}/copy`, { name, published, copyImages }), 'The product has been copied successfully'); if (r) onDone(r) }}><Copy size={14} />Copy</button>
    </>}>
      <div className="ad-form">
        <Field id="admin-product-copy-name" label="New product name"><Input id="admin-product-copy-name" value={name} onChange={setName} /></Field>
        <Field id="admin-product-copy-published" label="Published"><Toggle id="admin-product-copy-published" checked={published} onChange={setPublished} /></Field>
        <Field id="admin-product-copy-images" label="Copy images"><Toggle id="admin-product-copy-images" checked={copyImages} onChange={setCopyImages} /></Field>
      </div>
    </Modal>
  )
}

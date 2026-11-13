import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search, Download } from 'lucide-react'
import { api, usd, formatDate, kebab, useLoad, useLookups, PageHead, Card, Loading, ErrorBox, Table, Input, BarChart, BoolBadge, toCsv, downloadText } from './ui.jsx'

const money = (k, label) => ({ k, label, className: 'num', render: (r) => usd(r[k]), csv: true })
const prod = { k: 'product_name', label: 'Product', render: (r) => (r.product_id ? <Link className="ad-link" to={`/admin/products/edit/${r.product_id}`}>{r.product_name}</Link> : r.product_name) }
const prodName = { k: 'name', label: 'Product', render: (r) => <Link className="ad-link" to={`/admin/products/edit/${r.id}`}>{r.name}</Link> }
const cust = { k: 'email', label: 'Customer', render: (r) => <Link className="ad-link" to={`/admin/customers/edit/${r.id}`}>{r.email}</Link> }
const custName = { k: 'name', label: 'Name', render: (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() }

const REPORTS = {
  sales: { title: 'Sales summary', dates: true, status: true, groupBy: true, key: (r) => r.period, cols: [
    { k: 'period', label: 'Period' }, { k: 'orders', label: 'Orders', className: 'num' }, money('subtotal', 'Subtotal'), money('discounts', 'Discounts'), money('shipping', 'Shipping'), money('tax', 'Tax'), money('total', 'Total')] },
  'low-stock': { title: 'Low stock', cols: [prodName, { k: 'sku', label: 'SKU' }, { k: 'stock_qty', label: 'Stock qty', className: 'num' }, { k: 'min_stock_qty', label: 'Min stock qty', className: 'num' }, { k: 'published', label: 'Published', render: (r) => <BoolBadge v={r.published} /> }] },
  bestsellers: { title: 'Bestsellers', dates: true, status: true, orderBy: true, key: (r) => r.product_id ?? r.product_name, cols: [prod, { k: 'qty', label: 'Total quantity', className: 'num' }, money('amount', 'Total amount')] },
  'never-purchased': { title: 'Products never purchased', cols: [prodName, { k: 'sku', label: 'SKU' }, money('price', 'Price'), { k: 'created_at', label: 'Created on', render: (r) => formatDate(r.created_at) }] },
  'country-sales': { title: 'Country sales', dates: true, status: true, key: (r) => r.country, cols: [{ k: 'country', label: 'Country' }, { k: 'orders', label: 'Number of orders', className: 'num' }, money('total', 'Order total')] },
  'customers-by-total': { title: 'Customers by order total', dates: true, status: true, cols: [cust, custName, { k: 'orders', label: 'Orders', className: 'num' }, money('total', 'Order total')] },
  'customers-by-orders': { title: 'Customers by number of orders', dates: true, status: true, cols: [cust, custName, { k: 'orders', label: 'Orders', className: 'num' }, money('total', 'Order total')] },
  'registered-customers': { title: 'Registered customers', single: true },
  discounts: { title: 'Discount usage', cols: [{ k: 'name', label: 'Discount', render: (r) => <Link className="ad-link" to={`/admin/discounts/edit/${r.id}`}>{r.name}</Link> }, { k: 'coupon_code', label: 'Coupon code' }, { k: 'uses', label: 'Times used', className: 'num' }] },
}

export default function Reports() {
  const { name } = useParams()
  return REPORTS[name] ? <Report key={name} name={name} cfg={REPORTS[name]} /> : <div className="ad-page"><ErrorBox error="Unknown report" /></div>
}

function Report({ name, cfg }) {
  const p = `admin-report-${kebab(name)}`
  const { lookups } = useLookups()
  const [f, setF] = useState({ from: '', to: '', orderStatus: '', paymentStatus: '', groupBy: 'day', orderBy: 'qty' })
  const [applied, setApplied] = useState(f)
  const { data, loading, error, reload } = useLoad(() => api.get(`/admin/reports/${name}`, applied), [name, applied])
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const chart = useMemo(() => (name === 'sales' && Array.isArray(data) ? [...data].reverse().slice(-40).map((r) => ({ label: r.period, value: r.total })) : null), [name, data])
  const hasFilters = cfg.dates || cfg.status || cfg.groupBy || cfg.orderBy
  const exportCsv = () => downloadText(`${name}.csv`, toCsv(data, cfg.cols.map((c) => ({ k: c.k, label: c.label, get: c.k === 'name' && c.label === 'Name' ? (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() : undefined }))))
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title={cfg.title}>{!cfg.single && Array.isArray(data) && data.length > 0 && <button type="button" className="ad-btn" id={`${p}-export`} onClick={exportCsv}><Download size={15} />Export CSV</button>}</PageHead>
      {hasFilters && (
        <Card className="ad-filter-card">
          <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); setApplied(f) }}>
            {cfg.dates && <>
              <div className="ad-field-inline"><label htmlFor={`${p}-from`}>Start date</label><input id={`${p}-from`} type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} /></div>
              <div className="ad-field-inline"><label htmlFor={`${p}-to`}>End date</label><input id={`${p}-to`} type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} /></div>
            </>}
            {cfg.status && <>
              <div className="ad-field-inline"><label htmlFor={`${p}-order-status`}>Order status</label><Input id={`${p}-order-status`} type="select" value={f.orderStatus} onChange={set('orderStatus')} options={[['', 'All'], ...(lookups.orderStatuses || []).filter((s) => s !== 'Cancelled')]} /></div>
              <div className="ad-field-inline"><label htmlFor={`${p}-payment-status`}>Payment status</label><Input id={`${p}-payment-status`} type="select" value={f.paymentStatus} onChange={set('paymentStatus')} options={[['', 'All'], ...(lookups.paymentStatuses || [])]} /></div>
            </>}
            {cfg.groupBy && <div className="ad-field-inline"><label htmlFor={`${p}-group-by`}>Group by</label><Input id={`${p}-group-by`} type="select" value={f.groupBy} onChange={set('groupBy')} options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']]} /></div>}
            {cfg.orderBy && <div className="ad-field-inline"><label htmlFor={`${p}-order-by`}>Order by</label><Input id={`${p}-order-by`} type="select" value={f.orderBy} onChange={set('orderBy')} options={[['qty', 'Quantity'], ['amount', 'Total amount']]} /></div>}
            <button type="submit" className="ad-btn primary" id={`${p}-run`}><Search size={14} />Run report</button>
          </form>
        </Card>
      )}
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading || !data ? <Loading /> : cfg.single ? (
        <div className="ad-stats four" id={`${p}-result`}>
          {[['week', 'In the last 7 days'], ['two_weeks', 'In the last 14 days'], ['month', 'In the last month'], ['year', 'In the last year']].map(([k, l]) => (
            <div className="ad-stat static" key={k} id={`${p}-${kebab(k)}`}><strong>{data[k]}</strong><p>{l}</p></div>
          ))}
        </div>
      ) : (
        <>
          {chart && chart.length > 0 && <Card title="Order totals by period" id={`${p}-chart`}><BarChart data={chart} format={usd} /></Card>}
          <Card id={`${p}-result`}>
            <Table idPrefix={p} rowKey={cfg.key || ((r) => r.id)} rows={data} cols={cfg.cols} empty="No data for the selected criteria" />
          </Card>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Undo2, Users, PackageX, MessageSquare, Wifi } from 'lucide-react'
import { api, usd, formatDate, useLoad, Card, Loading, ErrorBox, Badge, Table, BarChart, Tabs, PageHead } from './ui.jsx'

const short = (d) => d.slice(5).replace('-', '/')

export default function Dashboard() {
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/dashboard'), [])
  const [metric, setMetric] = useState('amount')
  const [best, setBest] = useState('qty')
  if (error) return <div className="ad-page"><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !data) return <Loading />
  const c = data.counts
  const stats = [
    { id: 'orders', label: 'Orders', value: c.orders, icon: ShoppingBag, to: '/admin/orders' },
    { id: 'pending-returns', label: 'Pending return requests', value: c.pending_returns, icon: Undo2, to: '/admin/return-requests' },
    { id: 'customers', label: 'Registered customers', value: c.customers, icon: Users, to: '/admin/customers' },
    { id: 'low-stock', label: 'Low stock products', value: c.low_stock, icon: PackageX, to: '/admin/reports/low-stock' },
    { id: 'pending-reviews', label: 'Pending reviews', value: c.pending_reviews, icon: MessageSquare, to: '/admin/reviews' },
    { id: 'online', label: 'Online customers', value: c.online, icon: Wifi, to: '/admin/online-customers' },
  ]
  const days = data.byDay.map((d) => ({ label: short(d.day), value: metric === 'amount' ? d.amount : d.orders }))
  const totalAmount = data.byDay.reduce((s, d) => s + d.amount, 0)
  const totalOrders = data.byDay.reduce((s, d) => s + d.orders, 0)
  const newCust = data.customersByDay.reduce((s, d) => s + d.n, 0)
  const inc = data.incomplete
  const sumRow = ['today', 'week', 'month', 'year', 'all_time'].reduce((o, k) => ({ ...o, [k]: data.totals.reduce((s, r) => s + r[k], 0) }), { status: 'Total' })
  return (
    <div className="ad-page" id="admin-dashboard-page">
      <PageHead title="Dashboard" sub="Store statistics at a glance" />
      <div className="ad-stats">
        {stats.map((s) => (
          <Link key={s.id} to={s.to} className="ad-stat" id={`admin-dashboard-stat-${s.id}`}>
            <span className="ad-stat-icon"><s.icon size={18} /></span>
            <strong>{s.value}</strong><p>{s.label}</p><small>More info ›</small>
          </Link>
        ))}
      </div>

      <div className="ad-grid-2">
        <Card title="Orders – last 30 days" id="admin-dashboard-orders-chart" actions={
          <Tabs idPrefix="admin-dashboard-chart" active={metric} onChange={setMetric} tabs={[{ key: 'amount', label: 'Amount' }, { key: 'orders', label: 'Count' }]} />
        }>
          <div className="ad-kpis"><span><b>{usd(totalAmount)}</b> revenue</span><span><b>{totalOrders}</b> orders</span></div>
          <BarChart data={days} format={metric === 'amount' ? usd : (v) => v} id="admin-dashboard-orders-bars" />
        </Card>
        <Card title="New customers – last 30 days" id="admin-dashboard-customers-chart">
          <div className="ad-kpis"><span><b>{newCust}</b> registrations</span></div>
          <BarChart data={data.customersByDay.map((d) => ({ label: short(d.day), value: d.n }))} color="var(--ad-lime-deep)" id="admin-dashboard-customers-bars" />
        </Card>
      </div>

      <div className="ad-grid-2">
        <Card title="Order totals" id="admin-dashboard-order-totals">
          <Table idPrefix="admin-dashboard-totals" rowKey={(r) => r.status} rows={[...data.totals, ...(data.totals.length ? [sumRow] : [])]} cols={[
            { k: 'status', label: 'Order status', render: (r) => (r.status === 'Total' ? <b>Total</b> : <Badge>{r.status}</Badge>) },
            ...[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all_time', 'All time']].map(([k, l]) => ({ k, label: l, className: 'num', render: (r) => usd(r[k]) })),
          ]} />
        </Card>
        <Card title="Incomplete orders" id="admin-dashboard-incomplete">
          <Table idPrefix="admin-dashboard-incomplete" rowKey={(r) => r.k} rows={[
            { k: 'unpaid', label: 'Total unpaid orders (pending payment status)', n: inc.unpaid, amount: inc.unpaid_amount, to: '/admin/orders?paymentStatus=Pending' },
            { k: 'not-shipped', label: 'Total not yet shipped orders', n: inc.not_shipped, amount: inc.not_shipped_amount, to: '/admin/orders?shippingStatus=NotYetShipped' },
            { k: 'pending', label: 'Total incomplete orders (pending order status)', n: inc.pending, amount: inc.pending_amount, to: '/admin/orders?orderStatus=Pending' },
          ]} cols={[
            { k: 'label', label: 'Item' }, { k: 'amount', label: 'Total', className: 'num', render: (r) => usd(r.amount) },
            { k: 'n', label: 'Count', render: (r) => <Link className="ad-link" id={`admin-dashboard-incomplete-${r.k}-view`} to={r.to}>{r.n} – view all</Link> },
          ]} />
        </Card>
      </div>

      <Card title="Latest orders" id="admin-dashboard-latest-orders" actions={<Link to="/admin/orders" className="ad-btn sm" id="admin-dashboard-view-all-orders">View all orders</Link>}>
        <Table idPrefix="admin-dashboard-latest" rows={data.latest} empty="No orders yet" cols={[
          { k: 'id', label: 'Order #', render: (r) => <Link className="ad-link" to={`/admin/orders/edit/${r.id}`} id={`admin-dashboard-order-${r.id}`}>{r.custom_number || r.id}</Link> },
          { k: 'order_status', label: 'Order status', render: (r) => <Badge>{r.order_status}</Badge> },
          { k: 'payment_status', label: 'Payment', render: (r) => <Badge>{r.payment_status}</Badge> },
          { k: 'customer_email', label: 'Customer' },
          { k: 'created_at', label: 'Created on', render: (r) => formatDate(r.created_at, true) },
          { k: 'total', label: 'Total', className: 'num', render: (r) => usd(r.total) },
        ]} />
      </Card>

      <div className="ad-grid-2">
        <Card title="Popular search keywords" id="admin-dashboard-keywords" actions={<Link to="/admin/search-terms" className="ad-btn sm" id="admin-dashboard-view-search-terms">View all</Link>}>
          <Table idPrefix="admin-dashboard-keywords" rowKey={(r) => r.term} rows={data.keywords} empty="No searches yet" cols={[{ k: 'term', label: 'Keyword' }, { k: 'count', label: 'Count', className: 'num' }]} />
        </Card>
        <Card title="Bestsellers" id="admin-dashboard-bestsellers" actions={
          <Tabs idPrefix="admin-dashboard-bestsellers" active={best} onChange={setBest} tabs={[{ key: 'qty', label: 'By quantity' }, { key: 'amount', label: 'By amount' }]} />
        }>
          <Table idPrefix={`admin-dashboard-best-${best}`} rowKey={(r) => r.product_id ?? r.product_name} rows={best === 'qty' ? data.bestQty : data.bestAmt} empty="No sales yet" cols={[
            { k: 'product_name', label: 'Product', render: (r) => (r.product_id ? <Link className="ad-link" to={`/admin/products/edit/${r.product_id}`}>{r.product_name}</Link> : r.product_name) },
            { k: 'qty', label: 'Quantity', className: 'num' }, { k: 'amount', label: 'Amount', className: 'num', render: (r) => usd(r.amount) },
          ]} />
        </Card>
      </div>
    </div>
  )
}

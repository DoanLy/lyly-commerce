import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, Download, Trash2, CreditCard, Ban, Truck, Printer, Save, Plus, PackageCheck, Send, Undo2, ChevronDown, Pencil, X } from 'lucide-react'
import {
  api, usd, formatDate, kebab, cx, useLoad, useUi, useAction, useLookups, PageHead, Card, Loading, ErrorBox, Badge, Table, Pager, Tabs,
  Field, Input, Toggle, Modal, toCsv, downloadText, splitCamel,
} from './ui.jsx'

// string multi-select (checkbox dropdown)
function CheckSelect({ id, options, value, onChange, placeholder = 'All' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="ad-checkselect" ref={ref}>
      <button type="button" id={id} className="ad-checkselect-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{value.length ? value.map(splitCamel).join(', ') : placeholder}</span><ChevronDown size={13} />
      </button>
      {open && (
        <div className="ad-checkselect-list" id={`${id}-options`}>
          {options.map((o) => (
            <label key={o} htmlFor={`${id}-${kebab(o)}`}>
              <input type="checkbox" id={`${id}-${kebab(o)}`} checked={value.includes(o)} onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} />{splitCamel(o)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const ORDER_CSV = [
  { k: 'custom_number', label: 'Order #' }, { k: 'created_at', label: 'Created on' }, { k: 'customer_email', label: 'Customer email' },
  { k: 'name', label: 'Customer name', get: (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() }, { k: 'order_status', label: 'Order status' },
  { k: 'payment_status', label: 'Payment status' }, { k: 'shipping_status', label: 'Shipping status' }, { k: 'payment_method_name', label: 'Payment method' }, { k: 'total', label: 'Order total' },
]

// ---------------- list ----------------
export function OrderList() {
  const p = 'admin-orders'
  const [sp] = useSearchParams()
  const { lookups } = useLookups()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const init = () => ({
    from: '', to: '', orderStatus: sp.get('orderStatus')?.split(',').filter(Boolean) || [], paymentStatus: sp.get('paymentStatus')?.split(',').filter(Boolean) || [],
    shippingStatus: sp.get('shippingStatus')?.split(',').filter(Boolean) || [], paymentMethod: '', email: '', lastName: '', number: '', productId: '', customerId: sp.get('customerId') || '',
  })
  const [f, setF] = useState(init)
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(15)
  const [selected, setSelected] = useState([])
  const methods = useLoad(() => api.get('/admin/e/payment_methods', { size: 100 }), [])
  useEffect(() => { const n = init(); setF(n); setApplied(n); setPage(1) }, [sp.toString()]) // eslint-disable-line react-hooks/exhaustive-deps
  const params = useMemo(() => {
    const o = { ...applied, page, size }
    for (const k of ['orderStatus', 'paymentStatus', 'shippingStatus']) o[k] = applied[k].join(',')
    return o
  }, [applied, page, size])
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/orders', params), [params])
  useEffect(() => { setSelected([]) }, [params])
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  const bulk = async (action, label) => {
    if (!selected.length) return
    if (!(await confirm(`${label} ${selected.length} selected order(s)?`, { danger: action === 'delete' || action === 'cancel', okText: label }))) return
    if (await run(() => api.post('/admin/orders/bulk', { action, ids: selected }), `${selected.length} order(s) processed`)) reload()
  }
  const exportCsv = async () => {
    const all = await run(() => api.get('/admin/orders', { ...params, page: 1, size: 500 }))
    if (all) downloadText('orders.csv', toCsv(all.rows, ORDER_CSV))
  }
  const s = data?.summary

  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title="Orders">
        <button type="button" className="ad-btn" id={`${p}-export`} onClick={exportCsv} disabled={busy}><Download size={15} />Export CSV</button>
      </PageHead>
      <Card className="ad-filter-card">
        <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f) }}>
          <div className="ad-field-inline"><label htmlFor={`${p}-from`}>Start date</label><input id={`${p}-from`} type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-to`}>End date</label><input id={`${p}-to`} type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-order-status`}>Order statuses</label><CheckSelect id={`${p}-order-status`} options={lookups.orderStatuses || []} value={f.orderStatus} onChange={set('orderStatus')} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-payment-status`}>Payment statuses</label><CheckSelect id={`${p}-payment-status`} options={lookups.paymentStatuses || []} value={f.paymentStatus} onChange={set('paymentStatus')} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-shipping-status`}>Shipping statuses</label><CheckSelect id={`${p}-shipping-status`} options={lookups.shippingStatuses || []} value={f.shippingStatus} onChange={set('shippingStatus')} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-payment-method`}>Payment method</label>
            <Input id={`${p}-payment-method`} type="select" value={f.paymentMethod} onChange={set('paymentMethod')} options={[['', 'All'], ...(methods.data?.rows || []).map((m) => [m.system_name, m.name])]} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-product`}>Product</label>
            <Input id={`${p}-product`} type="select" value={f.productId} onChange={set('productId')} options={[['', 'All'], ...(lookups.products || []).map((m) => [m.id, m.name])]} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-email`}>Billing email</label><input id={`${p}-email`} value={f.email} onChange={(e) => set('email')(e.target.value)} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-last-name`}>Billing last name</label><input id={`${p}-last-name`} value={f.lastName} onChange={(e) => set('lastName')(e.target.value)} /></div>
          <div className="ad-field-inline"><label htmlFor={`${p}-number`}>Order #</label><input id={`${p}-number`} value={f.number} onChange={(e) => set('number')(e.target.value)} /></div>
          <div className="ad-filter-buttons">
            <button type="submit" className="ad-btn primary" id={`${p}-search-button`}><Search size={14} />Search</button>
            <button type="button" className="ad-btn ghost" id={`${p}-reset`} onClick={() => { const n = { ...init(), orderStatus: [], paymentStatus: [], shippingStatus: [], customerId: '' }; setF(n); setApplied(n); setPage(1) }}>Reset</button>
          </div>
        </form>
        {applied.customerId && <p className="ad-muted">Filtered by customer #{applied.customerId}</p>}
      </Card>

      <Card>
        {selected.length > 0 && (
          <div className="ad-bulkbar" id={`${p}-bulkbar`}>
            <span>{selected.length} selected</span>
            <button type="button" className="ad-btn sm" id={`${p}-bulk-mark-paid`} disabled={busy} onClick={() => bulk('markPaid', 'Mark as paid')}><CreditCard size={13} />Mark as paid</button>
            <button type="button" className="ad-btn sm" id={`${p}-bulk-ship`} disabled={busy} onClick={() => bulk('ship', 'Ship all')}><Truck size={13} />Ship all</button>
            <button type="button" className="ad-btn sm danger" id={`${p}-bulk-cancel`} disabled={busy} onClick={() => bulk('cancel', 'Cancel')}><Ban size={13} />Cancel selected</button>
            <button type="button" className="ad-btn sm danger" id={`${p}-bulk-delete`} disabled={busy} onClick={() => bulk('delete', 'Delete')}><Trash2 size={13} />Delete selected</button>
          </div>
        )}
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <Table idPrefix={p} rowId={(r) => `admin-order-row-${r.id}`} rows={data?.rows} selectable selected={selected} onSelect={setSelected} empty="No orders found" cols={[
              { k: 'custom_number', label: 'Order #', render: (r) => <Link className="ad-link" to={`/admin/orders/edit/${r.id}`} id={`admin-order-link-${r.id}`}>{r.custom_number || r.id}</Link> },
              { k: 'order_status', label: 'Order status', render: (r) => <Badge>{r.order_status}</Badge> },
              { k: 'payment_status', label: 'Payment status', render: (r) => <Badge>{splitCamel(r.payment_status)}</Badge> },
              { k: 'shipping_status', label: 'Shipping status', render: (r) => <Badge>{splitCamel(r.shipping_status)}</Badge> },
              { k: 'customer_email', label: 'Customer', render: (r) => <span className="ad-two"><b>{`${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'}</b><small>{r.customer_email}</small></span> },
              { k: 'created_at', label: 'Created on', render: (r) => formatDate(r.created_at, true) },
              { k: 'total', label: 'Order total', className: 'num', render: (r) => usd(r.total) },
              { k: 'view', label: '', className: 'ad-actions-col', render: (r) => <Link to={`/admin/orders/edit/${r.id}`} className="ad-btn sm" id={`admin-order-view-${r.id}`}>View</Link> },
            ]} foot={s && data.rows.length > 0 && (
              <tfoot><tr className="ad-summary" id={`${p}-summary`}>
                <td colSpan={9}><span>Profit: <b id={`${p}-summary-profit`}>{usd(s.profit)}</b></span><span>Shipping: <b>{usd(s.shipping)}</b></span><span>Tax: <b id={`${p}-summary-tax`}>{usd(s.tax)}</b></span><span>Total: <b id={`${p}-summary-total`}>{usd(s.total)}</b></span></td>
              </tr></tfoot>
            )} />
            <Pager idPrefix={p} page={page} size={size} total={data?.total || 0} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------- detail ----------------
const TOTAL_FIELDS = [['subtotal', 'Order subtotal'], ['subtotal_discount', 'Order subtotal discount'], ['shipping_amount', 'Order shipping'], ['payment_fee', 'Payment method additional fee'], ['tax', 'Order tax'], ['order_discount', 'Order discount'], ['total', 'Order total']]
const ADDR = [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['company', 'Company'], ['country', 'Country'], ['state', 'State / province'], ['city', 'City'], ['address1', 'Address 1'], ['address2', 'Address 2'], ['zip', 'Zip / postal code'], ['phone', 'Phone number'], ['fax', 'Fax number']]

const Row = ({ label, children, id }) => <div className="ad-kv" id={id}><span>{label}</span><div>{children}</div></div>

export function OrderDetail() {
  const { id } = useParams()
  const p = 'admin-order'
  const nav = useNavigate()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const { lookups } = useLookups()
  const [tab, setTab] = useState('info')
  const [modal, setModal] = useState(null)
  const [print, setPrint] = useState(false)
  const { data: o, loading, error, reload, setData } = useLoad(() => api.get(`/admin/orders/${id}`), [id])

  const act = async (body, msg, ask) => {
    if (ask && !(await confirm(ask.text, ask))) return null
    const r = await run(() => api.post(`/admin/orders/${id}/action`, body), msg)
    if (r && body.action !== 'delete') setData(r)
    return r
  }
  if (error) return <div className="ad-page"><PageHead title="Order" back="/admin/orders" /><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !o) return <Loading />

  const remainingRefund = Math.round((o.total - o.refunded_amount) * 100) / 100
  const tabs = [
    { key: 'info', label: 'Info' }, { key: 'addresses', label: 'Billing & shipping' }, { key: 'products', label: 'Products', count: o.items.length },
    { key: 'shipments', label: 'Shipments', count: o.shipments.length }, { key: 'notes', label: 'Order notes', count: o.notes.length },
    { key: 'other', label: 'Gift cards & returns', count: o.purchasedGiftCards.length + o.returnRequests.length },
  ]
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title={`Edit order details – #${o.custom_number || o.id}`} back="/admin/orders" backLabel="back to order list">
        <button type="button" className="ad-btn" id={`${p}-print-invoice`} onClick={() => setPrint(true)}><Printer size={15} />Print / PDF invoice</button>
        <button type="button" className="ad-btn danger" id={`${p}-delete`} disabled={busy} onClick={async () => { if (await act({ action: 'delete' }, 'The order has been deleted', { text: 'Delete this order?' })) nav('/admin/orders') }}><Trash2 size={15} />Delete</button>
      </PageHead>
      <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix={`${p}-tab`} />

      {tab === 'info' && (
        <>
          <div className="ad-grid-2">
            <Card title="Status" id={`${p}-section-status`}>
              <Row label="Order status" id={`${p}-order-status`}><Badge>{o.order_status}</Badge>
                <StatusChanger id={`${p}-change-order-status`} options={lookups.orderStatuses || []} current={o.order_status} onApply={(s) => act({ action: 'setStatus', status: s }, 'Order status updated', s === 'Cancelled' ? { text: 'Cancel this order?' } : null)} /></Row>
              <Row label="Payment status" id={`${p}-payment-status`}><Badge>{splitCamel(o.payment_status)}</Badge>
                <StatusChanger id={`${p}-change-payment-status`} options={lookups.paymentStatuses || []} current={o.payment_status} onApply={(s) => act({ action: 'setPaymentStatus', status: s }, 'Payment status updated')} /></Row>
              <Row label="Shipping status" id={`${p}-shipping-status`}><Badge>{splitCamel(o.shipping_status)}</Badge></Row>
              <div className="ad-inline-actions wrap">
                {o.order_status !== 'Cancelled' && <button type="button" className="ad-btn danger sm" id={`${p}-cancel`} disabled={busy} onClick={() => act({ action: 'cancel' }, 'The order has been cancelled', { text: 'Cancel this order? Stock will be restored.' })}><Ban size={13} />Cancel order</button>}
                {['Pending', 'Authorized'].includes(o.payment_status) && o.order_status !== 'Cancelled' && <button type="button" className="ad-btn primary sm" id={`${p}-mark-paid`} disabled={busy} onClick={() => act({ action: 'markPaid' }, 'The order has been marked as paid')}><CreditCard size={13} />Mark as paid</button>}
                {['Paid', 'PartiallyRefunded'].includes(o.payment_status) && remainingRefund > 0 && <>
                  <button type="button" className="ad-btn sm" id={`${p}-refund`} disabled={busy} onClick={() => act({ action: 'refund' }, 'The order has been refunded', { text: `Refund the remaining ${usd(remainingRefund)}?`, okText: 'Refund' })}><Undo2 size={13} />Refund</button>
                  <button type="button" className="ad-btn sm" id={`${p}-partial-refund`} disabled={busy} onClick={() => setModal('refund')}><Undo2 size={13} />Partial refund</button>
                </>}
                {['Pending', 'Authorized'].includes(o.payment_status) && <button type="button" className="ad-btn sm" id={`${p}-void`} disabled={busy} onClick={() => act({ action: 'void' }, 'The payment has been voided', { text: 'Void this payment?' })}><X size={13} />Void</button>}
              </div>
            </Card>
            <Card title="Customer & payment" id={`${p}-section-customer`}>
              <Row label="Customer">{o.customer_id && !o.is_guest ? <Link className="ad-link" id={`${p}-customer-link`} to={`/admin/customers/edit/${o.customer_id}`}>{o.account_email || o.customer_email}</Link> : <span>{o.customer_email} <Badge tone="mute">Guest</Badge></span>}</Row>
              <Row label="Created on">{formatDate(o.created_at, true)}</Row>
              <Row label="Customer IP">{o.customer_ip || '—'}</Row>
              <Row label="Payment method">{o.payment_method_name || o.payment_method || '—'}</Row>
              {o.card_masked && <Row label="Card">{[o.card_type, o.card_name, o.card_masked].filter(Boolean).join(' · ')}</Row>}
              {o.paid_at && <Row label="Paid on">{formatDate(o.paid_at, true)}</Row>}
              <Row label="Shipping method">{o.pickup_in_store ? `Pickup: ${o.pickup_point?.name || ''}` : o.shipping_method || '—'}</Row>
              {o.checkout_attributes_desc && <Row label="Checkout attributes"><span className="ad-pre-line">{o.checkout_attributes_desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</span></Row>}
            </Card>
          </div>
          <Card title="Totals" id={`${p}-section-totals`} actions={<button type="button" className="ad-btn sm" id={`${p}-edit-totals`} onClick={() => setModal('totals')}><Pencil size={13} />Edit order totals</button>}>
            <div className="ad-totals">
              <Row label="Order subtotal">{usd(o.subtotal)}</Row>
              {o.subtotal_discount > 0 && <Row label="Subtotal discount">−{usd(o.subtotal_discount)}</Row>}
              <Row label="Shipping">{usd(o.shipping_amount)}</Row>
              {o.shipping_discount > 0 && <Row label="Shipping discount">−{usd(o.shipping_discount)}</Row>}
              {o.payment_fee > 0 && <Row label="Payment method fee">{usd(o.payment_fee)}</Row>}
              <Row label="Tax">{usd(o.tax)}</Row>
              {o.order_discount > 0 && <Row label="Order discount">−{usd(o.order_discount)}</Row>}
              {o.giftCardUsage.map((g) => <Row key={g.code} label={`Gift card (${g.code})`}>−{usd(g.used_value)}</Row>)}
              {o.reward_points_used > 0 && <Row label={`Reward points (${o.reward_points_used} pts)`}>−{usd(o.reward_points_amount)}</Row>}
              <Row label="Order total" id={`${p}-total`}><b>{usd(o.total)}</b></Row>
              {o.refunded_amount > 0 && <Row label="Refunded amount">{usd(o.refunded_amount)}</Row>}
            </div>
            {o.discounts.length > 0 && <p className="ad-muted">Discounts applied: {o.discounts.map((d) => `${d.name}${d.coupon_code ? ` (${d.coupon_code})` : ''}`).join(', ')}</p>}
          </Card>
          <AdminComment o={o} onSave={(c) => act({ action: 'adminComment', comment: c }, 'Admin comment saved')} busy={busy} />
        </>
      )}

      {tab === 'addresses' && (
        <div className="ad-grid-2">
          <AddressCard type="billing" o={o} lookups={lookups} busy={busy} onSave={(a) => act({ action: 'editAddress', type: 'billing', address: a }, 'Billing address updated')} />
          {o.shipping_address ? <AddressCard type="shipping" o={o} lookups={lookups} busy={busy} onSave={(a) => act({ action: 'editAddress', type: 'shipping', address: a }, 'Shipping address updated')} />
            : <Card title="Shipping address"><p className="ad-muted">{o.pickup_in_store ? `Pickup in store: ${o.pickup_point?.name || ''} ${o.pickup_point?.address || ''}` : 'Shipping not required.'}</p></Card>}
        </div>
      )}

      {tab === 'products' && <OrderItems o={o} act={act} busy={busy} />}
      {tab === 'shipments' && <OrderShipments o={o} reload={reload} setData={setData} />}
      {tab === 'notes' && <OrderNotes o={o} act={act} busy={busy} />}
      {tab === 'other' && (
        <>
          <Card title="Purchased gift cards" id={`${p}-section-gift-cards`}>
            <Table idPrefix={`${p}-gift-cards`} rows={o.purchasedGiftCards} empty="No gift cards were purchased with this order" cols={[
              { k: 'code', label: 'Code', render: (g) => <Link className="ad-link" to={`/admin/gift-cards/edit/${g.id}`}>{g.code}</Link> }, { k: 'gift_card_type', label: 'Type' },
              { k: 'amount', label: 'Amount', render: (g) => usd(g.amount) }, { k: 'is_activated', label: 'Activated', render: (g) => <Badge tone={g.is_activated ? 'ok' : 'mute'}>{g.is_activated ? 'Yes' : 'No'}</Badge> }, { k: 'recipient_email', label: 'Recipient' },
            ]} />
          </Card>
          <Card title="Return requests" id={`${p}-section-returns`}>
            <Table idPrefix={`${p}-returns`} rows={o.returnRequests} empty="No return requests" cols={[
              { k: 'custom_number', label: 'ID', render: (r) => <Link className="ad-link" to={`/admin/return-requests/edit/${r.id}`}>{r.custom_number || r.id}</Link> }, { k: 'quantity', label: 'Quantity' },
              { k: 'reason', label: 'Reason' }, { k: 'requested_action', label: 'Action' }, { k: 'status', label: 'Status', render: (r) => <Badge>{splitCamel(r.status)}</Badge> }, { k: 'created_at', label: 'Date', render: (r) => formatDate(r.created_at) },
            ]} />
          </Card>
        </>
      )}

      {modal === 'refund' && <RefundModal max={remainingRefund} onClose={() => setModal(null)} onSubmit={async (a) => { if (await act({ action: 'refund', amount: a }, `Refunded ${usd(a)}`)) setModal(null) }} />}
      {modal === 'totals' && <TotalsModal o={o} onClose={() => setModal(null)} onSubmit={async (values) => { if (await act({ action: 'editTotals', values }, 'Order totals updated')) setModal(null) }} />}
      {print && <Invoice o={o} onClose={() => setPrint(false)} />}
    </div>
  )
}

function StatusChanger({ id, options, current, onApply }) {
  const [v, setV] = useState(current)
  useEffect(() => setV(current), [current])
  return (
    <span className="ad-inline-actions">
      <label htmlFor={id} className="ad-sr">New status</label>
      <select id={id} value={v} onChange={(e) => setV(e.target.value)}>{options.map((s) => <option key={s} value={s}>{splitCamel(s)}</option>)}</select>
      <button type="button" className="ad-btn sm" id={`${id}-save`} disabled={v === current} onClick={() => onApply(v)}>Change</button>
    </span>
  )
}

function AdminComment({ o, onSave, busy }) {
  const [c, setC] = useState(o.admin_comment || '')
  return (
    <Card title="Admin comment" id="admin-order-section-comment">
      <label htmlFor="admin-order-admin-comment" className="ad-sr">Admin comment</label>
      <textarea id="admin-order-admin-comment" rows={3} value={c} onChange={(e) => setC(e.target.value)} placeholder="Internal comment (not visible to the customer)" />
      <button type="button" className="ad-btn sm" id="admin-order-admin-comment-save" disabled={busy} onClick={() => onSave(c)}><Save size={13} />Save comment</button>
    </Card>
  )
}

function AddressCard({ type, o, lookups, onSave, busy }) {
  const src = (type === 'billing' ? o.billing_address : o.shipping_address) || {}
  const [edit, setEdit] = useState(false)
  const [a, setA] = useState(src)
  useEffect(() => setA(src), [o]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = `admin-order-${type}-address`
  return (
    <Card title={`${type === 'billing' ? 'Billing' : 'Shipping'} address`} id={p} actions={!edit && <button type="button" className="ad-btn sm" id={`${p}-edit`} onClick={() => setEdit(true)}><Pencil size={13} />Edit</button>}>
      {edit ? (
        <>
          <div className="ad-form">
            {ADDR.map(([k, l]) => (
              <Field key={k} id={`${p}-${kebab(k)}`} label={l}>
                {k === 'country' ? (
                  <select id={`${p}-${kebab(k)}`} value={a.countryId || ''} onChange={(e) => { const c = (lookups.countries || []).find((x) => x.id === Number(e.target.value)); setA({ ...a, countryId: c?.id || null, country: c?.name || '' }) }}>
                    <option value="">Select country</option>{(lookups.countries || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : <input id={`${p}-${kebab(k)}`} value={a[k] || ''} onChange={(e) => setA({ ...a, [k]: e.target.value })} />}
              </Field>
            ))}
          </div>
          <div className="ad-inline-actions">
            <button type="button" className="ad-btn primary sm" id={`${p}-save`} disabled={busy} onClick={async () => { if (await onSave(a)) setEdit(false) }}><Save size={13} />Save</button>
            <button type="button" className="ad-btn sm ghost" id={`${p}-cancel`} onClick={() => { setA(src); setEdit(false) }}>Cancel</button>
          </div>
        </>
      ) : (
        <address className="ad-address" id={`${p}-view`}>
          <b>{src.firstName} {src.lastName}</b>{src.company && <span>{src.company}</span>}<span>{src.address1}</span>{src.address2 && <span>{src.address2}</span>}
          <span>{[src.city, src.state, src.zip].filter(Boolean).join(', ')}</span><span>{src.country}</span>{src.email && <span>{src.email}</span>}{src.phone && <span>Phone: {src.phone}</span>}
        </address>
      )}
    </Card>
  )
}

function OrderItems({ o, act, busy }) {
  const p = 'admin-order-items'
  const [edits, setEdits] = useState({})
  const val = (it, k) => edits[it.id]?.[k] ?? (k === 'quantity' ? it.quantity : it.unit_price)
  const setE = (it, k, v) => setEdits((e) => ({ ...e, [it.id]: { ...e[it.id], [k]: v } }))
  return (
    <Card title="Products" id={`${p}-section`}>
      <Table idPrefix={p} rows={o.items} cols={[
        { k: 'product_name', label: 'Product', render: (it) => <span className="ad-two"><b>{it.product_id ? <Link className="ad-link" to={`/admin/products/edit/${it.product_id}`}>{it.product_name}</Link> : it.product_name}</b>
          {it.sku && <small>SKU: {it.sku}</small>}{it.attributes_desc && <small className="ad-pre-line">{it.attributes_desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</small>}</span> },
        { k: 'unit_price', label: 'Price', render: (it) => <><label className="ad-sr" htmlFor={`${p}-${it.id}-price`}>Unit price</label><Input id={`${p}-${it.id}-price`} type="money" value={val(it, 'unit_price')} onChange={(v) => setE(it, 'unit_price', v)} /></> },
        { k: 'quantity', label: 'Quantity', render: (it) => <><label className="ad-sr" htmlFor={`${p}-${it.id}-quantity`}>Quantity</label><Input id={`${p}-${it.id}-quantity`} type="int" min={0} value={val(it, 'quantity')} onChange={(v) => setE(it, 'quantity', v)} /></> },
        { k: 'discount_amount', label: 'Discount', render: (it) => usd(it.discount_amount) },
        { k: 'price', label: 'Total', className: 'num', render: (it) => usd(it.price) },
        { k: 'shipped_qty', label: 'Shipped', render: (it) => (it.is_download ? 'Download' : `${it.shipped_qty} / ${it.quantity}`) },
        { k: 'actions', label: '', className: 'ad-actions-col', render: (it) => (
          <div className="ad-row-actions">
            <button type="button" className="ad-btn sm" id={`${p}-${it.id}-save`} disabled={busy || !edits[it.id]} onClick={async () => { if (await act({ action: 'editItem', itemId: it.id, quantity: val(it, 'quantity'), unitPrice: val(it, 'unit_price') }, 'Order item updated')) setEdits((e) => { const n = { ...e }; delete n[it.id]; return n }) }}><Save size={13} />Save</button>
            <button type="button" className="ad-icon-btn danger" id={`${p}-${it.id}-delete`} aria-label="Delete item" disabled={busy} onClick={() => act({ action: 'editItem', itemId: it.id, quantity: 0 }, 'Order item deleted', { text: `Delete "${it.product_name}" from this order?` })}><Trash2 size={14} /></button>
          </div>
        ) },
      ]} />
      <p className="ad-muted">Editing an item recalculates the order subtotal and total. Stock is adjusted for products with inventory tracking.</p>
    </Card>
  )
}

function OrderShipments({ o, reload, setData }) {
  const p = 'admin-order-shipments'
  const [run, busy] = useAction()
  const { confirm } = useUi()
  const [adding, setAdding] = useState(false)
  const shippable = o.items.filter((i) => !i.is_download && i.quantity - i.shipped_qty > 0)
  const [qty, setQty] = useState({})
  const [tracking, setTracking] = useState('')
  const [comment, setComment] = useState('')
  const [shipNow, setShipNow] = useState(true)
  const sAct = async (s, action, msg, ask) => {
    if (ask && !(await confirm(ask))) return
    if (await run(() => api.post(`/admin/shipments/${s.id}/action`, { action }), msg)) reload()
  }
  const create = async () => {
    const items = shippable.map((i) => ({ orderItemId: i.id, quantity: Number(qty[i.id] ?? i.quantity - i.shipped_qty) || 0 })).filter((x) => x.quantity > 0)
    if (!items.length) return run(() => Promise.reject(new Error('Enter a quantity to ship for at least one product')))
    const r = await run(() => api.post(`/admin/orders/${o.id}/shipments`, { items, trackingNumber: tracking, adminComment: comment, ship: shipNow }), 'The shipment has been added')
    if (r) { setData(r); setAdding(false); setQty({}); setTracking(''); setComment('') }
  }
  return (
    <Card title="Shipments" id={`${p}-section`} actions={shippable.length > 0 && !adding && <button type="button" className="ad-btn primary sm" id={`${p}-add`} onClick={() => setAdding(true)}><Plus size={13} />Add shipment</button>}>
      {adding && (
        <div className="ad-subcard" id={`${p}-new`}>
          <div className="ad-subcard-head"><b>New shipment</b></div>
          <Table idPrefix={`${p}-new`} rows={shippable} cols={[
            { k: 'product_name', label: 'Product' }, { k: 'remaining', label: 'Qty remaining', render: (i) => i.quantity - i.shipped_qty },
            { k: 'qty', label: 'Qty to ship', render: (i) => <><label className="ad-sr" htmlFor={`${p}-new-${i.id}-qty`}>Quantity to ship</label><Input id={`${p}-new-${i.id}-qty`} type="int" min={0} value={qty[i.id] ?? i.quantity - i.shipped_qty} onChange={(v) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(v ?? 0, i.quantity - i.shipped_qty)) })} /></> },
          ]} />
          <div className="ad-form">
            <Field id={`${p}-new-tracking`} label="Tracking number"><Input id={`${p}-new-tracking`} value={tracking} onChange={setTracking} /></Field>
            <Field id={`${p}-new-comment`} label="Admin comment"><Input id={`${p}-new-comment`} type="textarea" rows={2} value={comment} onChange={setComment} /></Field>
            <Field id={`${p}-new-ship`} label="Mark as shipped now"><Toggle id={`${p}-new-ship`} checked={shipNow} onChange={setShipNow} /></Field>
          </div>
          <div className="ad-inline-actions">
            <button type="button" className="ad-btn primary sm" id={`${p}-new-save`} disabled={busy} onClick={create}><Save size={13} />Save shipment</button>
            <button type="button" className="ad-btn sm ghost" id={`${p}-new-cancel`} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      <Table idPrefix={p} rows={o.shipments} empty="No shipments yet" cols={[
        { k: 'id', label: 'Shipment #', render: (s) => <Link className="ad-link" id={`${p}-${s.id}-link`} to={`/admin/shipments/edit/${s.id}`}>#{s.id}</Link> },
        { k: 'tracking_number', label: 'Tracking number', render: (s) => s.tracking_number || '—' }, { k: 'items', label: 'Items' }, { k: 'total_weight', label: 'Weight' },
        { k: 'shipped_at', label: 'Date shipped', render: (s) => (s.shipped_at ? formatDate(s.shipped_at, true) : <button type="button" className="ad-btn sm" id={`${p}-${s.id}-ship`} disabled={busy} onClick={() => sAct(s, 'ship', 'Marked as shipped')}><Send size={12} />Set as shipped</button>) },
        { k: 'delivered_at', label: 'Date delivered', render: (s) => (s.delivered_at ? formatDate(s.delivered_at, true) : <button type="button" className="ad-btn sm" id={`${p}-${s.id}-deliver`} disabled={busy} onClick={() => sAct(s, 'deliver', 'Marked as delivered')}><PackageCheck size={12} />Set as delivered</button>) },
        { k: 'del', label: '', className: 'ad-actions-col', render: (s) => <button type="button" className="ad-icon-btn danger" id={`${p}-${s.id}-delete`} aria-label="Delete shipment" onClick={() => sAct(s, 'delete', 'The shipment has been deleted', `Delete shipment #${s.id}?`)}><Trash2 size={14} /></button> },
      ]} />
    </Card>
  )
}

function OrderNotes({ o, act, busy }) {
  const p = 'admin-order-notes'
  const [note, setNote] = useState('')
  const [display, setDisplay] = useState(false)
  return (
    <Card title="Order notes" id={`${p}-section`}>
      <Table idPrefix={p} rows={o.notes} empty="No notes" cols={[
        { k: 'created_at', label: 'Created on', render: (n) => formatDate(n.created_at, true) }, { k: 'note', label: 'Note', render: (n) => <span className="ad-wrap">{n.note}</span> },
        { k: 'display_to_customer', label: 'Display to customer', render: (n) => <Badge tone={n.display_to_customer ? 'ok' : 'mute'}>{n.display_to_customer ? 'Yes' : 'No'}</Badge> },
        { k: 'del', label: '', className: 'ad-actions-col', render: (n) => <button type="button" className="ad-icon-btn danger" id={`${p}-${n.id}-delete`} aria-label="Delete note" onClick={() => act({ action: 'deleteNote', noteId: n.id }, 'The note has been deleted', { text: 'Delete this note?' })}><Trash2 size={14} /></button> },
      ]} />
      <div className="ad-subcard" id={`${p}-add-section`}>
        <div className="ad-subcard-head"><b>Add order note</b></div>
        <div className="ad-form">
          <Field id={`${p}-new`} label="Note"><Input id={`${p}-new`} type="textarea" rows={3} value={note} onChange={setNote} /></Field>
          <Field id={`${p}-new-display`} label="Display to customer"><Toggle id={`${p}-new-display`} checked={display} onChange={setDisplay} /></Field>
        </div>
        <button type="button" className="ad-btn primary sm" id={`${p}-add`} disabled={busy || !note.trim()} onClick={async () => { if (await act({ action: 'note', note, displayToCustomer: display }, 'The note has been added')) { setNote(''); setDisplay(false) } }}><Plus size={13} />Add order note</button>
      </div>
    </Card>
  )
}

function RefundModal({ max, onClose, onSubmit }) {
  const [a, setA] = useState(max)
  return (
    <Modal title="Partial refund" id="admin-order-refund-modal" onClose={onClose} footer={<>
      <button type="button" className="ad-btn" id="admin-order-refund-cancel" onClick={onClose}>Cancel</button>
      <button type="button" className="ad-btn primary" id="admin-order-refund-submit" disabled={!(a > 0 && a <= max)} onClick={() => onSubmit(a)}>Refund</button>
    </>}>
      <Field id="admin-order-refund-amount" label="Amount to refund" hint={`Maximum ${usd(max)}`}><Input id="admin-order-refund-amount" type="money" value={a} onChange={setA} /></Field>
    </Modal>
  )
}

function TotalsModal({ o, onClose, onSubmit }) {
  const [v, setV] = useState(Object.fromEntries(TOTAL_FIELDS.map(([k]) => [k, o[k]])))
  return (
    <Modal title="Edit order totals" id="admin-order-totals-modal" onClose={onClose} footer={<>
      <button type="button" className="ad-btn" id="admin-order-totals-cancel" onClick={onClose}>Cancel</button>
      <button type="button" className="ad-btn primary" id="admin-order-totals-save" onClick={() => onSubmit(v)}>Save</button>
    </>}>
      <div className="ad-form">
        {TOTAL_FIELDS.map(([k, l]) => <Field key={k} id={`admin-order-totals-${kebab(k)}`} label={l}><Input id={`admin-order-totals-${kebab(k)}`} type="money" value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} /></Field>)}
      </div>
    </Modal>
  )
}

export function PrintFrame({ title, onClose, children, id }) {
  return (
    <div className="ad-print-overlay" id={id}>
      <div className="ad-print-bar ad-no-print">
        <b>{title}</b>
        <button type="button" className="ad-btn primary" id={`${id}-print`} onClick={() => window.print()}><Printer size={15} />Print</button>
        <button type="button" className="ad-btn" id={`${id}-close`} onClick={onClose}>Close</button>
      </div>
      <div className="ad-print">{children}</div>
    </div>
  )
}

const addrLines = (a) => (a ? [`${a.firstName || ''} ${a.lastName || ''}`.trim(), a.company, a.address1, a.address2, [a.city, a.state, a.zip].filter(Boolean).join(', '), a.country, a.phone].filter(Boolean) : [])

function Invoice({ o, onClose }) {
  return (
    <PrintFrame title={`Invoice – order #${o.custom_number || o.id}`} onClose={onClose} id="admin-order-invoice">
      <header className="ad-print-head"><div><h1>LyLy Commerce</h1><p>Invoice</p></div><div><b>Order #{o.custom_number || o.id}</b><p>{formatDate(o.created_at, true)}</p><p>{o.payment_method_name}</p></div></header>
      <div className="ad-print-cols">
        <div><h3>Billing address</h3>{addrLines(o.billing_address).map((l, i) => <p key={i}>{l}</p>)}</div>
        <div><h3>Shipping address</h3>{o.shipping_address ? addrLines(o.shipping_address).map((l, i) => <p key={i}>{l}</p>) : <p>{o.pickup_in_store ? 'Pickup in store' : 'Not required'}</p>}</div>
      </div>
      <table className="ad-print-table">
        <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>{o.items.map((it) => <tr key={it.id}><td>{it.product_name}<small>{(it.attributes_desc || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '')}</small></td><td>{it.sku}</td><td>{usd(it.unit_price)}</td><td>{it.quantity}</td><td>{usd(it.price)}</td></tr>)}</tbody>
      </table>
      <div className="ad-print-totals">
        <p><span>Subtotal</span><b>{usd(o.subtotal)}</b></p>
        {o.subtotal_discount + o.order_discount > 0 && <p><span>Discount</span><b>−{usd(o.subtotal_discount + o.order_discount)}</b></p>}
        <p><span>Shipping</span><b>{usd(o.shipping_amount)}</b></p>{o.payment_fee > 0 && <p><span>Payment fee</span><b>{usd(o.payment_fee)}</b></p>}<p><span>Tax</span><b>{usd(o.tax)}</b></p>
        {o.gift_card_amount > 0 && <p><span>Gift cards</span><b>−{usd(o.gift_card_amount)}</b></p>}{o.reward_points_amount > 0 && <p><span>Reward points</span><b>−{usd(o.reward_points_amount)}</b></p>}
        <p className="grand"><span>Order total</span><b>{usd(o.total)}</b></p>
      </div>
    </PrintFrame>
  )
}

// ---------------- shipment detail ----------------
export function ShipmentDetail() {
  const { id } = useParams()
  const p = 'admin-shipment'
  const nav = useNavigate()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const [tracking, setTracking] = useState('')
  const [print, setPrint] = useState(false)
  const { data: s, loading, error, reload } = useLoad(() => api.get(`/admin/shipments/${id}`), [id])
  useEffect(() => { if (s) setTracking(s.tracking_number || '') }, [s])
  const act = async (action, msg, extra = {}) => { if (await run(() => api.post(`/admin/shipments/${id}/action`, { action, ...extra }), msg)) reload() }
  if (error) return <div className="ad-page"><PageHead title="Shipment" back="/admin/shipments" /><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !s) return <Loading />
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title={`Shipment #${s.id} – order #${s.custom_number || s.order_id}`} back="/admin/shipments" backLabel="back to shipment list">
        <button type="button" className="ad-btn" id={`${p}-packaging-slip`} onClick={() => setPrint(true)}><Printer size={15} />Print packaging slip</button>
        <button type="button" className="ad-btn danger" id={`${p}-delete`} disabled={busy} onClick={async () => { if (!(await confirm('Delete this shipment?'))) return; if (await run(() => api.post(`/admin/shipments/${id}/action`, { action: 'delete' }), 'The shipment has been deleted')) nav('/admin/shipments') }}><Trash2 size={15} />Delete</button>
      </PageHead>
      <div className="ad-grid-2">
        <Card title="Shipment info" id={`${p}-section-info`}>
          <Row label="Order"><Link className="ad-link" id={`${p}-order-link`} to={`/admin/orders/edit/${s.order_id}`}>#{s.custom_number || s.order_id}</Link></Row>
          <Row label="Shipping method">{s.shipping_method || '—'}</Row>
          <Row label="Total weight">{s.total_weight} kg</Row>
          <Row label="Tracking number">
            <span className="ad-input-group"><label htmlFor={`${p}-tracking`} className="ad-sr">Tracking number</label><input id={`${p}-tracking`} value={tracking} onChange={(e) => setTracking(e.target.value)} />
              <button type="button" className="ad-btn sm" id={`${p}-tracking-save`} disabled={busy || tracking === (s.tracking_number || '')} onClick={() => act('tracking', 'Tracking number saved', { trackingNumber: tracking })}><Save size={13} />Save</button></span>
          </Row>
          <Row label="Date shipped">{s.shipped_at ? formatDate(s.shipped_at, true) : <button type="button" className="ad-btn sm primary" id={`${p}-ship`} disabled={busy} onClick={() => act('ship', 'Marked as shipped')}><Send size={13} />Set as shipped</button>}</Row>
          <Row label="Date delivered">{s.delivered_at ? formatDate(s.delivered_at, true) : <button type="button" className="ad-btn sm primary" id={`${p}-deliver`} disabled={busy} onClick={() => act('deliver', 'Marked as delivered')}><PackageCheck size={13} />Set as delivered</button>}</Row>
          {s.admin_comment && <Row label="Admin comment">{s.admin_comment}</Row>}
        </Card>
        <Card title="Shipping address" id={`${p}-section-address`}>
          <address className="ad-address">{addrLines(s.shipping_address).map((l, i) => <span key={i}>{l}</span>)}</address>
        </Card>
      </div>
      <Card title="Products" id={`${p}-section-items`}>
        <Table idPrefix={`${p}-items`} rowKey={(r) => `${r.product_name}-${r.sku}`} rows={s.items} cols={[{ k: 'product_name', label: 'Product' }, { k: 'sku', label: 'SKU' }, { k: 'quantity', label: 'Qty shipped', className: 'num' }]} />
      </Card>
      {print && (
        <PrintFrame title="Packaging slip" onClose={() => setPrint(false)} id={`${p}-slip`}>
          <header className="ad-print-head"><div><h1>LyLy Commerce</h1><p>Packaging slip</p></div><div><b>Shipment #{s.id}</b><p>Order #{s.custom_number || s.order_id}</p><p>{s.shipping_method}</p></div></header>
          <div className="ad-print-cols"><div><h3>Ship to</h3>{addrLines(s.shipping_address).map((l, i) => <p key={i}>{l}</p>)}</div><div><h3>Tracking</h3><p>{s.tracking_number || '—'}</p></div></div>
          <table className="ad-print-table"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th></tr></thead>
            <tbody>{s.items.map((it, i) => <tr key={i}><td>{it.product_name}<small>{(it.attributes_desc || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '')}</small></td><td>{it.sku}</td><td>{it.quantity}</td></tr>)}</tbody></table>
        </PrintFrame>
      )}
    </div>
  )
}

export { cx }

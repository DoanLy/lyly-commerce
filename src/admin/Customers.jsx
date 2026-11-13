import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, Pencil, Mail, Download, ChevronRight, ChevronDown, Award } from 'lucide-react'
import {
  api, usd, formatDate, useLoad, useUi, useAction, useLookups, PageHead, Card, Loading, ErrorBox, Badge, BoolBadge, Table, Pager, Tabs,
  Field, Input, Modal, MultiPicker, toCsv, downloadText, splitCamel, Empty,
} from './ui.jsx'
import { FormFields, EditButtons } from './EntityPage.jsx'

// ---------------- list ----------------
export function CustomerList({ online }) {
  const p = online ? 'admin-online-customers' : 'admin-customers'
  const { lookups } = useLookups()
  const [run, busy] = useAction()
  const [f, setF] = useState({ email: '', name: '', company: '', phone: '', roleId: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(15)
  const params = useMemo(() => ({ ...applied, page, size, ...(online ? { online: 'true', guests: 'true' } : {}) }), [applied, page, size, online])
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/customers', params), [params])
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const name = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim()
  const exportCsv = async () => {
    const all = await run(() => api.get('/admin/customers', { ...params, page: 1, size: 500 }))
    if (all) downloadText('customers.csv', toCsv(all.rows, [{ k: 'email' }, { k: 'name', get: name }, { k: 'company' }, { k: 'phone' }, { k: 'roles' }, { k: 'orders' }, { k: 'active' }, { k: 'created_at' }]))
  }
  const cols = online ? [
    { k: 'email', label: 'Customer info', render: (r) => (r.is_guest ? <span>Guest #{r.id}</span> : <Link className="ad-link" to={`/admin/customers/edit/${r.id}`}>{r.email}</Link>) },
    { k: 'last_ip', label: 'IP address' }, { k: 'last_activity_at', label: 'Last activity', render: (r) => formatDate(r.last_activity_at, true) },
    { k: 'last_page', label: 'Last visited page', render: (r) => <span className="ad-trunc">{r.last_page || '—'}</span> },
  ] : [
    { k: 'email', label: 'Email', render: (r) => <Link className="ad-link" to={`/admin/customers/edit/${r.id}`} id={`admin-customer-email-${r.id}`}>{r.email}</Link> },
    { k: 'name', label: 'Name', render: name }, { k: 'roles', label: 'Customer roles' }, { k: 'company', label: 'Company' }, { k: 'phone', label: 'Phone' },
    { k: 'orders', label: 'Orders', className: 'num' }, { k: 'active', label: 'Active', render: (r) => <BoolBadge v={r.active} /> },
    { k: 'created_at', label: 'Registered on', render: (r) => formatDate(r.created_at) },
    { k: 'edit', label: '', className: 'ad-actions-col', render: (r) => <Link to={`/admin/customers/edit/${r.id}`} className="ad-btn sm" id={`admin-customer-edit-${r.id}`}><Pencil size={13} />Edit</Link> },
  ]
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title={online ? 'Online customers' : 'Customers'} sub={online ? 'Customers active in the last 20 minutes' : undefined}>
        {!online && <Link to="/admin/customers/create" className="ad-btn primary" id={`${p}-add-new`}><Plus size={15} />Add new</Link>}
        <button type="button" className="ad-btn" id={`${p}-export`} onClick={exportCsv} disabled={busy}><Download size={15} />Export CSV</button>
      </PageHead>
      {!online && (
        <Card className="ad-filter-card">
          <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(f) }}>
            {[['email', 'Email'], ['name', 'Name'], ['company', 'Company'], ['phone', 'Phone']].map(([k, l]) => (
              <div className="ad-field-inline" key={k}><label htmlFor={`${p}-search-${k}`}>{l}</label><input id={`${p}-search-${k}`} value={f[k]} onChange={(e) => set(k)(e.target.value)} /></div>
            ))}
            <div className="ad-field-inline"><label htmlFor={`${p}-search-role`}>Customer role</label>
              <Input id={`${p}-search-role`} type="select" value={f.roleId} onChange={set('roleId')} options={[['', 'All'], ...(lookups.roles || []).map((r) => [r.id, r.name])]} /></div>
            <button type="submit" className="ad-btn primary" id={`${p}-search-button`}><Search size={14} />Search</button>
          </form>
        </Card>
      )}
      <Card>
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <Table idPrefix={p} rowId={(r) => `admin-customer-row-${r.id}`} rows={data?.rows} cols={cols} empty={online ? 'No customers online' : 'No customers found'} />
            <Pager idPrefix={p} page={page} size={size} total={data?.total || 0} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------- edit ----------------
const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra })
const FIELDS = [
  F('email', 'Email', 'email', { required: true }), F('password', 'Password', 'password', { hint: 'Leave empty to keep the current password' }),
  F('first_name', 'First name'), F('last_name', 'Last name'), F('gender', 'Gender', 'select', { options: [['', 'Not specified'], ['M', 'Male'], ['F', 'Female']] }),
  F('dob', 'Date of birth', 'date'), F('company', 'Company name'), F('phone', 'Phone'), F('newsletter', 'Newsletter', 'bool'), F('active', 'Active', 'bool'),
]

export function CustomerEdit() {
  const { id } = useParams()
  const isNew = !id
  const p = 'admin-customer'
  const nav = useNavigate()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const { lookups } = useLookups()
  const [tab, setTab] = useState('info')
  const [row, setRow] = useState(null)
  const [mail, setMail] = useState(false)
  const { data, loading, error, reload } = useLoad(() => (id ? api.get(`/admin/customers/${id}`) : Promise.resolve(null)), [id])
  useEffect(() => {
    if (data) setRow({ ...data, password: '' })
    else if (isNew && lookups.roles) setRow({ email: '', password: '', active: true, newsletter: false, roleIds: lookups.roles.filter((r) => r.system_name === 'Registered').map((r) => r.id), admin_comment: '' })
  }, [data, isNew, lookups.roles])
  const set = (k, v) => setRow((r) => ({ ...r, [k]: v }))

  const save = async (cont) => {
    const res = await run(() => (isNew ? api.post('/admin/customers', row) : api.put(`/admin/customers/${id}`, row)), `The customer has been ${isNew ? 'added' : 'updated'} successfully.`)
    if (!res) return
    if (!cont) return nav('/admin/customers')
    if (isNew) nav(`/admin/customers/edit/${res.id}`, { replace: true }); else reload()
  }
  const del = async () => {
    if (!(await confirm('Delete this customer?'))) return
    if (await run(() => api.del(`/admin/customers/${id}`), 'The customer has been deleted.')) nav('/admin/customers')
  }

  if (error) return <div className="ad-page"><PageHead title="Customer" back="/admin/customers" /><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !row) return <Loading />
  const balance = data?.rewardPoints?.[0]?.points_balance ?? 0
  const tabs = [
    { key: 'info', label: 'Customer info' },
    ...(isNew ? [] : [
      { key: 'orders', label: 'Orders', count: data.orders.length }, { key: 'addresses', label: 'Addresses', count: data.addresses.length },
      { key: 'cart', label: 'Shopping cart & wishlist', count: data.cart.length + data.wishlist.length }, { key: 'activity', label: 'Activity log' },
      { key: 'points', label: 'Reward points' }, { key: 'bis', label: 'Back in stock subscriptions', count: data.backInStock.length },
    ]),
  ]
  return (
    <div className="ad-page" id={`${p}-edit-page`}>
      <PageHead title={isNew ? 'Add a new customer' : `Edit customer details – ${data.email || `Guest #${data.id}`}`} back="/admin/customers" backLabel="back to customer list">
        {!isNew && data.email && <button type="button" className="ad-btn" id={`${p}-send-email`} onClick={() => setMail(true)}><Mail size={15} />Send email</button>}
        {!isNew && <Link className="ad-btn" id={`${p}-view-orders`} to={`/admin/orders?customerId=${id}`}>View orders</Link>}
        <EditButtons prefix={p} busy={busy} onSave={save} onDelete={!isNew ? del : null} />
      </PageHead>
      <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix={`${p}-tab`} />
      {tab === 'info' && (
        <form onSubmit={(e) => { e.preventDefault(); save(false) }}>
          <Card title="Customer info" id={`${p}-section-info`}>
            <div className="ad-form">
              <FormFields fields={FIELDS.map((x) => (x.k === 'password' && isNew ? { ...x, hint: undefined, required: true } : x))} row={row} set={set} prefix={p} lookups={lookups} />
              <Field id={`${p}-roles`} label="Customer roles" required><MultiPicker id={`${p}-roles`} options={lookups.roles || []} value={row.roleIds || []} onChange={(v) => set('roleIds', v)} /></Field>
              <FormFields fields={[F('admin_comment', 'Admin comment', 'textarea')]} row={row} set={set} prefix={p} lookups={lookups} />
            </div>
            {!isNew && (
              <div className="ad-meta" id={`${p}-meta`}>
                <span>Registered: <b>{formatDate(data.created_at, true)}</b></span><span>Last login: <b>{formatDate(data.last_login_at, true) || '—'}</b></span>
                <span>Last activity: <b>{formatDate(data.last_activity_at, true)}</b></span><span>Last IP: <b>{data.last_ip || '—'}</b></span>
              </div>
            )}
          </Card>
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      )}
      {tab === 'orders' && (
        <Card title="Orders" id={`${p}-section-orders`}>
          <Table idPrefix={`${p}-orders`} rows={data.orders} empty="No orders" cols={[
            { k: 'custom_number', label: 'Order #', render: (o) => <Link className="ad-link" to={`/admin/orders/edit/${o.id}`} id={`${p}-order-${o.id}`}>{o.custom_number || o.id}</Link> },
            { k: 'order_status', label: 'Order status', render: (o) => <Badge>{o.order_status}</Badge> }, { k: 'payment_status', label: 'Payment', render: (o) => <Badge>{splitCamel(o.payment_status)}</Badge> },
            { k: 'shipping_status', label: 'Shipping', render: (o) => <Badge>{splitCamel(o.shipping_status)}</Badge> }, { k: 'total', label: 'Total', className: 'num', render: (o) => usd(o.total) },
            { k: 'created_at', label: 'Created on', render: (o) => formatDate(o.created_at, true) },
          ]} />
        </Card>
      )}
      {tab === 'addresses' && (
        <Card title="Addresses" id={`${p}-section-addresses`}>
          <Table idPrefix={`${p}-addresses`} rows={data.addresses} empty="No addresses" cols={[
            { k: 'name', label: 'Name', render: (a) => `${a.first_name} ${a.last_name}` }, { k: 'email', label: 'Email' }, { k: 'phone', label: 'Phone' }, { k: 'company', label: 'Company' },
            { k: 'address', label: 'Address', render: (a) => [a.address1, a.address2, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ') },
          ]} />
        </Card>
      )}
      {tab === 'cart' && (
        <div className="ad-grid-2">
          {[['cart', 'Shopping cart'], ['wishlist', 'Wishlist']].map(([k, l]) => (
            <Card key={k} title={l} id={`${p}-section-${k}`}>
              <Table idPrefix={`${p}-${k}`} rows={data[k]} empty={`${l} is empty`} cols={[
                { k: 'name', label: 'Product', render: (i) => <Link className="ad-link" to={`/admin/products/edit/${i.product_id}`}>{i.name}</Link> }, { k: 'quantity', label: 'Qty', className: 'num' },
                { k: 'attributes_desc', label: 'Attributes', render: (i) => (i.attributes_desc || '').replace(/<[^>]+>/g, ' ') }, { k: 'updated_at', label: 'Updated', render: (i) => formatDate(i.updated_at, true) },
              ]} />
            </Card>
          ))}
        </div>
      )}
      {tab === 'activity' && (
        <Card title="Activity log" id={`${p}-section-activity`}>
          <Table idPrefix={`${p}-activity`} rows={data.activity} empty="No activity" cols={[
            { k: 'type', label: 'Activity type', render: (a) => <Badge tone="mute">{a.type}</Badge> }, { k: 'comment', label: 'Comment' }, { k: 'ip', label: 'IP address' }, { k: 'created_at', label: 'Created on', render: (a) => formatDate(a.created_at, true) },
          ]} />
        </Card>
      )}
      {tab === 'points' && <RewardPoints id={id} rows={data.rewardPoints} balance={balance} onDone={reload} />}
      {tab === 'bis' && (
        <Card title="Back in stock subscriptions" id={`${p}-section-bis`}>
          <Table idPrefix={`${p}-bis`} rows={data.backInStock} empty="No subscriptions" cols={[
            { k: 'name', label: 'Product', render: (b) => <Link className="ad-link" to={`/admin/products/edit/${b.product_id}`}>{b.name}</Link> }, { k: 'created_at', label: 'Subscribed on', render: (b) => formatDate(b.created_at, true) },
          ]} />
        </Card>
      )}
      {mail && <SendEmail id={id} email={data.email} onClose={() => setMail(false)} />}
    </div>
  )
}

function RewardPoints({ id, rows, balance, onDone }) {
  const p = 'admin-customer-reward-points'
  const [points, setPoints] = useState(null)
  const [message, setMessage] = useState('')
  const [run, busy] = useAction()
  return (
    <Card title={`Reward points – balance ${balance}`} id={`${p}-section`}>
      <Table idPrefix={p} rows={rows} empty="No reward points history" cols={[
        { k: 'created_at', label: 'Date', render: (r) => formatDate(r.created_at, true) }, { k: 'points', label: 'Points', className: 'num', render: (r) => <b className={r.points < 0 ? 'ad-neg' : 'ad-pos'}>{r.points > 0 ? `+${r.points}` : r.points}</b> },
        { k: 'points_balance', label: 'Balance', className: 'num' }, { k: 'message', label: 'Message' },
      ]} />
      <div className="ad-subcard" id={`${p}-add-section`}>
        <div className="ad-subcard-head"><b>Add (or subtract) reward points</b></div>
        <div className="ad-form">
          <Field id={`${p}-points`} label="Points" hint="Use a negative value to subtract points"><Input id={`${p}-points`} type="int" value={points} onChange={setPoints} /></Field>
          <Field id={`${p}-message`} label="Message"><Input id={`${p}-message`} value={message} onChange={setMessage} /></Field>
        </div>
        <button type="button" className="ad-btn primary sm" id={`${p}-submit`} disabled={busy || !points} onClick={async () => { if (await run(() => api.post(`/admin/customers/${id}/reward-points`, { points, message }), 'Reward points updated')) { setPoints(null); setMessage(''); onDone() } }}><Award size={13} />Add reward points</button>
      </div>
    </Card>
  )
}

function SendEmail({ id, email, onClose }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [run, busy] = useAction()
  return (
    <Modal title={`Send email to ${email}`} id="admin-customer-email-modal" onClose={onClose} footer={<>
      <button type="button" className="ad-btn" id="admin-customer-email-cancel" onClick={onClose}>Cancel</button>
      <button type="button" className="ad-btn primary" id="admin-customer-email-send" disabled={busy || !subject.trim() || !body.trim()} onClick={async () => { if (await run(() => api.post(`/admin/customers/${id}/email`, { subject, body }), (r) => r.message)) onClose() }}><Mail size={14} />Send email</button>
    </>}>
      <div className="ad-form">
        <Field id="admin-customer-email-subject" label="Subject" required><Input id="admin-customer-email-subject" value={subject} onChange={setSubject} /></Field>
        <Field id="admin-customer-email-body" label="Body" required><Input id="admin-customer-email-body" type="textarea" rows={7} value={body} onChange={setBody} /></Field>
      </div>
    </Modal>
  )
}

// ---------------- carts ----------------
export function Carts() {
  const p = 'admin-carts'
  const [type, setType] = useState('cart')
  const [open, setOpen] = useState([])
  const { data, loading, error, reload } = useLoad(() => api.get('/admin/carts', { type }), [type])
  useEffect(() => setOpen([]), [type])
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title="Shopping carts & wishlists" />
      <Tabs idPrefix={`${p}-tab`} active={type} onChange={setType} tabs={[{ key: 'cart', label: 'Shopping carts' }, { key: 'wishlist', label: 'Wishlists' }]} />
      <Card>
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? <Loading /> : !data?.length ? <Empty text={type === 'cart' ? 'No active shopping carts' : 'No wishlists'} /> : (
          <div className="ad-table-wrap">
            <table className="ad-table" id={`${p}-table`}>
              <thead><tr><th /><th>Customer</th><th>Total items</th><th>Last updated</th></tr></thead>
              <tbody>{data.map((r) => {
                const isOpen = open.includes(r.customer_id)
                return (
                  <Fragment key={r.customer_id}>
                    <tr id={`${p}-row-${r.customer_id}`} className="ad-clickable" onClick={() => setOpen(isOpen ? open.filter((x) => x !== r.customer_id) : [...open, r.customer_id])}>
                      <td className="ad-check"><button type="button" className="ad-icon-btn" id={`${p}-toggle-${r.customer_id}`} aria-expanded={isOpen} aria-label="Toggle details">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                      <td>{r.is_guest ? r.customer : <Link className="ad-link" to={`/admin/customers/edit/${r.customer_id}`} onClick={(e) => e.stopPropagation()}>{r.customer}</Link>}{r.is_guest && <> <Badge tone="mute">Guest</Badge></>}</td>
                      <td className="num">{r.items}</td><td>{formatDate(r.updated_at, true)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="ad-expanded" id={`${p}-details-${r.customer_id}`}><td /><td colSpan={3}>
                        <table className="ad-table compact"><thead><tr><th>Product</th><th>Attributes</th><th>Unit price</th><th>Qty</th><th>Total</th></tr></thead>
                          <tbody>{r.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{(l.attributes || '').replace(/<[^>]+>/g, ' ')}</td><td>{usd(l.price)}</td><td>{l.quantity}</td><td>{usd(l.price * l.quantity)}</td></tr>)}</tbody></table>
                      </td></tr>
                    )}
                  </Fragment>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

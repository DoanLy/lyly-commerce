import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Printer, RotateCcw, Download, Trash2, Pencil, Plus } from 'lucide-react'
import { api, formatDate } from '../../lib/api.js'
import { useStore, Loading, Breadcrumb, Notice, PageTitle, Field, ProductArt, useDocumentTitle, useMoney, useAsync, Stars } from '../ui.jsx'
import { AddressForm, EMPTY_ADDRESS } from './Checkout.jsx'

export function LoginForm({ returnUrl = '/', idPrefix = 'login' }) {
  const { refresh } = useStore()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await api.post('/auth/login', form); await refresh(); nav(returnUrl) } catch (x) { setError(x.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} id={`${idPrefix}-form`} noValidate>
      <Notice type="error" id={`${idPrefix}-error`}>{error}</Notice>
      <Field label="Email" id={`${idPrefix}-email`} required><input id={`${idPrefix}-email`} name="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Password" id={`${idPrefix}-password`} required><input id={`${idPrefix}-password`} name="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      <div className="row-between">
        <label className="check" htmlFor={`${idPrefix}-remember`}><input type="checkbox" id={`${idPrefix}-remember`} checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} /> Remember me?</label>
        <Link to="/passwordrecovery" className="text-link" id={`${idPrefix}-forgot`}>Forgot password?</Link>
      </div>
      <button className="dark-button wide" id={`${idPrefix}-submit`} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  )
}

export function LoginPage() {
  useDocumentTitle('Login')
  const [params] = useSearchParams()
  return (
    <div className="container auth-page" id="login-page">
      <PageTitle>Welcome, please sign in!</PageTitle>
      <div className="two-col">
        <div className="card" id="login-new-customer">
          <h3>New customer</h3>
          <p className="muted">By creating an account on our website, you will be able to shop faster, be up to date on an order's status, and keep track of the orders you have previously made.</p>
          <Link to={`/register${params.get('returnUrl') ? `?returnUrl=${params.get('returnUrl')}` : ''}`} className="ghost-button" id="login-register-button">Register</Link>
        </div>
        <div className="card"><h3>Returning customer</h3><LoginForm returnUrl={params.get('returnUrl') || '/'} /></div>
      </div>
    </div>
  )
}

export function RegisterPage() {
  useDocumentTitle('Register')
  const { boot, refresh } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const cs = boot.settings.customer
  const [form, setForm] = useState({ gender: '', firstName: '', lastName: '', dob: '', email: '', company: '', phone: '', newsletter: true, password: '', confirmPassword: '' })
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErrors([])
    try { await api.post('/auth/register', form); await refresh(); nav(`/register/result${params.get('returnUrl') ? `?returnUrl=${params.get('returnUrl')}` : ''}`) } catch (x) { setErrors(x.data?.errors || [x.message]) } finally { setBusy(false) }
  }
  return (
    <div className="container auth-page" id="register-page">
      <Breadcrumb items={[{ label: 'Register' }]} />
      <PageTitle>Register</PageTitle>
      <form className="card form-card" onSubmit={submit} id="register-form" noValidate>
        {errors.length > 0 && <Notice type="error" id="register-errors">{errors.map((x) => <div key={x}>{x}</div>)}</Notice>}
        <h3>Your personal details</h3>
        {cs.genderEnabled && (
          <div className="field"><span className="attr-label">Gender</span>
            <div className="row-gap" id="register-gender">
              <label className="radio" htmlFor="register-gender-male"><input type="radio" id="register-gender-male" name="gender" checked={form.gender === 'M'} onChange={() => setForm({ ...form, gender: 'M' })} /> Male</label>
              <label className="radio" htmlFor="register-gender-female"><input type="radio" id="register-gender-female" name="gender" checked={form.gender === 'F'} onChange={() => setForm({ ...form, gender: 'F' })} /> Female</label>
            </div>
          </div>
        )}
        <div className="form-grid">
          <Field label="First name" id="register-first-name" required><input id="register-first-name" name="firstName" value={form.firstName} onChange={set('firstName')} /></Field>
          <Field label="Last name" id="register-last-name" required><input id="register-last-name" name="lastName" value={form.lastName} onChange={set('lastName')} /></Field>
          {cs.dobEnabled && <Field label="Date of birth" id="register-dob"><input id="register-dob" name="dob" type="date" value={form.dob} onChange={set('dob')} /></Field>}
          <Field label="Email" id="register-email" required><input id="register-email" name="email" type="email" value={form.email} onChange={set('email')} /></Field>
          {cs.companyEnabled && <Field label="Company name" id="register-company"><input id="register-company" name="company" value={form.company} onChange={set('company')} /></Field>}
          {cs.phoneEnabled && <Field label="Phone" id="register-phone"><input id="register-phone" name="phone" type="tel" value={form.phone} onChange={set('phone')} /></Field>}
        </div>
        {cs.newsletterEnabled && <label className="check" htmlFor="register-newsletter"><input type="checkbox" id="register-newsletter" checked={form.newsletter} onChange={set('newsletter')} /> Newsletter</label>}
        <h3>Your password</h3>
        <div className="form-grid">
          <Field label="Password" id="register-password" required hint={`At least ${cs.passwordMinLength} characters`}><input id="register-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
          <Field label="Confirm password" id="register-confirm-password" required><input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} /></Field>
        </div>
        <button className="dark-button" id="register-button" disabled={busy}>{busy ? 'Registering…' : 'Register'}</button>
      </form>
    </div>
  )
}

export function RegisterResultPage() {
  const [params] = useSearchParams()
  return (
    <div className="container section completed" id="register-result">
      <PageTitle>Register</PageTitle>
      <p className="lead" id="register-result-message">Your registration completed</p>
      <Link to={params.get('returnUrl') || '/'} className="dark-button" id="register-continue">Continue</Link>
    </div>
  )
}

export function PasswordRecoveryPage() {
  useDocumentTitle('Password recovery')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const submit = async (e) => { e.preventDefault(); try { const r = await api.post('/auth/password-recovery', { email }); setMsg({ type: 'success', text: r.message }) } catch (x) { setMsg({ type: 'error', text: x.message }) } }
  return (
    <div className="container auth-page" id="password-recovery-page">
      <PageTitle sub="Please enter your email address below. You will receive a link to reset your password.">Password recovery</PageTitle>
      <form className="card form-card narrow" onSubmit={submit} id="password-recovery-form">
        {msg && <Notice type={msg.type} id="password-recovery-result">{msg.text}</Notice>}
        <Field label="Your email address" id="password-recovery-email" required><input id="password-recovery-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="dark-button" id="password-recovery-submit">Recover</button>
      </form>
    </div>
  )
}

export function PasswordRecoveryConfirmPage() {
  const [params] = useSearchParams()
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try { const r = await api.post('/auth/password-recovery/confirm', { ...form, token: params.get('token'), email: params.get('email') }); setMsg({ type: 'success', text: r.message }) } catch (x) { setMsg({ type: 'error', text: x.message }) }
  }
  return (
    <div className="container auth-page" id="password-recovery-confirm-page">
      <PageTitle>Password recovery</PageTitle>
      <form className="card form-card narrow" onSubmit={submit}>
        {msg && <Notice type={msg.type} id="password-recovery-confirm-result">{msg.text} {msg.type === 'success' && <Link to="/login">Log in</Link>}</Notice>}
        <Field label="New password" id="password-recovery-new" required><input id="password-recovery-new" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Field label="Confirm password" id="password-recovery-confirm" required><input id="password-recovery-confirm" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></Field>
        <button className="dark-button" id="password-recovery-change">Change password</button>
      </form>
    </div>
  )
}

// ---------------- My account ----------------
const SECTIONS = [
  ['info', 'Customer info'], ['addresses', 'Addresses'], ['orders', 'Orders'], ['downloads', 'Downloadable products'], ['returns', 'Return requests'],
  ['backinstock', 'Back in stock subscriptions'], ['rewardpoints', 'Reward points'], ['changepassword', 'Change password'], ['reviews', 'My product reviews'],
]

export function AccountLayout() {
  const { section } = useParams()
  const { customer, boot } = useStore()
  const nav = useNavigate()
  useEffect(() => { if (!customer) nav(`/login?returnUrl=/customer/${section}`) }, [customer, nav, section])
  const title = SECTIONS.find(([k]) => k === section)?.[1] || 'My account'
  useDocumentTitle(title)
  if (!customer) return null
  const visible = SECTIONS.filter(([k]) => (k !== 'rewardpoints' || boot.settings.rewardPoints.enabled) && (k !== 'returns' || boot.settings.orders.returnRequestsEnabled))
  return (
    <div className="container account-page" id={`account-${section}`}>
      <Breadcrumb items={[{ label: 'My account', to: '/customer/info' }, { label: title }]} />
      <div className="account-grid">
        <aside className="account-nav" id="account-navigation">
          <h3>My account</h3>
          {visible.map(([k, l]) => <NavLink key={k} to={`/customer/${k}`} id={`account-nav-${k}`}>{l}</NavLink>)}
        </aside>
        <section>
          <PageTitle id="account-title">My account - {title}</PageTitle>
          {section === 'info' && <InfoSection />}
          {section === 'addresses' && <AddressesSection />}
          {section === 'orders' && <OrdersSection />}
          {section === 'downloads' && <DownloadsSection />}
          {section === 'returns' && <ReturnsSection />}
          {section === 'backinstock' && <BackInStockSection />}
          {section === 'rewardpoints' && <RewardPointsSection />}
          {section === 'changepassword' && <ChangePasswordSection />}
          {section === 'reviews' && <ReviewsSection />}
        </section>
      </div>
    </div>
  )
}

function InfoSection() {
  const { boot, refresh } = useStore()
  const cs = boot.settings.customer
  const [{ data, loading }] = useAsync(() => api.get('/account/info'), [])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (data) setForm({ ...data, dob: data.dob ? String(data.dob).slice(0, 10) : '' }) }, [data])
  if (loading || !form) return <Loading />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async (e) => { e.preventDefault(); try { const r = await api.put('/account/info', form); setMsg({ type: 'success', text: r.message }); refresh() } catch (x) { setMsg({ type: 'error', text: x.message }) } }
  return (
    <form className="card" onSubmit={save} id="account-info-form">
      {msg && <Notice type={msg.type} id="account-info-result">{msg.text}</Notice>}
      {cs.genderEnabled && (
        <div className="field"><span className="attr-label">Gender</span><div className="row-gap">
          <label className="radio" htmlFor="account-gender-male"><input type="radio" id="account-gender-male" checked={form.gender === 'M'} onChange={() => setForm({ ...form, gender: 'M' })} /> Male</label>
          <label className="radio" htmlFor="account-gender-female"><input type="radio" id="account-gender-female" checked={form.gender === 'F'} onChange={() => setForm({ ...form, gender: 'F' })} /> Female</label>
        </div></div>
      )}
      <div className="form-grid">
        <Field label="First name" id="account-first-name" required><input id="account-first-name" value={form.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name" id="account-last-name" required><input id="account-last-name" value={form.lastName} onChange={set('lastName')} /></Field>
        {cs.dobEnabled && <Field label="Date of birth" id="account-dob"><input id="account-dob" type="date" value={form.dob} onChange={set('dob')} /></Field>}
        <Field label="Email" id="account-email" required><input id="account-email" type="email" value={form.email} onChange={set('email')} /></Field>
        {cs.companyEnabled && <Field label="Company name" id="account-company"><input id="account-company" value={form.company || ''} onChange={set('company')} /></Field>}
        {cs.phoneEnabled && <Field label="Phone" id="account-phone"><input id="account-phone" value={form.phone || ''} onChange={set('phone')} /></Field>}
      </div>
      {cs.newsletterEnabled && <label className="check" htmlFor="account-newsletter"><input type="checkbox" id="account-newsletter" checked={!!form.newsletter} onChange={set('newsletter')} /> Newsletter</label>}
      <button className="dark-button" id="account-info-save">Save</button>
    </form>
  )
}

function AddressesSection() {
  const { notify } = useStore()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = () => api.get('/account/addresses').then(setList)
  useEffect(() => { load() }, [])
  const save = async (e) => {
    e.preventDefault()
    try { if (edit.id) await api.put(`/account/addresses/${edit.id}`, edit); else await api.post('/account/addresses', edit); setEdit(null); load(); notify('The address has been saved') } catch (x) { notify(x.message, 'error') }
  }
  if (!list) return <Loading />
  if (edit) return (
    <form className="card" onSubmit={save} id="address-edit-form">
      <h3>{edit.id ? 'Edit address' : 'Add new address'}</h3>
      <AddressForm value={edit} onChange={setEdit} idPrefix="address-edit" />
      <div className="row-gap"><button className="dark-button" id="address-save">Save</button><button type="button" className="ghost-button" id="address-cancel" onClick={() => setEdit(null)}>Cancel</button></div>
    </form>
  )
  return (
    <div>
      {!list.length && <div className="empty" id="addresses-empty">No addresses</div>}
      <div className="address-grid">
        {list.map((a) => (
          <div className="card address-card" key={a.id} id={`address-${a.id}`}>
            <b>{a.firstName} {a.lastName}</b>
            <p>{a.email}<br />{a.phone}<br />{a.company && <>{a.company}<br /></>}{a.address1}{a.address2 && `, ${a.address2}`}<br />{a.city}{a.state && `, ${a.state}`} {a.zip}<br />{a.country}</p>
            <div className="row-gap">
              <button className="ghost-button small" id={`address-edit-${a.id}`} onClick={() => setEdit(a)}><Pencil size={13} /> Edit</button>
              <button className="ghost-button small" id={`address-delete-${a.id}`} onClick={async () => { if (confirm('Are you sure?')) { await api.del(`/account/addresses/${a.id}`); load() } }}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
      <button className="dark-button" id="address-add" onClick={() => setEdit({ ...EMPTY_ADDRESS })}><Plus size={15} /> Add new</button>
    </div>
  )
}

function OrdersSection() {
  const money = useMoney()
  const [{ data, loading }] = useAsync(() => api.get('/account/orders'), [])
  if (loading) return <Loading />
  if (!data.length) return <div className="empty" id="orders-empty">No orders</div>
  return (
    <div className="order-list" id="account-orders-list">
      {data.map((o) => (
        <div className="card order-card" key={o.id} id={`account-order-${o.id}`} data-status={o.order_status}>
          <div><b>Order Number: {o.custom_number || o.id}</b>
            <p className="muted">Order status: <span className={`status s-${o.order_status.toLowerCase()}`}>{o.order_status}</span> · Order Date: {formatDate(o.created_at, true)} · Order Total: {money(o.total)}</p>
          </div>
          <Link to={`/orderdetails/${o.id}`} className="ghost-button small" id={`account-order-details-${o.id}`}>Details</Link>
        </div>
      ))}
    </div>
  )
}

export function OrderDetailsPage() {
  const { id } = useParams()
  const { notify, refresh } = useStore()
  const nav = useNavigate()
  const money = useMoney()
  const [{ data: o, loading, error }] = useAsync(() => api.get(`/account/orders/${id}`), [id])
  useDocumentTitle(`Order #${id}`)
  if (loading) return <Loading />
  if (error) return <div className="container section"><Notice type="error">{error.message}</Notice></div>
  const addr = (a) => a ? <p>{a.firstName} {a.lastName}<br />{a.email} · {a.phone}<br />{a.address1}{a.address2 && `, ${a.address2}`}<br />{a.city}{a.state && `, ${a.state}`} {a.zip}<br />{a.country}</p> : <p className="muted">—</p>
  const reorder = async () => { await api.post(`/account/orders/${o.id}/reorder`); refresh(); notify('Items added to your', 'success', { to: '/cart', label: 'shopping cart' }); nav('/cart') }
  return (
    <div className="container order-details" id="order-details-page" data-order-id={o.id}>
      <Breadcrumb items={[{ label: 'My account', to: '/customer/info' }, { label: 'Orders', to: '/customer/orders' }, { label: `Order #${o.custom_number || o.id}` }]} />
      <div className="row-between wrap">
        <PageTitle>Order information</PageTitle>
        <div className="row-gap no-print">
          <button className="ghost-button small" id="order-print" onClick={() => window.print()}><Printer size={14} /> Print</button>
          {o.reorderAllowed && <button className="ghost-button small" id="order-reorder" onClick={reorder}>Re-order</button>}
          {o.returnable && <Link to={`/returnrequest/${o.id}`} className="ghost-button small" id="order-return"><RotateCcw size={14} /> Return item(s)</Link>}
        </div>
      </div>
      <div className="card">
        <p><b>Order #{o.custom_number || o.id}</b> · {formatDate(o.created_at, true)}</p>
        <p>Order status: <b id="order-status">{o.order_status}</b> · Order Total: <b id="order-total">{money(o.total)}</b></p>
      </div>
      <div className="info-grid">
        <div className="card"><h3>Billing address</h3>{addr(o.billing_address)}<h4>Payment</h4><p>{o.payment_method_name || '—'} {o.card_masked && `(${o.card_type} ${o.card_masked})`}<br />Payment status: <b id="order-payment-status">{o.payment_status}</b></p></div>
        <div className="card"><h3>{o.pickup_in_store ? 'Pickup point' : 'Shipping address'}</h3>{o.pickup_in_store ? <p>{o.pickup_point?.name}<br />{o.pickup_point?.address}, {o.pickup_point?.city}</p> : addr(o.shipping_address)}<h4>Shipping</h4><p>{o.shipping_method}<br />Shipping status: <b id="order-shipping-status">{o.shipping_status}</b></p></div>
      </div>
      <div className="table-wrap card">
        <table className="cart-table" id="order-items-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>{o.items.map((i) => (
            <tr key={i.id} id={`order-item-${i.id}`}>
              <td className="cart-product"><ProductArt name={i.product_name} src={i.picture} size="xs" /><div>{i.slug ? <Link to={`/product/${i.slug}`}>{i.product_name}</Link> : i.product_name}{i.attributes_desc && <small className="attr-desc">{i.attributes_desc}</small>}</div></td>
              <td>{i.sku}</td><td>{money(i.unit_price)}</td><td>{i.quantity}</td><td>{money(i.price)}</td>
            </tr>
          ))}</tbody>
        </table>
        {o.checkout_attributes_desc && <p className="attr-desc">{o.checkout_attributes_desc}</p>}
        <table className="totals" id="order-totals"><tbody>
          <tr><th>Sub-Total:</th><td>{money(o.subtotal)}</td></tr>
          {o.subtotal_discount > 0 && <tr><th>Discount:</th><td>-{money(o.subtotal_discount)}</td></tr>}
          <tr><th>Shipping:</th><td>{money(o.shipping_amount)}</td></tr>
          {o.payment_fee > 0 && <tr><th>Payment method additional fee:</th><td>{money(o.payment_fee)}</td></tr>}
          <tr><th>Tax:</th><td>{money(o.tax)}</td></tr>
          {o.order_discount > 0 && <tr><th>Order discount:</th><td>-{money(o.order_discount)}</td></tr>}
          {o.gift_card_amount > 0 && <tr><th>Gift cards:</th><td>-{money(o.gift_card_amount)}</td></tr>}
          {o.reward_points_used > 0 && <tr><th>{o.reward_points_used} reward points:</th><td>-{money(o.reward_points_amount)}</td></tr>}
          {o.refunded_amount > 0 && <tr><th>Refunded:</th><td>{money(o.refunded_amount)}</td></tr>}
          <tr className="grand"><th>Order Total:</th><td><b>{money(o.total)}</b></td></tr>
        </tbody></table>
      </div>
      {o.shipments.length > 0 && (
        <div className="card" id="order-shipments"><h3>Shipments</h3>
          <table className="simple-table"><thead><tr><th>Shipment #</th><th>Tracking number</th><th>Date shipped</th><th>Date delivered</th></tr></thead>
            <tbody>{o.shipments.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.tracking_number || '—'}</td><td>{s.shipped_at ? formatDate(s.shipped_at) : 'Not yet'}</td><td>{s.delivered_at ? formatDate(s.delivered_at) : 'Not yet'}</td></tr>)}</tbody></table>
        </div>
      )}
      {o.notes.length > 0 && (
        <div className="card" id="order-notes"><h3>Order notes</h3>
          {o.notes.map((n) => <p key={n.id}><small className="muted">{formatDate(n.created_at, true)}</small><br />{n.note}</p>)}
        </div>
      )}
    </div>
  )
}

export function ReturnRequestPage() {
  const { id } = useParams()
  const { boot, notify } = useStore()
  const nav = useNavigate()
  const [{ data: o, loading, error }] = useAsync(() => api.get(`/account/orders/${id}`), [id])
  const [qty, setQty] = useState({})
  const [form, setForm] = useState({ reason: boot.settings.orders.returnReasons[0], action: boot.settings.orders.returnActions[0], comments: '' })
  useDocumentTitle('Return item(s)')
  if (loading) return <Loading />
  if (error) return <div className="container section"><Notice type="error">{error.message}</Notice></div>
  const submit = async (e) => {
    e.preventDefault()
    try {
      const r = await api.post(`/account/orders/${id}/return`, { ...form, items: Object.entries(qty).map(([orderItemId, quantity]) => ({ orderItemId, quantity })) })
      notify(r.message); nav('/customer/returns')
    } catch (x) { notify(x.message, 'error') }
  }
  return (
    <div className="container" id="return-request-page">
      <Breadcrumb items={[{ label: 'Orders', to: '/customer/orders' }, { label: `Order #${o.id}`, to: `/orderdetails/${o.id}` }, { label: 'Return item(s)' }]} />
      <PageTitle>Return item(s) from order #{o.custom_number || o.id}</PageTitle>
      {!o.returnable ? <Notice type="warning">This order is not eligible for returns.</Notice> : (
        <form className="card" onSubmit={submit} id="return-request-form">
          <h3>Which items would you like to return?</h3>
          <table className="simple-table"><thead><tr><th>Product</th><th>Price</th><th>Qty to return</th></tr></thead>
            <tbody>{o.items.map((i) => (
              <tr key={i.id}><td>{i.product_name}<small className="attr-desc">{i.attributes_desc}</small></td><td>{i.unit_price.toFixed(2)}</td>
                <td><label htmlFor={`return-qty-${i.id}`} className="sr-only">Quantity</label><select id={`return-qty-${i.id}`} value={qty[i.id] || 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}>{Array.from({ length: i.quantity + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></td></tr>
            ))}</tbody></table>
          <h3>Why are you returning these items?</h3>
          <div className="form-grid">
            <Field label="Return reason" id="return-reason"><select id="return-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{boot.settings.orders.returnReasons.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Return action" id="return-action"><select id="return-action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>{boot.settings.orders.returnActions.map((r) => <option key={r}>{r}</option>)}</select></Field>
          </div>
          <Field label="Comments" id="return-comments"><textarea id="return-comments" rows={3} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></Field>
          <button className="dark-button" id="return-submit">Submit return request</button>
        </form>
      )}
    </div>
  )
}

function ReturnsSection() {
  const [{ data, loading }] = useAsync(() => api.get('/account/returns'), [])
  if (loading) return <Loading />
  if (!data.length) return <div className="empty" id="returns-empty">No return requests</div>
  return data.map((r) => (
    <div className="card" key={r.id} id={`return-request-${r.id}`}>
      <b>Return #{r.custom_number || r.id} — <span className="status">{r.status}</span></b>
      <p>Returned item: {r.quantity} × <Link to={r.slug ? `/product/${r.slug}` : '#'}>{r.product_name}</Link> (order #{r.order_id})<br />Reason: {r.reason} · Requested action: {r.requested_action}<br /><small className="muted">{formatDate(r.created_at, true)}</small></p>
      {r.comments && <p className="muted">Your comments: {r.comments}</p>}
    </div>
  ))
}

function DownloadsSection() {
  const [{ data, loading }] = useAsync(() => api.get('/account/downloads'), [])
  if (loading) return <Loading />
  if (!data.length) return <div className="empty" id="downloads-empty">There are no downloadable products</div>
  return (
    <table className="simple-table card" id="downloads-table"><thead><tr><th>Order #</th><th>Date</th><th>Product</th><th>Download</th></tr></thead>
      <tbody>{data.map((d) => (
        <tr key={d.id}><td><Link to={`/orderdetails/${d.order_id}`}>{d.order_id}</Link></td><td>{formatDate(d.created_at)}</td><td>{d.product_name}</td>
          <td>{d.payment_status === 'Paid' ? <a href={`/api/download/${d.guid}`} className="text-link" id={`download-${d.id}`}><Download size={14} /> Download ({d.download_count})</a> : <small className="muted">Available after payment</small>}</td></tr>
      ))}</tbody></table>
  )
}

function BackInStockSection() {
  const [list, setList] = useState(null)
  const [sel, setSel] = useState([])
  const load = () => api.get('/account/back-in-stock').then(setList)
  useEffect(() => { load() }, [])
  if (!list) return <Loading />
  if (!list.length) return <div className="empty" id="backinstock-empty">You are not currently subscribed to any Back In Stock notification lists</div>
  return (
    <div className="card">
      {list.map((b) => <label key={b.id} className="check" htmlFor={`backinstock-${b.id}`}><input type="checkbox" id={`backinstock-${b.id}`} checked={sel.includes(b.id)} onChange={() => setSel(sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id])} /> <Link to={`/product/${b.slug}`}>{b.name}</Link></label>)}
      <button className="ghost-button" id="backinstock-delete" disabled={!sel.length} onClick={async () => { await api.post('/account/back-in-stock/delete', { ids: sel }); setSel([]); load() }}>Delete selected</button>
    </div>
  )
}

function RewardPointsSection() {
  const money = useMoney()
  const [{ data, loading }] = useAsync(() => api.get('/account/reward-points'), [])
  if (loading) return <Loading />
  return (
    <div>
      <div className="card" id="reward-points-balance">
        <p>Your current balance is <b>{data.balance} reward points ({money(data.balanceAmount)})</b>.</p>
        <p className="muted">Earn {data.settings.earnPoints} point(s) for every {money(data.settings.earnPerAmount)} spent. Each point is worth {money(data.settings.exchangeRate)}.</p>
      </div>
      {data.history.length ? (
        <table className="simple-table card" id="reward-points-history"><thead><tr><th>Date</th><th>Points</th><th>Balance</th><th>Message</th></tr></thead>
          <tbody>{data.history.map((h) => <tr key={h.id}><td>{formatDate(h.created_at, true)}</td><td>{h.points > 0 ? `+${h.points}` : h.points}</td><td>{h.points_balance}</td><td>{h.message}</td></tr>)}</tbody></table>
      ) : <div className="empty">There is no reward points history yet</div>}
    </div>
  )
}

function ChangePasswordSection() {
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [msg, setMsg] = useState(null)
  const submit = async (e) => { e.preventDefault(); try { const r = await api.post('/account/change-password', form); setMsg({ type: 'success', text: r.message }); setForm({ oldPassword: '', newPassword: '', confirmPassword: '' }) } catch (x) { setMsg({ type: 'error', text: x.message }) } }
  return (
    <form className="card form-card narrow" onSubmit={submit} id="change-password-form">
      {msg && <Notice type={msg.type} id="change-password-result">{msg.text}</Notice>}
      <Field label="Old password" id="change-password-old" required><input id="change-password-old" type="password" value={form.oldPassword} onChange={(e) => setForm({ ...form, oldPassword: e.target.value })} /></Field>
      <Field label="New password" id="change-password-new" required><input id="change-password-new" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
      <Field label="Confirm password" id="change-password-confirm" required><input id="change-password-confirm" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></Field>
      <button className="dark-button" id="change-password-submit">Change password</button>
    </form>
  )
}

function ReviewsSection() {
  const [{ data, loading }] = useAsync(() => api.get('/account/reviews'), [])
  if (loading) return <Loading />
  if (!data.length) return <div className="empty" id="my-reviews-empty">You haven't written any reviews yet</div>
  return data.map((r) => (
    <div className="card review" key={r.id} id={`my-review-${r.id}`}>
      <div className="review-head"><b>{r.title}</b><Stars value={r.rating} /></div>
      <p>{r.body}</p>
      <small className="muted">Product: <Link to={`/product/${r.slug}`}>{r.product_name}</Link> · {formatDate(r.created_at)} · {r.approved ? 'Approved' : 'Pending approval'}</small>
    </div>
  ))
}

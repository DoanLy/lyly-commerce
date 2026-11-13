import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Lock, Store } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useStore, Loading, Breadcrumb, Notice, PageTitle, Field, ProductArt, useDocumentTitle, useMoney, useAsync } from '../ui.jsx'
import { TotalsTable } from './Cart.jsx'
import { LoginForm } from './Account.jsx'

export const EMPTY_ADDRESS = { firstName: '', lastName: '', email: '', company: '', countryId: '', stateId: '', city: '', address1: '', address2: '', zip: '', phone: '' }

let countriesCache = null
export function useCountries() {
  const [list, setList] = useState(countriesCache || [])
  useEffect(() => { if (!countriesCache) api.get('/countries').then((c) => { countriesCache = c; setList(c) }) }, [])
  return list
}

export function AddressForm({ value, onChange, idPrefix, errors = {} }) {
  const countries = useCountries()
  const country = countries.find((c) => String(c.id) === String(value.countryId))
  const f = (k, label, type = 'text', required = true) => (
    <Field label={label} id={`${idPrefix}-${k}`} required={required} error={errors[k]}>
      <input id={`${idPrefix}-${k}`} name={k} type={type} value={value[k] || ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
    </Field>
  )
  return (
    <div className="form-grid" id={`${idPrefix}-form`}>
      {f('firstName', 'First name')}{f('lastName', 'Last name')}
      {f('email', 'Email', 'email')}{f('company', 'Company', 'text', false)}
      <Field label="Country" id={`${idPrefix}-countryId`} required>
        <select id={`${idPrefix}-countryId`} value={value.countryId || ''} onChange={(e) => onChange({ ...value, countryId: e.target.value, stateId: '' })}>
          <option value="">Select country</option>
          {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="State / province" id={`${idPrefix}-stateId`}>
        <select id={`${idPrefix}-stateId`} value={value.stateId || ''} onChange={(e) => onChange({ ...value, stateId: e.target.value })} disabled={!country?.states.length}>
          <option value="">{country?.states.length ? 'Select state' : 'Other (Non US)'}</option>
          {(country?.states || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      {f('city', 'City')}{f('address1', 'Address 1')}
      {f('address2', 'Address 2', 'text', false)}{f('zip', 'Zip / postal code')}
      {f('phone', 'Phone number', 'tel')}
    </div>
  )
}

function addrLine(a) {
  return [`${a.firstName} ${a.lastName}`, a.address1, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ')
}

function AddressPicker({ addresses, value, onChange, idPrefix }) {
  const [mode, setMode] = useState(addresses.length ? 'existing' : 'new')
  const [selected, setSelected] = useState(value?.id || addresses[0]?.id || '')
  useEffect(() => { if (mode === 'existing' && selected) onChange(addresses.find((a) => a.id === Number(selected))) }, [mode, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      {addresses.length > 0 && (
        <div className="field">
          <label htmlFor={`${idPrefix}-select`}>Select an address from your address book or enter a new address.</label>
          <select id={`${idPrefix}-select`} value={mode === 'new' ? 'new' : selected} onChange={(e) => { if (e.target.value === 'new') { setMode('new'); onChange({ ...EMPTY_ADDRESS }) } else { setMode('existing'); setSelected(e.target.value) } }}>
            {addresses.map((a) => <option key={a.id} value={a.id}>{addrLine(a)}</option>)}
            <option value="new">New address</option>
          </select>
        </div>
      )}
      {mode === 'new' && <AddressForm value={value || EMPTY_ADDRESS} onChange={onChange} idPrefix={idPrefix} />}
    </div>
  )
}

function validAddress(a) {
  return a && a.firstName && a.lastName && /\S+@\S+\.\S+/.test(a.email || '') && a.countryId && a.city && a.address1 && a.zip && a.phone
}

export function CheckoutPage() {
  useDocumentTitle('Checkout')
  const { customer, notify, refresh, currency, boot } = useStore()
  const money = useMoney()
  const nav = useNavigate()
  const [guest, setGuest] = useState(false)
  const [opt, setOpt] = useState(null)
  const [cart, setCart] = useState(null)
  const [step, setStep] = useState(1)
  const [billing, setBilling] = useState(null)
  const [sameAddress, setSameAddress] = useState(boot.settings.shipping.shipToSameAddressDefault)
  const [shipping, setShipping] = useState(null)
  const [pickup, setPickup] = useState(false)
  const [pickupPointId, setPickupPointId] = useState('')
  const [shippingMethodId, setShippingMethodId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [useRP, setUseRP] = useState(false)
  const [card, setCard] = useState({ cardholderName: '', cardNumber: '', expireMonth: '', expireYear: '', cardCode: '' })
  const [comment, setComment] = useState('')
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!customer && !guest) return
    api.get('/checkout/options').then((o) => {
      if (o.loginRequired) { nav('/login?returnUrl=/checkout'); return }
      setOpt(o); setCart(o.cart)
      const def = o.addresses[0] || { ...EMPTY_ADDRESS, email: o.customer?.email || '', firstName: o.customer?.firstName || '', lastName: o.customer?.lastName || '', phone: o.customer?.phone || '' }
      setBilling(def)
      setShippingMethodId(o.shippingOptions[0]?.id || '')
      setPaymentMethod(o.paymentMethods[0]?.system_name || '')
      setPickupPointId(o.pickupPoints[0]?.id || '')
    }).catch((e) => setError(e.message))
  }, [customer, guest, nav])

  const updateState = async (patch) => { try { setCart(await api.post('/checkout/state', patch)) } catch (e) { notify(e.message, 'error') } }

  if (!customer && !guest) {
    return (
      <div className="container" id="checkout-login">
        <Breadcrumb items={[{ label: 'Checkout' }]} />
        <PageTitle>Welcome, please sign in!</PageTitle>
        <div className="two-col">
          <div className="card" id="checkout-guest-panel">
            <h3>Checkout as a guest or register</h3>
            <p className="muted">Create an account to save addresses, track orders and earn reward points. Or check out quickly as a guest.</p>
            <div className="row-gap wrap">
              {boot.settings.orders.anonymousCheckoutAllowed && <button className="dark-button" id="checkout-as-guest" onClick={() => setGuest(true)}>Checkout as guest</button>}
              <Link to="/register?returnUrl=/checkout" className="ghost-button" id="checkout-register">Register</Link>
            </div>
          </div>
          <div className="card"><h3>Returning customer</h3><LoginForm returnUrl="/checkout" idPrefix="checkout-login" /></div>
        </div>
      </div>
    )
  }
  if (error && !opt) return <div className="container section"><Notice type="error">{error}</Notice></div>
  if (!opt || !cart) return <Loading />
  if (!cart.items.length) return <div className="container section"><div className="empty" id="checkout-empty">Your Shopping Cart is empty! <Link to="/">Continue shopping</Link></div></div>

  const shippable = cart.shippable
  const needsPayment = (cart.totals.total ?? 1) > 0 || paymentMethod
  const steps = [
    { n: 1, key: 'billing', title: 'Billing address' },
    shippable && { n: 2, key: 'shipping', title: 'Shipping address' },
    shippable && !pickup && { n: 3, key: 'method', title: 'Shipping method' },
    { n: 4, key: 'payment', title: 'Payment method' },
    { n: 5, key: 'info', title: 'Payment information' },
    { n: 6, key: 'confirm', title: 'Confirm order' },
  ].filter(Boolean)
  const nextOf = (n) => steps.find((s) => s.n > n)?.n || 6
  const go = (n) => { setError(''); setStep(n) }
  const pm = opt.paymentMethods.find((p) => p.system_name === paymentMethod)

  const cont = async (n) => {
    setError('')
    if (n === 1) { if (!validAddress(billing)) return setError('Please fill in all required billing address fields.') }
    if (n === 2) {
      if (pickup) { if (!pickupPointId) return setError('Please select a pickup point'); await updateState({ pickup: true, pickupPointId: Number(pickupPointId) }) }
      else { if (!sameAddress && !validAddress(shipping)) return setError('Please fill in all required shipping address fields.'); await updateState({ pickup: false }) }
    }
    if (n === 3) { if (!shippingMethodId) return setError('Please select a shipping method'); await updateState({ shippingMethodId: Number(shippingMethodId), pickup: false }) }
    if (n === 4) { if (!paymentMethod) return setError('Please select a payment method'); await updateState({ paymentMethod, useRewardPoints: useRP }) }
    if (n === 5 && pm?.kind === 'card') {
      const digits = card.cardNumber.replace(/\D/g, '')
      if (!card.cardholderName || digits.length < 12 || !card.expireMonth || !card.expireYear || !/^\d{3,4}$/.test(card.cardCode)) return setError('Please complete the card information.')
    }
    go(nextOf(n))
  }

  const confirm = async () => {
    if (opt.termsRequired && !terms) return setError('Please accept the terms of service before the next step.')
    setBusy(true); setError('')
    try {
      const r = await api.post('/checkout/confirm', {
        billingAddress: billing, shipToSameAddress: sameAddress, shippingAddress: shipping, pickup, pickupPointId, shippingMethodId,
        paymentMethod: needsPayment ? paymentMethod : '', useRewardPoints: useRP, paymentInfo: card, comment, currency: currency.code,
      })
      refresh()
      nav(r.redirect || `/checkout/completed/${r.orderId}`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const section = (s, children) => (
    <section className={`checkout-step ${step === s.n ? 'open' : ''} ${step > s.n ? 'done' : ''}`} id={`checkout-step-${s.key}`} data-open={step === s.n}>
      <button className="step-head" id={`checkout-step-${s.key}-head`} onClick={() => step > s.n && go(s.n)} disabled={step <= s.n}>
        <span className="step-no">{steps.indexOf(s) + 1}</span> {s.title} {step > s.n && <small className="text-link">Edit</small>}
      </button>
      {step === s.n && <div className="step-body">{children}</div>}
    </section>
  )
  const contBtn = (n) => <div className="step-actions"><button className="dark-button" id={`checkout-continue-${n}`} onClick={() => cont(n)}>Continue</button></div>

  return (
    <div className="container checkout-page" id="checkout-page">
      <Breadcrumb items={[{ label: 'Shopping cart', to: '/cart' }, { label: 'Checkout' }]} />
      <PageTitle>Checkout</PageTitle>
      <div className="checkout-grid">
        <div>
          {error && <Notice type="error" id="checkout-error">{error}</Notice>}
          {steps.map((s) => (
            <div key={s.key}>{section(s, <>
              {s.key === 'billing' && <><AddressPicker addresses={opt.addresses} value={billing} onChange={setBilling} idPrefix="checkout-billing" />
                {shippable && <label className="check" htmlFor="checkout-ship-to-same"><input type="checkbox" id="checkout-ship-to-same" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} /> Ship to the same address</label>}
                {contBtn(1)}</>}
              {s.key === 'shipping' && <>
                {boot.settings.shipping.allowPickupInStore && opt.pickupPoints.length > 0 && (
                  <label className="check" htmlFor="checkout-pickup"><input type="checkbox" id="checkout-pickup" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> <Store size={15} /> In-Store Pickup</label>
                )}
                {pickup ? (
                  <div className="option-cards" id="checkout-pickup-points">
                    {opt.pickupPoints.map((p) => (
                      <label key={p.id} className={`option-card ${String(pickupPointId) === String(p.id) ? 'active' : ''}`} htmlFor={`checkout-pickup-point-${p.id}`}>
                        <input type="radio" name="pickup" id={`checkout-pickup-point-${p.id}`} checked={String(pickupPointId) === String(p.id)} onChange={() => setPickupPointId(p.id)} />
                        <span><b>{p.name}</b> {p.fee > 0 ? `(${money(p.fee)})` : '(Free)'}<small>{p.address}, {p.city} · {p.opening_hours}</small></span>
                      </label>
                    ))}
                  </div>
                ) : sameAddress ? <p className="muted" id="checkout-shipping-same">Shipping to: {addrLine(billing)}. <button className="text-link" onClick={() => { setSameAddress(false); setShipping({ ...EMPTY_ADDRESS }) }}>Use a different address</button></p>
                  : <AddressPicker addresses={opt.addresses} value={shipping} onChange={setShipping} idPrefix="checkout-shipping" />}
                {contBtn(2)}</>}
              {s.key === 'method' && <>
                <div className="option-cards" id="checkout-shipping-methods">
                  {opt.shippingOptions.map((m) => (
                    <label key={m.id} className={`option-card ${String(shippingMethodId) === String(m.id) ? 'active' : ''}`} htmlFor={`checkout-shipping-method-${m.id}`}>
                      <input type="radio" name="shipping-method" id={`checkout-shipping-method-${m.id}`} checked={String(shippingMethodId) === String(m.id)} onChange={() => setShippingMethodId(m.id)} />
                      <span><b>{m.name} ({m.rate === 0 ? 'Free' : money(m.rate)})</b><small>{m.description}</small></span>
                    </label>
                  ))}
                </div>
                {contBtn(3)}</>}
              {s.key === 'payment' && <>
                {cart.totals.total === 0 && !cart.totals.giftCardAmount ? <p className="muted">No payment required.</p> : (
                  <div className="option-cards" id="checkout-payment-methods">
                    {opt.paymentMethods.map((p) => (
                      <label key={p.system_name} className={`option-card ${paymentMethod === p.system_name ? 'active' : ''}`} htmlFor={`checkout-payment-${p.system_name.replace(/\W/g, '-').toLowerCase()}`}>
                        <input type="radio" name="payment-method" id={`checkout-payment-${p.system_name.replace(/\W/g, '-').toLowerCase()}`} checked={paymentMethod === p.system_name} onChange={() => setPaymentMethod(p.system_name)} />
                        <span><b>{p.name}{p.additional_fee > 0 && ` (+${p.fee_percentage ? `${p.additional_fee}%` : money(p.additional_fee)})`}</b><small>{p.description}</small></span>
                      </label>
                    ))}
                  </div>
                )}
                {cart.totals.rewardPoints?.balance > 0 && (
                  <label className="check" htmlFor="checkout-use-reward-points"><input type="checkbox" id="checkout-use-reward-points" checked={useRP} onChange={(e) => setUseRP(e.target.checked)} /> Use my reward points, {cart.totals.rewardPoints.balance} reward points ({money(cart.totals.rewardPoints.balanceAmount)}) available</label>
                )}
                {contBtn(4)}</>}
              {s.key === 'info' && <>
                {pm?.kind === 'card' ? (
                  <div className="form-grid" id="checkout-card-form">
                    <Field label="Cardholder name" id="checkout-card-name" required><input id="checkout-card-name" autoComplete="off" value={card.cardholderName} onChange={(e) => setCard({ ...card, cardholderName: e.target.value })} /></Field>
                    <Field label="Card number" id="checkout-card-number" required hint="Test mode: use 4111 1111 1111 1111"><input id="checkout-card-number" inputMode="numeric" autoComplete="off" value={card.cardNumber} onChange={(e) => setCard({ ...card, cardNumber: e.target.value })} /></Field>
                    <Field label="Expiration date" id="checkout-card-month" required>
                      <div className="row-gap">
                        <select id="checkout-card-month" value={card.expireMonth} onChange={(e) => setCard({ ...card, expireMonth: e.target.value })}><option value="">Month</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select>
                        <label htmlFor="checkout-card-year" className="sr-only">Year</label>
                        <select id="checkout-card-year" value={card.expireYear} onChange={(e) => setCard({ ...card, expireYear: e.target.value })}><option value="">Year</option>{Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + i).map((y) => <option key={y} value={y}>{y}</option>)}</select>
                      </div>
                    </Field>
                    <Field label="Card code" id="checkout-card-code" required><input id="checkout-card-code" inputMode="numeric" autoComplete="off" maxLength={4} value={card.cardCode} onChange={(e) => setCard({ ...card, cardCode: e.target.value })} /></Field>
                  </div>
                ) : <p className="muted" id="checkout-payment-info-text">{pm?.description || 'No payment information is required.'}</p>}
                {contBtn(5)}</>}
              {s.key === 'confirm' && <>
                <div className="confirm-summary" id="checkout-confirm-summary">
                  <div><h4>Billing address</h4><p>{addrLine(billing)}<br />{billing.email} · {billing.phone}</p></div>
                  {shippable && <div><h4>{pickup ? 'Pickup point' : 'Shipping address'}</h4><p>{pickup ? opt.pickupPoints.find((p) => String(p.id) === String(pickupPointId))?.name : addrLine(sameAddress ? billing : shipping)}</p></div>}
                  <div><h4>Shipping method</h4><p>{cart.totals.shippingMethodName || '—'}</p></div>
                  <div><h4>Payment method</h4><p>{pm?.name || 'Not required'}</p></div>
                </div>
                <Field label="Comment for the order" id="checkout-comment"><textarea id="checkout-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
                {opt.termsRequired && <label className="check" htmlFor="checkout-terms"><input type="checkbox" id="checkout-terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree with the terms of service</label>}
                <div className="step-actions"><button className="dark-button" id="checkout-confirm" disabled={busy} onClick={confirm}><Lock size={15} /> {busy ? 'Placing order…' : 'Confirm'}</button></div>
              </>}
            </>)}</div>
          ))}
        </div>
        <aside className="card checkout-summary" id="checkout-summary">
          <h3>Order summary</h3>
          {cart.items.map((i) => (
            <div className="summary-row" key={i.id}><ProductArt name={i.name} src={i.picture} size="xs" /><div><b>{i.name}</b><small className="attr-desc">{i.attributesDesc}</small><small>{i.quantity} × {money(i.unitPrice - i.unitDiscount)}</small></div><b>{money(i.lineTotal)}</b></div>
          ))}
          {cart.checkoutAttributesDesc && <p className="attr-desc">{cart.checkoutAttributesDesc}</p>}
          <TotalsTable cart={cart} id="checkout-totals" />
          {currency.code !== 'USD' && <p className="muted small">Displayed in {currency.code}; charged in USD.</p>}
        </aside>
      </div>
    </div>
  )
}

export function CompletedPage() {
  const { id } = useParams()
  useDocumentTitle('Thank you')
  const [{ data, loading, error }] = useAsync(() => api.get(`/checkout/completed/${id}`), [id])
  const { customer } = useStore()
  const money = useMoney()
  if (loading) return <Loading />
  return (
    <div className="container section completed" id="checkout-completed">
      <CheckCircle2 size={56} className="ok-icon" />
      <PageTitle>Thank you</PageTitle>
      {error ? <Notice type="error">{error.message}</Notice> : (
        <>
          <p className="lead" id="checkout-completed-message">Your order has been successfully processed!</p>
          <p id="checkout-completed-number">ORDER NUMBER: <b>{data.custom_number || data.id}</b></p>
          <p className="muted">Total {money(data.total)} · {data.payment_method_name || 'No payment required'} · Payment status: {data.payment_status}</p>
          <div className="row-gap center">
            {customer && <Link to={`/orderdetails/${data.id}`} className="ghost-button" id="checkout-completed-details">Click here for order details</Link>}
            <Link to="/" className="dark-button" id="checkout-completed-continue">Continue</Link>
          </div>
        </>
      )}
    </div>
  )
}

export function PayPalPage() {
  const { guid } = useParams()
  const nav = useNavigate()
  const money = useMoney()
  const [{ data, loading, error }] = useAsync(() => api.get(`/checkout/paypal/${guid}`), [guid])
  const act = async (approve) => { const r = await api.post(`/checkout/paypal/${guid}`, { approve }); nav(`/checkout/completed/${r.orderId}`) }
  if (loading) return <Loading />
  if (error) return <div className="container section"><Notice type="error">{error.message}</Notice></div>
  return (
    <div className="container section" id="paypal-sandbox">
      <div className="card paypal-card">
        <p className="eyebrow">Payment sandbox</p>
        <h2>Approve payment</h2>
        <p>Order #{data.id} · {data.customer_email}</p>
        <p className="lead">Amount: <b>{money(data.total)}</b></p>
        {data.payment_status === 'Paid' ? <Notice type="success">This order is already paid.</Notice> : (
          <div className="row-gap">
            <button className="dark-button" id="paypal-approve" onClick={() => act(true)}>Pay now</button>
            <button className="ghost-button" id="paypal-cancel" onClick={() => act(false)}>Cancel and return to store</button>
          </div>
        )}
      </div>
    </div>
  )
}

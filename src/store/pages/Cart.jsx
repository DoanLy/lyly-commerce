import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2, Tag, Gift, Truck, X, Share2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useStore, Loading, Breadcrumb, Notice, ProductArt, PageTitle, Field, readList, useDocumentTitle, useMoney, Stars } from '../ui.jsx'
import { ProductGrid } from '../layout.jsx'

export function TotalsTable({ cart, id = 'cart-totals' }) {
  const money = useMoney()
  const t = cart.totals
  const row = (label, value, key, neg) => <tr id={`${id}-${key}`}><th>{label}</th><td>{neg ? `-${money(value)}` : value}</td></tr>
  return (
    <table className="totals" id={id}>
      <tbody>
        {row('Sub-Total:', money(t.subtotal), 'subtotal')}
        {t.subtotalDiscount > 0 && row('Discount:', t.subtotalDiscount, 'discount', true)}
        <tr id={`${id}-shipping`}><th>Shipping:{t.shippingMethodName && <small> ({t.shippingMethodName})</small>}</th><td>{t.shipping == null ? <small className="muted">Calculated during checkout</small> : t.shipping === 0 ? 'Free' : money(t.shipping)}</td></tr>
        {t.paymentFee > 0 && row('Payment method additional fee:', money(t.paymentFee), 'payment-fee')}
        {row('Tax:', money(t.tax), 'tax')}
        {t.orderDiscount > 0 && row('Order discount:', t.orderDiscount, 'order-discount', true)}
        {t.giftCards.filter((g) => g.amount > 0).map((g) => <tr key={g.code} id={`${id}-giftcard-${g.code}`}><th>Gift card ({g.code}):<small> {money(g.remaining)} remaining</small></th><td>-{money(g.amount)}</td></tr>)}
        {t.rewardPoints?.used > 0 && row(`${t.rewardPoints.used} reward points:`, t.rewardPoints.usedAmount, 'reward-points', true)}
        <tr className="grand" id={`${id}-total`}><th>Total:</th><td>{t.total == null ? <small className="muted">Calculated during checkout</small> : <b>{money(t.total)}</b>}</td></tr>
      </tbody>
    </table>
  )
}

function CheckoutAttributes({ attrs, state, onSave }) {
  const [sel, setSel] = useState(state || {})
  if (!attrs?.length) return null
  const set = (id, v) => { const next = { ...sel, [id]: v }; setSel(next); onSave(next) }
  return (
    <div className="card" id="cart-checkout-attributes">
      {attrs.map((a) => {
        const values = typeof a.values === 'string' ? JSON.parse(a.values) : a.values
        const id = `cart-checkout-attribute-${a.id}`
        return (
          <div className="field" key={a.id}>
            <label htmlFor={id}>{a.text_prompt || a.name}{a.is_required && <em> *</em>}</label>
            {a.control_type === 'textbox' || a.control_type === 'multiline'
              ? <input id={id} value={sel[a.id] || ''} onChange={(e) => setSel({ ...sel, [a.id]: e.target.value })} onBlur={() => onSave(sel)} />
              : (
                <select id={id} value={sel[a.id] ?? values.find((v) => v.is_preselected)?.id ?? ''} onChange={(e) => set(a.id, Number(e.target.value) || '')}>
                  <option value="">--- Please select ---</option>
                  {values.map((v) => <option key={v.id} value={v.id}>{v.name}{v.price_adjustment ? ` [+$${v.price_adjustment.toFixed(2)}]` : ''}</option>)}
                </select>
              )}
          </div>
        )
      })}
    </div>
  )
}

export function CartPage() {
  useDocumentTitle('Shopping cart')
  const { boot, notify, setCounts, refresh } = useStore()
  const money = useMoney()
  const nav = useNavigate()
  const [cart, setCart] = useState(null)
  const [qtys, setQtys] = useState({})
  const [coupon, setCoupon] = useState('')
  const [gift, setGift] = useState('')
  const [msg, setMsg] = useState({})
  const [terms, setTerms] = useState(false)
  const [estimate, setEstimate] = useState(null)
  const [cross, setCross] = useState([])
  const load = async () => {
    const c = await api.get('/cart')
    setCart(c)
    setQtys(Object.fromEntries(c.items.map((i) => [i.id, i.quantity])))
    setCounts({ cartCount: c.items.reduce((s, i) => s + i.quantity, 0) })
    if (c.crossSellIds?.length) api.get('/products-by-ids', { ids: c.crossSellIds.join(',') }).then(setCross)
    else setCross([])
  }
  useEffect(() => { load().catch((e) => notify(e.message, 'error')) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cart) return <Loading />
  const update = async () => {
    const errors = []
    for (const it of cart.items) {
      if (qtys[it.id] !== it.quantity) await api.patch(`/cart/${it.id}`, { quantity: qtys[it.id] }).catch((e) => errors.push(`${it.name}: ${e.message}`))
    }
    await load()
    if (errors.length) notify(errors[0], 'error')
  }
  const remove = async (id) => { await api.del(`/cart/${id}`); await load() }
  const applyCoupon = async (e) => {
    e.preventDefault()
    try { const r = await api.post('/cart/coupon', { code: coupon }); setMsg({ coupon: { type: r.warning ? 'warning' : 'success', text: r.warning || r.message } }); setCoupon(''); await load() } catch (x) { setMsg({ coupon: { type: 'error', text: x.message } }) }
  }
  const removeCoupon = async (code) => { await api.post('/cart/coupon', { code, remove: true }); await load() }
  const applyGift = async (e) => {
    e.preventDefault()
    try { const r = await api.post('/cart/gift-card', { code: gift }); setMsg({ gift: { type: 'success', text: r.message } }); setGift(''); await load() } catch (x) { setMsg({ gift: { type: 'error', text: x.message } }) }
  }
  const removeGift = async (code) => { await api.post('/cart/gift-card', { code, remove: true }); await load() }
  const saveAttrs = async (attributes) => { await api.post('/cart/checkout-attributes', { attributes }); await load() }
  const doEstimate = async () => setEstimate(await api.post('/cart/estimate-shipping'))
  const checkout = () => {
    if (boot.settings.orders.termsOfServiceOnCart && !terms) { notify('Please accept the terms of service before the next step.', 'error'); return }
    nav('/checkout')
  }
  const hasErrors = cart.items.some((i) => i.warnings.length) || cart.warnings.length > 0 || cart.checkoutAttributeErrors.length > 0
  return (
    <div className="container cart-page" id="cart-page" data-cart-count={cart.items.length}>
      <Breadcrumb items={[{ label: 'Shopping cart' }]} />
      <PageTitle>Shopping cart</PageTitle>
      {!cart.items.length ? (
        <div className="empty" id="cart-empty">Your Shopping Cart is empty! <Link to="/" className="text-link">Continue shopping</Link></div>
      ) : (
        <>
          {cart.freeShippingRemaining > 0 && <Notice type="info" id="cart-free-shipping">Add {money(cart.freeShippingRemaining)} more to get free shipping.</Notice>}
          {cart.warnings.map((w) => <Notice key={w} type="warning">{w}</Notice>)}
          <div className="table-wrap">
            <table className="cart-table" id="cart-table">
              <thead><tr><th>Product</th><th>Price</th><th>Qty.</th><th>Total</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody id="cart-table-body">
                {cart.items.map((i) => (
                  <tr key={i.id} id={`cart-row-${i.id}`} data-product-id={i.productId}>
                    <td className="cart-product">
                      <Link to={`/product/${i.slug}`}><ProductArt name={i.name} src={i.picture} size="xs" /></Link>
                      <div>
                        <Link to={`/product/${i.slug}`} id={`cart-row-name-${i.id}`}><b>{i.name}</b></Link>
                        {i.sku && <small className="muted">SKU: {i.sku}</small>}
                        {i.attributesDesc && <small className="attr-desc">{i.attributesDesc}</small>}
                        {i.warnings.map((w) => <small key={w} className="field-error" id={`cart-row-warning-${i.id}`}>{w}</small>)}
                      </div>
                    </td>
                    <td data-label="Price">{i.unitDiscount > 0 && <s className="muted">{money(i.unitPrice)}</s>} {money(i.unitPrice - i.unitDiscount)}</td>
                    <td data-label="Qty"><label htmlFor={`cart-row-qty-${i.id}`} className="sr-only">Quantity</label><input className="qty-input" id={`cart-row-qty-${i.id}`} type="number" min="0" value={qtys[i.id] ?? i.quantity} onChange={(e) => setQtys({ ...qtys, [i.id]: parseInt(e.target.value, 10) || 0 })} /></td>
                    <td data-label="Total"><b id={`cart-row-total-${i.id}`}>{money(i.lineTotal)}</b>{i.unitDiscount > 0 && <small className="saving">You save {money(i.unitDiscount * i.quantity)}</small>}</td>
                    <td><button className="icon-round" id={`cart-row-remove-${i.id}`} aria-label={`Remove ${i.name}`} onClick={() => remove(i.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-gap wrap cart-buttons">
            <button className="ghost-button" id="cart-update" onClick={update}>Update shopping cart</button>
            <Link to="/" className="ghost-button" id="cart-continue">Continue shopping</Link>
            <button className="text-link" id="cart-clear" onClick={async () => { await api.post('/cart/clear'); await load(); refresh() }}>Clear cart</button>
          </div>
          <div className="cart-grid">
            <div className="cart-left">
              <CheckoutAttributes attrs={cart.checkoutAttributes} state={cart.state.checkoutAttributes} onSave={saveAttrs} />
              {cart.checkoutAttributeErrors.map((e) => <Notice key={e} type="warning">{e}</Notice>)}
              <form className="card" onSubmit={applyCoupon} id="cart-coupon-form">
                <h3><Tag size={16} /> Discount code</h3>
                <p className="muted">Enter your coupon here</p>
                <div className="row-gap"><label htmlFor="cart-coupon-code" className="sr-only">Discount code</label><input id="cart-coupon-code" className="grow" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="e.g. WELCOME10" /><button className="ghost-button" id="cart-coupon-apply">Apply coupon</button></div>
                {msg.coupon && <Notice type={msg.coupon.type} id="cart-coupon-message">{msg.coupon.text}</Notice>}
                {cart.couponCodes.map((c) => (
                  <div className="applied" key={c.code} id={`cart-coupon-${c.code}`}>Entered coupon code - <b>{c.code}</b> {!c.valid && <small className="field-error">(not applicable)</small>}<button type="button" className="icon-button" aria-label="Remove coupon" id={`cart-coupon-remove-${c.code}`} onClick={() => removeCoupon(c.code)}><X size={14} /></button></div>
                ))}
              </form>
              <form className="card" onSubmit={applyGift} id="cart-giftcard-form">
                <h3><Gift size={16} /> Gift cards</h3>
                <div className="row-gap"><label htmlFor="cart-giftcard-code" className="sr-only">Gift card code</label><input id="cart-giftcard-code" className="grow" value={gift} onChange={(e) => setGift(e.target.value)} placeholder="Gift card code" /><button className="ghost-button" id="cart-giftcard-apply">Add gift card</button></div>
                {msg.gift && <Notice type={msg.gift.type} id="cart-giftcard-message">{msg.gift.text}</Notice>}
                {(cart.state.giftCardCodes || []).map((c) => <div className="applied" key={c}>Gift card - <b>{c}</b><button type="button" className="icon-button" aria-label="Remove gift card" id={`cart-giftcard-remove-${c}`} onClick={() => removeGift(c)}><X size={14} /></button></div>)}
              </form>
              {boot.settings.shipping.estimateEnabled && cart.shippable && (
                <div className="card" id="cart-estimate-shipping">
                  <h3><Truck size={16} /> Estimate shipping</h3>
                  <button className="ghost-button small" id="cart-estimate-button" onClick={doEstimate}>Estimate</button>
                  {estimate && <ul className="estimate-list">{estimate.options.map((o) => <li key={o.id}><b>{o.name}</b> — {o.rate === 0 ? 'Free' : money(o.rate)}<small className="muted"> {o.description}</small></li>)}</ul>}
                </div>
              )}
            </div>
            <div className="cart-right card">
              <TotalsTable cart={cart} />
              {cart.discounts.length > 0 && <p className="muted small" id="cart-applied-discounts">Applied: {cart.discounts.map((d) => d.name).join(', ')}</p>}
              {boot.settings.orders.termsOfServiceOnCart && (
                <label className="check" htmlFor="cart-terms"><input type="checkbox" id="cart-terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree with the <Link to="/page/conditions-of-use" target="_blank">terms of service</Link> and I adhere to them unconditionally</label>
              )}
              <button className="dark-button wide" id="cart-checkout" disabled={hasErrors} onClick={checkout}>Checkout</button>
              {hasErrors && <small className="field-error">Please fix the issues above before checkout.</small>}
            </div>
          </div>
          {cross.length > 0 && <section className="section-sm" id="cart-cross-sells"><h2 className="block-title">You may also like</h2><ProductGrid products={cross} idPrefix="cart-cross" /></section>}
        </>
      )}
    </div>
  )
}

export function WishlistPage({ shared }) {
  const { guid } = useParams()
  useDocumentTitle('Wishlist')
  const { notify, setCounts, customer, boot } = useStore()
  const money = useMoney()
  const [data, setData] = useState(null)
  const [qtys, setQtys] = useState({})
  const [checked, setChecked] = useState([])
  const [email, setEmail] = useState(null)
  const load = async () => {
    const d = shared ? await api.get(`/wishlist/shared/${guid}`) : await api.get('/cart', { type: 'wishlist' })
    setData(d)
    setQtys(Object.fromEntries(d.items.map((i) => [i.id, i.quantity])))
    if (!shared) setCounts({ wishlistCount: d.items.length })
  }
  useEffect(() => { load().catch((e) => notify(e.message, 'error')) }, [guid]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <Loading />
  const update = async () => { for (const it of data.items) if (qtys[it.id] !== it.quantity) await api.patch(`/cart/${it.id}`, { quantity: qtys[it.id] }); await load() }
  const toCart = async (ids) => {
    const r = await api.post('/wishlist/move-to-cart', { ids })
    if (r.errors.length) notify(r.errors[0], 'error'); else notify('Selected products have been added to your', 'success', { to: '/cart', label: 'shopping cart' })
    await load()
    api.get('/bootstrap').then((b) => setCounts({ cartCount: b.cartCount }))
  }
  const shareUrl = data.guid ? `${window.location.origin}/wishlist/${data.guid}` : ''
  return (
    <div className="container" id="wishlist-page">
      <Breadcrumb items={[{ label: 'Wishlist' }]} />
      <PageTitle>{shared ? `Wishlist of ${data.owner || 'a customer'}` : 'Wishlist'}</PageTitle>
      {!data.items.length ? <div className="empty" id="wishlist-empty">The wishlist is empty!</div> : (
        <>
          <div className="table-wrap">
            <table className="cart-table" id="wishlist-table">
              <thead><tr>{!shared && <th>Add to cart</th>}<th>Product</th><th>Price</th><th>Qty.</th><th>Total</th>{!shared && <th />}</tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} id={`wishlist-row-${i.id}`}>
                    {!shared && <td><label htmlFor={`wishlist-row-check-${i.id}`} className="sr-only">Select</label><input type="checkbox" id={`wishlist-row-check-${i.id}`} checked={checked.includes(i.id)} onChange={() => setChecked(checked.includes(i.id) ? checked.filter((x) => x !== i.id) : [...checked, i.id])} /></td>}
                    <td className="cart-product"><ProductArt name={i.name} src={i.picture} size="xs" /><div><Link to={`/product/${i.slug}`}><b>{i.name}</b></Link>{i.attributesDesc && <small className="attr-desc">{i.attributesDesc}</small>}{i.warnings.map((w) => <small key={w} className="field-error">{w}</small>)}</div></td>
                    <td data-label="Price">{money(i.unitPrice)}</td>
                    <td data-label="Qty">{shared ? i.quantity : <input className="qty-input" id={`wishlist-row-qty-${i.id}`} type="number" min="0" value={qtys[i.id]} onChange={(e) => setQtys({ ...qtys, [i.id]: parseInt(e.target.value, 10) || 0 })} />}</td>
                    <td data-label="Total"><b>{money(i.lineTotal)}</b></td>
                    {!shared && <td><button className="icon-round" id={`wishlist-row-remove-${i.id}`} aria-label="Remove" onClick={async () => { await api.del(`/cart/${i.id}`); await load() }}><Trash2 size={15} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shared && (
            <div className="row-gap wrap cart-buttons">
              <button className="ghost-button" id="wishlist-update" onClick={update}>Update wishlist</button>
              <button className="dark-button" id="wishlist-add-to-cart" disabled={!checked.length} onClick={() => toCart(checked)}>Add to cart</button>
              {customer && boot.settings.catalog.emailWishlistEnabled && <button className="ghost-button" id="wishlist-email" onClick={() => setEmail({ friendEmail: '', message: '' })}>Email a friend</button>}
            </div>
          )}
          {!shared && shareUrl && <p className="muted share-link" id="wishlist-share"><Share2 size={14} /> Your wishlist URL for sharing: <a href={shareUrl} id="wishlist-share-url">{shareUrl}</a></p>}
        </>
      )}
      {email && (
        <div className="modal-overlay" onClick={() => setEmail(null)}>
          <form className="modal" id="wishlist-email-modal" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); try { const r = await api.post('/wishlist/email', email); notify(r.message); setEmail(null) } catch (x) { notify(x.message, 'error') } }}>
            <div className="modal-head"><h3>Email your wishlist to a friend</h3><button type="button" className="icon-button" onClick={() => setEmail(null)} aria-label="Close"><X /></button></div>
            <Field label="Friend's email" id="wishlist-email-friend" required><input type="email" id="wishlist-email-friend" value={email.friendEmail} onChange={(e) => setEmail({ ...email, friendEmail: e.target.value })} /></Field>
            <Field label="Personal message" id="wishlist-email-message"><textarea id="wishlist-email-message" rows={3} value={email.message} onChange={(e) => setEmail({ ...email, message: e.target.value })} /></Field>
            <button className="dark-button" id="wishlist-email-send">Send email</button>
          </form>
        </div>
      )}
    </div>
  )
}

export function ComparePage() {
  useDocumentTitle('Compare products')
  const { compare, addToCart } = useStore()
  const money = useMoney()
  const [items, setItems] = useState(null)
  useEffect(() => { api.get('/products-by-ids', { ids: compare.ids.join(','), full: 1 }).then(setItems) }, [compare.ids])
  if (!items) return <Loading />
  const specNames = [...new Set(items.flatMap((p) => p.specs.map((s) => s.attr)))]
  return (
    <div className="container" id="compare-page">
      <Breadcrumb items={[{ label: 'Compare products' }]} />
      <PageTitle>Compare products</PageTitle>
      {!items.length ? <div className="empty" id="compare-empty">You have no items to compare.</div> : (
        <>
          <button className="text-link" id="compare-clear" onClick={compare.clear}>Clear list</button>
          <div className="table-wrap">
            <table className="compare-table" id="compare-table">
              <tbody>
                <tr><th />{items.map((p) => <td key={p.id}><button className="text-link" id={`compare-remove-${p.id}`} onClick={() => compare.remove(p.id)}>Remove</button></td>)}</tr>
                <tr><th>Product</th>{items.map((p) => <td key={p.id}><Link to={`/product/${p.slug}`}><ProductArt name={p.name} src={p.picture} size="sm" /><b>{p.name}</b></Link></td>)}</tr>
                <tr><th>Price</th>{items.map((p) => <td key={p.id}>{money(p.price)}</td>)}</tr>
                <tr><th>Rating</th>{items.map((p) => <td key={p.id}><Stars value={p.rating} count={p.reviews} /></td>)}</tr>
                <tr><th>Manufacturer</th>{items.map((p) => <td key={p.id}>{p.manufacturer || '—'}</td>)}</tr>
                <tr><th>SKU</th>{items.map((p) => <td key={p.id}>{p.sku}</td>)}</tr>
                <tr><th>Weight</th>{items.map((p) => <td key={p.id}>{p.weight ? `${p.weight} kg` : '—'}</td>)}</tr>
                {specNames.map((n) => <tr key={n}><th>{n}</th>{items.map((p) => <td key={p.id}>{p.specs.find((s) => s.attr === n)?.value || '—'}</td>)}</tr>)}
                <tr><th />{items.map((p) => <td key={p.id}><button className="ghost-button small" id={`compare-add-${p.id}`} onClick={() => addToCart(p)}>Add to cart</button></td>)}</tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function RecentlyViewedPage() {
  useDocumentTitle('Recently viewed products')
  const { boot } = useStore()
  const [items, setItems] = useState(null)
  useEffect(() => { const ids = readList('lyc-recent').slice(0, boot.settings.catalog.recentlyViewedCount * 3); api.get('/products-by-ids', { ids: ids.join(',') }).then(setItems) }, [boot])
  return (
    <div className="container" id="recently-viewed-page">
      <Breadcrumb items={[{ label: 'Recently viewed products' }]} />
      <PageTitle>Recently viewed products</PageTitle>
      {!items ? <Loading /> : items.length ? <ProductGrid products={items} idPrefix="recent" /> : <div className="empty" id="recent-empty">No products were viewed yet.</div>}
    </div>
  )
}

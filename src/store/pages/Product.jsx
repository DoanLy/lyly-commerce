import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Heart, Repeat2, Mail, Bell, Minus, Plus, ThumbsUp, ThumbsDown, Truck, X } from 'lucide-react'
import { api, formatDate } from '../../lib/api.js'
import { useStore, useAsync, Loading, Breadcrumb, Notice, ProductArt, Stars, Field, readList, writeList, useDocumentTitle, useMoney } from '../ui.jsx'
import { ProductGrid } from '../layout.jsx'

function defaultSelection(attrs) {
  const sel = {}
  for (const a of attrs) {
    const pre = a.values.filter((v) => v.preselected).map((v) => v.id)
    if (a.control === 'checkbox') sel[a.id] = pre
    else if (['textbox', 'multiline'].includes(a.control)) sel[a.id] = ''
    else if (pre.length) sel[a.id] = pre[0]
  }
  return sel
}

export function AttributeControls({ attributes, value, onChange, idPrefix = 'product-attribute' }) {
  const money = useMoney()
  const label = (v) => `${v.name}${v.priceAdjustment ? ` [${v.priceAdjustment > 0 ? '+' : '-'}${v.percent ? `${Math.abs(v.priceAdjustment)}%` : money(Math.abs(v.priceAdjustment))}]` : ''}`
  return (
    <div className="attributes" id={`${idPrefix}s`}>
      {attributes.map((a) => {
        const id = `${idPrefix}-${a.id}`
        const set = (v) => onChange({ ...value, [a.id]: v })
        return (
          <div className="attribute" key={a.id} id={`${id}-block`}>
            <label htmlFor={id} className="attr-label">{a.prompt}{a.required && <em> *</em>}</label>
            {a.control === 'dropdown' && (
              <select id={id} name={`attr-${a.id}`} value={value[a.id] ?? ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : '')}>
                {!a.values.some((v) => v.preselected) && <option value="">--- Please select ---</option>}
                {a.values.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
              </select>
            )}
            {(a.control === 'radio' || a.control === 'color') && (
              <div className={`option-list ${a.control === 'color' ? 'swatches' : ''}`} id={id}>
                {a.values.map((v) => (
                  <label key={v.id} htmlFor={`${id}-${v.id}`} className={`option ${value[a.id] === v.id ? 'active' : ''}`} title={label(v)}>
                    <input type="radio" id={`${id}-${v.id}`} name={`attr-${a.id}`} checked={value[a.id] === v.id} onChange={() => set(v.id)} />
                    {a.control === 'color' ? <i style={{ background: v.color || '#ccc' }} /> : null}
                    <span>{label(v)}</span>
                  </label>
                ))}
              </div>
            )}
            {a.control === 'checkbox' && (
              <div className="option-list" id={id}>
                {a.values.map((v) => {
                  const arr = value[a.id] || []
                  return (
                    <label key={v.id} htmlFor={`${id}-${v.id}`} className="check">
                      <input type="checkbox" id={`${id}-${v.id}`} checked={arr.includes(v.id)} onChange={() => set(arr.includes(v.id) ? arr.filter((x) => x !== v.id) : [...arr, v.id])} /> {label(v)}
                    </label>
                  )
                })}
              </div>
            )}
            {a.control === 'textbox' && <input id={id} name={`attr-${a.id}`} value={value[a.id] || ''} onChange={(e) => set(e.target.value)} maxLength={200} />}
            {a.control === 'multiline' && <textarea id={id} name={`attr-${a.id}`} value={value[a.id] || ''} onChange={(e) => set(e.target.value)} rows={3} />}
          </div>
        )
      })}
    </div>
  )
}

function computePrice(p, sel, qty, customPrice) {
  let base = p.customerEntersPrice ? Number(customPrice) || 0 : p.basePrice
  const tier = [...(p.tierPrices || [])].reverse().find((t) => qty >= t.quantity)
  if (tier && !p.customerEntersPrice) base = tier.price
  let adj = 0
  for (const a of p.attributes || []) {
    const ids = Array.isArray(sel[a.id]) ? sel[a.id] : sel[a.id] ? [sel[a.id]] : []
    for (const v of a.values) if (ids.includes(v.id)) adj += v.percent ? p.basePrice * v.priceAdjustment / 100 : v.priceAdjustment
  }
  return Math.max(0, base + adj - (p.discount || 0))
}

function QtyInput({ value, onChange, product, id }) {
  if (product.allowedQuantities?.length) {
    return <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>{product.allowedQuantities.map((n) => <option key={n} value={n}>{n}</option>)}</select>
  }
  return (
    <div className="qty" id={`${id}-wrap`}>
      <button type="button" id={`${id}-minus`} aria-label="Decrease" onClick={() => onChange(Math.max(1, value - 1))}><Minus size={14} /></button>
      <input id={id} name="quantity" type="number" min="1" value={value} onChange={(e) => onChange(Math.max(1, parseInt(e.target.value, 10) || 1))} aria-label="Quantity" />
      <button type="button" id={`${id}-plus`} aria-label="Increase" onClick={() => onChange(value + 1)}><Plus size={14} /></button>
    </div>
  )
}

function BuyBox({ p, idPrefix = 'product' }) {
  const { addToCart, addToWishlist, compare, boot, notify, customer } = useStore()
  const money = useMoney()
  const [sel, setSel] = useState(() => defaultSelection(p.attributes))
  const [qty, setQty] = useState(p.allowedQuantities?.[0] || p.minQty || 1)
  const [customPrice, setCustomPrice] = useState(p.minCustomerPrice || '')
  const [gift, setGift] = useState({ recipientName: '', recipientEmail: '', senderName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '', senderEmail: customer?.email || '', message: '' })
  const [busy, setBusy] = useState(false)
  const [bis, setBis] = useState(p.backInStockSubscribed)
  const unit = computePrice(p, sel, qty, customPrice)
  const attrs = p.isGiftCard ? { ...sel, giftCard: gift } : sel
  const add = async (type) => {
    setBusy(true)
    try { await (type === 'wishlist' ? addToWishlist : addToCart)(p, qty, { attributes: attrs, customerPrice: customPrice, fromProductPage: true }) } catch { /* toast shown */ } finally { setBusy(false) }
  }
  const toggleBis = async () => {
    try { const r = await api.post(`/products/${p.id}/back-in-stock`); setBis(r.subscribed); notify(r.message, 'info') } catch (e) { notify(e.message, 'error') }
  }
  const g = (k) => (e) => setGift({ ...gift, [k]: e.target.value })
  return (
    <div className="buy-box" id={`${idPrefix}-buy-box`}>
      {p.attributes.length > 0 && <AttributeControls attributes={p.attributes} value={sel} onChange={setSel} idPrefix={`${idPrefix}-attribute`} />}
      {p.isGiftCard && (
        <div className="gift-card-fields form-grid" id={`${idPrefix}-giftcard`}>
          <Field label="Recipient's name" id={`${idPrefix}-giftcard-recipient-name`} required><input id={`${idPrefix}-giftcard-recipient-name`} value={gift.recipientName} onChange={g('recipientName')} /></Field>
          {p.giftCardType === 'virtual' && <Field label="Recipient's email" id={`${idPrefix}-giftcard-recipient-email`} required><input type="email" id={`${idPrefix}-giftcard-recipient-email`} value={gift.recipientEmail} onChange={g('recipientEmail')} /></Field>}
          <Field label="Your name" id={`${idPrefix}-giftcard-sender-name`} required><input id={`${idPrefix}-giftcard-sender-name`} value={gift.senderName} onChange={g('senderName')} /></Field>
          {p.giftCardType === 'virtual' && <Field label="Your email" id={`${idPrefix}-giftcard-sender-email`} required><input type="email" id={`${idPrefix}-giftcard-sender-email`} value={gift.senderEmail} onChange={g('senderEmail')} /></Field>}
          <Field label="Message" id={`${idPrefix}-giftcard-message`} className="span-2"><textarea id={`${idPrefix}-giftcard-message`} value={gift.message} onChange={g('message')} rows={3} /></Field>
        </div>
      )}
      {p.customerEntersPrice && (
        <Field label={`Enter price (${money(p.minCustomerPrice)} – ${money(p.maxCustomerPrice)})`} id={`${idPrefix}-customer-price`}>
          <input id={`${idPrefix}-customer-price`} type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
        </Field>
      )}
      {p.tierPrices?.length > 0 && (
        <table className="tier-prices" id={`${idPrefix}-tier-prices`}>
          <thead><tr><th>Quantity</th>{p.tierPrices.map((t) => <th key={t.quantity}>{t.quantity}+</th>)}</tr></thead>
          <tbody><tr><td>Price</td>{p.tierPrices.map((t) => <td key={t.quantity}>{money(t.price)}</td>)}</tr></tbody>
        </table>
      )}
      <div className="buy-price" id={`${idPrefix}-price`}>
        {p.callForPrice ? <strong>Call for price</strong> : <>
          {p.oldPrice > p.price && <s id={`${idPrefix}-old-price`}>{money(p.oldPrice)}</s>}
          <strong id={`${idPrefix}-price-value`} data-price={unit.toFixed(2)}>{money(unit)}</strong>
          {boot.settings.tax.displayTaxSuffix && <small>excl. tax</small>}
        </>}
      </div>
      {p.stock?.text && <p className={`stock ${p.stock.inStock ? 'in' : 'out'}`} id={`${idPrefix}-stock`}>Availability: <b>{p.stock.text}</b></p>}
      {(p.isShippingEnabled === false || p.isDownload) ? <p className="muted"><Truck size={14} /> {p.isDownload ? 'Instant download after payment' : 'No shipping required'}</p> : p.isFreeShipping && <p className="free-ship"><Truck size={14} /> Free shipping</p>}
      <div className="buy-row">
        {!p.disableBuy && !p.callForPrice && (
          <>
            <QtyInput value={qty} onChange={setQty} product={p} id={`${idPrefix}-quantity`} />
            <button className="dark-button" id={`${idPrefix}-add-to-cart`} disabled={busy || !p.stock?.inStock} onClick={() => add('cart')}>{p.availableForPreorder ? 'Pre-order' : 'Add to cart'}</button>
          </>
        )}
        {!p.disableWishlist && boot.settings.catalog.wishlistEnabled && <button className="ghost-button" id={`${idPrefix}-add-to-wishlist`} disabled={busy} onClick={() => add('wishlist')}><Heart size={16} /> Wishlist</button>}
      </div>
      {p.allowBackInStock && (
        <button className="text-link" id={`${idPrefix}-back-in-stock`} onClick={toggleBis}><Bell size={14} /> {bis ? 'Unsubscribe from back in stock notification' : 'Notify me when available'}</button>
      )}
      {boot.settings.catalog.compareEnabled && idPrefix === 'product' && (
        <button className={`text-link ${compare.ids.includes(p.id) ? 'active' : ''}`} id="product-add-to-compare" onClick={() => compare.toggle(p.id)}><Repeat2 size={14} /> {compare.ids.includes(p.id) ? 'Remove from compare list' : 'Add to compare list'}</button>
      )}
    </div>
  )
}

function EmailFriend({ p, onClose }) {
  const { customer, notify } = useStore()
  const [form, setForm] = useState({ friendEmail: '', yourEmail: customer?.email || '', message: '' })
  const [err, setErr] = useState('')
  const send = async (e) => {
    e.preventDefault()
    try { const r = await api.post(`/products/${p.id}/email-friend`, form); notify(r.message); onClose() } catch (x) { setErr(x.message) }
  }
  return (
    <div className="modal-overlay" id="email-friend-modal" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <div className="modal-head"><h3>Email a friend</h3><button type="button" className="icon-button" onClick={onClose} id="email-friend-close" aria-label="Close"><X /></button></div>
        <p className="muted">{p.name}</p>
        <Notice type="error" id="email-friend-error">{err}</Notice>
        <Field label="Friend's email" id="email-friend-friend" required><input id="email-friend-friend" type="email" value={form.friendEmail} onChange={(e) => setForm({ ...form, friendEmail: e.target.value })} /></Field>
        <Field label="Your email address" id="email-friend-yours" required><input id="email-friend-yours" type="email" value={form.yourEmail} onChange={(e) => setForm({ ...form, yourEmail: e.target.value })} /></Field>
        <Field label="Personal message" id="email-friend-message"><textarea id="email-friend-message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
        <button className="dark-button" id="email-friend-send">Send email</button>
      </form>
    </div>
  )
}

function Reviews({ p, onAdded }) {
  const { customer, notify, boot } = useStore()
  const [form, setForm] = useState({ title: '', text: '', rating: 5 })
  const [msg, setMsg] = useState(null)
  const [votes, setVotes] = useState({})
  const canWrite = customer || boot.settings.catalog.allowAnonymousReviews
  const submit = async (e) => {
    e.preventDefault()
    try { const r = await api.post(`/products/${p.id}/reviews`, form); setMsg({ type: 'success', text: r.message }); setForm({ title: '', text: '', rating: 5 }); onAdded() } catch (x) { setMsg({ type: 'error', text: x.message }) }
  }
  const vote = async (r, helpful) => {
    try { const x = await api.post(`/reviews/${r.id}/helpful`, { helpful }); setVotes({ ...votes, [r.id]: x }) } catch (e) { notify(e.message, 'error') }
  }
  return (
    <div id="product-reviews">
      {p.reviewList.length === 0 && <p className="muted" id="product-reviews-empty">There are no reviews for this product yet.</p>}
      {p.reviewList.map((r) => (
        <div className="review" key={r.id} id={`product-review-${r.id}`}>
          <div className="review-head"><b>{r.title}</b><Stars value={r.rating} /></div>
          <p>{r.body}</p>
          <small className="muted">From: {r.author} · {formatDate(r.created_at)}</small>
          {r.reply_text && <div className="review-reply"><b>Store reply:</b> {r.reply_text}</div>}
          <div className="helpful" id={`product-review-helpful-${r.id}`}>
            Was this review helpful?
            <button onClick={() => vote(r, true)} id={`product-review-yes-${r.id}`}><ThumbsUp size={13} /> Yes ({votes[r.id]?.yes ?? r.helpful_yes})</button>
            <button onClick={() => vote(r, false)} id={`product-review-no-${r.id}`}><ThumbsDown size={13} /> No ({votes[r.id]?.no ?? r.helpful_no})</button>
          </div>
        </div>
      ))}
      {p.allowReviews && (
        <form className="review-form card" onSubmit={submit} id="product-review-form">
          <h3>Write your own review</h3>
          {!canWrite ? <Notice type="info">Only registered customers can write reviews. <Link to="/login">Log in</Link></Notice>
            : p.alreadyReviewed ? <Notice type="info">You have already reviewed this product.</Notice> : (
              <>
                {msg && <Notice type={msg.type} id="product-review-result">{msg.text}</Notice>}
                <Field label="Review title" id="product-review-title" required><input id="product-review-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <Field label="Review text" id="product-review-text" required><textarea id="product-review-text" rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
                <div className="field"><span className="attr-label">Rating</span>
                  <div className="rating-pick" id="product-review-rating">
                    <small>Bad</small>
                    {[1, 2, 3, 4, 5].map((n) => <label key={n} htmlFor={`product-review-rating-${n}`}><input type="radio" id={`product-review-rating-${n}`} name="rating" checked={form.rating === n} onChange={() => setForm({ ...form, rating: n })} /> {n}</label>)}
                    <small>Excellent</small>
                  </div>
                </div>
                <button className="dark-button" id="product-review-submit">Submit review</button>
              </>
            )}
        </form>
      )}
    </div>
  )
}

export default function ProductPage() {
  const { slug } = useParams()
  const { boot } = useStore()
  const [{ data: p, loading, error }, , ] = useAsync(() => api.get(`/products/${slug}`), [slug, 0])
  const [reload, setReload] = useState(0)
  const [fresh, setFresh] = useState(null)
  const [tab, setTab] = useState('description')
  const [pic, setPic] = useState(0)
  const [emailOpen, setEmailOpen] = useState(false)
  const product = fresh || p
  useDocumentTitle(product?.name)
  useEffect(() => { setFresh(null); setPic(0); setTab('description') }, [slug])
  useEffect(() => { if (reload) api.get(`/products/${slug}`).then(setFresh) }, [reload, slug])
  useEffect(() => {
    if (!p || !boot.settings.catalog.recentlyViewedEnabled) return
    writeList('lyc-recent', [p.id, ...readList('lyc-recent').filter((x) => x !== p.id)].slice(0, 12))
  }, [p, boot])
  const pics = useMemo(() => product?.pictures || [], [product])
  if (loading && !product) return <Loading />
  if (error) return <div className="container section"><Notice type="error">{error.message}</Notice><Link to="/" className="text-link">Back to home</Link></div>
  const x = product
  const cs = boot.settings.catalog
  return (
    <div className="container product-page" id="product-page" data-product-id={x.id}>
      <Breadcrumb items={[...x.breadcrumb.map((c) => ({ label: c.name, to: `/category/${c.slug}` })), { label: x.name }]} />
      <div className="product-top">
        <div className="gallery" id="product-gallery">
          <div className="gallery-main"><ProductArt name={x.name} src={pics[pic]?.url} alt={pics[pic]?.alt} size="lg" id="product-main-image" /></div>
          {pics.length > 1 && <div className="thumbs">{pics.map((ph, i) => <button key={ph.id} id={`product-thumb-${i}`} className={i === pic ? 'active' : ''} onClick={() => setPic(i)}><ProductArt name={x.name} src={ph.url} size="xs" /></button>)}</div>}
        </div>
        <div className="product-info">
          <h1 id="product-name">{x.name}</h1>
          <p className="product-short-desc" id="product-short-description">{x.short}</p>
          <div className="meta-line">
            {x.reviews > 0 ? <a href="#product-tabs" onClick={() => setTab('reviews')} id="product-rating-link"><Stars value={x.rating} count={x.reviews} /> {x.reviews} review(s)</a> : <button className="text-link" id="product-first-review" onClick={() => { setTab('reviews'); document.getElementById('product-tabs')?.scrollIntoView({ behavior: 'smooth' }) }}>Be the first to review this product</button>}
          </div>
          <dl className="product-meta" id="product-meta">
            {x.manufacturers.length > 0 && <><dt>Manufacturer</dt><dd>{x.manufacturers.map((m) => <Link key={m.id} to={`/manufacturer/${m.slug}`} id={`product-manufacturer-${m.slug}`}>{m.name}</Link>)}</dd></>}
            {cs.showSku && x.sku && <><dt>SKU</dt><dd id="product-sku">{x.sku}</dd></>}
            {cs.showManufacturerPartNumber && x.mpn && <><dt>Part number</dt><dd>{x.mpn}</dd></>}
            {cs.showGtin && x.gtin && <><dt>GTIN</dt><dd>{x.gtin}</dd></>}
            {x.isNew && <><dt>Status</dt><dd><span className="badge new">New</span></dd></>}
          </dl>
          {x.productType === 'grouped' ? (
            <div className="associated" id="product-associated">
              {x.associated.map((a) => (
                <div key={a.id} className="associated-item card" id={`product-associated-${a.id}`}>
                  <div className="row-gap"><ProductArt name={a.name} src={a.picture} size="xs" /><div><b>{a.name}</b><p className="muted">{a.short}</p></div></div>
                  <BuyBox p={{ ...a, tierPrices: [], attributes: a.attributes || [], allowedQuantities: [] }} idPrefix={`product-associated-${a.id}`} />
                </div>
              ))}
            </div>
          ) : <BuyBox p={x} key={x.id} />}
          {cs.emailAFriendEnabled && <button className="text-link" id="product-email-friend" onClick={() => setEmailOpen(true)}><Mail size={14} /> Email a friend</button>}
        </div>
      </div>

      <div className="tabs" id="product-tabs" data-active-tab={tab}>
        <div className="tab-list" role="tablist">
          {[['description', 'Description'], ['specs', 'Specifications'], ['reviews', `Reviews (${x.reviews})`], ['tags', 'Tags']].map(([k, l]) => (
            <button key={k} role="tab" id={`product-tab-${k}`} aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="tab-panel" id={`product-tab-panel-${tab}`}>
          {tab === 'description' && <div className="rich" dangerouslySetInnerHTML={{ __html: x.fullDescription || '<p>No description.</p>' }} />}
          {tab === 'specs' && (x.specs.length ? (
            <table className="spec-table" id="product-specs-table"><tbody>{x.specs.map((s, i) => <tr key={i}><th>{s.attr}</th><td>{s.color_rgb && <i className="dot" style={{ background: s.color_rgb }} />}{s.value}</td></tr>)}
              {x.weight > 0 && <tr><th>Weight</th><td>{x.weight} kg</td></tr>}</tbody></table>
          ) : <p className="muted">No specifications.</p>)}
          {tab === 'reviews' && <Reviews p={x} onAdded={() => setReload((n) => n + 1)} />}
          {tab === 'tags' && (x.tags.length ? <div className="tag-cloud">{x.tags.map((t) => <Link key={t.id} to={`/producttag/${encodeURIComponent(t.name)}`} id={`product-tag-${t.id}`}>{t.name} <small>({t.n})</small></Link>)}</div> : <p className="muted">No tags.</p>)}
        </div>
      </div>

      {x.related.length > 0 && <section className="section-sm" id="product-related"><h2 className="block-title">Related products</h2><ProductGrid products={x.related} idPrefix="product-related" /></section>}
      {x.alsoPurchased.length > 0 && <section className="section-sm" id="product-also-purchased"><h2 className="block-title">Customers who bought this item also bought</h2><ProductGrid products={x.alsoPurchased} idPrefix="product-also" /></section>}
      {emailOpen && <EmailFriend p={x} onClose={() => setEmailOpen(false)} />}
    </div>
  )
}

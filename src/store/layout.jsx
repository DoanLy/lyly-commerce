import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Search, User, ShoppingBag, Heart, ChevronDown, Menu, X, Repeat2, LogOut, Settings2, Truck, ShieldCheck, RotateCcw, Headset, Mail,
} from 'lucide-react'
import { api } from '../lib/api.js'
import { useStore, ProductArt, Stars, Price, useMoney } from './ui.jsx'

export function Logo({ id = 'site-logo' }) {
  const { boot } = useStore()
  return (
    <Link to="/" className="logo" id={id} aria-label={boot?.settings?.store?.name || 'LyLy Commerce'}>
      <span>LyLy</span>
      <small>COMMERCE</small>
    </Link>
  )
}

function SearchBox() {
  const { boot } = useStore()
  const nav = useNavigate()
  const money = useMoney()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const timer = useRef()
  const min = boot?.settings?.catalog?.searchMinLength || 3
  useEffect(() => {
    clearTimeout(timer.current)
    if (term.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(() => api.get('/search/suggest', { q: term }).then(setResults).catch(() => {}), 220)
  }, [term])
  const submit = (e) => {
    e.preventDefault()
    if (term.trim().length < min) { setOpen(true); return }
    setOpen(false)
    nav(`/search?q=${encodeURIComponent(term.trim())}`)
  }
  return (
    <form className="search-wrap" id="header-search-form" onSubmit={submit} role="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <Search size={18} />
      <label htmlFor="header-search-input" className="sr-only">Search store</label>
      <input id="header-search-input" name="q" value={term} placeholder="Search store" autoComplete="off" onFocus={() => setOpen(true)} onChange={(e) => { setTerm(e.target.value); setOpen(true) }} />
      <button type="submit" id="header-search-button" className="search-submit">Search</button>
      {open && term && (
        <div className="search-results" id="header-search-results">
          {term.trim().length < min && <p>Search term minimum length is {min} characters</p>}
          {results.length > 0 && <div className="search-heading">Products</div>}
          {results.map((p) => (
            <button type="button" key={p.id} id={`header-search-result-${p.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); setTerm(''); nav(`/product/${p.slug}`) }}>
              <ProductArt name={p.name} src={p.picture} size="xs" />
              <span><strong>{p.name}</strong><small>{p.sku}</small></span>
              <b>{money(p.price)}</b>
            </button>
          ))}
          {term.trim().length >= 2 && !results.length && <p>No products were found that matched your criteria.</p>}
        </div>
      )}
    </form>
  )
}

function MegaMenu({ onNavigate }) {
  const { boot } = useStore()
  const [open, setOpen] = useState(null)
  const cats = (boot?.categories || []).filter((c) => c.include_in_top_menu)
  return (
    <nav className="main-nav" id="header-main-nav" onMouseLeave={() => setOpen(null)}>
      {cats.map((c) => (
        <div key={c.id} className={`nav-item ${open === c.id ? 'open' : ''}`} onMouseEnter={() => setOpen(c.id)}>
          <NavLink to={`/category/${c.slug}`} id={`header-nav-${c.slug}`} onClick={() => { setOpen(null); onNavigate?.() }}>
            {c.name}{c.children.length > 0 && <ChevronDown size={14} />}
          </NavLink>
          {c.children.length > 0 && (
            <div className="nav-dropdown" id={`header-nav-${c.slug}-dropdown`}>
              {c.children.map((s) => (
                <Link key={s.id} to={`/category/${s.slug}`} id={`header-nav-sub-${s.slug}`} onClick={() => setOpen(null)}>
                  <b>{s.name}</b><small>{s.total} products</small>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}

function MiniCart() {
  const { cartCount } = useStore()
  const money = useMoney()
  const [cart, setCart] = useState(null)
  const load = () => api.get('/cart').then(setCart).catch(() => {})
  return (
    <div className="mini-cart-wrap" onMouseEnter={load}>
      <Link to="/cart" className="cart-button" id="header-cart-button" data-cart-count={cartCount}>
        <ShoppingBag size={18} /> Cart <span className="count" id="header-cart-count">({cartCount})</span>
      </Link>
      <div className="mini-cart" id="header-mini-cart">
        {!cart ? <p>Loading…</p> : !cart.items.length ? <p>You have no items in your shopping cart.</p> : (
          <>
            <p className="mini-cart-count">There are <Link to="/cart">{cart.items.reduce((s, i) => s + i.quantity, 0)} item(s)</Link> in your cart.</p>
            {cart.items.slice(0, 4).map((i) => (
              <div className="mini-cart-row" key={i.id}>
                <ProductArt name={i.name} src={i.picture} size="xs" />
                <div><Link to={`/product/${i.slug}`}>{i.name}</Link><small>{i.quantity} × {money(i.unitPrice - i.unitDiscount)}</small></div>
              </div>
            ))}
            <div className="mini-cart-total">Sub-Total: <b>{money(cart.totals.subtotal)}</b></div>
            <div className="mini-cart-actions">
              <Link to="/cart" className="ghost-button small" id="header-mini-cart-view">Go to cart</Link>
              <Link to="/checkout" className="dark-button small" id="header-mini-cart-checkout">Checkout</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function Header() {
  const { boot, customer, wishlistCount, currency, setCurrency, logout } = useStore()
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  useEffect(() => setMenu(false), [loc.pathname])
  const s = boot?.settings
  return (
    <header className="site-header" id="site-header">
      <div className="announcement" id="header-announcement">
        <p>{s?.store?.announcement}</p>
        <span className="announcement-links">
          <label htmlFor="header-currency-select" className="sr-only">Currency</label>
          <select id="header-currency-select" value={currency?.code} onChange={(e) => setCurrency(e.target.value)}>
            {(boot?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
          </select>
          {customer?.isAdmin && <a href="/admin" id="header-admin-link"><Settings2 size={13} /> Administration</a>}
        </span>
      </div>
      <div className="header-main">
        <button className="icon-button mobile-only" id="header-menu-button" aria-label="Open menu" onClick={() => setMenu(true)}><Menu /></button>
        <Logo />
        <SearchBox />
        <div className="header-actions">
          {customer ? (
            <div className="account-menu">
              <Link to="/customer/info" className="account-button" id="header-account-button"><User size={18} /><span className="desktop-only">{customer.firstName || 'My account'}</span></Link>
              <div className="account-dropdown" id="header-account-dropdown">
                <Link to="/customer/info" id="header-my-account">My account</Link>
                <Link to="/customer/orders" id="header-my-orders">Orders</Link>
                <Link to="/customer/addresses" id="header-my-addresses">Addresses</Link>
                <button onClick={logout} id="header-logout"><LogOut size={14} /> Log out</button>
              </div>
            </div>
          ) : (
            <>
              <Link to="/register" className="text-link desktop-only" id="header-register-link">Register</Link>
              <Link to="/login" className="account-button" id="header-login-link"><User size={18} /><span className="desktop-only">Log in</span></Link>
            </>
          )}
          <Link to="/wishlist" className="icon-pill" id="header-wishlist-link" aria-label="Wishlist"><Heart size={18} /><span id="header-wishlist-count">{wishlistCount}</span></Link>
          <MiniCart />
        </div>
      </div>
      <div className="header-nav desktop-only">
        <MegaMenu />
        <div className="service-links">
          <Link to="/newproducts" id="header-new-products">New products</Link>
          <Link to="/blog" id="header-blog">Blog</Link>
          <Link to="/contactus" id="header-contact">Contact us</Link>
        </div>
      </div>
      {menu && (
        <div className="drawer-overlay" id="menu-drawer-overlay" onClick={() => setMenu(false)}>
          <aside className="menu-drawer" id="menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head"><Logo id="menu-drawer-logo" /><button className="icon-button" id="menu-drawer-close" aria-label="Close menu" onClick={() => setMenu(false)}><X /></button></div>
            {(boot?.categories || []).map((c) => (
              <div key={c.id} className="drawer-group">
                <Link to={`/category/${c.slug}`} id={`menu-drawer-cat-${c.slug}`}>{c.name}</Link>
                {c.children.map((s2) => <Link key={s2.id} className="sub" to={`/category/${s2.slug}`} id={`menu-drawer-cat-${s2.slug}`}>{s2.name}</Link>)}
              </div>
            ))}
            <div className="drawer-group">
              <Link to="/newproducts">New products</Link><Link to="/blog">Blog</Link><Link to="/news">News</Link><Link to="/contactus">Contact us</Link>
              {!customer && <Link to="/register">Register</Link>}
            </div>
          </aside>
        </div>
      )}
    </header>
  )
}

export function BenefitBar() {
  const { boot } = useStore()
  const free = boot?.settings?.shipping
  return (
    <div className="benefit-bar" id="benefit-bar">
      <div><Truck size={22} /><span><b>Free delivery</b><small>{free?.freeShippingOverEnabled ? `On orders over $${free.freeShippingOver}` : 'Fast nationwide shipping'}</small></span></div>
      <div><RotateCcw size={22} /><span><b>Easy returns</b><small>Within {boot?.settings?.orders?.returnDays || 30} days</small></span></div>
      <div><ShieldCheck size={22} /><span><b>Secure checkout</b><small>Card, COD, PayPal sandbox</small></span></div>
      <div><Headset size={22} /><span><b>Friendly support</b><small>{boot?.settings?.store?.companyPhone}</small></span></div>
    </div>
  )
}

export function Footer() {
  const { boot, customer, notify } = useStore()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const topics = boot?.topics || []
  const s = boot?.settings
  const subscribe = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { const r = await api.post('/newsletter', { email }); notify(r.message); setEmail('') } catch (err) { notify(err.message, 'error') } finally { setBusy(false) }
  }
  return (
    <footer className="site-footer" id="site-footer">
      {s?.newsletter?.enabled && (
        <section className="newsletter" id="footer-newsletter">
          <div>
            <p className="eyebrow">Newsletter</p>
            <h2>Get offers & new arrivals first</h2>
          </div>
          <form onSubmit={subscribe} id="footer-newsletter-form">
            <Mail size={18} />
            <label htmlFor="footer-newsletter-email" className="sr-only">Email</label>
            <input id="footer-newsletter-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email here…" />
            <button className="dark-button" id="footer-newsletter-subscribe" disabled={busy}>Subscribe</button>
          </form>
        </section>
      )}
      <div className="footer-columns">
        <div className="footer-brand">
          <Logo id="footer-logo" />
          <p>{s?.store?.tagline}</p>
          <p className="muted">{s?.store?.companyAddress}<br />{s?.store?.companyPhone}</p>
        </div>
        <div>
          <h3>Information</h3>
          <Link to="/sitemap" id="footer-sitemap">Sitemap</Link>
          {topics.filter((t) => t.footer_column === 1).map((t) => <Link key={t.slug} to={`/page/${t.slug}`} id={`footer-topic-${t.slug}`}>{t.title}</Link>)}
          <Link to="/contactus" id="footer-contact">Contact us</Link>
        </div>
        <div>
          <h3>Customer service</h3>
          <Link to="/search" id="footer-search">Search</Link>
          <Link to="/news" id="footer-news">News</Link>
          <Link to="/blog" id="footer-blog">Blog</Link>
          <Link to="/recentlyviewedproducts" id="footer-recently-viewed">Recently viewed products</Link>
          <Link to="/compareproducts" id="footer-compare">Compare products list</Link>
          <Link to="/newproducts" id="footer-new-products">New products</Link>
          <Link to="/brands" id="footer-brands">All brands</Link>
        </div>
        <div>
          <h3>My account</h3>
          <Link to="/customer/info" id="footer-my-account">My account</Link>
          <Link to="/customer/orders" id="footer-orders">Orders</Link>
          <Link to="/customer/addresses" id="footer-addresses">Addresses</Link>
          <Link to="/cart" id="footer-cart">Shopping cart</Link>
          <Link to="/wishlist" id="footer-wishlist">Wishlist</Link>
          {!customer && <Link to="/register" id="footer-register">Register</Link>}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} {s?.store?.name}. Demo store — no real orders are shipped.</span>
        <span>Powered by LyLy</span>
      </div>
    </footer>
  )
}

export function ProductCard({ product: p, idPrefix = 'product-card' }) {
  const { addToCart, addToWishlist, compare, boot } = useStore()
  const showCompare = boot?.settings?.catalog?.compareEnabled
  return (
    <article className="product-card" id={`${idPrefix}-${p.id}`} data-product-id={p.id}>
      <Link to={`/product/${p.slug}`} className="product-card-media" id={`${idPrefix}-image-${p.id}`}>
        <ProductArt name={p.name} src={p.picture} alt={p.pictureAlt} />
        <span className="badges">
          {p.isNew && <i className="badge new">New</i>}
          {p.oldPrice > p.price && !p.callForPrice && <i className="badge sale">-{Math.round((1 - p.price / p.oldPrice) * 100)}%</i>}
          {!p.stock?.inStock && <i className="badge out">Out of stock</i>}
        </span>
      </Link>
      <div className="product-card-body">
        <h3><Link to={`/product/${p.slug}`} id={`${idPrefix}-title-${p.id}`}>{p.name}</Link></h3>
        {p.reviews > 0 ? <Stars value={p.rating} count={p.reviews} /> : <span className="stars-empty">No reviews yet</span>}
        <p className="product-short">{p.short}</p>
        <div className="product-card-foot">
          <Price product={p} id={`${idPrefix}-price-${p.id}`} />
          <div className="card-actions">
            {showCompare && <button className={`icon-round ${compare.ids.includes(p.id) ? 'active' : ''}`} id={`${idPrefix}-compare-${p.id}`} title="Add to compare list" aria-label="Add to compare list" onClick={() => compare.toggle(p.id)}><Repeat2 size={16} /></button>}
            {!p.disableWishlist && <button className="icon-round" id={`${idPrefix}-wishlist-${p.id}`} title="Add to wishlist" aria-label="Add to wishlist" onClick={() => addToWishlist(p)}><Heart size={16} /></button>}
            {!p.disableBuy && !p.callForPrice && p.productType !== 'grouped' && (
              <button className="add-button" id={`${idPrefix}-add-${p.id}`} onClick={() => addToCart(p)} disabled={!p.stock?.inStock}>Add to cart</button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ products, idPrefix, view = 'grid' }) {
  if (!products?.length) return null
  return <div className={`product-grid ${view}`} id={`${idPrefix}-grid`} data-row-count={products.length}>{products.map((p) => <ProductCard key={p.id} product={p} idPrefix={idPrefix} />)}</div>
}

export function Toasts({ items, onClose }) {
  return (
    <div className="toasts" id="bar-notification" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} id={`bar-notification-${t.type}`}>
          <span>{t.text}{t.link && <> <Link to={t.link.to} id="bar-notification-link" onClick={() => onClose(t.id)}>{t.link.label}</Link></>}</span>
          <button aria-label="Close" id="bar-notification-close" onClick={() => onClose(t.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}

export { Price, Stars }

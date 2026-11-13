import { useCallback, useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api.js'
import { StoreContext, readList, writeList, Loading } from './ui.jsx'
import { Header, Footer, Toasts } from './layout.jsx'
import Home from './pages/Home.jsx'
import { CatalogPage, BrandsPage, TagsPage } from './pages/Catalog.jsx'
import ProductPage from './pages/Product.jsx'
import { CartPage, WishlistPage, ComparePage, RecentlyViewedPage } from './pages/Cart.jsx'
import { CheckoutPage, CompletedPage, PayPalPage } from './pages/Checkout.jsx'
import { LoginPage, RegisterPage, RegisterResultPage, PasswordRecoveryPage, PasswordRecoveryConfirmPage, AccountLayout, OrderDetailsPage, ReturnRequestPage } from './pages/Account.jsx'
import { TopicPage, NewsListPage, NewsItemPage, BlogListPage, BlogPostPage, ContactPage, SitemapPage, NotFound } from './pages/Content.jsx'
import './store.css'

export default function StoreApp() {
  const nav = useNavigate()
  const loc = useLocation()
  const [boot, setBoot] = useState(null)
  const [bootError, setBootError] = useState(null)
  const [toasts, setToasts] = useState([])
  const [currencyCode, setCurrencyCode] = useState(() => { try { return localStorage.getItem('lyc-currency') || 'USD' } catch { return 'USD' } })
  const [compareIds, setCompareIds] = useState(() => readList('lyc-compare'))

  const refresh = useCallback(() => api.get('/bootstrap').then((b) => { setBoot(b); setBootError(null); return b }).catch((e) => setBootError(e)), [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  const notify = useCallback((text, type = 'success', link) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, text, type, link }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 4500)
  }, [])

  const setCounts = (r) => setBoot((b) => b && ({ ...b, cartCount: r.cartCount ?? b.cartCount, wishlistCount: r.wishlistCount ?? b.wishlistCount }))

  const addToCart = useCallback(async (p, quantity = 1, extra = {}) => {
    try {
      const r = await api.post('/cart', { productId: p.id, quantity, fromList: !extra.attributes && !extra.fromProductPage, ...extra })
      if (r.redirect) { nav(r.redirect); notify('Please select the product options before adding it to the cart.', 'info'); return r }
      setCounts(r)
      notify(extra.type === 'wishlist' ? 'The product has been added to your' : 'The product has been added to your', 'success', extra.type === 'wishlist' ? { to: '/wishlist', label: 'wishlist' } : { to: '/cart', label: 'shopping cart' })
      return r
    } catch (e) {
      notify(e.message, 'error')
      throw e
    }
  }, [nav, notify])

  const addToWishlist = useCallback((p, quantity = 1, extra = {}) => addToCart(p, quantity, { ...extra, type: 'wishlist' }), [addToCart])

  const compare = useMemo(() => ({
    ids: compareIds,
    toggle: (id) => {
      const max = boot?.settings?.catalog?.compareMax || 4
      let next
      if (compareIds.includes(id)) { next = compareIds.filter((x) => x !== id); notify('The product has been removed from your comparison list', 'info') }
      else { next = [id, ...compareIds].slice(0, max); notify('The product has been added to your', 'success', { to: '/compareproducts', label: 'product comparison' }) }
      setCompareIds(next); writeList('lyc-compare', next)
    },
    remove: (id) => { const next = compareIds.filter((x) => x !== id); setCompareIds(next); writeList('lyc-compare', next) },
    clear: () => { setCompareIds([]); writeList('lyc-compare', []) },
  }), [compareIds, boot, notify])

  const currency = useMemo(() => (boot?.currencies || []).find((c) => c.code === currencyCode) || { code: 'USD', symbol: '$', rate: 1 }, [boot, currencyCode])
  const setCurrency = (code) => { setCurrencyCode(code); try { localStorage.setItem('lyc-currency', code) } catch { /* ignore */ } }

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    await refresh()
    nav('/')
  }, [refresh, nav])

  const value = {
    boot, customer: boot?.customer || null, cartCount: boot?.cartCount || 0, wishlistCount: boot?.wishlistCount || 0, refresh, notify,
    addToCart, addToWishlist, compare, currency, setCurrency, logout, setCounts,
  }

  if (bootError && !boot) return <div className="boot-error"><h1>Store is temporarily unavailable</h1><p>{bootError.message}</p><button className="dark-button" onClick={refresh}>Try again</button></div>
  if (!boot) return <div className="boot-loading"><Loading label="Loading store…" /></div>
  if (boot.settings.store.storeClosed && !boot.customer?.isAdmin) return <div className="boot-error"><h1>This store is closed</h1><p>Please come back later.</p></div>

  return (
    <StoreContext.Provider value={value}>
      <div className="store-app">
        <Header />
        <main className="store-main" id="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/category/:slug" element={<CatalogPage mode="category" />} />
            <Route path="/manufacturer/:slug" element={<CatalogPage mode="manufacturer" />} />
            <Route path="/producttag/:tag" element={<CatalogPage mode="tag" />} />
            <Route path="/search" element={<CatalogPage mode="search" />} />
            <Route path="/newproducts" element={<CatalogPage mode="new" />} />
            <Route path="/brands" element={<BrandsPage />} />
            <Route path="/producttag/all" element={<TagsPage />} />
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/wishlist/:guid" element={<WishlistPage shared />} />
            <Route path="/compareproducts" element={<ComparePage />} />
            <Route path="/recentlyviewedproducts" element={<RecentlyViewedPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/checkout/completed/:id" element={<CompletedPage />} />
            <Route path="/checkout/paypal/:guid" element={<PayPalPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/result" element={<RegisterResultPage />} />
            <Route path="/passwordrecovery" element={<PasswordRecoveryPage />} />
            <Route path="/passwordrecovery/confirm" element={<PasswordRecoveryConfirmPage />} />
            <Route path="/customer/:section" element={<AccountLayout />} />
            <Route path="/orderdetails/:id" element={<OrderDetailsPage />} />
            <Route path="/returnrequest/:id" element={<ReturnRequestPage />} />
            <Route path="/page/:slug" element={<TopicPage />} />
            <Route path="/news" element={<NewsListPage />} />
            <Route path="/news/:slug" element={<NewsItemPage />} />
            <Route path="/blog" element={<BlogListPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/contactus" element={<ContactPage />} />
            <Route path="/sitemap" element={<SitemapPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
        <Toasts items={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      </div>
    </StoreContext.Provider>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import './admin.css'
import { api, UiProvider, LookupProvider, Loading, useUi } from './ui.jsx'
import Layout from './Layout.jsx'
import { ENTITIES, keyOf } from './entities.js'
import { EntityList, EntityEdit } from './EntityPage.jsx'
import Dashboard from './Dashboard.jsx'
import { ProductList, ProductEdit } from './Products.jsx'
import { OrderList, OrderDetail, ShipmentDetail } from './Orders.jsx'
import { CustomerList, CustomerEdit, Carts } from './Customers.jsx'
import { SettingsPage, Maintenance } from './Settings.jsx'
import Reports from './Reports.jsx'

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@yourstore.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.post('/auth/login', { email, password })
      const me = await api.get('/admin/me')
      if (!me.admin) { await api.post('/auth/logout').catch(() => {}); throw new Error('This account does not have access to the administration area.') }
      onLogin(me.admin)
      const back = new URLSearchParams(loc.search).get('returnUrl')
      nav(back && back.startsWith('/admin') ? back : '/admin', { replace: true })
    } catch (er) { setError(er.message) } finally { setBusy(false) }
  }
  return (
    <div className="ad-login" id="admin-login-page">
      <form className="ad-login-card" onSubmit={submit} id="admin-login-form">
        <div className="ad-logo dark"><span>Ly</span><b>LyLy Commerce</b><small>admin</small></div>
        <h1>Welcome, please sign in</h1>
        <p>Use an account that belongs to the Administrators role.</p>
        {error && <div className="ad-error" id="admin-login-error" role="alert">{error}</div>}
        <label htmlFor="admin-login-email">Email</label>
        <input id="admin-login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="admin-login-password">Password</label>
        <input id="admin-login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="ad-btn primary block" id="admin-login-submit" disabled={busy}><LogIn size={15} />{busy ? 'Signing in…' : 'Log in'}</button>
        <a href="/" id="admin-login-public-store">← Back to the public store</a>
      </form>
    </div>
  )
}

function Generic({ mode }) {
  const { entity: slug } = useParams()
  const key = keyOf(slug)
  if (!ENTITIES[key]) return <NotFound />
  return mode === 'list' ? <EntityList key={key} entity={key} /> : <EntityEdit key={key} entity={key} />
}

const NotFound = () => (
  <div className="ad-page"><div className="ad-card ad-notfound" id="admin-not-found"><h1>Page not found</h1><p>The page you requested does not exist.</p><Link className="ad-btn primary" to="/admin" id="admin-not-found-home">Go to dashboard</Link></div></div>
)

function Shell() {
  const [admin, setAdmin] = useState(undefined)
  const loc = useLocation()
  const nav = useNavigate()
  const { fail } = useUi()
  useEffect(() => { api.get('/admin/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(null)) }, [])
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch (e) { fail(e) }
    setAdmin(null)
    nav('/admin/login', { replace: true })
  }, [nav, fail])

  if (admin === undefined) return <div className="ad-boot"><Loading text="Loading administration…" /></div>
  const isLogin = /^\/admin\/login\/?$/.test(loc.pathname)
  if (isLogin) return admin ? <Navigate to="/admin" replace /> : <Login onLogin={setAdmin} />
  if (!admin) return <Navigate to={`/admin/login?returnUrl=${encodeURIComponent(loc.pathname + loc.search)}`} replace />

  return (
    <LookupProvider>
      <Layout admin={admin} onLogout={logout}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/create" element={<ProductEdit key="new" />} />
          <Route path="products/edit/:id" element={<ProductEdit />} />
          <Route path="orders" element={<OrderList />} />
          <Route path="orders/edit/:id" element={<OrderDetail />} />
          <Route path="shipments/edit/:id" element={<ShipmentDetail />} />
          <Route path="customers" element={<CustomerList key="all" />} />
          <Route path="online-customers" element={<CustomerList key="online" online />} />
          <Route path="customers/create" element={<CustomerEdit key="new" />} />
          <Route path="customers/edit/:id" element={<CustomerEdit />} />
          <Route path="carts" element={<Carts />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:group" element={<SettingsPage />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="reports/:name" element={<Reports />} />
          <Route path=":entity" element={<Generic mode="list" />} />
          <Route path=":entity/create" element={<Generic mode="edit" />} />
          <Route path=":entity/edit/:id" element={<Generic mode="edit" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </LookupProvider>
  )
}

export default function AdminApp() {
  return (
    <div className="ad-app">
      <UiProvider><Shell /></UiProvider>
    </div>
  )
}

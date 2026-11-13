import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, ShoppingCart, Users, Tag, FileText, Settings, Server, BarChart3, ChevronDown, Menu, X, LogOut, Store, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { cx, kebab } from './ui.jsx'

const L = (label, to, id) => ({ label, to, id: id || kebab(to.replace(/^\/admin\/?/, '').replace(/[/?=&]+/g, '-')) || 'dashboard' })

export const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/admin' },
  { key: 'catalog', label: 'Catalog', icon: BookOpen, items: [
    L('Products', '/admin/products'), L('Categories', '/admin/categories'), L('Manufacturers', '/admin/manufacturers'), L('Product reviews', '/admin/reviews'), L('Product tags', '/admin/product-tags'),
    { label: 'Attributes', id: 'attributes', items: [L('Product attributes', '/admin/product-attributes'), L('Specification attributes', '/admin/spec-attributes'), L('Checkout attributes', '/admin/checkout-attributes')] },
  ] },
  { key: 'sales', label: 'Sales', icon: ShoppingCart, items: [
    L('Orders', '/admin/orders'), L('Shipments', '/admin/shipments'), L('Return requests', '/admin/return-requests'), L('Gift cards', '/admin/gift-cards'), L('Shopping carts & wishlists', '/admin/carts', 'carts'),
  ] },
  { key: 'customers', label: 'Customers', icon: Users, items: [
    L('Customers', '/admin/customers'), L('Customer roles', '/admin/customer-roles'), L('Online customers', '/admin/online-customers'), L('Activity log', '/admin/activity-log'),
  ] },
  { key: 'promotions', label: 'Promotions', icon: Tag, items: [L('Discounts', '/admin/discounts'), L('Newsletter subscribers', '/admin/newsletter'), L('Campaigns', '/admin/campaigns')] },
  { key: 'content', label: 'Content management', icon: FileText, items: [
    L('Topics (pages)', '/admin/topics'), L('Message templates', '/admin/message-templates'), L('News items', '/admin/news'), L('News comments', '/admin/news-comments'),
    L('Blog posts', '/admin/blog'), L('Blog comments', '/admin/blog-comments'), L('Polls', '/admin/polls'),
  ] },
  { key: 'configuration', label: 'Configuration', icon: Settings, items: [
    L('Settings', '/admin/settings'), L('Shipping methods', '/admin/shipping-methods'), L('Pickup points', '/admin/pickup-points'), L('Payment methods', '/admin/payment-methods'),
    L('Tax categories', '/admin/tax-categories'), L('Countries', '/admin/countries'), L('Currencies', '/admin/currencies'),
  ] },
  { key: 'system', label: 'System', icon: Server, items: [
    L('Queued emails', '/admin/queued-emails'), L('Log', '/admin/system-log', 'log'), L('Search terms', '/admin/search-terms'), L('Back-in-stock subscriptions', '/admin/back-in-stock'), L('Maintenance', '/admin/maintenance'),
  ] },
  { key: 'reports', label: 'Reports', icon: BarChart3, items: [
    L('Sales summary', '/admin/reports/sales', 'report-sales'), L('Low stock', '/admin/reports/low-stock', 'report-low-stock'), L('Bestsellers', '/admin/reports/bestsellers', 'report-bestsellers'),
    L('Products never purchased', '/admin/reports/never-purchased', 'report-never-purchased'), L('Country sales', '/admin/reports/country-sales', 'report-country-sales'),
    L('Customers by order total', '/admin/reports/customers-by-total', 'report-customers-by-total'), L('Customers by number of orders', '/admin/reports/customers-by-orders', 'report-customers-by-orders'),
    L('Registered customers', '/admin/reports/registered-customers', 'report-registered-customers'), L('Discount usage', '/admin/reports/discounts', 'report-discounts'),
  ] },
]

const flat = (items) => items.flatMap((i) => (i.items ? flat(i.items) : [i]))
const isActive = (pathname, to) => (to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname === to || pathname.startsWith(`${to}/`))

function NavItems({ items, pathname, depth = 0 }) {
  return items.map((it) => it.items ? (
    <SubGroup key={it.id} item={it} pathname={pathname} depth={depth} />
  ) : (
    <NavLink key={it.to} to={it.to} end={it.to === '/admin'} id={`admin-nav-${it.id}`} className={() => cx('ad-nav-link', depth && 'sub', isActive(pathname, it.to) && 'active')}>
      <span className="ad-dot" />{it.label}
    </NavLink>
  ))
}

function SubGroup({ item, pathname, depth }) {
  const has = flat(item.items).some((x) => isActive(pathname, x.to))
  const [open, setOpen] = useState(has)
  useEffect(() => { if (has) setOpen(true) }, [has])
  return (
    <div className="ad-nav-sub">
      <button type="button" className={cx('ad-nav-link', 'sub-toggle', has && 'has-active')} id={`admin-nav-${item.id}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ad-dot" />{item.label}<ChevronDown size={13} className={cx('ad-caret', open && 'open')} />
      </button>
      {open && <div className="ad-nav-children"><NavItems items={item.items} pathname={pathname} depth={depth + 1} /></div>}
    </div>
  )
}

function Group({ g, pathname, collapsed, onExpand }) {
  const has = g.items ? flat(g.items).some((x) => isActive(pathname, x.to)) : isActive(pathname, g.to)
  const [open, setOpen] = useState(has)
  useEffect(() => { if (has) setOpen(true) }, [has])
  const Icon = g.icon
  if (!g.items) return (
    <NavLink to={g.to} end id={`admin-nav-${g.key}`} className={cx('ad-nav-group-btn', has && 'active')} title={g.label}><Icon size={17} /><span>{g.label}</span></NavLink>
  )
  return (
    <div className={cx('ad-nav-group', open && 'open')}>
      <button type="button" id={`admin-nav-group-${g.key}`} className={cx('ad-nav-group-btn', has && 'has-active')} aria-expanded={open} title={g.label} onClick={() => { if (collapsed) { onExpand(); setOpen(true) } else setOpen(!open) }}>
        <Icon size={17} /><span>{g.label}</span><ChevronDown size={14} className={cx('ad-caret', open && 'open')} />
      </button>
      {open && !collapsed && <div className="ad-nav-items"><NavItems items={g.items} pathname={pathname} /></div>}
    </div>
  )
}

export default function Layout({ admin, onLogout, children }) {
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ad-collapsed') === '1' } catch { return false } })
  useEffect(() => { setDrawer(false) }, [pathname])
  useEffect(() => { try { localStorage.setItem('ad-collapsed', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])
  return (
    <div className={cx('ad-shell', collapsed && 'collapsed', drawer && 'drawer-open')}>
      <header className="ad-topbar">
        <button type="button" className="ad-top-icon ad-mobile-only" id="admin-menu-toggle" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={20} /></button>
        <Link to="/admin" className="ad-logo" id="admin-logo"><span>Ly</span><b>LyLy Commerce</b><small>admin</small></Link>
        <button type="button" className="ad-top-icon ad-desktop-only" id="admin-sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="ad-top-right">
          <a href="/" target="_blank" rel="noreferrer" className="ad-top-link" id="admin-public-store"><Store size={15} /><span>Public store</span></a>
          <span className="ad-top-user" id="admin-current-user"><i>{(admin.name || admin.email || 'A').slice(0, 1).toUpperCase()}</i><span>{admin.name || admin.email}</span></span>
          <button type="button" className="ad-top-link" id="admin-logout" onClick={onLogout}><LogOut size={15} /><span>Logout</span></button>
        </div>
      </header>
      <div className="ad-backdrop" onClick={() => setDrawer(false)} />
      <aside className="ad-sidebar" id="admin-sidebar" aria-label="Admin navigation">
        <div className="ad-sidebar-head ad-mobile-only">
          <b>Menu</b><button type="button" className="ad-icon-btn" id="admin-menu-close" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></button>
        </div>
        <nav>{NAV.map((g) => <Group key={g.key} g={g} pathname={pathname} collapsed={collapsed} onExpand={() => setCollapsed(false)} />)}</nav>
      </aside>
      <main className="ad-main" id="admin-main">{children}</main>
    </div>
  )
}

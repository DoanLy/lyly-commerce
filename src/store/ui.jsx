import { createContext, useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Laptop, Monitor, Disc3, Camera, Smartphone, Headphones, Footprints, Shirt, Briefcase, Music, BookOpen, Gem, Gift, Package, Star, ChevronLeft, ChevronRight,
} from 'lucide-react'

export const StoreContext = createContext(null)
export const useStore = () => useContext(StoreContext)

// ---------- money ----------
export function useMoney() {
  const { currency } = useStore()
  return (n) => formatMoney(n, currency)
}
export function formatMoney(n, currency) {
  const c = currency || { code: 'USD', symbol: '$', rate: 1 }
  const v = (Number(n) || 0) * (c.rate || 1)
  if (c.code === 'VND') return `${Math.round(v).toLocaleString('vi-VN')}${c.symbol}`
  return `${c.symbol}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------- product art placeholder ----------
const ICONS = [
  [/desktop|tower|mini desktop|all-in-one/i, Monitor], [/notebook|laptop|book 14|air 13|creator|gamer|student/i, Laptop], [/software|office|antivirus|studio/i, Disc3],
  [/camera|lens|cam/i, Camera], [/phone|rugged|one/i, Smartphone], [/buds|headphone|speaker|watch/i, Headphones], [/sneaker|loafer|boot|shoe/i, Footprints],
  [/shirt|jacket|sweater|t-shirt/i, Shirt], [/bag|cap|belt|sunglasses/i, Briefcase], [/album|presets|wallpaper/i, Music], [/kitchen|habits|novel|book/i, BookOpen],
  [/ring|bracelet|necklace/i, Gem], [/gift card/i, Gift],
]
const HUES = [['#dce7d5', '#294b3a'], ['#f3e6d6', '#8a5a2b'], ['#e2e8f2', '#33507a'], ['#f2e1e1', '#8a3b3b'], ['#ece4f2', '#5b3f7a'], ['#e3efe9', '#2d6a55'], ['#f4efd9', '#7a6524']]

export function ProductArt({ name = '', src, alt, size = 'md', id }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) return <img id={id} className={`product-img ${size}`} src={src} alt={alt || name} loading="lazy" onError={() => setFailed(true)} />
  const Icon = ICONS.find(([re]) => re.test(name))?.[1] || Package
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [bg, fg] = HUES[h % HUES.length]
  return (
    <div id={id} className={`product-art ${size}`} style={{ background: `radial-gradient(circle at 30% 25%, #ffffffcc, transparent 55%), ${bg}`, color: fg }} role="img" aria-label={alt || name}>
      <Icon strokeWidth={1.3} />
      {size !== 'xs' && <span>{name.split(' ').slice(0, 3).join(' ')}</span>}
    </div>
  )
}

export function Stars({ value = 0, count, id }) {
  return (
    <span className="stars" id={id} title={`${value.toFixed ? value.toFixed(1) : value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} className={i <= Math.round(value) ? 'on' : ''} fill={i <= Math.round(value) ? 'currentColor' : 'none'} />)}
      {count != null && <small>({count})</small>}
    </span>
  )
}

export function Price({ product, id }) {
  const money = useMoney()
  if (product.callForPrice) return <div className="price" id={id}><strong>Call for price</strong></div>
  return (
    <div className="price" id={id}>
      {product.oldPrice > product.price && <s>{money(product.oldPrice)}</s>}
      <strong>{product.customerEntersPrice ? 'Name your price' : product.price === 0 ? 'Free' : money(product.price)}</strong>
    </div>
  )
}

export function Breadcrumb({ items = [], id = 'breadcrumb' }) {
  return (
    <nav className="breadcrumb" id={id} aria-label="Breadcrumb">
      <Link to="/" id={`${id}-home`}>Home</Link>
      {items.map((it, i) => (
        <span key={i}>
          <ChevronRight size={13} />
          {it.to && i < items.length - 1 ? <Link to={it.to} id={`${id}-link-${i}`}>{it.label}</Link> : <strong id={`${id}-current`}>{it.label}</strong>}
        </span>
      ))}
    </nav>
  )
}

export function Pager({ page, pages, onPage, id = 'pager' }) {
  if (!pages || pages <= 1) return null
  const list = []
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) list.push(i)
  return (
    <div className="pager" id={id}>
      <button id={`${id}-prev`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      {list[0] > 1 && <><button id={`${id}-page-1`} onClick={() => onPage(1)}>1</button>{list[0] > 2 && <span>…</span>}</>}
      {list.map((n) => <button key={n} id={`${id}-page-${n}`} className={n === page ? 'active' : ''} onClick={() => onPage(n)}>{n}</button>)}
      {list.at(-1) < pages && <>{list.at(-1) < pages - 1 && <span>…</span>}<button id={`${id}-page-${pages}`} onClick={() => onPage(pages)}>{pages}</button></>}
      <button id={`${id}-next`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
    </div>
  )
}

export function Field({ label, id, required, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className} ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={id}>{label}{required && <em> *</em>}</label>}
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
    </div>
  )
}

export function Notice({ type = 'info', children, id }) {
  if (!children) return null
  return <div className={`notice ${type}`} id={id} role={type === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function PageTitle({ children, sub, id = 'page-title' }) {
  return (
    <div className="page-title">
      <h1 id={id}>{children}</h1>
      {sub && <p>{sub}</p>}
    </div>
  )
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>
}

export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null })
  useEffect(() => {
    let alive = true
    set((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => alive && set({ loading: false, data, error: null })).catch((error) => alive && set({ loading: false, data: null, error }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [state, (data) => set((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data }))]
}

// ---------- local lists (compare, recently viewed) ----------
export function readList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
export function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* storage blocked */ }
}

export function useDocumentTitle(title) {
  useEffect(() => { document.title = title ? `${title} · LyLy Commerce` : 'LyLy Commerce' }, [title])
}

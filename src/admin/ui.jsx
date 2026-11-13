import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, CheckCircle2, AlertTriangle, Loader2, Inbox, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api, formatDate, usd } from '../lib/api.js'

export { api, formatDate, usd }

// ---------- helpers ----------
export const kebab = (s) => String(s).replace(/_/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9-]+/g, '-').toLowerCase()
export const cx = (...a) => a.filter(Boolean).join(' ')
export const toLocalInput = (v) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
export const toDateInput = (v) => (v ? String(v).slice(0, 10) : '')

export function toCsv(rows, cols) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [cols.map((c) => esc(c.label || c.k)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get ? c.get(r) : r[c.k])).join(','))].join('\r\n')
}
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (!head) return []
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

// ---------- data hooks ----------
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const seq = useRef(0)
  const load = useCallback(async () => {
    const n = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try { const data = await fn(); if (n === seq.current) setState({ data, loading: false, error: null }) }
    catch (e) { if (n === seq.current) setState({ data: null, loading: false, error: e.message }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { load() }, [load])
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) }
}

const LookupCtx = createContext(null)
export function LookupProvider({ children }) {
  const [data, setData] = useState(null)
  const refresh = useCallback(() => api.get('/admin/lookups').then(setData).catch(() => {}), [])
  useEffect(() => { refresh() }, [refresh])
  const value = useMemo(() => ({ lookups: data ? { ...data, categoryOptions: categoryOptions(data.categories) } : {}, ready: !!data, refresh }), [data, refresh])
  return <LookupCtx.Provider value={value}>{children}</LookupCtx.Provider>
}
export const useLookups = () => useContext(LookupCtx)

// ---------- toasts + confirm ----------
const UiCtx = createContext(null)
export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [dlg, setDlg] = useState(null)
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500)
  }, [])
  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => setDlg({ message, ...opts, resolve })), [])
  const close = (v) => { dlg?.resolve(v); setDlg(null) }
  const value = useMemo(() => ({ toast, confirm, ok: (m) => toast(m, 'success'), fail: (e) => toast(e?.message || String(e), 'error') }), [toast, confirm])
  return (
    <UiCtx.Provider value={value}>
      {children}
      <div className="ad-toasts" id="admin-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('ad-toast', t.type)} id={`admin-toast-${t.type}`} role="status">
            {t.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
      {dlg && (
        <Modal title={dlg.title || 'Are you sure?'} onClose={() => close(false)} id="admin-confirm" footer={<>
          <button type="button" className="ad-btn" id="admin-confirm-cancel" onClick={() => close(false)}>Cancel</button>
          <button type="button" className={cx('ad-btn', dlg.danger === false ? 'primary' : 'danger')} id="admin-confirm-ok" autoFocus onClick={() => close(true)}>{dlg.okText || 'Yes'}</button>
        </>}>
          <p className="ad-confirm-text">{dlg.message}</p>
        </Modal>
      )}
    </UiCtx.Provider>
  )
}
export const useUi = () => useContext(UiCtx)

// run an async action with toast feedback
export function useAction() {
  const { ok, fail } = useUi()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, success) => {
    setBusy(true)
    try { const r = await fn(); if (success) ok(typeof success === 'function' ? success(r) : success); return r }
    catch (e) { fail(e); return undefined }
    finally { setBusy(false) }
  }, [ok, fail])
  return [run, busy]
}

// ---------- layout bits ----------
export function Modal({ title, children, footer, onClose, id = 'admin-modal', wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ad-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('ad-modal', wide && 'wide')} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="ad-modal-head"><h3 id={`${id}-title`}>{title}</h3><button type="button" className="ad-icon-btn" id={`${id}-close`} aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <div className="ad-modal-body">{children}</div>
        {footer && <div className="ad-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function PageHead({ title, back, backLabel = 'back to list', children, sub }) {
  return (
    <div className="ad-page-head">
      <div>
        <h1>{title}</h1>
        {back && <Link to={back} className="ad-back" id="admin-back-to-list"><ChevronLeft size={14} />{backLabel}</Link>}
        {sub && <p className="ad-sub">{sub}</p>}
      </div>
      <div className="ad-head-actions">{children}</div>
    </div>
  )
}

export const Card = ({ title, children, actions, className, id }) => (
  <section className={cx('ad-card', className)} id={id}>
    {(title || actions) && <div className="ad-card-head">{title && <h2>{title}</h2>}<div className="ad-card-actions">{actions}</div></div>}
    <div className="ad-card-body">{children}</div>
  </section>
)

export const Loading = ({ text = 'Loading…' }) => <div className="ad-state" id="admin-loading"><Loader2 className="ad-spin" size={20} /><span>{text}</span></div>
export const Empty = ({ text = 'No data available in table' }) => <div className="ad-state empty"><Inbox size={22} /><span>{text}</span></div>
export const ErrorBox = ({ error, onRetry }) => (
  <div className="ad-error" id="admin-error"><AlertTriangle size={16} /><span>{error}</span>{onRetry && <button type="button" className="ad-btn sm" id="admin-error-retry" onClick={onRetry}>Retry</button>}</div>
)

const STATUS_TONE = {
  pending: 'warn', processing: 'info', complete: 'ok', cancelled: 'bad', authorized: 'info', paid: 'ok', partiallyrefunded: 'warn', refunded: 'bad', voided: 'bad',
  shippingnotrequired: 'mute', notyetshipped: 'warn', partiallyshipped: 'info', shipped: 'info', delivered: 'ok', received: 'info', returnauthorized: 'info',
  itemsrepaired: 'ok', itemsrefunded: 'ok', requestrejected: 'bad', yes: 'ok', no: 'mute', information: 'info', warning: 'warn', error: 'bad', active: 'ok', inactive: 'mute',
}
export const Badge = ({ children, tone }) => <span className={cx('ad-badge', tone || STATUS_TONE[String(children).toLowerCase().replace(/\s/g, '')] || 'mute')}>{children}</span>
export const BoolBadge = ({ v, yes = 'Yes', no = 'No' }) => <Badge tone={v ? 'ok' : 'mute'}>{v ? yes : no}</Badge>
export const splitCamel = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2')

export function Tabs({ tabs, active, onChange, idPrefix = 'admin-tab' }) {
  return (
    <div className="ad-tabs" role="tablist">
      {tabs.filter(Boolean).map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} id={`${idPrefix}-${kebab(t.key)}`} className={cx(active === t.key && 'active')} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <em>{t.count}</em>}
        </button>
      ))}
    </div>
  )
}

export function Pager({ page, size, total, onPage, onSize, idPrefix = 'admin' }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? (page - 1) * size + 1 : 0
  const nums = []
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i)
  return (
    <div className="ad-pager">
      <div className="ad-pager-size">
        <label htmlFor={`${idPrefix}-page-size`}>Show</label>
        <select id={`${idPrefix}-page-size`} value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {[7, 15, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>items</span>
      </div>
      <div className="ad-pager-nav">
        <button type="button" id={`${idPrefix}-page-prev`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        {nums.map((n) => <button type="button" key={n} id={`${idPrefix}-page-${n}`} className={cx(n === page && 'active')} onClick={() => onPage(n)}>{n}</button>)}
        <button type="button" id={`${idPrefix}-page-next`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
      <span className="ad-pager-info" id={`${idPrefix}-page-info`}>{from}-{Math.min(total, page * size)} of {total} items</span>
    </div>
  )
}

// Simple table. cols: [{k,label,render?,className?}]
export function Table({ cols, rows, idPrefix, rowKey = (r) => r.id, empty, selectable, selected, onSelect, rowId, foot }) {
  if (!rows?.length) return <Empty text={empty} />
  const all = selectable && rows.every((r) => selected.includes(rowKey(r)))
  return (
    <div className="ad-table-wrap">
      <table className="ad-table" id={idPrefix ? `${idPrefix}-table` : undefined}>
        <thead><tr>
          {selectable && <th className="ad-check"><input type="checkbox" id={`${idPrefix}-select-all`} aria-label="Select all" checked={all} onChange={() => onSelect(all ? selected.filter((x) => !rows.some((r) => rowKey(r) === x)) : [...new Set([...selected, ...rows.map(rowKey)])])} /></th>}
          {cols.map((c) => <th key={c.k} className={c.className}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const key = rowKey(r) ?? i
            return (
              <tr key={key} id={rowId ? rowId(r) : idPrefix ? `${idPrefix}-row-${kebab(key)}` : undefined}>
                {selectable && <td className="ad-check"><input type="checkbox" id={`${idPrefix}-select-${kebab(key)}`} aria-label={`Select ${key}`} checked={selected.includes(key)} onChange={() => onSelect(selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key])} /></td>}
                {cols.map((c) => <td key={c.k} className={c.className}>{c.render ? c.render(r, i) : r[c.k]}</td>)}
              </tr>
            )
          })}
        </tbody>
        {foot}
      </table>
    </div>
  )
}

// ---------- form fields ----------
export function Field({ id, label, hint, children, className, required }) {
  return (
    <div className={cx('ad-field', className)}>
      <label htmlFor={id} className="ad-label">{label}{required && <i className="ad-req">*</i>}</label>
      <div className="ad-control">{children}{hint && <small className="ad-hint">{hint}</small>}</div>
    </div>
  )
}

export function Toggle({ id, checked, onChange, label, disabled }) {
  return (
    <span className="ad-toggle">
      <input type="checkbox" id={id} checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ad-toggle-ui" aria-hidden="true" />
      {label && <label htmlFor={id} className="ad-toggle-label">{label}</label>}
    </span>
  )
}

// input by type: text|textarea|html|int|number|money|bool|datetime|date|select|email|password|color
export function Input({ id, type = 'text', value, onChange, options, placeholder, rows, disabled, min, step }) {
  if (type === 'bool') return <Toggle id={id} checked={value} onChange={onChange} disabled={disabled} />
  if (type === 'select') return (
    <select id={id} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {(options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o]; return <option key={String(v)} value={v ?? ''}>{l}</option> })}
    </select>
  )
  if (type === 'textarea' || type === 'html') return <textarea id={id} value={value ?? ''} rows={rows || (type === 'html' ? 10 : 4)} disabled={disabled} placeholder={placeholder} className={cx(type === 'html' && 'mono')} onChange={(e) => onChange(e.target.value)} />
  if (type === 'datetime') return <input id={id} type="datetime-local" value={toLocalInput(value)} disabled={disabled} onChange={(e) => onChange(fromLocalInput(e.target.value))} />
  if (type === 'date') return <input id={id} type="date" value={toDateInput(value)} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
  if (type === 'color') return (
    <span className="ad-color"><input type="color" id={`${id}-picker`} aria-label="Pick color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input id={id} value={value ?? ''} placeholder="#RRGGBB" disabled={disabled} onChange={(e) => onChange(e.target.value)} /></span>
  )
  const numeric = type === 'int' || type === 'number' || type === 'money'
  return (
    <input id={id} type={numeric ? 'number' : type} value={value ?? ''} disabled={disabled} placeholder={placeholder} min={min} step={step || (type === 'int' ? 1 : numeric ? 'any' : undefined)}
      onChange={(e) => onChange(numeric ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
  )
}

// Multi-select with search. options: [{id, name, group?}]
export function MultiPicker({ id, options = [], value = [], onChange, placeholder = 'Search and select…' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = value.map(Number)
  const byId = new Map(options.map((o) => [Number(o.id), o]))
  const list = options.filter((o) => !sel.includes(Number(o.id)) && `${o.name} ${o.group || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60)
  return (
    <div className="ad-multi" ref={ref}>
      <div className="ad-multi-box" onClick={() => setOpen(true)}>
        {sel.map((v) => (
          <span key={v} className="ad-chip" id={`${id}-chip-${v}`}>{byId.get(v)?.name || `#${v}`}
            <button type="button" id={`${id}-remove-${v}`} aria-label="Remove" onClick={(e) => { e.stopPropagation(); onChange(sel.filter((x) => x !== v)) }}><X size={11} /></button></span>
        ))}
        <input id={id} value={q} placeholder={sel.length ? '' : placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !q && sel.length) onChange(sel.slice(0, -1)); if (e.key === 'Enter') { e.preventDefault(); if (list[0]) { onChange([...sel, Number(list[0].id)]); setQ('') } } }} />
      </div>
      {open && (
        <div className="ad-multi-list" id={`${id}-options`}>
          {list.length ? list.map((o) => (
            <button type="button" key={o.id} id={`${id}-option-${o.id}`} onClick={() => { onChange([...sel, Number(o.id)]); setQ('') }}>
              {o.group && <small>{o.group} › </small>}{o.name}
            </button>
          )) : <span className="ad-multi-none">No matches</span>}
        </div>
      )}
    </div>
  )
}

export function SearchBox({ id, value, onChange, onSubmit, placeholder = 'Search' }) {
  return (
    <form className="ad-search" onSubmit={(e) => { e.preventDefault(); onSubmit?.() }} role="search">
      <Search size={14} />
      <label htmlFor={id} className="ad-sr">{placeholder}</label>
      <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </form>
  )
}

// category options with breadcrumb names
export function categoryOptions(cats = []) {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const path = (c, depth = 0) => (c.parent_id && byId.get(c.parent_id) && depth < 8 ? `${path(byId.get(c.parent_id), depth + 1)} >> ` : '') + c.name
  return cats.map((c) => ({ id: c.id, name: path(c) })).sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- tiny SVG charts ----------
export function BarChart({ data, height = 180, format = (v) => v, id, color = 'var(--ad-green)' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  const [hover, setHover] = useState(null)
  return (
    <div className="ad-chart" id={id}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="Chart">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1="0" x2="100" y1={height - g * (height - 10)} y2={height - g * (height - 10)} className="ad-grid" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 10)
          return <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={height - h} height={Math.max(h, d.value ? 1 : 0)} rx="0.6" fill={color} opacity={hover === null || hover === i ? 1 : 0.45}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><title>{`${d.label}: ${format(d.value)}`}</title></rect>
        })}
      </svg>
      <div className="ad-chart-axis"><span>{data[0]?.label}</span><span>{hover !== null ? `${data[hover].label}: ${format(data[hover].value)}` : `max ${format(max)}`}</span><span>{data[data.length - 1]?.label}</span></div>
    </div>
  )
}

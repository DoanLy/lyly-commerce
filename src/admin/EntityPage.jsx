import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Pencil, Download, Save, Search, Eraser, Upload, Wand2, Send, Eye, MailCheck, Image as ImageIcon } from 'lucide-react'
import { ENTITIES, slugOf } from './entities.js'
import {
  api, usd, formatDate, kebab, cx, useLoad, useUi, useAction, useLookups, PageHead, Card, Loading, ErrorBox, Badge, BoolBadge, Table, Pager,
  Field, Input, MultiPicker, toCsv, downloadText, splitCamel,
} from './ui.jsx'
import { fileToDataUrl } from '../lib/api.js'

const pkOf = (cfg, row) => row[cfg.pk || 'id']

export function renderCell(col, row) {
  const v = col.get ? col.get(row) : row[col.k]
  switch (col.type) {
    case 'bool': return <BoolBadge v={v} />
    case 'date': return v ? formatDate(v) : ''
    case 'datetime': return v ? formatDate(v, true) : ''
    case 'money': return usd(v)
    case 'badge': return v ? <Badge>{splitCamel(v)}</Badge> : ''
    case 'enum': return (col.options.find((o) => o[0] === v) || [v, v])[1]
    case 'truncate': return <span className="ad-trunc" title={String(v ?? '')}>{String(v ?? '').replace(/<[^>]+>/g, ' ').slice(0, 90)}</span>
    case 'number': return <span className="ad-num">{v ?? ''}</span>
    case 'image': return v ? <img className="ad-thumb" src={v} alt="" /> : <span className="ad-thumb empty"><ImageIcon size={14} /></span>
    case 'link': return v != null && v !== '' ? <Link to={col.to(row)} className="ad-link" onClick={(e) => e.stopPropagation()}>{col.text ? col.text(row) : v}</Link> : ''
    default: return v ?? ''
  }
}

// ---------------- list ----------------
export function EntityList({ entity }) {
  const cfg = ENTITIES[entity]
  const slug = slugOf(entity)
  const p = `admin-${kebab(entity)}`
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [applied, setApplied] = useState({ search: '', filters: {} })
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(15)
  const [selected, setSelected] = useState([])
  const params = useMemo(() => ({ search: applied.search, page, size, ...Object.fromEntries(Object.entries(applied.filters).map(([k, v]) => [`f_${k}`, v])) }), [applied, page, size])
  const { data, loading, error, reload } = useLoad(() => api.get(`/admin/e/${entity}`, params), [entity, params])

  useEffect(() => { setSelected([]) }, [entity, params])
  const apply = () => { setPage(1); setApplied({ search, filters }) }
  const editable = !cfg.readOnly
  const canDelete = !cfg.noDelete

  const del = async (ids) => {
    if (!ids.length) return
    if (!(await confirm(`Delete ${ids.length} selected ${ids.length > 1 ? 'items' : cfg.single}?`))) return
    await run(() => api.post(`/admin/e/${entity}/bulk`, { action: 'delete', ids }), 'The selected items have been deleted')
    reload()
  }
  const bulkSet = async (b) => {
    await run(() => api.post(`/admin/e/${entity}/bulk`, { action: 'set', ids: selected, values: b.values }), `${selected.length} item(s) updated`)
    reload()
  }
  const clearAll = async () => {
    if (!(await confirm(`Clear all ${cfg.title.toLowerCase()}? This cannot be undone.`, { okText: 'Clear all' }))) return
    await run(() => api.post(`/admin/e/${entity}/clear`), `${cfg.title} cleared`)
    reload()
  }
  const exportCsv = async () => {
    const all = await run(() => api.get(`/admin/e/${entity}`, { ...params, page: 1, size: 500 }))
    if (all) downloadText(`${slug}.csv`, toCsv(all.rows, cfg.list.filter((c) => c.type !== 'image').map((c) => ({ k: c.k, label: c.label, get: c.get }))))
  }

  const cols = [...cfg.list.map((c) => ({ ...c, render: (r) => renderCell(c, r) }))]
  if (editable || canDelete) cols.push({
    k: '__actions', label: '', className: 'ad-actions-col',
    render: (r) => {
      const id = kebab(pkOf(cfg, r))
      return (
        <div className="ad-row-actions">
          {editable && <Link to={`/admin/${slug}/edit/${encodeURIComponent(pkOf(cfg, r))}`} className="ad-btn sm" id={`${p}-edit-${id}`}><Pencil size={13} />{cfg.viewOnly ? 'View' : 'Edit'}</Link>}
          {!editable && canDelete && <button type="button" className="ad-icon-btn danger" id={`${p}-delete-${id}`} aria-label="Delete" onClick={() => del([pkOf(cfg, r)])}><Trash2 size={14} /></button>}
        </div>
      )
    },
  })

  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title={cfg.title}>
        {!cfg.noCreate && <Link to={`/admin/${slug}/create`} className="ad-btn primary" id={`${p}-add-new`}><Plus size={15} />Add new</Link>}
        <button type="button" className="ad-btn" id={`${p}-export`} onClick={exportCsv} disabled={busy}><Download size={15} />Export CSV</button>
        {cfg.clearable && <button type="button" className="ad-btn danger" id={`${p}-clear-all`} onClick={clearAll}><Eraser size={15} />Clear all</button>}
      </PageHead>

      <Card className="ad-filter-card">
        <form className="ad-filters" onSubmit={(e) => { e.preventDefault(); apply() }}>
          <div className="ad-field-inline">
            <label htmlFor={`${p}-search`}>Search</label>
            <input id={`${p}-search`} value={search} placeholder={`Search ${cfg.title.toLowerCase()}`} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(cfg.filters || []).map((f) => (
            <div className="ad-field-inline" key={f.k}>
              <label htmlFor={`${p}-filter-${kebab(f.k)}`}>{f.label}</label>
              <Input id={`${p}-filter-${kebab(f.k)}`} type={f.type} options={f.options} placeholder={f.placeholder} value={filters[f.k] ?? ''} onChange={(v) => setFilters((x) => ({ ...x, [f.k]: v }))} />
            </div>
          ))}
          <button type="submit" className="ad-btn primary" id={`${p}-search-button`}><Search size={14} />Search</button>
        </form>
      </Card>

      <Card>
        {(selected.length > 0) && (
          <div className="ad-bulkbar" id={`${p}-bulkbar`}>
            <span>{selected.length} selected</span>
            {(cfg.bulk || []).map((b) => <button type="button" key={b.key} className="ad-btn sm" id={`${p}-bulk-${b.key}`} onClick={() => bulkSet(b)} disabled={busy}>{b.label}</button>)}
            {canDelete && <button type="button" className="ad-btn sm danger" id={`${p}-bulk-delete`} onClick={() => del(selected)} disabled={busy}><Trash2 size={13} />Delete selected</button>}
            <button type="button" className="ad-btn sm ghost" id={`${p}-bulk-clear`} onClick={() => setSelected([])}>Clear selection</button>
          </div>
        )}
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <Table idPrefix={p} cols={cols} rows={data?.rows} rowKey={(r) => pkOf(cfg, r)} selectable={canDelete || !!cfg.bulk} selected={selected} onSelect={setSelected} />
            <Pager idPrefix={p} page={page} size={size} total={data?.total || 0} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------- edit ----------------
function resolveOptions(f, lookups, row) {
  return typeof f.options === 'function' ? f.options(lookups, row) : f.options
}

export function ImageInput({ id, value, onChange }) {
  const { fail } = useUi()
  return (
    <div className="ad-image-input">
      {value ? <img src={value} alt="Preview" id={`${id}-preview`} /> : <span className="ad-thumb empty lg"><ImageIcon size={18} /></span>}
      <div>
        <input id={id} value={value?.startsWith('data:') ? '(uploaded image)' : value || ''} placeholder="Paste image URL" onChange={(e) => onChange(e.target.value)} />
        <div className="ad-inline-actions">
          <label className="ad-btn sm" htmlFor={`${id}-file`}><Upload size={13} />Upload</label>
          <input type="file" accept="image/*" id={`${id}-file`} className="ad-sr" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { onChange(await fileToDataUrl(f)) } catch (er) { fail(er) } } e.target.value = '' }} />
          {value && <button type="button" className="ad-btn sm ghost" id={`${id}-remove`} onClick={() => onChange('')}>Remove</button>}
        </div>
      </div>
    </div>
  )
}

function InfoValue({ f, row }) {
  const v = row[f.k]
  const text = f.format === 'datetime' ? formatDate(v, true) : f.format === 'money' ? usd(v) : v
  if (f.format === 'pre') return <pre className="ad-pre" id={`admin-info-${kebab(f.k)}`}>{v || '—'}</pre>
  const link = f.link?.(row)
  return <span className="ad-info" id={`admin-info-${kebab(f.k)}`}>{link ? <Link className="ad-link" to={link}>{text || '—'}</Link> : (text === '' || text == null ? '—' : String(text))}</span>
}

export function FormFields({ fields, row, set, prefix, lookups, extraRender }) {
  return fields.map((f) => {
    if (f.show && !f.show(row)) return null
    if (f.type === 'info' && f.hideEmpty && (row[f.k] == null || row[f.k] === '')) return null
    const id = `${prefix}-${kebab(f.k)}`
    let control
    if (f.type === 'info') control = <InfoValue f={f} row={row} />
    else if (f.type === 'image') control = <ImageInput id={id} value={row[f.k]} onChange={(v) => set(f.k, v)} />
    else if (extraRender?.[f.type]) control = extraRender[f.type](f, id)
    else control = <Input id={id} type={f.type} rows={f.rows} placeholder={f.placeholder} options={resolveOptions(f, lookups, row)} value={row[f.k]} onChange={(v) => set(f.k, v)} />
    return <Field key={f.k} id={id} label={f.label} hint={f.hint} required={f.required}>{control}</Field>
  })
}

export function ChildEditor({ def, rows = [], onChange, prefix }) {
  const upd = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="ad-child">
      {rows.length ? (
        <div className="ad-table-wrap">
          <table className="ad-table compact" id={`${prefix}-table`}>
            <thead><tr>{def.cols.map((c) => <th key={c.k}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || `n${i}`} id={`${prefix}-row-${i}`}>
                  {def.cols.map((c) => (
                    <td key={c.k}><label htmlFor={`${prefix}-${i}-${kebab(c.k)}`} className="ad-sr">{c.label}</label>
                      <Input id={`${prefix}-${i}-${kebab(c.k)}`} type={c.type} options={c.options} value={r[c.k]} onChange={(v) => upd(i, c.k, v)} /></td>
                  ))}
                  <td className="ad-actions-col"><button type="button" className="ad-icon-btn danger" id={`${prefix}-${i}-delete`} aria-label="Delete row" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="ad-muted">No {def.single}s yet.</p>}
      <button type="button" className="ad-btn sm" id={`${prefix}-add`} onClick={() => onChange([...rows, Object.fromEntries(def.cols.map((c) => [c.k, c.type === 'bool' ? false : c.k === 'display_order' ? rows.length : ['int', 'number', 'money'].includes(c.type) ? (c.k === 'quantity' ? 1 : 0) : '']))])}><Plus size={13} />Add {def.single}</button>
    </div>
  )
}

export function EditButtons({ prefix, onSave, onDelete, busy, extra }) {
  return (
    <>
      {extra}
      <button type="button" className="ad-btn primary" id={`${prefix}-save`} disabled={busy} onClick={() => onSave(false)}><Save size={15} />Save</button>
      <button type="button" className="ad-btn primary outline" id={`${prefix}-save-continue`} disabled={busy} onClick={() => onSave(true)}><Save size={15} />Save and continue edit</button>
      {onDelete && <button type="button" className="ad-btn danger" id={`${prefix}-delete`} disabled={busy} onClick={onDelete}><Trash2 size={15} />Delete</button>}
    </>
  )
}

export function EntityEdit({ entity }) {
  const cfg = ENTITIES[entity]
  const slug = slugOf(entity)
  const p = `admin-${kebab(entity)}`
  const { id } = useParams()
  const nav = useNavigate()
  const { confirm } = useUi()
  const [run, busy] = useAction()
  const { lookups, refresh } = useLookups()
  const [row, setRow] = useState(null)
  const { data, loading, error, reload } = useLoad(() => (id ? api.get(`/admin/e/${entity}/${encodeURIComponent(id)}`) : Promise.resolve({ ...(cfg.defaults || {}) })), [entity, id])
  useEffect(() => { if (data) setRow(structuredClone(data)) }, [data])
  const set = (k, v) => setRow((r) => ({ ...r, [k]: v }))
  const isNew = !id

  const save = async (cont) => {
    const res = await run(() => (isNew ? api.post(`/admin/e/${entity}`, row) : api.put(`/admin/e/${entity}/${encodeURIComponent(id)}`, row)), `The ${cfg.single} has been ${isNew ? 'added' : 'updated'} successfully.`)
    if (!res) return
    if (cfg.lookupsChange) refresh()
    if (!cont) return nav(`/admin/${slug}`)
    const newId = pkOf(cfg, res)
    if (isNew) nav(`/admin/${slug}/edit/${encodeURIComponent(newId)}`, { replace: true })
    else reload()
  }
  const del = async () => {
    if (!(await confirm(`Delete this ${cfg.single}?`))) return
    const r = await run(() => api.del(`/admin/e/${entity}/${encodeURIComponent(id)}`), `The ${cfg.single} has been deleted.`)
    if (r) { if (cfg.lookupsChange) refresh(); nav(`/admin/${slug}`) }
  }

  if (!cfg.sections || (isNew && cfg.noCreate)) return <div className="ad-page"><PageHead title={cfg.title} back={`/admin/${slug}`} /><ErrorBox error="This item cannot be created or edited here." /></div>
  if (error) return <div className="ad-page"><PageHead title={cfg.title} back={`/admin/${slug}`} /><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !row) return <Loading />

  const lk = lookups
  const extraRender = {
    giftcode: (f, fid) => (
      <div className="ad-input-group">
        <input id={fid} value={row[f.k] || ''} onChange={(e) => set(f.k, e.target.value)} />
        <button type="button" className="ad-btn" id={`${p}-generate-code`} onClick={async () => { const r = await run(() => api.post('/admin/gift_cards/generate-code')); if (r) set(f.k, r.code) }}><Wand2 size={14} />Generate code</button>
      </div>
    ),
  }
  const title = isNew ? `Add a new ${cfg.single}` : `${cfg.viewOnly ? 'View' : 'Edit'} ${cfg.single}${row.name || row.title ? ` – ${row.name || row.title}` : ''}`
  const previewUrl = !isNew && cfg.preview?.(row)

  return (
    <div className="ad-page" id={`${p}-edit-page`}>
      <PageHead title={title} back={`/admin/${slug}`} backLabel={`back to ${cfg.title.toLowerCase()} list`}>
        {previewUrl && <a className="ad-btn" id={`${p}-preview`} href={previewUrl} target="_blank" rel="noreferrer"><Eye size={15} />Preview</a>}
        {cfg.viewOnly
          ? !cfg.noDelete && <button type="button" className="ad-btn danger" id={`${p}-delete`} onClick={del}><Trash2 size={15} />Delete</button>
          : <EditButtons prefix={p} busy={busy} onSave={save} onDelete={!isNew && !cfg.noDelete && !(row.is_system) ? del : null} />}
      </PageHead>
      <form onSubmit={(e) => { e.preventDefault(); if (!cfg.viewOnly) save(false) }}>
        {cfg.sections.map((s) => (
          <Card key={s.title} title={s.title} id={`${p}-section-${kebab(s.title)}`}>
            <div className="ad-form"><FormFields fields={s.fields} row={row} set={set} prefix={p} lookups={lk} extraRender={extraRender} /></div>
          </Card>
        ))}
        {(cfg.maps || []).filter((m) => !m.show || m.show(row)).map((m) => (
          <Card key={m.key} title={m.label} id={`${p}-section-${kebab(m.key)}`}>
            <Field id={`${p}-${kebab(m.key)}`} label={m.label}>
              <MultiPicker id={`${p}-${kebab(m.key)}`} options={lk[m.source] || []} value={row[m.key] || []} onChange={(v) => set(m.key, v)} />
            </Field>
          </Card>
        ))}
        {cfg.children && (
          <Card title={cfg.children.title} id={`${p}-section-${kebab(cfg.children.key)}`}>
            <ChildEditor def={cfg.children} prefix={`${p}-${kebab(cfg.children.key)}`} rows={row[cfg.children.key] || []} onChange={(v) => set(cfg.children.key, v)} />
          </Card>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {cfg.extra === 'campaign' && !isNew && <CampaignActions id={id} prefix={p} />}
      {cfg.extra === 'queuedEmail' && !isNew && (
        <Card title="Message preview" id={`${p}-preview-card`} actions={!row.sent_at && (
          <button type="button" className="ad-btn primary" id={`${p}-mark-sent`} disabled={busy} onClick={async () => { if (await run(() => api.post(`/admin/queued_emails/${id}/send`), 'The email has been marked as sent')) reload() }}><MailCheck size={15} />Mark as sent</button>
        )}>
          <iframe title="Email body" className="ad-email-frame" id={`${p}-body-preview`} sandbox="" srcDoc={row.body || ''} />
        </Card>
      )}
    </div>
  )
}

function CampaignActions({ id, prefix }) {
  const [email, setEmail] = useState('')
  const [run, busy] = useAction()
  const { confirm } = useUi()
  return (
    <Card title="Send campaign" id={`${prefix}-send-card`}>
      <p className="ad-muted">Save the campaign before sending. Mass email goes to all active newsletter subscribers.</p>
      <div className="ad-form">
        <Field id={`${prefix}-test-email`} label="Send test email to">
          <div className="ad-input-group">
            <input id={`${prefix}-test-email`} type="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
            <button type="button" className="ad-btn" id={`${prefix}-send-test`} disabled={busy || !email} onClick={() => run(() => api.post(`/admin/campaigns/${id}/send`, { testEmail: email }), (r) => r.message)}><Send size={14} />Send test email</button>
          </div>
        </Field>
      </div>
      <button type="button" className="ad-btn primary" id={`${prefix}-send-mass`} disabled={busy} onClick={async () => { if (await confirm('Send this campaign to all active newsletter subscribers?', { danger: false, okText: 'Send' })) run(() => api.post(`/admin/campaigns/${id}/send`, {}), (r) => r.message) }}><Send size={15} />Send mass email</button>
    </Card>
  )
}

export { cx }

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, ShoppingCart, Users } from 'lucide-react'
import { api, kebab, useLoad, useAction, useUi, PageHead, Card, Loading, ErrorBox, Tabs, Field, Input } from './ui.jsx'

const GROUPS = [
  ['store', 'Store information'], ['catalog', 'Catalog'], ['orders', 'Orders'], ['shipping', 'Shipping'], ['tax', 'Tax'], ['rewardPoints', 'Reward points'],
  ['customer', 'Customers'], ['newsletter', 'Newsletter'], ['polls', 'Polls'], ['blog', 'Blog'], ['news', 'News'], ['seo', 'SEO'],
]
const SELECTS = { awardWhen: [['Paid', 'Order is paid'], ['Complete', 'Order is complete']], defaultViewMode: [['grid', 'Grid'], ['list', 'List']] }
const LABELS = { showSku: 'Show SKU', showGtin: 'Show GTIN', seo: 'SEO', url: 'Store URL', email: 'Store email', name: 'Store name', title: 'Default title', description: 'Default meta description', earnPerAmount: 'Earn points for every amount spent ($)', earnPoints: 'Points earned per amount', exchangeRate: 'Exchange rate (1 point = $)' }
const label = (k) => LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m) => m.toLowerCase())

export function SettingsPage() {
  const { group = 'store' } = useParams()
  const nav = useNavigate()
  const [run, busy] = useAction()
  const { data, loading, error, reload, setData } = useLoad(() => api.get('/admin/settings'), [])
  const [vals, setVals] = useState(null)
  useEffect(() => { if (data?.[group]) setVals(structuredClone(data[group])) }, [data, group])
  if (error) return <div className="ad-page"><ErrorBox error={error} onRetry={reload} /></div>
  if (loading || !data) return <Loading />
  const p = `admin-settings-${kebab(group)}`
  const title = GROUPS.find((g) => g[0] === group)?.[1] || group
  const save = async () => {
    const body = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Array.isArray(data[group][k]) ? (Array.isArray(v) ? v : String(v).split('\n').map((x) => x.trim()).filter(Boolean)) : v]))
    const r = await run(() => api.put(`/admin/settings/${group}`, body), `${title} settings have been saved`)
    if (r) setData(r)
  }
  return (
    <div className="ad-page" id="admin-settings-page">
      <PageHead title="Settings" sub="Changes apply to the public store immediately">
        <button type="button" className="ad-btn primary" id={`${p}-save`} disabled={busy || !vals} onClick={save}><Save size={15} />Save</button>
      </PageHead>
      <Tabs idPrefix="admin-settings-tab" active={group} onChange={(g) => nav(`/admin/settings/${g}`)} tabs={GROUPS.map(([key, l]) => ({ key, label: l }))} />
      {!data[group] ? <ErrorBox error="Unknown settings group" /> : vals && (
        <Card title={`${title} settings`} id={`${p}-section`}>
          <form className="ad-form" onSubmit={(e) => { e.preventDefault(); save() }}>
            {Object.entries(data[group]).map(([k, def]) => {
              const id = `${p}-${kebab(k)}`
              const type = typeof def === 'boolean' ? 'bool' : typeof def === 'number' ? 'number' : Array.isArray(def) ? 'textarea' : SELECTS[k] ? 'select' : String(def).length > 80 ? 'textarea' : 'text'
              const value = Array.isArray(def) ? (Array.isArray(vals[k]) ? vals[k].join('\n') : vals[k]) : vals[k]
              return (
                <Field key={k} id={id} label={label(k)} hint={Array.isArray(def) ? 'One value per line' : undefined}>
                  <Input id={id} type={type} options={SELECTS[k]} rows={4} value={value} onChange={(v) => setVals({ ...vals, [k]: v })} />
                </Field>
              )
            })}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Card>
      )}
    </div>
  )
}

export function Maintenance() {
  const p = 'admin-maintenance'
  const [run, busy] = useAction()
  const { confirm } = useUi()
  const [days, setDays] = useState(30)
  const task = async (t, text, body) => { if (await confirm(text, { okText: 'Run' })) run(() => api.post(`/admin/maintenance/${t}`, body), (r) => r.message) }
  return (
    <div className="ad-page" id={`${p}-page`}>
      <PageHead title="Maintenance" />
      <div className="ad-grid-2">
        <Card title="Deleting guest customers" id={`${p}-guests`}>
          <p className="ad-muted">Delete guest customers without email and orders that have been inactive for more than a day.</p>
          <button type="button" className="ad-btn danger" id={`${p}-delete-guests`} disabled={busy} onClick={() => task('delete-guests', 'Delete inactive guest customers?')}><Users size={15} />Delete guest customers</button>
        </Card>
        <Card title="Deleting abandoned shopping carts" id={`${p}-carts`}>
          <div className="ad-form">
            <Field id={`${p}-cart-days`} label="Older than (days)"><Input id={`${p}-cart-days`} type="int" min={1} value={days} onChange={setDays} /></Field>
          </div>
          <button type="button" className="ad-btn danger" id={`${p}-clear-carts`} disabled={busy} onClick={() => task('clear-carts', `Delete cart and wishlist items not updated in the last ${days} days?`, { days })}><ShoppingCart size={15} />Clear old carts</button>
        </Card>
      </div>
      <Card title="Logs" id={`${p}-logs`}>
        <p className="ad-muted">Clear logs from their pages: Queued emails, Log, Activity log, and Search terms each have a “Clear all” button.</p>
      </Card>
    </div>
  )
}

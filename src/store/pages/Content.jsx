import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, formatDate } from '../../lib/api.js'
import { useStore, Loading, Breadcrumb, Notice, PageTitle, Field, Pager, useDocumentTitle, useAsync } from '../ui.jsx'

export function TopicPage() {
  const { slug } = useParams()
  const [{ data, loading, error }] = useAsync(() => api.get(`/topics/${slug}`), [slug])
  useDocumentTitle(data?.title)
  if (loading) return <Loading />
  if (error) return <NotFound />
  return (
    <div className="container topic-page" id={`topic-${slug}`}>
      <Breadcrumb items={[{ label: data.title }]} />
      <PageTitle>{data.title}</PageTitle>
      <div className="rich card" dangerouslySetInnerHTML={{ __html: data.body }} />
    </div>
  )
}

function CommentForm({ onSubmit, withTitle, idPrefix }) {
  const { customer } = useStore()
  const [form, setForm] = useState({ title: '', text: '' })
  const [msg, setMsg] = useState(null)
  if (!customer) return <Notice type="info">Only registered users can leave comments. <Link to="/login">Log in</Link></Notice>
  const submit = async (e) => {
    e.preventDefault()
    try { const r = await onSubmit(form); setMsg({ type: 'success', text: r.message }); setForm({ title: '', text: '' }) } catch (x) { setMsg({ type: 'error', text: x.message }) }
  }
  return (
    <form className="card" onSubmit={submit} id={`${idPrefix}-form`}>
      <h3>Leave your comment</h3>
      {msg && <Notice type={msg.type} id={`${idPrefix}-result`}>{msg.text}</Notice>}
      {withTitle && <Field label="Title" id={`${idPrefix}-title`} required><input id={`${idPrefix}-title`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>}
      <Field label="Comment" id={`${idPrefix}-text`} required><textarea id={`${idPrefix}-text`} rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
      <button className="dark-button" id={`${idPrefix}-submit`}>{withTitle ? 'New comment' : 'Add comment'}</button>
    </form>
  )
}

export function NewsListPage() {
  useDocumentTitle('News')
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') || 1)
  const [{ data, loading }] = useAsync(() => api.get('/news', { page }), [page])
  return (
    <div className="container" id="news-list-page">
      <Breadcrumb items={[{ label: 'News' }]} />
      <PageTitle>News</PageTitle>
      {loading ? <Loading /> : (
        <>
          <div className="post-list">{data.items.map((n) => (
            <article className="card post" key={n.id} id={`news-item-${n.id}`}>
              <small className="muted">{formatDate(n.created_at)}</small>
              <h2><Link to={`/news/${n.slug}`}>{n.title}</Link></h2>
              <p>{n.short}</p>
              <Link to={`/news/${n.slug}`} className="text-link">Details · {n.comments} comment(s)</Link>
            </article>
          ))}</div>
          <Pager page={data.page} pages={data.pages} onPage={(p) => setParams({ page: p })} id="news-pager" />
        </>
      )}
    </div>
  )
}

export function NewsItemPage() {
  const { slug } = useParams()
  const [n, setN] = useState(0)
  const [{ data, loading, error }] = useAsync(() => api.get(`/news/${slug}`), [slug, n])
  useDocumentTitle(data?.title)
  if (loading && !data) return <Loading />
  if (error) return <NotFound />
  return (
    <div className="container article" id="news-item-page">
      <Breadcrumb items={[{ label: 'News', to: '/news' }, { label: data.title }]} />
      <PageTitle sub={formatDate(data.created_at)}>{data.title}</PageTitle>
      <div className="rich card" dangerouslySetInnerHTML={{ __html: data.full_text }} />
      {data.allow_comments && (
        <section className="comments" id="news-comments">
          <h3>Comments ({data.comments.length})</h3>
          {data.comments.map((c) => <div className="comment" key={c.id} id={`news-comment-${c.id}`}><b>{c.title}</b><p>{c.body}</p><small className="muted">{c.author} · {formatDate(c.created_at, true)}</small></div>)}
          <CommentForm withTitle idPrefix="news-comment" onSubmit={async (f) => { const r = await api.post(`/news/${data.id}/comments`, f); setN((x) => x + 1); return r }} />
        </section>
      )}
    </div>
  )
}

export function BlogListPage() {
  useDocumentTitle('Blog')
  const [params, setParams] = useSearchParams()
  const q = Object.fromEntries(params.entries())
  const [{ data, loading }] = useAsync(() => api.get('/blog', q), [params.toString()])
  return (
    <div className="container" id="blog-list-page">
      <Breadcrumb items={[{ label: 'Blog' }]} />
      <PageTitle>{q.tag ? `Blog posts tagged with '${q.tag}'` : q.month ? `Blog posts from ${q.month}` : 'Blog'}</PageTitle>
      {loading ? <Loading /> : (
        <div className="blog-layout">
          <div>
            {!data.items.length && <div className="empty">No blog posts</div>}
            {data.items.map((b) => (
              <article className="card post" key={b.id} id={`blog-post-${b.id}`}>
                <small className="muted">{formatDate(b.created_at)}</small>
                <h2><Link to={`/blog/${b.slug}`}>{b.title}</Link></h2>
                <p>{b.overview}</p>
                <div className="row-gap wrap">{b.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <Link key={t} className="chip" to={`/blog?tag=${encodeURIComponent(t)}`}>{t}</Link>)}</div>
                <Link to={`/blog/${b.slug}`} className="text-link">Details · {b.comments} comment(s)</Link>
              </article>
            ))}
            <Pager page={data.page} pages={data.pages} onPage={(p) => setParams({ ...q, page: p })} id="blog-pager" />
          </div>
          <aside className="card" id="blog-sidebar">
            <h4>Archive</h4>
            {Object.entries(data.months).sort().reverse().map(([m, c]) => <Link key={m} to={`/blog?month=${m}`} className="side-link">{m} ({c})</Link>)}
            <h4>Popular tags</h4>
            <div className="row-gap wrap">{Object.entries(data.tags).map(([t, c]) => <Link key={t} className="chip" to={`/blog?tag=${encodeURIComponent(t)}`}>{t} ({c})</Link>)}</div>
          </aside>
        </div>
      )}
    </div>
  )
}

export function BlogPostPage() {
  const { slug } = useParams()
  const [n, setN] = useState(0)
  const [{ data, loading, error }] = useAsync(() => api.get(`/blog/${slug}`), [slug, n])
  useDocumentTitle(data?.title)
  if (loading && !data) return <Loading />
  if (error) return <NotFound />
  return (
    <div className="container article" id="blog-post-page">
      <Breadcrumb items={[{ label: 'Blog', to: '/blog' }, { label: data.title }]} />
      <PageTitle sub={formatDate(data.created_at)}>{data.title}</PageTitle>
      <div className="rich card" dangerouslySetInnerHTML={{ __html: data.body }} />
      {data.allow_comments && (
        <section className="comments" id="blog-comments">
          <h3>Comments ({data.comments.length})</h3>
          {data.comments.map((c) => <div className="comment" key={c.id}><p>{c.body}</p><small className="muted">{c.author} · {formatDate(c.created_at, true)}</small></div>)}
          <CommentForm idPrefix="blog-comment" onSubmit={async (f) => { const r = await api.post(`/blog/${data.id}/comments`, f); setN((x) => x + 1); return r }} />
        </section>
      )}
    </div>
  )
}

export function ContactPage() {
  useDocumentTitle('Contact us')
  const { customer, boot } = useStore()
  const [form, setForm] = useState({ fullName: customer ? `${customer.firstName} ${customer.lastName}` : '', email: customer?.email || '', subject: '', enquiry: '' })
  const [msg, setMsg] = useState(null)
  const [{ data: topic }] = useAsync(() => api.get('/topics/ContactUs').catch(() => null), [])
  const submit = async (e) => { e.preventDefault(); try { const r = await api.post('/contact', form); setMsg({ type: 'success', text: r.message }); setForm({ ...form, subject: '', enquiry: '' }) } catch (x) { setMsg({ type: 'error', text: x.message }) } }
  return (
    <div className="container" id="contact-page">
      <Breadcrumb items={[{ label: 'Contact us' }]} />
      <PageTitle>Contact us</PageTitle>
      <div className="two-col">
        <div className="card">
          {topic && <div className="rich" dangerouslySetInnerHTML={{ __html: topic.body }} />}
          <p><b>{boot.settings.store.companyName}</b><br />{boot.settings.store.companyAddress}<br />{boot.settings.store.companyPhone}<br />{boot.settings.store.email}</p>
        </div>
        <form className="card" onSubmit={submit} id="contact-form" noValidate>
          {msg && <Notice type={msg.type} id="contact-result">{msg.text}</Notice>}
          <Field label="Your name" id="contact-name" required><input id="contact-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Your email" id="contact-email" required><input id="contact-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Subject" id="contact-subject"><input id="contact-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Enquiry" id="contact-enquiry" required><textarea id="contact-enquiry" rows={5} value={form.enquiry} onChange={(e) => setForm({ ...form, enquiry: e.target.value })} /></Field>
          <button className="dark-button" id="contact-submit">Submit</button>
        </form>
      </div>
    </div>
  )
}

export function SitemapPage() {
  useDocumentTitle('Sitemap')
  const [{ data, loading }] = useAsync(() => api.get('/sitemap'), [])
  const tree = (nodes) => <ul>{nodes.map((c) => <li key={c.id}><Link to={`/category/${c.slug}`}>{c.name}</Link>{c.children.length > 0 && tree(c.children)}</li>)}</ul>
  return (
    <div className="container" id="sitemap-page">
      <Breadcrumb items={[{ label: 'Sitemap' }]} />
      <PageTitle>Sitemap</PageTitle>
      {loading ? <Loading /> : (
        <div className="sitemap-grid">
          <div className="card"><h3>General</h3><ul><li><Link to="/">Home page</Link></li><li><Link to="/search">Search</Link></li><li><Link to="/news">News</Link></li><li><Link to="/blog">Blog</Link></li><li><Link to="/contactus">Contact us</Link></li><li><Link to="/customer/info">My account</Link></li><li><Link to="/producttag/all">Product tags</Link></li></ul>
            <h3>Topics</h3><ul>{data.topics.map((t) => <li key={t.slug}><Link to={`/page/${t.slug}`}>{t.title}</Link></li>)}</ul></div>
          <div className="card"><h3>Categories</h3>{tree(data.categories)}<h3>Manufacturers</h3><ul>{data.manufacturers.map((m) => <li key={m.slug}><Link to={`/manufacturer/${m.slug}`}>{m.name}</Link></li>)}</ul></div>
          <div className="card"><h3>Products</h3><ul>{data.products.map((p) => <li key={p.slug}><Link to={`/product/${p.slug}`}>{p.name}</Link></li>)}</ul></div>
        </div>
      )}
    </div>
  )
}

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="container section completed" id="page-not-found">
      <PageTitle>Page not found</PageTitle>
      <p className="lead">The page you requested was not found, and we have a fine guess why.</p>
      <Link to="/" className="dark-button" id="not-found-home">Back to home</Link>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Gift, Truck, Tag, Sparkles } from 'lucide-react'
import { api, formatDate } from '../../lib/api.js'
import { useStore, useAsync, Loading, useDocumentTitle } from '../ui.jsx'
import { BenefitBar, ProductGrid } from '../layout.jsx'

// Hero photos: CC0 images from StockSnap (https://stocksnap.io), no attribution required.
const SLIDES = [
  { eyebrow: 'New season tech', title: 'Work lighter with the Aurora Air 13', copy: 'All-day battery, silent design and a 10% welcome discount with code WELCOME10.', to: '/category/notebooks', cta: 'Shop notebooks', tone: 'sage',
    image: 'https://cdn.stocksnap.io/img-thumbs/960w/D3OTBIDS9X.jpg', alt: 'Bright home office with a laptop on a white desk', badge: { Icon: Tag, title: 'WELCOME10', text: '10% off your first order' } },
  { eyebrow: 'Capture everything', title: 'Mirrorless cameras from $749', copy: 'Bundle a lens and get free shipping on orders over $100.', to: '/category/camera-photo', cta: 'Explore cameras', tone: 'cream',
    image: 'https://cdn.stocksnap.io/img-thumbs/960w/PM78CUSN6D.jpg', alt: 'Camera bodies, lenses and accessories laid out on a wooden floor', badge: { Icon: Truck, title: 'Free shipping', text: 'On orders over $100' } },
  { eyebrow: 'Apparel week', title: '5% off all apparel, automatically', copy: 'Sneakers, jackets and accessories made from recycled fibres.', to: '/category/apparel', cta: 'Shop apparel', tone: 'blush',
    image: 'https://cdn.stocksnap.io/img-thumbs/960w/ZN97ZIF3ZU.jpg', alt: 'Rail of neutral-toned clothes in a warmly lit boutique', badge: { Icon: Sparkles, title: '-5% applied', text: 'No code needed' } },
]

function Hero() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return undefined
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6500)
    return () => clearInterval(t)
  }, [paused])
  const s = SLIDES[i]
  return (
    <section className={`hero-section tone-${s.tone}`} id="home-hero" data-slide={i} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="hero-inner">
        <div className="hero-content" key={i}>
          <div className="rating"><span>★★★★★</span> Rated 4.8 by our customers</div>
          <p className="eyebrow">{s.eyebrow}</p>
          <h1 id="home-hero-title">{s.title}</h1>
          <p className="hero-copy">{s.copy}</p>
          <Link to={s.to} className="dark-button" id="home-hero-cta">{s.cta} <ArrowRight size={15} /></Link>
        </div>
        <div className="hero-media" id="home-hero-media">
          <div className="hero-frame">
            {SLIDES.map((x, n) => (
              <img key={x.image} id={`home-hero-image-${n}`} src={x.image} alt={n === i ? x.alt : ''} aria-hidden={n !== i} className={n === i ? 'active' : ''} loading={n === 0 ? 'eager' : 'lazy'} />
            ))}
          </div>
          <div className="hero-badge" id="home-hero-badge" key={`b${i}`}>
            <span><s.badge.Icon size={18} /></span>
            <div><b>{s.badge.title}</b><small>{s.badge.text}</small></div>
          </div>
        </div>
      </div>
      <div className="hero-dots" id="home-hero-dots">
        {SLIDES.map((_, n) => <button key={n} id={`home-hero-dot-${n}`} className={n === i ? 'active' : ''} aria-label={`Slide ${n + 1}`} onClick={() => setI(n)} />)}
      </div>
    </section>
  )
}

export function PollBlock({ poll: initial, idPrefix = 'poll' }) {
  const { notify, customer } = useStore()
  const [poll, setPoll] = useState(initial)
  const [choice, setChoice] = useState('')
  const vote = async () => {
    if (!choice) return notify('Please select an answer', 'error')
    try { setPoll(await api.post(`/polls/${poll.id}/vote`, { answerId: choice })) } catch (e) { notify(e.message, 'error') }
  }
  const showResults = poll.voted || (!poll.allowGuests && !customer)
  return (
    <div className="poll" id={`${idPrefix}-${poll.id}`}>
      <h3>{poll.name}</h3>
      {showResults ? (
        <>
          {poll.answers.map((a) => {
            const pct = poll.total ? Math.round((a.votes / poll.total) * 100) : 0
            return <div key={a.id} className="poll-result"><span>{a.name}</span><div className="bar"><i style={{ width: `${pct}%` }} /></div><small>{a.votes} vote(s) · {pct}%</small></div>
          })}
          <p className="muted">{poll.total} vote(s) in total.{!poll.voted && !customer && ' Only registered users can vote.'}</p>
        </>
      ) : (
        <>
          {poll.answers.map((a) => (
            <label key={a.id} className="radio" htmlFor={`${idPrefix}-answer-${a.id}`}>
              <input type="radio" id={`${idPrefix}-answer-${a.id}`} name={`poll-${poll.id}`} value={a.id} checked={String(choice) === String(a.id)} onChange={() => setChoice(a.id)} /> {a.name}
            </label>
          ))}
          <button className="ghost-button small" id={`${idPrefix}-vote-${poll.id}`} onClick={vote}>Vote</button>
        </>
      )}
    </div>
  )
}

export default function Home() {
  useDocumentTitle('')
  const { boot } = useStore()
  const [{ data, loading }] = useAsync(() => api.get('/home'), [])
  return (
    <>
      <Hero />
      <BenefitBar />
      {loading ? <Loading /> : data && (
        <>
          <section className="section container" id="home-categories">
            <div className="section-heading"><div><p className="eyebrow">Shop by category</p><h2>Find what you need</h2></div><Link to="/sitemap" className="text-link">All categories <ArrowRight size={14} /></Link></div>
            <div className="category-tiles">
              {data.categories.map((c, i) => (
                <Link key={c.id} to={`/category/${c.slug}`} className={`category-tile t${i % 6}`} id={`home-category-${c.slug}`}>
                  <b>{c.name}</b><small>{c.description}</small><span>Shop now <ArrowRight size={13} /></span>
                </Link>
              ))}
            </div>
          </section>
          {data.text && <section className="container home-text" id="home-welcome"><h2>{data.text.title}</h2><div dangerouslySetInnerHTML={{ __html: data.text.body }} /></section>}
          <section className="section container" id="home-featured">
            <div className="section-heading"><div><p className="eyebrow">Hand-picked</p><h2>Featured products</h2></div></div>
            <ProductGrid products={data.featured} idPrefix="home-featured" />
          </section>
          {data.bestsellers.length > 0 && (
            <section className="section container soft" id="home-bestsellers">
              <div className="section-heading"><div><p className="eyebrow">Most loved</p><h2>Bestsellers</h2></div></div>
              <ProductGrid products={data.bestsellers} idPrefix="home-bestseller" />
            </section>
          )}
          <section className="promo-banner container" id="home-gift-banner">
            <div><p className="eyebrow">Gift cards</p><h2>Not sure what to give?</h2><p>Send an e-mail gift card in seconds, or try code <b>GIFT-DEMO-25</b> at checkout.</p><Link to="/category/gift-cards" className="dark-button" id="home-gift-cta">Buy a gift card</Link></div>
            <Gift strokeWidth={0.8} aria-hidden="true" />
          </section>
          <section className="section container home-bottom">
            {boot.settings.news.enabled && data.news.length > 0 && (
              <div id="home-news">
                <div className="section-heading"><div><p className="eyebrow">Store news</p><h2>Latest news</h2></div><Link to="/news" className="text-link" id="home-news-all">View news archive <ArrowRight size={14} /></Link></div>
                <div className="news-list">
                  {data.news.map((n) => (
                    <Link key={n.id} to={`/news/${n.slug}`} className="news-card" id={`home-news-${n.id}`}><small>{formatDate(n.created_at)}</small><b>{n.title}</b><p>{n.short}</p></Link>
                  ))}
                </div>
              </div>
            )}
            {data.polls.length > 0 && <div id="home-polls"><div className="section-heading"><div><p className="eyebrow">Community poll</p><h2>Your opinion</h2></div></div>{data.polls.map((p) => <PollBlock key={p.id} poll={p} idPrefix="home-poll" />)}</div>}
          </section>
        </>
      )}
    </>
  )
}

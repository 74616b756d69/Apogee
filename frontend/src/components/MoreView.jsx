import { useState, useEffect } from 'react'
import PreviousLaunchesView from './PreviousLaunchesView'
import StatsView from './StatsView'
import AgencyView from './AgencyView'

const SLIDE_INTERVAL = 6000
const FADE_MS = 900

const FALLBACK_SLIDES = [
  { imageUrl: 'https://images-assets.nasa.gov/image/KSC-08pd0725/KSC-08pd0725~orig.jpg',                               name: 'Space Shuttle Atlantis' },
  { imageUrl: 'https://images-assets.nasa.gov/image/KSC01padig214/KSC01padig214~orig.JPG',                              name: 'Kennedy Space Center' },
  { imageUrl: 'https://images-assets.nasa.gov/image/KSC-20220519-PH-KED02_0003/KSC-20220519-PH-KED02_0003~orig.jpg',    name: 'Crew Dragon Launch' },
  { imageUrl: 'https://images-assets.nasa.gov/image/KSC-07pp1461/KSC-07pp1461~orig.jpg',                                name: 'Space Shuttle on Pad' },
  { imageUrl: 'https://images-assets.nasa.gov/image/05pd1295/05pd1295~orig.jpg',                                        name: 'Rocket Rollout' },
]

const SECTIONS = [
  { id: 'previous', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    title: '発射履歴', sub: '過去の打ち上げ結果タイムライン' },
  { id: 'stats', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>,
    title: '打ち上げ統計', sub: '成功率・ロケット別ランキングなど' },
  { id: 'agencies', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4"/></svg>,
    title: '宇宙機関', sub: '打ち上げを手がける機関・企業一覧' },
]

const VIEWS = {
  previous: PreviousView,
  stats:    StatsView,
  agencies: AgencyView,
}

function useSlideshow() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (FALLBACK_SLIDES.length < 2) return
    const id = setInterval(() => {
      setActive(prev => (prev + 1) % FALLBACK_SLIDES.length)
    }, SLIDE_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return active
}

function PreviousView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/launches/previous')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => setData(json))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-content">
      <PreviousLaunchesView launches={data} loading={loading} error={error} />
    </div>
  )
}

function MoreView() {
  const [activeSection, setActiveSection] = useState(null)
  const activeSlide = useSlideshow()

  const View = VIEWS[activeSection]
  if (View) {
    return (
      <div className="more-view">
        <button className="more-back" onClick={() => setActiveSection(null)}>← 戻る</button>
        <View />
      </div>
    )
  }

  return (
    <div className="more-view relative min-h-full flex flex-col">
      <div className="more-bg">
        {FALLBACK_SLIDES.map((slide, i) => (
          <img
            key={slide.name}
            src={slide.imageUrl}
            alt=""
            className={`more-bg-img ${i === activeSlide ? 'more-bg-img--visible' : ''}`}
          />
        ))}
        <div className="more-bg-scrim" />
      </div>

      <div className="more-content relative z-10 flex min-h-full flex-col px-4 pb-6 pt-5 sm:px-6">
        <div className="section-header">
          <p className="section-eyebrow">MORE</p>
          <h2 className="section-title">その他</h2>
          <p className="section-sub">発射履歴・統計データ・宇宙機関情報</p>
        </div>

        <div className="more-menu mt-6 grid w-full max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-2">
          {SECTIONS.map(s => (
            <button key={s.id} className="more-card" onClick={() => setActiveSection(s.id)}>
              <span className="more-card-icon">{s.icon}</span>
              <div className="more-card-text">
                <span className="more-card-title">{s.title}</span>
                <span className="more-card-sub">{s.sub}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MoreView

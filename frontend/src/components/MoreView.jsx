import { useState, useEffect } from 'react'
import PreviousLaunchesView from './PreviousLaunchesView'
import StatsView from './StatsView'
import AgencyView from './AgencyView'

const SLIDE_INTERVAL = 6000

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
    title: '研究機関', sub: '打ち上げを手がける機関・企業一覧' },
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
    <div className="mx-auto max-w-[1200px] px-4 py-6 pb-[calc(56px+env(safe-area-inset-bottom))]">
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
      <div className="relative flex min-h-full flex-col">
        <button
          className="ml-4 mt-3 inline-flex items-center gap-0.5 self-start rounded-lg border border-sky-400/15 bg-transparent px-3 py-1.5 font-[inherit] text-[0.72rem] font-semibold text-[rgba(var(--accent),0.9)] transition-colors hover:bg-[rgba(var(--accent),0.08)]"
          onClick={() => setActiveSection(null)}
        >
          ← 戻る
        </button>
        <View />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="absolute inset-0 z-0 overflow-hidden">
        {FALLBACK_SLIDES.map((slide, i) => (
          <img
            key={slide.name}
            src={slide.imageUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out will-change-[opacity] ${i === activeSlide ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(8,13,22,0.18)] via-[rgba(8,13,22,0.38)] to-[rgba(8,13,22,0.62)]" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col px-4 py-5">
        <div className="pb-6 pt-8">
          <p className="mb-2 text-[0.62rem] font-extrabold tracking-[0.18em] text-[rgba(var(--accent),0.65)]">MORE</p>
          <h2 className="mb-1.5 text-2xl font-extrabold text-body-text">その他</h2>
          <p className="text-[0.8rem] text-meta">発射履歴・統計データ・研究機関情報</p>
        </div>

        <div className="mt-6 grid w-full max-w-[720px] grid-cols-2 gap-3 min-[900px]:max-w-[900px] min-[900px]:grid-cols-3 min-[900px]:gap-3.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className="flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[14px] border border-sky-400/15 bg-[rgba(13,24,41,0.65)] p-3.5 text-center font-[inherit] backdrop-blur-xl transition-[border-color,background] duration-200 hover:border-sky-400/35 hover:bg-[rgba(13,24,41,0.8)] active:scale-[0.96] min-[900px]:min-h-[140px] min-[900px]:px-3 min-[900px]:py-4"
              onClick={() => setActiveSection(s.id)}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(var(--accent),0.12)] p-2 text-[rgba(var(--accent),0.9)] min-[900px]:h-9 min-[900px]:w-9 [&>svg]:h-full [&>svg]:w-full">
                {s.icon}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.8rem] font-bold text-body-text">{s.title}</span>
                <span className="text-[0.64rem] leading-snug text-meta">{s.sub}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MoreView

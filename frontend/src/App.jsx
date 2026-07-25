import { useState, useEffect, useRef } from 'react'
import LaunchCard from './components/LaunchCard'
import TodayView from './components/TodayView'

const PAGES = [
  { id: 'today',    endpoint: null },
  { id: 'upcoming', endpoint: '/api/launches/upcoming' },
  { id: 'previous', endpoint: '/api/launches/previous' },
]

function App() {
  const [pageData,    setPageData]    = useState({})
  const [pageLoading, setPageLoading] = useState({})
  const [pageError,   setPageError]   = useState({})
  const [currentPage, setCurrentPage] = useState(0)
  const [accentColor, setAccentColor] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    PAGES.forEach((page, i) => {
      if (!page.endpoint) return
      setPageLoading(prev => ({ ...prev, [i]: true }))
      fetch(page.endpoint)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(json => setPageData(prev => ({ ...prev, [i]: json })))
        .catch(err => setPageError(prev => ({ ...prev, [i]: err.message })))
        .finally(() => setPageLoading(prev => ({ ...prev, [i]: false })))
    })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const page = Math.round(el.scrollLeft / el.clientWidth)
      setCurrentPage(page)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const goToPage = i => {
    scrollRef.current?.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: 'smooth' })
  }

  const accentStyle = accentColor
    ? { '--accent': `${accentColor.r}, ${accentColor.g}, ${accentColor.b}` }
    : {}

  return (
    <div className="app" style={accentStyle}>
      <div className="pages" ref={scrollRef}>
        {/* 今日 */}
        <div className="page">
          <TodayView onColorDetected={setAccentColor} />
        </div>

        {/* 打ち上げ予定 */}
        <div className="page">
          <div className="page-content">
            {pageLoading[1] && <div className="state-msg">⏳ 読み込み中...</div>}
            {pageError[1]   && <div className="state-msg error">データの取得に失敗しました: {pageError[1]}</div>}
            {!pageLoading[1] && !pageError[1] && !pageData[1]?.length && (
              <div className="state-msg">データがありません</div>
            )}
            {pageData[1]?.length > 0 && !pageLoading[1] && !pageError[1] && (
              <div className="grid">
                {pageData[1].map(l => <LaunchCard key={l.id} launch={l} />)}
              </div>
            )}
          </div>
        </div>

        {/* 過去の打ち上げ */}
        <div className="page">
          <div className="page-content">
            {pageLoading[2] && <div className="state-msg">⏳ 読み込み中...</div>}
            {pageError[2]   && <div className="state-msg error">データの取得に失敗しました: {pageError[2]}</div>}
            {!pageLoading[2] && !pageError[2] && !pageData[2]?.length && (
              <div className="state-msg">データがありません</div>
            )}
            {pageData[2]?.length > 0 && !pageLoading[2] && !pageError[2] && (
              <div className="grid">
                {pageData[2].map(l => <LaunchCard key={l.id} launch={l} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-dots">
        {PAGES.map((_, i) => (
          <button
            key={i}
            className={`page-dot ${currentPage === i ? 'active' : ''}`}
            onClick={() => goToPage(i)}
            aria-label={`ページ ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

export default App

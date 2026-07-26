import { useState, useEffect, useRef } from 'react'
import TodayView from './components/TodayView'
import CalendarView from './components/CalendarView'
import PreviousLaunchesView from './components/PreviousLaunchesView'
import AgencyView from './components/AgencyView'
import StatsView from './components/StatsView'

const PAGES = [
  { id: 'today',    endpoint: null },
  { id: 'calendar', endpoint: null },
  { id: 'previous', endpoint: '/api/launches/previous' },
  { id: 'agencies', endpoint: null },
  { id: 'stats',    endpoint: null },
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

        {/* カレンダー */}
        <div className="page">
          <CalendarView isActive={currentPage === 1} />
        </div>

        {/* 過去の打ち上げ */}
        <div className="page">
          <div className="page-content">
            <PreviousLaunchesView
              launches={pageData[2]}
              loading={pageLoading[2]}
              error={pageError[2]}
            />
          </div>
        </div>

        {/* 宇宙機関 */}
        <div className="page">
          <AgencyView />
        </div>

        {/* 統計 */}
        <div className="page">
          <StatsView />
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

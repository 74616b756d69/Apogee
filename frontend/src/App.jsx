import { useState, useEffect, useRef } from 'react'
import TodayView from './components/TodayView'
import CalendarView from './components/CalendarView'
import PreviousLaunchesView from './components/PreviousLaunchesView'
import AgencyView from './components/AgencyView'
import StatsView from './components/StatsView'

const POMO_DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }

const PAGES = [
  { id: 'today',    endpoint: null },
  { id: 'calendar', endpoint: null },
  { id: 'previous', endpoint: '/api/launches/previous' },
  { id: 'agencies', endpoint: null },
  { id: 'stats',    endpoint: null },
]

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [pageData,    setPageData]    = useState({})
  const [pageLoading, setPageLoading] = useState({})
  const [pageError,   setPageError]   = useState({})
  const [currentPage, setCurrentPage] = useState(0)
  const [accentColor, setAccentColor] = useState(null)
  const [pomo, setPomo] = useState({ mode: 'work', secs: 25 * 60, running: false, count: 0 })
  const scrollRef = useRef(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json()
        throw new Error('not authenticated')
      })
      .then(data => {
        if (data.authenticated) {
          setAuthenticated(true)
        } else {
          window.location.href = '/oauth2/authorization/google'
        }
      })
      .catch(() => {
        window.location.href = '/oauth2/authorization/google'
      })
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!pomo.running) return
    const id = setInterval(() => {
      setPomo(prev => {
        if (prev.secs > 0) return { ...prev, secs: prev.secs - 1 }
        let nextMode, nextCount
        if (prev.mode === 'work') {
          nextCount = prev.count + 1
          nextMode  = nextCount % 4 === 0 ? 'long' : 'short'
        } else {
          nextMode  = 'work'
          nextCount = prev.count
        }
        return { mode: nextMode, secs: POMO_DURATIONS[nextMode], running: false, count: nextCount }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [pomo.running])

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

  if (!authChecked || !authenticated) return null

  return (
    <div className="app" style={accentStyle}>
      <div className="pages" ref={scrollRef}>
        {/* 今日 */}
        <div className="page">
          <TodayView onColorDetected={setAccentColor} pomo={pomo} setPomo={setPomo} />
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

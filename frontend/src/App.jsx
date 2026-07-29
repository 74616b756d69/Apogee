import { useState, useEffect, useRef } from 'react'
import TodayView from './components/TodayView'
import CalendarView from './components/CalendarView'
import MoreView from './components/MoreView'

const POMO_DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }

const PAGES = ['today', 'calendar', 'more']

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
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
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const page = Math.round(el.scrollLeft / el.clientWidth)
      setCurrentPage(page)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [authenticated])

  const goToPage = i => {
    scrollRef.current?.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: 'smooth' })
  }

  const accentStyle = accentColor
    ? { '--accent': `${accentColor.r}, ${accentColor.g}, ${accentColor.b}` }
    : {}

  if (!authChecked || !authenticated) return null

  return (
    <div className="relative h-dvh overflow-hidden bg-body text-body-text" style={accentStyle}>
      <div
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        ref={scrollRef}
      >
        <div className="h-full w-screen min-w-screen shrink-0 snap-start overflow-y-auto">
          <TodayView onColorDetected={setAccentColor} pomo={pomo} setPomo={setPomo} />
        </div>

        <div className="h-full w-screen min-w-screen shrink-0 snap-start overflow-y-auto">
          <CalendarView isActive={currentPage === 1} />
        </div>

        <div className="h-full w-screen min-w-screen shrink-0 snap-start overflow-y-auto">
          <MoreView />
        </div>
      </div>

      <div className="fixed bottom-[calc(18px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 gap-2">
        {PAGES.map((_, i) => (
          <button
            key={i}
            className={`cursor-pointer border-0 p-0 transition-all duration-300 ease-in-out ${
              currentPage === i
                ? 'h-[7px] w-[22px] rounded bg-[rgba(var(--accent),1)] shadow-[0_0_12px_rgba(var(--accent),0.55)]'
                : 'h-[7px] w-[7px] rounded-full bg-white/28'
            }`}
            onClick={() => goToPage(i)}
            aria-label={`ページ ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

export default App

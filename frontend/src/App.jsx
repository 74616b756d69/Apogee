import { useState, useEffect, useRef } from 'react'
import TodayView from './components/TodayView'
import CalendarView from './components/CalendarView'
import MoreView from './components/MoreView'
import FocusView from './components/FocusView'

const POMO_DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }

const PAGES = ['today', 'calendar', 'more']

const FOCUS_STATS_KEY = 'apogee.focus.stats'

function jstDayKey() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

/** 集中時間の記録は日付が変わったらリセットする。 */
function loadFocusStats() {
  const today = jstDayKey()
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_STATS_KEY) ?? 'null')
    if (saved?.date === today) return saved
  } catch { /* 壊れていたら初期値から始める */ }
  return { date: today, sessions: 0, focusSecs: 0 }
}

function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [accentColor, setAccentColor] = useState(null)
  const [pomo, setPomo] = useState({ mode: 'work', secs: 25 * 60, running: false, count: 0 })
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusStats, setFocusStats] = useState(loadFocusStats)
  const [calEvents, setCalEvents] = useState([])
  const scrollRef = useRef(null)
  const prevPomoCount = useRef(0)

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

  // 作業セッションが 1 つ終わるたびに記録を足す。日付を跨いだらリセットする。
  useEffect(() => {
    const done = pomo.count - prevPomoCount.current
    prevPomoCount.current = pomo.count
    if (done <= 0) return
    setFocusStats(prev => {
      const today = jstDayKey()
      const base = prev.date === today ? prev : { date: today, sessions: 0, focusSecs: 0 }
      return {
        date: today,
        sessions: base.sessions + done,
        focusSecs: base.focusSecs + done * POMO_DURATIONS.work,
      }
    })
  }, [pomo.count])

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(focusStats))
    } catch { /* 保存できなくてもセッション中の表示は維持される */ }
  }, [focusStats])

  // フォーカスモードの「次の予定」用。開くたびに最新を取り直す。
  useEffect(() => {
    if (!focusOpen) return
    let cancelled = false
    fetch('/api/calendar/today', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => { if (!cancelled) setCalEvents(Array.isArray(json) ? json : []) })
      .catch(() => { if (!cancelled) setCalEvents([]) })
    return () => { cancelled = true }
  }, [focusOpen])

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
    ? (() => {
        const lum = accentColor.r * 0.299 + accentColor.g * 0.587 + accentColor.b * 0.114
        return {
          '--accent': `${accentColor.r}, ${accentColor.g}, ${accentColor.b}`,
          '--accent-text': lum > 150 ? '4, 16, 31' : '255, 255, 255',
        }
      })()
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

      <button
        className="fixed bottom-[calc(14px+env(safe-area-inset-bottom))] right-5 z-50 cursor-pointer rounded-full border border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.14)] px-4 py-2 text-[0.72rem] font-bold tracking-[0.08em] text-[rgba(var(--accent),1)] backdrop-blur transition-[background,border-color] hover:bg-[rgba(var(--accent),0.24)]"
        onClick={() => setFocusOpen(true)}
      >
        集中
      </button>

      {focusOpen && (
        <FocusView
          pomo={pomo}
          setPomo={setPomo}
          stats={focusStats}
          calEvents={calEvents}
          onClose={() => setFocusOpen(false)}
        />
      )}

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

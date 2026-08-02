import { useEffect, useMemo, useRef, useState } from 'react'
import LaunchLoader from './LaunchLoader'
import CalendarGrid from './CalendarGrid'
import CalendarWeekGrid from './CalendarWeekGrid'
import EventFormSheet from './EventFormSheet'

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function csrfHeaders() {
  const token = csrfToken()
  return token ? { 'X-XSRF-TOKEN': token } : {}
}

function toJstDateKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toDateKeyFromDate(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfWeekSunday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

function formatTime(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch {
    return dateStr
  }
}

function formatTimeShort(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    })
  } catch {
    return ''
  }
}

function formatLaunchDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch {
    return dateStr
  }
}

function formatUpdatedAt(date) {
  if (!date) return '未取得'
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Tokyo',
    hour12: false,
  }) + ' JST'
}

function formatAgendaDate(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  return `${m}月${d}日（${weekday}）`
}

function calcCountdown(net) {
  if (!net) return null
  const diff = new Date(net).getTime() - Date.now()
  if (diff <= 0) return { launched: true }
  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds, launched: false }
}

function pad2(n) { return String(n).padStart(2, '0') }

const LAUNCH_COLOR = '#e06a3a'
const LAUNCH_REFRESH_MS = 5 * 60 * 1000

function CalendarView({ isActive }) {
  const [launches, setLaunches]       = useState([])
  const [viewDate, setViewDate]       = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(null)
  const [countdown, setCountdown]     = useState(null)
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const [launchOpen, setLaunchOpen]   = useState(false)

  const [calEvents, setCalEvents]         = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const [viewMode, setViewMode] = useState('month')

  const [monthCalEvents, setMonthCalEvents] = useState({})
  const [monthCalLoading, setMonthCalLoading] = useState(true)

  const [weekCalEvents, setWeekCalEvents] = useState({})
  const [weekCalLoading, setWeekCalLoading] = useState(true)
  const [showLaunches, setShowLaunches] = useState(() => {
    const saved = localStorage.getItem('cal-show-launches')
    return saved === null ? true : saved === 'true'
  })

  const [showSheet, setShowSheet]     = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [form, setForm]               = useState({ title: '', date: '', startTime: '', endTime: '', allDay: true, calendarName: '' })
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [deleting, setDeleting]       = useState(false)
  const [collections, setCollections] = useState([])
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)
  const [launchUpdatedAt, setLaunchUpdatedAt] = useState(null)

  const activeKeyRef   = useRef(null)
  const eventsCacheRef = useRef({})

  const loadUpcomingLaunches = () => {
    fetch('/api/launches/upcoming', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        setLaunches(Array.isArray(json) ? json : [])
        setLaunchUpdatedAt(new Date())
      })
      .catch(() => {})
  }

  useEffect(() => {
    localStorage.setItem('cal-show-launches', String(showLaunches))
  }, [showLaunches])

  useEffect(() => {
    loadUpcomingLaunches()

    const id = setInterval(() => {
      loadUpcomingLaunches()
    }, LAUNCH_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadUpcomingLaunches()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const featuredLaunch = launches[featuredIdx] ?? launches[0] ?? null

  useEffect(() => {
    if (!featuredLaunch?.net) return
    const tick = () => setCountdown(calcCountdown(featuredLaunch.net))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [featuredLaunch?.net])

  const launchesByDate = useMemo(() => {
    const map = {}
    for (const launch of launches) {
      const key = toJstDateKey(launch.net)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(launch)
    }
    return map
  }, [launches])

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const monthCacheRef = useRef({})

  useEffect(() => {
    const key = `${year}-${month}`
    const cached = monthCacheRef.current[key]
    if (cached) {
      setMonthCalEvents(cached)
      setMonthCalLoading(false)
    } else {
      setMonthCalEvents({})
      setMonthCalLoading(true)
    }
    fetch(`/api/calendar/month?year=${year}&month=${month + 1}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        monthCacheRef.current[key] = json
        setMonthCalEvents(json)
      })
      .catch(() => {})
      .finally(() => setMonthCalLoading(false))

    const prefetch = (y, m) => {
      const k = `${y}-${m}`
      if (monthCacheRef.current[k]) return
      fetch(`/api/calendar/month?year=${y}&month=${m + 1}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(json => { monthCacheRef.current[k] = json })
        .catch(() => {})
    }
    const prev = new Date(year, month - 1, 1)
    const next = new Date(year, month + 1, 1)
    prefetch(prev.getFullYear(), prev.getMonth())
    prefetch(next.getFullYear(), next.getMonth())
  }, [year, month])

  const weekStartDate = useMemo(() => startOfWeekSunday(viewDate), [viewDate])
  const weekStartKey  = useMemo(() => toDateKeyFromDate(weekStartDate), [weekStartDate])
  const weekCacheRef  = useRef({})

  useEffect(() => {
    if (viewMode !== 'week') return
    const cached = weekCacheRef.current[weekStartKey]
    if (cached) {
      setWeekCalEvents(cached)
      setWeekCalLoading(false)
    } else {
      setWeekCalEvents({})
      setWeekCalLoading(true)
    }
    fetch(`/api/calendar/week?start=${weekStartKey}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        weekCacheRef.current[weekStartKey] = json
        setWeekCalEvents(json)
      })
      .catch(() => {})
      .finally(() => setWeekCalLoading(false))
  }, [viewMode, weekStartKey])

  const visibleCalEvents = viewMode === 'week' ? weekCalEvents : monthCalEvents
  const visibleCalLoading = viewMode === 'week' ? weekCalLoading : monthCalLoading

  const todayKey  = useMemo(() => toJstDateKey(new Date().toISOString()), [])
  const activeKey = selectedKey ?? todayKey
  const selectedLaunches = launchesByDate[activeKey] ?? []

  useEffect(() => {
    activeKeyRef.current = activeKey
    if (!activeKey) return

    const fromVisible = visibleCalEvents[activeKey]
    if (fromVisible) {
      setCalEvents(fromVisible)
      setLoadingEvents(false)
      return
    }

    const cached = eventsCacheRef.current[activeKey]
    if (cached) {
      setCalEvents(cached)
      setLoadingEvents(false)
    } else {
      setCalEvents([])
      setLoadingEvents(!visibleCalLoading)
    }
  }, [activeKey, visibleCalEvents, visibleCalLoading])

  const firstWeekday    = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, faint: true, key: null })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, faint: false, key: dateKey(year, month, day) })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - (firstWeekday + daysInMonth) + 1, faint: true, key: null })
  }

  const dayCombinedEvents = useMemo(() => {
    const map = {}
    for (const [key, events] of Object.entries(visibleCalEvents)) {
      map[key] = [...(map[key] || []), ...events.map(e => ({ ...e, _type: 'cal' }))]
    }
    if (showLaunches) {
      for (const [key, launches] of Object.entries(launchesByDate)) {
        map[key] = [
          ...(map[key] || []),
          ...launches.map(l => ({
            uid: l.id,
            title: l.name,
            allDay: false,
            startTime: formatTimeShort(l.net),
            calendarColor: LAUNCH_COLOR,
            calendarName: 'Launch',
            _type: 'launch',
          })),
        ]
      }
    }
    return map
  }, [visibleCalEvents, launchesByDate, showLaunches])

  const weekCells = useMemo(() => {
    const result = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate)
      d.setDate(d.getDate() + i)
      result.push({ day: d.getDate(), faint: false, key: toDateKeyFromDate(d) })
    }
    return result
  }, [weekStartDate])

  const changeMonth = delta => setViewDate(new Date(year, month + delta, 1))
  const changeWeek = delta => setViewDate(d => {
    const next = new Date(d)
    next.setDate(next.getDate() + delta * 7)
    return next
  })

  const jumpToToday = () => {
    setViewDate(new Date())
    setSelectedKey(todayKey)
  }

  const jumpToLaunch = () => {
    if (!featuredLaunch?.net) return
    const key = toJstDateKey(featuredLaunch.net)
    if (!key) return
    const [y, m, d] = key.split('-').map(Number)
    setViewDate(new Date(y, m - 1, d))
    setSelectedKey(key)
  }

  useEffect(() => {
    if (collectionsLoaded) return
    fetch('/api/calendar/collections')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => { setCollections(json); setCollectionsLoaded(true) })
      .catch(() => setCollectionsLoaded(true))
  }, [collectionsLoaded])

  const openSheet = (event = null) => {
    if (event) {
      setEditingEvent(event)
      setForm({
        title: event.title || '',
        date: event.date || activeKey || todayKey,
        startTime: event.startTime || '',
        endTime: event.endTime || '',
        allDay: event.allDay ?? true,
        calendarName: event.calendarName || collections[0]?.name || '',
      })
    } else {
      setEditingEvent(null)
      setForm({ title: '', date: activeKey || todayKey, startTime: '', endTime: '', allDay: true, calendarName: collections[0]?.name || '' })
    }
    setSubmitError(null)
    setShowSheet(true)
  }

  const closeSheet = () => {
    setShowSheet(false)
    setEditingEvent(null)
  }

  const refreshCalEvents = () => {
    if (!activeKey) return
    fetch(`/api/calendar/date?date=${activeKey}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        eventsCacheRef.current[activeKey] = json
        if (activeKeyRef.current === activeKey) setCalEvents(json)
      })
      .catch(() => {})
  }

  const refreshMonth = () => {
    const key = `${year}-${month}`
    delete monthCacheRef.current[key]
    fetch(`/api/calendar/month?year=${year}&month=${month + 1}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        monthCacheRef.current[key] = json
        setMonthCalEvents(json)
      })
      .catch(() => {})

    delete weekCacheRef.current[weekStartKey]
    fetch(`/api/calendar/week?start=${weekStartKey}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        weekCacheRef.current[weekStartKey] = json
        setWeekCalEvents(json)
      })
      .catch(() => {})
  }

  const submitEvent = async () => {
    if (!form.title.trim() || !form.date) return
    setSubmitting(true)
    setSubmitError(null)
    const targetDate = form.date
    const selectedCol = collections.find(c => c.name === form.calendarName)

    try {
      if (editingEvent) {
        const res = await fetch(`/api/calendar/event/${encodeURIComponent(editingEvent.rawUid)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({
            title:        form.title.trim(),
            date:         targetDate,
            startTime:    form.allDay ? null : (form.startTime || null),
            endTime:      form.allDay ? null : (form.endTime || null),
            calendarName: form.calendarName || null,
          }),
        })
        if (!res.ok) throw new Error()
      } else {
        const optimisticEvent = {
          uid:           `optimistic-${Date.now()}`,
          title:         form.title.trim(),
          startTime:     form.allDay ? null : (form.startTime || null),
          allDay:        form.allDay,
          calendarName:  form.calendarName || null,
          calendarColor: selectedCol?.color || null,
          date:          targetDate,
        }
        const res = await fetch('/api/calendar/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({
            title:        optimisticEvent.title,
            date:         targetDate,
            startTime:    optimisticEvent.startTime,
            endTime:      form.allDay ? null : (form.endTime || null),
            calendarName: form.calendarName || null,
          }),
        })
        if (!res.ok) throw new Error()
        if (targetDate === activeKey) {
          setCalEvents(prev => {
            const next = [...prev, optimisticEvent]
            eventsCacheRef.current[activeKey] = next
            return next
          })
        }
      }
      closeSheet()
      refreshCalEvents()
      refreshMonth()
    } catch {
      setSubmitError(editingEvent ? '更新に失敗しました' : '追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!editingEvent?.rawUid) return
    setDeleting(true)
    setSubmitError(null)
    try {
      const params = editingEvent.calendarName
        ? `?calendarName=${encodeURIComponent(editingEvent.calendarName)}`
        : ''
      const res = await fetch(
        `/api/calendar/event/${encodeURIComponent(editingEvent.rawUid)}${params}`,
        { method: 'DELETE', headers: csrfHeaders() },
      )
      if (!res.ok) throw new Error()
      setCalEvents(prev => prev.filter(e => e.rawUid !== editingEvent.rawUid))
      closeSheet()
      refreshCalEvents()
      refreshMonth()
    } catch {
      setSubmitError('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const totalEvents = calEvents.length + selectedLaunches.length

  return (
    <div className="min-h-full flex flex-col bg-[#080d16] md:flex-row md:h-dvh md:overflow-hidden">

      {/* 左パネル: アジェンダ（上）+ 打ち上げ情報（下） */}
      <div className="order-2 flex flex-col md:order-1 md:w-[340px] md:shrink-0 md:overflow-hidden md:border-r md:border-[rgba(100,160,255,0.08)] md:bg-[#04080f]">

        {/* アジェンダ */}
        <div className="px-5 pt-5 pb-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:bg-[rgba(4,8,16,0.97)] md:px-5 md:py-3.5">
          <div className="flex items-baseline justify-between mb-3.5 md:mb-2">
            <p className="text-[0.92rem] font-bold text-body-text">{formatAgendaDate(activeKey)}</p>
            {totalEvents > 0 && (
              <span className="text-[0.72rem] font-semibold text-[rgba(var(--accent),0.8)]">{totalEvents}件</span>
            )}
          </div>

          {calEvents.map(e => (
            <div
              className="relative pl-3.5 flex gap-3 items-center py-3 border-t border-[rgba(100,160,255,0.12)] rounded-[6px] transition-colors cursor-pointer hover:bg-white/[0.04]"
              key={e.uid}
              onClick={() => e.rawUid && openSheet(e)}
              role={e.rawUid ? 'button' : undefined}
              tabIndex={e.rawUid ? 0 : undefined}
            >
              <span
                className="absolute left-0 top-4 bottom-4 w-[3px] rounded-sm"
                style={{ background: e.calendarColor || 'rgba(var(--accent), 0.85)' }}
              />
              <div className="w-[38px] h-[38px] rounded-[9px] shrink-0 flex items-center justify-center bg-[rgba(var(--accent),0.12)] text-[10px]">
                <span className="text-[rgba(var(--accent),0.9)] leading-none">●</span>
              </div>
              <div className="flex-1 min-w-0">
                <b className="block text-[0.85rem] font-semibold text-body-text mb-0.5">{e.title}</b>
                <span className="block text-[0.75rem] text-meta">{e.allDay ? '終日' : e.startTime}</span>
                {e.calendarName && <span className="text-[0.62rem] text-white/35 ml-0.5">{e.calendarName}</span>}
              </div>
            </div>
          ))}

          {selectedLaunches.map(launch => (
            <div className="relative pl-3.5 flex gap-3 items-center py-3 border-t border-[rgba(100,160,255,0.12)]" key={launch.id}>
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-sm bg-[#e8c060]" />
              <div className="w-[38px] h-[38px] rounded-[9px] shrink-0 flex items-center justify-center p-0 overflow-hidden bg-[#0e1a2e]">
                {launch.imageUrl
                  ? <img src={launch.imageUrl} alt="" className="w-full h-full object-cover block" onError={e => { e.target.style.display = 'none' }} />
                  : <span className="text-[12px] text-[rgba(var(--accent),0.7)]">&#9650;</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <b className="block text-[0.85rem] font-semibold text-body-text mb-0.5">{launch.name}</b>
                <span className="block text-[0.75rem] text-meta">{[formatTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
              </div>
              {launch.statusName && (
                <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-[#7ab8ff]">
                  {launch.statusName}
                </span>
              )}
            </div>
          ))}

          {loadingEvents && calEvents.length === 0 && (
            <LaunchLoader />
          )}

          {!loadingEvents && totalEvents === 0 && (
            <div className="py-14 text-center text-base text-muted">この日の予定はありません</div>
          )}

          <div className="h-[88px]" />
        </div>

        {/* 打ち上げアコーディオン (PC のみ表示) */}
        {featuredLaunch && (
          <div className="hidden md:flex md:flex-col md:shrink-0 md:border-t md:border-white/[0.08] md:max-h-[50vh]">
            <button
              className="flex items-center gap-2 w-full px-4 py-[10px] bg-transparent border-none text-[#c8daea] text-[0.78rem] font-[inherit] cursor-pointer text-left transition-colors hover:bg-white/[0.04]"
              onClick={() => setLaunchOpen(o => !o)}
            >
              <span className="text-[0.9rem]">&#9650;</span>
              <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{featuredLaunch.name}</span>
              <span className="text-[0.7rem] text-white/40">{launchOpen ? '▾' : '▸'}</span>
            </button>

            {launchOpen && (
              <div className="overflow-y-auto min-h-0">
                <div className="relative h-[280px] overflow-hidden">
                  {featuredLaunch.imageUrl && (
                    <img src={featuredLaunch.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, rgba(4,8,16,0.05) 0%, rgba(4,8,16,0.40) 38%, rgba(4,8,16,0.90) 68%, rgba(4,8,16,0.98) 100%)' }}
                  />
                  <div className="absolute inset-0 flex flex-col justify-end px-[22px] pb-5">
                    {/* カウントダウン */}
                    <div className="mb-[18px]">
                      <p className="text-[0.58rem] font-black tracking-[0.24em] text-[rgba(var(--accent),0.75)] mb-2.5">T − MINUS</p>
                      {countdown && !countdown.launched && (
                        <div className="flex items-start gap-1">
                          {[
                            { val: countdown.days,    lbl: 'DAYS'  },
                            { val: countdown.hours,   lbl: 'HOURS' },
                            { val: countdown.minutes, lbl: 'MINS'  },
                            { val: countdown.seconds, lbl: 'SECS', gold: true },
                          ].map(({ val, lbl, gold }, i) => (
                            <>
                              {i > 0 && (
                                <span key={`sep-${lbl}`} className="font-mono text-[1.6rem] font-light text-[rgba(122,184,255,0.35)] leading-none pt-1 self-start">:</span>
                              )}
                              <div key={lbl} className="flex flex-col items-center gap-[5px] min-w-[46px]">
                                <span
                                  className={`font-mono text-[2.0rem] font-extrabold tracking-[-0.03em] leading-none ${gold ? 'text-[#e8c060]' : 'text-white'}`}
                                  style={{ textShadow: gold ? '0 0 22px rgba(232,192,96,0.55), 0 2px 10px rgba(0,0,0,0.9)' : '0 0 28px rgba(122,184,255,0.5), 0 2px 10px rgba(0,0,0,0.9)' }}
                                >
                                  {pad2(val)}
                                </span>
                                <span className="text-[0.58rem] font-bold tracking-[0.1em] text-white/40">{lbl}</span>
                              </div>
                            </>
                          ))}
                        </div>
                      )}
                      {countdown?.launched && (
                        <p className="mt-[18px] text-[0.88rem] text-white/45 italic tracking-[0.04em]">LAUNCHED</p>
                      )}
                    </div>

                    {/* 打ち上げ詳細 */}
                    <div className="border-t border-white/10 pt-3.5">
                      <p className="text-[0.56rem] font-extrabold tracking-[0.20em] text-[rgba(var(--accent),0.9)] mb-[5px]">NEXT LAUNCH</p>
                      <p className="text-[0.98rem] font-bold text-white mb-[5px] leading-[1.45]">{featuredLaunch.name}</p>
                      <p className="text-[0.70rem] text-white/55 mt-[1px]">{formatLaunchDate(featuredLaunch.net)}</p>
                      {featuredLaunch.locationName && (
                        <p className="text-[0.70rem] text-white/55 mt-[1px]">{featuredLaunch.locationName}</p>
                      )}
                      {featuredLaunch.webcastUrl && (
                        <a
                          className="inline-flex items-center gap-[7px] mt-[14px] px-[14px] py-[7px] bg-[rgba(var(--accent),0.10)] border border-[rgba(var(--accent),0.30)] rounded-[6px] text-[rgba(var(--accent),0.95)] text-[0.74rem] font-bold tracking-[0.02em] no-underline transition-colors hover:bg-[rgba(var(--accent),0.22)]"
                          href={featuredLaunch.webcastUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ▶ ライブ配信を見る
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {launches.length > 1 && (
                  <div className="flex flex-col gap-0.5 px-2 py-1 pb-2.5 max-h-[140px] overflow-y-auto">
                    {launches.map((l, i) => (
                      <button
                        key={l.id}
                        className={[
                          'flex items-center gap-2 w-full px-2.5 py-1.5 border-none rounded-[6px] text-[0.72rem] font-[inherit] cursor-pointer text-left transition-colors hover:bg-white/[0.06]',
                          i === featuredIdx
                            ? 'bg-[rgba(var(--accent),0.12)] text-[rgba(200,218,234,0.95)]'
                            : 'bg-transparent text-[rgba(200,218,234,0.7)]',
                        ].join(' ')}
                        onClick={() => setFeaturedIdx(i)}
                      >
                        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{l.name}</span>
                        <span className="shrink-0 text-[0.65rem] text-white/35">{formatLaunchDate(l.net)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右パネル: 月/週グリッド */}
      <div className="order-1 md:order-2 md:flex-1 md:flex md:flex-col md:items-center md:justify-start md:px-8 md:py-5 md:overflow-hidden md:bg-[rgba(8,14,26,0.6)]">
        <div className="px-5 pt-2 md:px-0 md:pt-0 md:max-w-[800px] md:w-full">
          <p className="text-[0.64rem] font-semibold tracking-[0.06em] text-white/45">
            打ち上げデータ最終更新: {formatUpdatedAt(launchUpdatedAt)}
          </p>
        </div>
        <div className="mt-1 flex gap-1 px-5 pt-1 md:mt-0 md:px-0 md:pt-0 md:pb-2 md:max-w-[800px] md:w-full">
          {[
            { mode: 'month', label: '月' },
            { mode: 'week', label: '週' },
          ].map(({ mode, label }) => (
            <button
              key={mode}
              className={[
                'cursor-pointer rounded-full border px-3 py-1 font-[inherit] text-[0.72rem] font-bold transition-colors',
                viewMode === mode
                  ? 'border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.18)] text-[rgba(var(--accent),0.95)]'
                  : 'border-sky-400/20 bg-white/5 text-muted hover:text-blue',
              ].join(' ')}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'month' ? (
          <CalendarGrid
            year={year}
            month={month}
            cells={cells}
            dayCombinedEvents={dayCombinedEvents}
            monthCalLoading={monthCalLoading}
            todayKey={todayKey}
            activeKey={activeKey}
            selectedKey={selectedKey}
            onSelectDay={setSelectedKey}
            showLaunches={showLaunches}
            onToggleLaunches={setShowLaunches}
            featuredLaunch={featuredLaunch}
            onJumpToLaunch={jumpToLaunch}
            onJumpToToday={jumpToToday}
            onChangeMonth={changeMonth}
          />
        ) : (
          <CalendarWeekGrid
            weekStartDate={weekStartDate}
            cells={weekCells}
            dayCombinedEvents={dayCombinedEvents}
            weekCalLoading={weekCalLoading}
            todayKey={todayKey}
            activeKey={activeKey}
            selectedKey={selectedKey}
            onSelectDay={setSelectedKey}
            showLaunches={showLaunches}
            onToggleLaunches={setShowLaunches}
            featuredLaunch={featuredLaunch}
            onJumpToLaunch={jumpToLaunch}
            onJumpToToday={jumpToToday}
            onChangeWeek={changeWeek}
          />
        )}
      </div>

      {/* FAB */}
      {isActive && (
        <button
          className="fixed bottom-[calc(52px+env(safe-area-inset-bottom))] right-[22px] w-[50px] h-[50px] rounded-full bg-[rgba(var(--accent),1)] border-none text-[rgba(var(--accent-text,4,16,31),1)] text-[1.7rem] leading-none cursor-pointer z-30 flex items-center justify-center shadow-[0_4px_18px_rgba(var(--accent),0.45)] transition-[transform,box-shadow] active:scale-[0.91] active:shadow-[0_2px_8px_rgba(var(--accent),0.3)] md:bottom-[50px] md:right-auto md:left-[calc(340px-66px)]"
          onClick={() => openSheet()}
          aria-label="予定を追加"
        >
          +
        </button>
      )}

      {/* 追加/編集シート */}
      {isActive && showSheet && (
        <EventFormSheet
          editingEvent={editingEvent}
          form={form}
          setForm={setForm}
          collections={collections}
          submitting={submitting}
          deleting={deleting}
          submitError={submitError}
          onSubmit={submitEvent}
          onDelete={handleDelete}
          onClose={closeSheet}
        />
      )}
    </div>
  )
}

export default CalendarView

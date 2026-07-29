import { useEffect, useMemo, useRef, useState } from 'react'
import LaunchLoader from './LaunchLoader'
import CalendarGrid from './CalendarGrid'
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

function CalendarView({ isActive }) {
  const [launches, setLaunches]       = useState([])
  const [viewDate, setViewDate]       = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(null)
  const [countdown, setCountdown]     = useState(null)
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const [launchOpen, setLaunchOpen]   = useState(false)

  const [calEvents, setCalEvents]         = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const [monthCalEvents, setMonthCalEvents] = useState({})
  const [monthCalLoading, setMonthCalLoading] = useState(true)
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

  const activeKeyRef   = useRef(null)
  const eventsCacheRef = useRef({})

  useEffect(() => {
    localStorage.setItem('cal-show-launches', String(showLaunches))
  }, [showLaunches])

  useEffect(() => {
    fetch('/api/launches/upcoming')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => setLaunches(json))
      .catch(() => {})
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

  const todayKey  = useMemo(() => toJstDateKey(new Date().toISOString()), [])
  const activeKey = selectedKey ?? todayKey
  const selectedLaunches = launchesByDate[activeKey] ?? []

  useEffect(() => {
    activeKeyRef.current = activeKey
    if (!activeKey) return

    const fromMonth = monthCalEvents[activeKey]
    if (fromMonth) {
      setCalEvents(fromMonth)
      setLoadingEvents(false)
      return
    }

    const cached = eventsCacheRef.current[activeKey]
    if (cached) {
      setCalEvents(cached)
      setLoadingEvents(false)
    } else {
      setCalEvents([])
      setLoadingEvents(!monthCalLoading)
    }
  }, [activeKey, monthCalEvents, monthCalLoading])

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
    for (const [key, events] of Object.entries(monthCalEvents)) {
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
  }, [monthCalEvents, launchesByDate, showLaunches])

  const changeMonth = delta => setViewDate(new Date(year, month + delta, 1))

  const jumpToToday = () => {
    setViewDate(new Date())
    setSelectedKey(todayKey)
  }

  const jumpToLaunch = () => {
    if (!featuredLaunch?.net) return
    const key = toJstDateKey(featuredLaunch.net)
    if (!key) return
    const [y, m] = key.split('-').map(Number)
    setViewDate(new Date(y, m - 1, 1))
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
    <div className="calendar-view">

      {/* 左パネル: アジェンダ（上）+ 打ち上げ情報（下） */}
      <div className="cal-left">

        <div className="calendar-agenda">
          <div className="cal-agenda-header">
            <p className="cal-agenda-date">{formatAgendaDate(activeKey)}</p>
            {totalEvents > 0 && (
              <span className="cal-agenda-count">{totalEvents}件</span>
            )}
          </div>

          {calEvents.map(e => (
            <div
              className="launch-row cal-row--event cal-row--editable"
              key={e.uid}
              onClick={() => e.rawUid && openSheet(e)}
              role={e.rawUid ? 'button' : undefined}
              tabIndex={e.rawUid ? 0 : undefined}
            >
              <span
                className="cal-row-bar"
                style={{ background: e.calendarColor || 'rgba(var(--accent), 0.85)' }}
              />
              <div className="launch-thumb cal-event-thumb">
                <span className="cal-event-icon">●</span>
              </div>
              <div className="launch-info">
                <b>{e.title}</b>
                <span>{e.allDay ? '終日' : e.startTime}</span>
                {e.calendarName && <span className="cal-event-cal-name">{e.calendarName}</span>}
              </div>
            </div>
          ))}

          {selectedLaunches.map(launch => (
            <div className="launch-row cal-row--event" key={launch.id}>
              <span className="cal-row-bar cal-row-bar--launch" />
              <div className="launch-thumb launch-thumb--img">
                {launch.imageUrl
                  ? <img src={launch.imageUrl} alt="" className="launch-row-img" onError={e => { e.target.style.display = 'none' }} />
                  : <span className="launch-thumb-icon">&#9650;</span>
                }
              </div>
              <div className="launch-info">
                <b>{launch.name}</b>
                <span>{[formatTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
              </div>
              {launch.statusName && <span className="badge badge-default">{launch.statusName}</span>}
            </div>
          ))}

          {loadingEvents && calEvents.length === 0 && (
            <LaunchLoader />
          )}

          {!loadingEvents && totalEvents === 0 && (
            <div className="state-msg">この日の予定はありません</div>
          )}

          <div className="cal-agenda-spacer" />
        </div>

        {featuredLaunch && (
          <div className={`cal-launch-accordion${launchOpen ? ' open' : ''}`}>
            <button
              className="cal-launch-accordion-header"
              onClick={() => setLaunchOpen(o => !o)}
            >
              <span className="cal-launch-accordion-icon">&#9650;</span>
              <span className="cal-launch-accordion-title">{featuredLaunch.name}</span>
              <span className="cal-launch-accordion-arrow">{launchOpen ? '▾' : '▸'}</span>
            </button>

            {launchOpen && (
              <div className="cal-launch-accordion-body">
                <div className="cal-next-launch">
                  {featuredLaunch.imageUrl && (
                    <img src={featuredLaunch.imageUrl} alt="" className="cal-next-launch-img" />
                  )}
                  <div className="cal-next-launch-overlay" />
                  <div className="cal-next-launch-body">
                    <div className="cal-pc-countdown">
                      <p className="cal-countdown-label">T − MINUS</p>
                      {countdown && !countdown.launched && (
                        <div className="countdown">
                          <div className="countdown-unit">
                            <span className="countdown-num">{pad2(countdown.days)}</span>
                            <span className="countdown-lbl">DAYS</span>
                          </div>
                          <span className="countdown-sep">:</span>
                          <div className="countdown-unit">
                            <span className="countdown-num">{pad2(countdown.hours)}</span>
                            <span className="countdown-lbl">HOURS</span>
                          </div>
                          <span className="countdown-sep">:</span>
                          <div className="countdown-unit">
                            <span className="countdown-num">{pad2(countdown.minutes)}</span>
                            <span className="countdown-lbl">MINS</span>
                          </div>
                          <span className="countdown-sep">:</span>
                          <div className="countdown-unit">
                            <span className="countdown-num countdown-num--sec">{pad2(countdown.seconds)}</span>
                            <span className="countdown-lbl">SECS</span>
                          </div>
                        </div>
                      )}
                      {countdown?.launched && (
                        <p className="countdown-launched">LAUNCHED</p>
                      )}
                    </div>

                    <div className="cal-next-launch-info">
                      <p className="cal-next-launch-label">NEXT LAUNCH</p>
                      <p className="cal-next-launch-name">{featuredLaunch.name}</p>
                      <p className="cal-next-launch-meta">{formatLaunchDate(featuredLaunch.net)}</p>
                      {featuredLaunch.locationName && (
                        <p className="cal-next-launch-meta">{featuredLaunch.locationName}</p>
                      )}
                      {featuredLaunch.webcastUrl && (
                        <a className="cal-webcast-link" href={featuredLaunch.webcastUrl} target="_blank" rel="noreferrer">
                          ▶ ライブ配信を見る
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {launches.length > 1 && (
                  <div className="cal-launch-list">
                    {launches.map((l, i) => (
                      <button
                        key={l.id}
                        className={`cal-launch-item${i === featuredIdx ? ' active' : ''}`}
                        onClick={() => setFeaturedIdx(i)}
                      >
                        <span className="cal-launch-item-name">{l.name}</span>
                        <span className="cal-launch-item-date">{formatLaunchDate(l.net)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右パネル: 月グリッド */}
      <div className="cal-right">
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
      </div>

      {/* FAB */}
      {isActive && (
        <button className="cal-fab" onClick={() => openSheet()} aria-label="予定を追加">+</button>
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

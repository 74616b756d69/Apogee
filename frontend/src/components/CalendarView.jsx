import { useEffect, useMemo, useRef, useState } from 'react'
import LaunchLoader from './LaunchLoader'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

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

function CalendarView({ isActive }) {
  const [launches, setLaunches]       = useState([])
  const [viewDate, setViewDate]       = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(null)

  const [calEvents, setCalEvents]     = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventsError, setEventsError] = useState(false)

  const [showSheet, setShowSheet]     = useState(false)
  const [form, setForm]               = useState({ title: '', startTime: '', endTime: '', allDay: true })
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const titleRef       = useRef(null)
  const activeKeyRef    = useRef(null)
  const eventsCacheRef  = useRef({})

  useEffect(() => {
    fetch('/api/launches/upcoming')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => setLaunches(json))
      .catch(() => {})
  }, [])

  const nearestLaunch = launches[0] ?? null

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

  const [todayKey, setTodayKey] = useState(() => toJstDateKey(new Date().toISOString()))

  useEffect(() => {
    const id = setInterval(() => {
      setTodayKey(prev => {
        const next = toJstDateKey(new Date().toISOString())
        return next === prev ? prev : next
      })
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const activeKey = selectedKey ?? (nearestLaunch ? toJstDateKey(nearestLaunch.net) : todayKey)
  const selectedLaunches = launchesByDate[activeKey] ?? []

  useEffect(() => {
    activeKeyRef.current = activeKey
    if (!activeKey) return

    // キャッシュ済みなら即座に表示し（楽観的更新）、裏で最新データを取りに行く
    const cached = eventsCacheRef.current[activeKey]
    setEventsError(false)
    if (cached) {
      setCalEvents(cached)
      setLoadingEvents(false)
    } else {
      setCalEvents([])
      setLoadingEvents(true)
    }

    fetch(`/api/calendar/date?date=${activeKey}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => {
        eventsCacheRef.current[activeKey] = json
        if (activeKeyRef.current === activeKey) {
          setCalEvents(json)
          setLoadingEvents(false)
        }
      })
      .catch(() => {
        if (activeKeyRef.current === activeKey) {
          if (!cached) setCalEvents([])
          setLoadingEvents(false)
          setEventsError(true)
        }
      })
  }, [activeKey])

  const year            = viewDate.getFullYear()
  const month           = viewDate.getMonth()
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

  const changeMonth = delta => setViewDate(new Date(year, month + delta, 1))

  const openSheet = () => {
    setForm({ title: '', startTime: '', endTime: '', allDay: true })
    setSubmitError(null)
    setShowSheet(true)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const closeSheet = () => setShowSheet(false)

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

  const submitEvent = async () => {
    if (!form.title.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const optimisticEvent = {
      uid:       `optimistic-${Date.now()}`,
      title:     form.title.trim(),
      startTime: form.allDay ? null : (form.startTime || null),
      allDay:    form.allDay,
    }
    try {
      const res = await fetch('/api/calendar/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:     optimisticEvent.title,
          date:      activeKey,
          startTime: optimisticEvent.startTime,
          endTime:   form.allDay ? null : (form.endTime   || null),
        }),
      })
      if (!res.ok) throw new Error()
      // 実際のレスポンスを待たず、その場で予定を反映（後で refreshCalEvents が本物のデータと入れ替える）
      setCalEvents(prev => {
        const next = [...prev, optimisticEvent]
        eventsCacheRef.current[activeKey] = next
        return next
      })
      closeSheet()
      refreshCalEvents()
    } catch {
      setSubmitError('追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="calendar-view">

      {/* 月グリッド */}
      <div className="calendar-panel">
        <div className="cal-header">
          <div className="cal-month">
            <span>{year} {String(month + 1).padStart(2, '0')}</span>
            {month + 1}月
          </div>
          <div className="cal-nav">
            <button onClick={() => changeMonth(-1)} aria-label="前の月">‹</button>
            <button onClick={() => changeMonth(1)}  aria-label="次の月">›</button>
          </div>
        </div>
        <div className="weekdays">
          {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((cell, i) => {
            const hasLaunch  = cell.key && launchesByDate[cell.key]?.length > 0
            const isToday    = cell.key === todayKey
            const isSelected = cell.key === activeKey
            return (
              <button
                key={i}
                className={`cal-day ${cell.faint ? 'faint' : ''} ${isToday ? 'today' : ''} ${isSelected && !cell.faint ? 'selected' : ''}`}
                disabled={cell.faint}
                onClick={() => cell.key && setSelectedKey(cell.key)}
              >
                <span className="num">{cell.day}</span>
                {hasLaunch && <span className="launch-dot" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 直近の打ち上げカード */}
      {nearestLaunch && (
        <div className="cal-next-launch">
          {nearestLaunch.imageUrl && (
            <img src={nearestLaunch.imageUrl} alt="" className="cal-next-launch-img" />
          )}
          <div className="cal-next-launch-overlay" />
          <div className="cal-next-launch-body">
            <p className="cal-next-launch-label">NEXT LAUNCH</p>
            <p className="cal-next-launch-name">{nearestLaunch.name}</p>
            <p className="cal-next-launch-meta">{formatLaunchDate(nearestLaunch.net)}</p>
            {nearestLaunch.locationName && (
              <p className="cal-next-launch-meta">{nearestLaunch.locationName}</p>
            )}
          </div>
        </div>
      )}

      {/* アジェンダ */}
      <div className="calendar-agenda">
        <div className="section-label">{activeKey ?? ''} の予定</div>

        {/* Apple Calendar イベント */}
        {calEvents.map(e => (
          <div className="launch-row" key={e.uid}>
            <div className="launch-thumb cal-event-thumb">
              <span className="cal-event-icon">●</span>
            </div>
            <div className="launch-info">
              <b>{e.title}</b>
              <span>{e.allDay ? '終日' : e.startTime}</span>
            </div>
          </div>
        ))}

        {/* 打ち上げイベント */}
        {selectedLaunches.map(launch => (
          <div className="launch-row" key={launch.id}>
            <div className="launch-thumb launch-thumb--img">
              {launch.imageUrl
                ? <img src={launch.imageUrl} alt="" className="launch-row-img" onError={e => { e.target.style.display = 'none' }} />
                : <span>🚀</span>
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

        {!loadingEvents && eventsError && (
          <div className="state-msg error">カレンダーの取得に失敗しました</div>
        )}

        {!loadingEvents && !eventsError && calEvents.length === 0 && selectedLaunches.length === 0 && (
          <div className="state-msg">この日の予定はありません</div>
        )}

        <div className="cal-agenda-spacer" />
      </div>

      {/* FAB */}
      {isActive && (
        <button className="cal-fab" onClick={openSheet} aria-label="予定を追加">+</button>
      )}

      {/* 追加シート */}
      {isActive && showSheet && (
        <div
          className="cal-sheet-overlay"
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
        >
          <div className="cal-sheet">
            <div className="cal-sheet-handle" />
            <p className="cal-sheet-date">{activeKey}</p>
            <div className="cal-form">
              <input
                ref={titleRef}
                className="cal-input"
                placeholder="タイトル"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && submitEvent()}
              />
              <label className="cal-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                />
                終日
              </label>
              {!form.allDay && (
                <div className="cal-time-row">
                  <input
                    className="cal-input cal-input--time"
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                  <span className="cal-time-sep">〜</span>
                  <input
                    className="cal-input cal-input--time"
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              )}
              {submitError && <p className="cal-error">{submitError}</p>}
              <button
                className="cal-submit-btn"
                onClick={submitEvent}
                disabled={submitting || !form.title.trim()}
              >
                {submitting ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarView

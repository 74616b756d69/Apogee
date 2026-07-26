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

const POMO_DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }
const POMO_LABELS    = { work: 'FOCUS', short: 'BREAK', long: 'LONG BREAK' }

function CalendarView({ isActive, pomo, setPomo }) {
  const [launches, setLaunches]       = useState([])
  const [viewDate, setViewDate]       = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(null)
  const [countdown, setCountdown]     = useState(null)

  const [calEvents, setCalEvents]         = useState([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const [showSheet, setShowSheet]     = useState(false)
  const [form, setForm]               = useState({ title: '', startTime: '', endTime: '', allDay: true })
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const titleRef       = useRef(null)
  const activeKeyRef   = useRef(null)
  const eventsCacheRef = useRef({})

  useEffect(() => {
    fetch('/api/launches/upcoming')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(json => setLaunches(json))
      .catch(() => {})
  }, [])

  const nearestLaunch = launches[0] ?? null

  useEffect(() => {
    if (!nearestLaunch?.net) return
    const tick = () => setCountdown(calcCountdown(nearestLaunch.net))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nearestLaunch?.net])


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

  const todayKey  = useMemo(() => toJstDateKey(new Date().toISOString()), [])
  const activeKey = selectedKey ?? (nearestLaunch ? toJstDateKey(nearestLaunch.net) : todayKey)
  const selectedLaunches = launchesByDate[activeKey] ?? []

  useEffect(() => {
    activeKeyRef.current = activeKey
    if (!activeKey) return

    const cached = eventsCacheRef.current[activeKey]
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
        }
      })
  }, [activeKey])

  const year            = viewDate.getFullYear()
  const month           = viewDate.getMonth()
  const firstWeekday    = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayDate          = useMemo(() => new Date(), [])
  const todayYear          = todayDate.getFullYear()
  const todayMonth         = todayDate.getMonth()
  const isViewingOtherMonth = year !== todayYear || month !== todayMonth

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
          endTime:   form.allDay ? null : (form.endTime || null),
        }),
      })
      if (!res.ok) throw new Error()
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

  const totalEvents = calEvents.length + selectedLaunches.length

  return (
    <div className="calendar-view">

      {/* 左パネル: 打ち上げ情報 + アジェンダ */}
      <div className="cal-left">

        {nearestLaunch && (
          <div className="cal-next-launch">
            {nearestLaunch.imageUrl && (
              <img src={nearestLaunch.imageUrl} alt="" className="cal-next-launch-img" />
            )}
            <div className="cal-next-launch-overlay" />
            <div className="cal-next-launch-body">
              {/* PC専用: カウントダウン (SP版と同じスタイル) */}
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
                <p className="cal-next-launch-name">{nearestLaunch.name}</p>
                <p className="cal-next-launch-meta">{formatLaunchDate(nearestLaunch.net)}</p>
                {nearestLaunch.locationName && (
                  <p className="cal-next-launch-meta">{nearestLaunch.locationName}</p>
                )}
                {nearestLaunch.webcastUrl && (
                  <a className="cal-webcast-link" href={nearestLaunch.webcastUrl} target="_blank" rel="noreferrer">
                    ▶ ライブ配信を見る
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PC専用: ポモドーロタイマー */}
        <div className="cal-pomo">
          <div className="cal-pomo-header">
            <span className={`cal-pomo-mode cal-pomo-mode--${pomo.mode}`}>
              {POMO_LABELS[pomo.mode]}
            </span>
            <span className="cal-pomo-dots">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className={`cal-pomo-dot${i < (pomo.count % 4 || (pomo.count > 0 && pomo.count % 4 === 0 ? 4 : 0)) ? ' done' : ''}`} />
              ))}
            </span>
          </div>
          <div className="cal-pomo-body">
            <span className="cal-pomo-time">
              {pad2(Math.floor(pomo.secs / 60))}:{pad2(pomo.secs % 60)}
            </span>
            <div className="cal-pomo-btns">
              <button
                className="cal-pomo-btn cal-pomo-btn--main"
                onClick={() => setPomo(p => ({ ...p, running: !p.running }))}
                aria-label={pomo.running ? '一時停止' : '開始'}
              >
                {pomo.running ? '⏸' : '▶'}
              </button>
              <button
                className="cal-pomo-btn"
                onClick={() => setPomo(p => ({ ...p, secs: POMO_DURATIONS[p.mode], running: false }))}
                aria-label="リセット"
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-agenda">
          <div className="cal-agenda-header">
            <p className="cal-agenda-date">{formatAgendaDate(activeKey)}</p>
            {totalEvents > 0 && (
              <span className="cal-agenda-count">{totalEvents}件</span>
            )}
          </div>

          {calEvents.map(e => (
            <div className="launch-row cal-row--event" key={e.uid}>
              <span className="cal-row-bar cal-row-bar--apple" />
              <div className="launch-thumb cal-event-thumb">
                <span className="cal-event-icon">●</span>
              </div>
              <div className="launch-info">
                <b>{e.title}</b>
                <span>{e.allDay ? '終日' : e.startTime}</span>
              </div>
            </div>
          ))}

          {selectedLaunches.map(launch => (
            <div className="launch-row cal-row--event" key={launch.id}>
              <span className="cal-row-bar cal-row-bar--launch" />
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

          {!loadingEvents && totalEvents === 0 && (
            <div className="state-msg">この日の予定はありません</div>
          )}

          <div className="cal-agenda-spacer" />
        </div>
      </div>

      {/* 右パネル: 月グリッド */}
      <div className="cal-right">
        <div className="calendar-panel">
          <div className="cal-header">
            <div className="cal-month">
              <span>{year}</span>
              {month + 1}月
            </div>
            <div className="cal-nav">
              {isViewingOtherMonth && (
                <button
                  className="cal-today-btn"
                  onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey) }}
                >
                  今日
                </button>
              )}
              <button onClick={() => changeMonth(-1)} aria-label="前の月">‹</button>
              <button onClick={() => changeMonth(1)}  aria-label="次の月">›</button>
            </div>
          </div>
          <div className="weekdays">
            {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((cell, i) => {
              const launchList = cell.key ? (launchesByDate[cell.key] || []) : []
              const hasLaunch  = launchList.length > 0
              const isToday    = cell.key === todayKey
              const isSelected = cell.key === activeKey
              return (
                <button
                  key={i}
                  className={`cal-day ${cell.faint ? 'faint' : ''} ${isToday ? 'today' : ''} ${isSelected && !cell.faint ? 'selected' : ''}`}
                  disabled={cell.faint}
                  onClick={() => {
                    if (!cell.key) return
                    setSelectedKey(cell.key === selectedKey ? todayKey : cell.key)
                  }}
                >
                  <span className="cal-day-circle">
                    <span className="num">{cell.day}</span>
                  </span>
                  {hasLaunch && (
                    <span className="launch-dot-row">
                      {launchList.slice(0, 3).map((_, idx) => (
                        <span key={idx} className="launch-dot" />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
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
            <p className="cal-sheet-date">{formatAgendaDate(activeKey)}</p>
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

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

// 打ち上げイベントのデフォルトカラー
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

  // 月全体のカレンダーイベント (dateKey → events[])
  const [monthCalEvents, setMonthCalEvents] = useState({})
  const [monthCalLoading, setMonthCalLoading] = useState(true)
  const [showLaunches, setShowLaunches] = useState(() => {
    const saved = localStorage.getItem('cal-show-launches')
    return saved === null ? true : saved === 'true'
  })

  const [showSheet, setShowSheet]     = useState(false)
  const [form, setForm]               = useState({ title: '', date: '', startTime: '', endTime: '', allDay: true, calendarName: '' })
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [collections, setCollections] = useState([])
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)

  const titleRef       = useRef(null)
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

  const year            = viewDate.getFullYear()
  const month           = viewDate.getMonth()

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

  // セルごとの表示イベント (カレンダー + 打ち上げ) を統合
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

  const openSheet = () => {
    setForm({ title: '', date: activeKey || todayKey, startTime: '', endTime: '', allDay: true, calendarName: collections[0]?.name || '' })
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
    if (!form.title.trim() || !form.date) return
    setSubmitting(true)
    setSubmitError(null)
    const targetDate = form.date
    const selectedCol = collections.find(c => c.name === form.calendarName)
    const optimisticEvent = {
      uid:           `optimistic-${Date.now()}`,
      title:         form.title.trim(),
      startTime:     form.allDay ? null : (form.startTime || null),
      allDay:        form.allDay,
      calendarName:  form.calendarName || null,
      calendarColor: selectedCol?.color || null,
      date:          targetDate,
    }
    try {
      const res = await fetch('/api/calendar/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            <div className="launch-row cal-row--event" key={e.uid}>
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

        {featuredLaunch && (
          <div className={`cal-launch-accordion${launchOpen ? ' open' : ''}`}>
            <button
              className="cal-launch-accordion-header"
              onClick={() => setLaunchOpen(o => !o)}
            >
              <span className="cal-launch-accordion-icon">🚀</span>
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

      {/* 右パネル: 月グリッド (PC: インライン表示) */}
      <div className="cal-right">
        <div className="calendar-panel">
          <div className="cal-header">
            <div className="cal-month">
              <span>{year}</span>
              {month + 1}月
            </div>
            <div className="cal-nav">
              {featuredLaunch?.net && toJstDateKey(featuredLaunch.net) !== activeKey && (
                <button
                  className="cal-today-btn cal-launch-jump-btn"
                  onClick={jumpToLaunch}
                >
                  Next Rancher
                </button>
              )}
              {activeKey !== todayKey && (
                <button
                  className="cal-today-btn"
                  onClick={jumpToToday}
                >
                  ToDay
                </button>
              )}
              <button onClick={() => changeMonth(-1)} aria-label="前の月">‹</button>
              <button onClick={() => changeMonth(1)}  aria-label="次の月">›</button>
            </div>
          </div>
          <label className="cal-toggle">
            <input
              type="checkbox"
              checked={showLaunches}
              onChange={e => setShowLaunches(e.target.checked)}
            />
            <span className="cal-toggle-dot" style={{ background: LAUNCH_COLOR }} />
            <span className="cal-toggle-label">打ち上げ予定</span>
          </label>
          <div className="weekdays">
            {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((cell, i) => {
              const dayEvents  = cell.key ? (dayCombinedEvents[cell.key] || []) : []
              const isToday    = cell.key === todayKey
              const isSelected = cell.key === activeKey
              const MAX_INLINE = 3
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
                  {/* モバイル: ドット表示 */}
                  {dayEvents.length > 0 && (
                    <span className="launch-dot-row">
                      {dayEvents.slice(0, 3).map((_, idx) => (
                        <span key={idx} className="launch-dot" />
                      ))}
                    </span>
                  )}
                  {/* PC: ロード中はスケルトン、完了後はイベント */}
                  {monthCalLoading ? (
                    <>
                      <div className="cal-inline-skeleton" />
                      <div className="cal-inline-skeleton cal-inline-skeleton--short" />
                    </>
                  ) : (
                    <>
                      {dayEvents.slice(0, MAX_INLINE).map((e, idx) => (
                        <div
                          key={e.uid + idx}
                          className="cal-inline-event"
                          style={{ borderLeftColor: e.calendarColor || '#4a9eff' }}
                        >
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > MAX_INLINE && (
                        <div className="cal-inline-more">+{dayEvents.length - MAX_INLINE}</div>
                      )}
                    </>
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
            <div className="cal-sheet-header">
              <p className="cal-sheet-title">新しい予定</p>
              <button className="cal-sheet-close" onClick={closeSheet}>✕</button>
            </div>
            <div className="cal-form">
              <input
                ref={titleRef}
                className="cal-input cal-input--title"
                placeholder="タイトルを入力"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && submitEvent()}
              />

              {/* カレンダー選択 */}
              {collections.length > 0 && (
                <div className="cal-field">
                  <label className="cal-field-label">カレンダー</label>
                  <div className="cal-collection-list">
                    {collections.map(c => (
                      <button
                        key={c.name}
                        className={`cal-collection-chip${form.calendarName === c.name ? ' active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, calendarName: c.name }))}
                      >
                        <span className="cal-collection-dot" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 日付 */}
              <div className="cal-field">
                <label className="cal-field-label">日付</label>
                <input
                  className="cal-input cal-input--date"
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* 終日 / 時間 */}
              <div className="cal-field">
                <div className="cal-allday-row">
                  <label className="cal-field-label" style={{ marginBottom: 0 }}>時間</label>
                  <label className="cal-toggle-switch">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                    />
                    <span className="cal-toggle-track" />
                    <span className="cal-toggle-text">終日</span>
                  </label>
                </div>
                {!form.allDay && (
                  <div className="cal-time-row">
                    <div className="cal-time-field">
                      <span className="cal-time-label">開始</span>
                      <input
                        className="cal-input cal-input--time"
                        type="time"
                        step="300"
                        value={form.startTime}
                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <span className="cal-time-arrow">→</span>
                    <div className="cal-time-field">
                      <span className="cal-time-label">終了</span>
                      <input
                        className="cal-input cal-input--time"
                        type="time"
                        step="300"
                        value={form.endTime}
                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {submitError && <p className="cal-error">{submitError}</p>}
              <button
                className="cal-submit-btn"
                onClick={submitEvent}
                disabled={submitting || !form.title.trim() || !form.date}
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

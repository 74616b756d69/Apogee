import { useEffect, useMemo, useState } from 'react'

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
      year: 'numeric',
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

function calcCountdown(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return null
  const total = Math.floor(diff / 1000)
  return {
    days:    Math.floor(total / 86400),
    hours:   Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

function CalendarView() {
  const [launches, setLaunches]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [viewDate, setViewDate]       = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(null)
  const [countdown, setCountdown]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/launches/upcoming')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => setLaunches(json))
      .catch(err => setError(`データの取得に失敗しました: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  const nearestLaunch = launches[0] ?? null

  useEffect(() => {
    if (!nearestLaunch?.net) { setCountdown(null); return }
    setCountdown(calcCountdown(nearestLaunch.net))
    const id = setInterval(() => setCountdown(calcCountdown(nearestLaunch.net)), 1000)
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

  const todayKey = useMemo(() => toJstDateKey(new Date().toISOString()), [])
  const activeKey = selectedKey ?? (nearestLaunch ? toJstDateKey(nearestLaunch.net) : todayKey)
  const selectedLaunches = launchesByDate[activeKey] ?? []

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
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

  const changeMonth = delta => {
    setViewDate(new Date(year, month + delta, 1))
  }

  const heroStyle = nearestLaunch?.imageUrl
    ? { backgroundImage: `url(${nearestLaunch.imageUrl})` }
    : undefined

  return (
    <div className="calendar-view">
      <div className={`calendar-hero ${nearestLaunch?.imageUrl ? '' : 'calendar-hero-fallback'}`} style={heroStyle}>
        <div className="calendar-hero-scrim" />
        <div className="calendar-hero-info">
          {loading && <div className="calendar-eyebrow">読み込み中…</div>}
          {!loading && nearestLaunch && (
            <>
              <div className="calendar-eyebrow">NEXT LAUNCH</div>
              <h2 className="calendar-hero-title">{nearestLaunch.name}</h2>
              {nearestLaunch.net && (
                <div className="calendar-launch-date">{formatLaunchDate(nearestLaunch.net)}</div>
              )}
              {nearestLaunch.locationName && (
                <div className="calendar-hero-sub">{nearestLaunch.locationName}</div>
              )}

              <div className="countdown-label-t">T − MINUS</div>
              {countdown ? (
                <div className="countdown">
                  <div className="countdown-unit">
                    <span className="countdown-num">{String(countdown.days).padStart(2, '0')}</span>
                    <span className="countdown-lbl">DAYS</span>
                  </div>
                  <span className="countdown-sep">:</span>
                  <div className="countdown-unit">
                    <span className="countdown-num">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="countdown-lbl">HOURS</span>
                  </div>
                  <span className="countdown-sep">:</span>
                  <div className="countdown-unit">
                    <span className="countdown-num">{String(countdown.minutes).padStart(2, '0')}</span>
                    <span className="countdown-lbl">MINS</span>
                  </div>
                  <span className="countdown-sep">:</span>
                  <div className="countdown-unit">
                    <span className="countdown-num countdown-num--sec">{String(countdown.seconds).padStart(2, '0')}</span>
                    <span className="countdown-lbl">SECS</span>
                  </div>
                </div>
              ) : (
                <div className="countdown-launched">発射済み / 日時未定</div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="calendar-panel">
        <div className="cal-header">
          <div className="cal-month">
            <span>{year} {String(month + 1).padStart(2, '0')}</span>
            {month + 1}月
          </div>
          <div className="cal-nav">
            <button onClick={() => changeMonth(-1)} aria-label="前の月">‹</button>
            <button onClick={() => changeMonth(1)} aria-label="次の月">›</button>
          </div>
        </div>

        <div className="weekdays">
          {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
        </div>

        <div className="cal-grid">
          {cells.map((cell, i) => {
            const hasLaunch = cell.key && launchesByDate[cell.key]?.length > 0
            const isToday = cell.key === todayKey
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

      <div className="calendar-agenda">
        <div className="section-label">{activeKey ?? ''} の打ち上げ予定</div>

        {loading && <div className="state-msg">⏳ 読み込み中...</div>}
        {error && <div className="state-msg error">{error}</div>}

        {!loading && !error && selectedLaunches.length === 0 && (
          <div className="state-msg">この日の打ち上げ予定はありません</div>
        )}

        {selectedLaunches.map(launch => (
          <div className="launch-row" key={launch.id}>
            <div className="launch-thumb">🚀</div>
            <div className="launch-info">
              <b>{launch.name}</b>
              <span>{[formatTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
            </div>
            {launch.statusName && <span className="badge badge-default">{launch.statusName}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default CalendarView

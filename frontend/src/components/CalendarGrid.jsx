const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function toJstDateKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

const LAUNCH_COLOR = '#e06a3a'

function CalendarGrid({
  year, month, cells, dayCombinedEvents, monthCalLoading,
  todayKey, activeKey, selectedKey, onSelectDay,
  showLaunches, onToggleLaunches,
  featuredLaunch, onJumpToLaunch, onJumpToToday,
  onChangeMonth,
}) {
  return (
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
              onClick={onJumpToLaunch}
            >
              Next Launch
            </button>
          )}
          {activeKey !== todayKey && (
            <button
              className="cal-today-btn"
              onClick={onJumpToToday}
            >
              ToDay
            </button>
          )}
          <button onClick={() => onChangeMonth(-1)} aria-label="前の月">‹</button>
          <button onClick={() => onChangeMonth(1)}  aria-label="次の月">›</button>
        </div>
      </div>
      <label className="cal-toggle">
        <input
          type="checkbox"
          checked={showLaunches}
          onChange={e => onToggleLaunches(e.target.checked)}
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
                onSelectDay(cell.key === selectedKey ? todayKey : cell.key)
              }}
            >
              <span className="cal-day-circle">
                <span className="num">{cell.day}</span>
              </span>
              {dayEvents.length > 0 && (
                <span className="launch-dot-row">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span key={idx} className="launch-dot" />
                  ))}
                </span>
              )}
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
  )
}

export default CalendarGrid

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
    <div className="rounded-none border-b border-white/10 bg-[rgba(13,24,41,0.85)] px-5 py-4 sm:px-5">
      <div className="flex items-center justify-between pb-2">
        <div className="text-[1rem] font-bold tracking-[-0.01em] text-[#dce8f5]">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#7ab8ff]">{year}</span>
          {month + 1}月
        </div>
        <div className="flex gap-2">
          {featuredLaunch?.net && toJstDateKey(featuredLaunch.net) !== activeKey && (
            <button
              className="rounded-full border border-orange-500/35 bg-orange-500/10 px-3 py-1 text-[0.72rem] font-semibold text-[#e06a3a] transition hover:bg-orange-500/20"
              onClick={onJumpToLaunch}
            >
              Next Launch
            </button>
          )}
          {activeKey !== todayKey && (
            <button
              className="rounded-full border border-sky-400/25 bg-white/5 px-3 py-1 text-[0.72rem] font-semibold text-[#7a93b0] transition hover:border-[#7ab8ff] hover:text-[#7ab8ff]"
              onClick={onJumpToToday}
            >
              ToDay
            </button>
          )}
          <button className="h-7 w-7 rounded-full border border-sky-400/25 bg-white/5 text-sm text-[#7a93b0]" onClick={() => onChangeMonth(-1)} aria-label="前の月">‹</button>
          <button className="h-7 w-7 rounded-full border border-sky-400/25 bg-white/5 text-sm text-[#7a93b0]" onClick={() => onChangeMonth(1)} aria-label="次の月">›</button>
        </div>
      </div>
      <label className="flex items-center gap-2 pb-2 text-[0.68rem] text-white/45">
        <input
          type="checkbox"
          checked={showLaunches}
          onChange={e => onToggleLaunches(e.target.checked)}
        />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAUNCH_COLOR }} />
        <span>打ち上げ予定</span>
      </label>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#7a93b0]">
        {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 pb-2">
        {cells.map((cell, i) => {
          const dayEvents  = cell.key ? (dayCombinedEvents[cell.key] || []) : []
          const isToday    = cell.key === todayKey
          const isSelected = cell.key === activeKey
          const MAX_INLINE = 3
          const dayClassName = [
            'flex aspect-square flex-col items-center justify-start rounded-lg p-1 text-left transition',
            cell.faint ? 'text-[#4d6580]' : 'text-[#dce8f5]',
            isToday ? 'bg-[#e8c060]/15 ring-1 ring-[#e8c060]/65' : '',
            isSelected && !cell.faint ? 'bg-[#7ab8ff] text-[#04101f] font-extrabold' : '',
            !cell.faint ? 'hover:bg-white/5' : 'cursor-default',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={i}
              className={dayClassName}
              disabled={cell.faint}
              onClick={() => {
                if (!cell.key) return
                onSelectDay(cell.key === selectedKey ? todayKey : cell.key)
              }}
            >
              <span className="text-[0.78rem] font-semibold leading-none">{cell.day}</span>
              {dayEvents.length > 0 && (
                <span className="mt-1 flex gap-1">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span key={idx} className="h-1.5 w-1.5 rounded-full bg-white/60" />
                  ))}
                </span>
              )}
              {monthCalLoading ? (
                <>
                  <div className="mt-1 h-2 w-full rounded bg-white/10" />
                  <div className="mt-1 h-2 w-4/5 rounded bg-white/10" />
                </>
              ) : (
                <>
                  {dayEvents.slice(0, MAX_INLINE).map((e, idx) => (
                    <div
                      key={e.uid + idx}
                      className="mt-1 max-w-full truncate rounded-sm border-l-2 px-1 text-[0.58rem] leading-4"
                      style={{ borderLeftColor: e.calendarColor || '#4a9eff' }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > MAX_INLINE && (
                    <div className="mt-1 text-[0.6rem] text-white/70">+{dayEvents.length - MAX_INLINE}</div>
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

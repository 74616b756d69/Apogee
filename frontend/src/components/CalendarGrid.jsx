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
    <div className="border-b border-sky-400/14 bg-[rgba(13,24,41,0.85)] px-5 py-4 pb-3 md:flex md:min-h-0 md:flex-1 md:flex-col md:border-none md:bg-transparent md:p-0 md:max-w-[800px] md:w-full">
      <div className="flex items-center justify-between pb-2">
        <div className="text-base font-bold tracking-[-0.01em] text-body-text">
          <span className="mb-0.5 block text-[0.72rem] font-semibold tracking-[0.06em] text-blue">{year}</span>
          {month + 1}月
        </div>
        <div className="flex gap-1.5">
          {featuredLaunch?.net && toJstDateKey(featuredLaunch.net) !== activeKey && (
            <button
              className="cursor-pointer rounded-full border border-launch/35 bg-launch/10 px-2.5 py-0.5 font-[inherit] text-[0.72rem] font-bold text-launch transition-colors hover:bg-launch/20"
              onClick={onJumpToLaunch}
            >
              Next Launch
            </button>
          )}
          {activeKey !== todayKey && (
            <button
              className="cursor-pointer rounded-full border border-[rgba(var(--accent),0.3)] bg-[rgba(var(--accent),0.12)] px-2.5 py-0.5 font-[inherit] text-[0.72rem] font-bold text-[rgba(var(--accent),0.9)] transition-colors hover:bg-[rgba(var(--accent),0.22)]"
              onClick={onJumpToToday}
            >
              ToDay
            </button>
          )}
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-sky-400/25 bg-white/5 text-[0.85rem] text-muted transition-colors hover:border-blue hover:text-blue"
            onClick={() => onChangeMonth(-1)}
            aria-label="前の月"
          >
            ‹
          </button>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-sky-400/25 bg-white/5 text-[0.85rem] text-muted transition-colors hover:border-blue hover:text-blue"
            onClick={() => onChangeMonth(1)}
            aria-label="次の月"
          >
            ›
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer select-none items-center gap-1.5 px-0.5 pb-1">
        <input
          type="checkbox"
          className="hidden"
          checked={showLaunches}
          onChange={e => onToggleLaunches(e.target.checked)}
        />
        <span
          className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${showLaunches ? 'opacity-100' : 'opacity-25'}`}
          style={{ background: LAUNCH_COLOR }}
        />
        <span className={`text-[0.68rem] transition-colors ${showLaunches ? 'text-white/70' : 'text-white/45'}`}>
          打ち上げ予定
        </span>
      </label>

      <div className="grid grid-cols-7 py-1 pb-0.5 text-center text-[0.68rem] font-semibold text-meta [&>div:first-child]:text-[#e07a7a] [&>div:last-child]:text-blue [&>div]:py-1.5">
        {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1 px-0 py-0.5 pb-2 md:min-h-0 md:flex-1 md:grid-auto-rows-fr md:content-stretch md:pt-0.5 md:pb-0">
        {cells.map((cell, i) => {
          const dayEvents  = cell.key ? (dayCombinedEvents[cell.key] || []) : []
          const isToday    = cell.key === todayKey
          const isSelected = cell.key === activeKey
          const MAX_INLINE = 3

          return (
            <button
              key={i}
              className={[
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-[3px] border-none bg-transparent p-0.5 font-[inherit] md:aspect-auto md:h-auto md:min-h-0 md:items-start md:justify-start md:gap-0.5 md:overflow-hidden md:p-1 md:px-1 md:py-1.5',
                cell.faint ? 'cursor-default' : '',
              ].filter(Boolean).join(' ')}
              disabled={cell.faint}
              onClick={() => {
                if (!cell.key) return
                onSelectDay(cell.key === selectedKey ? todayKey : cell.key)
              }}
            >
              <span className={[
                'flex aspect-square w-[76%] max-[480px]:w-[70%] items-center justify-center rounded-full transition-colors md:h-[22px] md:w-[22px] md:min-h-[22px] md:min-w-[22px] md:aspect-auto md:shrink-0 md:self-start',
                isToday ? 'border-[1.5px] border-gold/65 bg-gold/18' : '',
                isSelected && !cell.faint ? 'bg-[rgba(var(--accent),1)]' : '',
              ].filter(Boolean).join(' ')}>
                <span className={[
                  'text-[0.78rem] max-[480px]:text-[0.7rem] md:text-[0.88rem] font-semibold leading-none',
                  cell.faint ? 'text-[#4d6580]' : isSelected ? 'font-extrabold text-[#04101f]' : 'text-body-text',
                ].filter(Boolean).join(' ')}>
                  {cell.day}
                </span>
              </span>

              {dayEvents.length > 0 && (
                <span className="flex min-h-[5px] gap-0.5 md:hidden">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1 w-1 shrink-0 rounded-full bg-gold ${isSelected ? 'bg-[rgba(4,16,31,0.55)]' : ''}`}
                    />
                  ))}
                </span>
              )}

              {monthCalLoading ? (
                <>
                  <div className="mt-0.5 hidden h-[11px] w-4/5 rounded-sm bg-white/[0.07] md:block" />
                  <div className="mt-0.5 hidden h-[11px] w-[55%] rounded-sm bg-white/[0.07] md:block" />
                </>
              ) : (
                <>
                  {dayEvents.slice(0, MAX_INLINE).map((e, idx) => (
                    <div
                      key={e.uid + idx}
                      className={`mt-0.5 hidden w-full cursor-pointer truncate rounded-r-sm border-l-2 bg-white/[0.06] px-1 py-px pl-[5px] text-left text-[0.62rem] leading-[1.35] text-[rgba(220,232,245,0.85)] md:block ${
                        isSelected ? 'bg-[rgba(var(--accent),0.12)] text-[rgba(220,232,245,0.90)]' : ''
                      }`}
                      style={{ borderLeftColor: e.calendarColor || '#4a9eff' }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > MAX_INLINE && (
                    <div className={`mt-0.5 hidden pl-[5px] text-[0.58rem] leading-[1.2] md:block ${isSelected ? 'text-white/35' : 'text-white/30'}`}>
                      +{dayEvents.length - MAX_INLINE}
                    </div>
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

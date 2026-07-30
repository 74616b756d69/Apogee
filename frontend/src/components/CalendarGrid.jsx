import { computeWeekSpans, MAX_LANES } from '../utils/calendarSpans'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function toJstDateKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

const LAUNCH_COLOR = '#e06a3a'

function DayBadge({ cell, isToday, isSelected }) {
  return (
    <span className={[
      'flex aspect-square w-[82%] max-[480px]:w-[76%] items-center justify-center rounded-full transition-colors md:h-[25px] md:w-[25px] md:min-h-[25px] md:min-w-[25px] md:aspect-auto md:shrink-0 md:self-start',
      isToday ? 'border-[1.5px] border-gold/65 bg-gold/18' : '',
      isSelected && !cell.faint ? 'bg-[rgba(var(--accent),1)]' : '',
    ].filter(Boolean).join(' ')}>
      <span className={[
        'text-[0.78rem] max-[480px]:text-[0.7rem] md:text-[0.88rem] font-semibold leading-none',
        cell.faint ? 'text-[#4d6580]' : isSelected ? 'font-extrabold text-[rgba(var(--accent-text,4,16,31),1)]' : 'text-body-text',
      ].filter(Boolean).join(' ')}>
        {cell.day}
      </span>
    </span>
  )
}

function CalendarGrid({
  year, month, cells, dayCombinedEvents, monthCalLoading,
  todayKey, activeKey, selectedKey, onSelectDay,
  showLaunches, onToggleLaunches,
  featuredLaunch, onJumpToLaunch, onJumpToToday,
  onChangeMonth,
}) {
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

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

      {/* モバイル: 日ごとのドット表示 */}
      <div className="grid grid-cols-7 gap-1 px-0 py-0.5 pb-2 md:hidden">
        {cells.map((cell, i) => {
          const dayEvents  = cell.key ? (dayCombinedEvents[cell.key] || []) : []
          const isToday    = cell.key === todayKey
          const isSelected = cell.key === activeKey

          return (
            <button
              key={i}
              className={[
                'flex aspect-square cursor-pointer flex-col items-center justify-center gap-[3px] border-none bg-transparent p-0.5 font-[inherit]',
                cell.faint ? 'cursor-default' : '',
              ].filter(Boolean).join(' ')}
              disabled={cell.faint}
              onClick={() => {
                if (!cell.key) return
                onSelectDay(cell.key === selectedKey ? todayKey : cell.key)
              }}
            >
              <DayBadge cell={cell} isToday={isToday} isSelected={isSelected} />
              {dayEvents.length > 0 && (
                <span className="flex min-h-[5px] gap-0.5">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1 w-1 shrink-0 rounded-full bg-gold ${isSelected ? 'bg-[rgba(4,16,31,0.55)]' : ''}`}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* デスクトップ: 連続日程を1本のバーで連結表示 */}
      <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-1 md:pt-0.5">
        {weeks.map((week, wi) => {
          const { spans, overflowByCol } = computeWeekSpans(week, dayCombinedEvents)
          return (
            <div
              key={wi}
              className="relative grid md:min-h-0 md:flex-1"
              style={{
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridTemplateRows: `25px repeat(${MAX_LANES}, minmax(0, 1fr)) 12px`,
              }}
            >
              {week.map((cell, ci) => {
                const isToday    = cell.key === todayKey
                const isSelected = cell.key === activeKey
                return (
                  <button
                    key={ci}
                    className={[
                      'flex flex-col items-start gap-0.5 border-none bg-transparent p-1 font-[inherit]',
                      cell.faint ? 'cursor-default' : 'cursor-pointer',
                    ].filter(Boolean).join(' ')}
                    style={{ gridColumn: ci + 1, gridRow: '1 / -1' }}
                    disabled={cell.faint}
                    onClick={() => {
                      if (!cell.key) return
                      onSelectDay(cell.key === selectedKey ? todayKey : cell.key)
                    }}
                  >
                    <DayBadge cell={cell} isToday={isToday} isSelected={isSelected} />
                  </button>
                )
              })}

              {monthCalLoading ? (
                <>
                  <div className="pointer-events-none mx-1 h-[11px] rounded-sm bg-white/[0.07]" style={{ gridColumn: '1 / 3', gridRow: 2 }} />
                  <div className="pointer-events-none mx-1 h-[11px] rounded-sm bg-white/[0.07]" style={{ gridColumn: '3 / 4', gridRow: 2 }} />
                </>
              ) : (
                <>
                  {spans.map(s => (
                    <div
                      key={s.id}
                      className="pointer-events-none mt-0.5 mr-0.5 truncate rounded-r-sm border-l-2 bg-white/[0.06] px-1 py-px pl-[5px] text-left text-[0.62rem] leading-[1.35] text-[rgba(220,232,245,0.85)]"
                      style={{
                        gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`,
                        gridRow: s.lane + 2,
                        borderLeftColor: s.calendarColor || '#4a9eff',
                      }}
                    >
                      {s.title}
                    </div>
                  ))}
                  {Object.entries(overflowByCol).map(([col, count]) => (
                    <div
                      key={col}
                      className="pointer-events-none pl-[5px] text-[0.58rem] leading-[1.2] text-white/30"
                      style={{ gridColumn: Number(col) + 1, gridRow: MAX_LANES + 2 }}
                    >
                      +{count}
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarGrid

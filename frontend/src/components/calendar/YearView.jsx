import { useMemo } from 'react'
import { addDays, isSameDay, startOfDay, toDateKey } from '../../utils/calendarDates'
import { eventColor } from '../../store/calendarStore'

const WEEKDAY_HEADS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_DOTS = 3

/** 各日に、その日にかかるイベントの色を最大 MAX_DOTS 件まで集める。 */
function buildDotsByDate(events) {
  const map = new Map()
  for (const event of events) {
    if (!event.start) continue
    const last = event.allDay && event.end ? addDays(event.end, -1) : (event.end ?? event.start)
    for (let d = startOfDay(event.start); d <= last; d = addDays(d, 1)) {
      const key = toDateKey(d)
      const colors = map.get(key) ?? []
      if (colors.length < MAX_DOTS) {
        colors.push(eventColor(event))
        map.set(key, colors)
      }
      // 1 件のイベントで 400 日以上ループしないよう保険をかける
      if ((d - event.start) / 86400000 > 400) break
    }
  }
  return map
}

function MonthMini({ year, month, dotsByDate, today, onSelectMonth, onSelectDay }) {
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leading = first.getDay()
    const result = []
    for (let i = 0; i < leading; i++) result.push(null)
    for (let day = 1; day <= daysInMonth; day++) result.push(new Date(year, month, day))
    return result
  }, [year, month])

  return (
    <div className="rounded-xl border border-[rgba(100,160,255,0.1)] bg-[rgba(4,8,16,0.45)] p-2.5">
      <button
        type="button"
        onClick={() => onSelectMonth(new Date(year, month, 1))}
        className="mb-1.5 w-full cursor-pointer rounded-md border-none bg-transparent px-1 py-0.5 text-left font-[inherit] text-[0.78rem] font-bold text-body-text transition-colors hover:bg-white/[0.06]"
      >
        {month + 1}月
      </button>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAY_HEADS.map((label, i) => (
          <span
            key={label}
            className={[
              'text-[0.55rem] font-bold',
              i === 0 ? 'text-[#ff8a8a]/70' : i === 6 ? 'text-[#8ab8ff]/70' : 'text-white/30',
            ].join(' ')}
          >
            {label}
          </span>
        ))}

        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} />
          const dots = dotsByDate.get(toDateKey(date)) ?? []
          const isToday = isSameDay(date, today)
          return (
            <button
              key={toDateKey(date)}
              type="button"
              onClick={() => onSelectDay(date)}
              className="flex cursor-pointer flex-col items-center gap-[1px] rounded-[4px] border-none bg-transparent px-0 py-[1px] font-[inherit] transition-colors hover:bg-white/[0.08]"
            >
              <span
                className={[
                  'flex h-[15px] w-[15px] items-center justify-center rounded-full text-[0.58rem] leading-none',
                  isToday
                    ? 'bg-[rgba(var(--accent),1)] font-extrabold text-[#04101f]'
                    : 'text-white/70',
                ].join(' ')}
              >
                {date.getDate()}
              </span>
              <span className="flex h-[3px] items-center gap-[1.5px]">
                {dots.map((color, di) => (
                  <span
                    key={di}
                    className="block h-[3px] w-[3px] rounded-full"
                    style={{ background: color }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 12 ヶ月のミニカレンダーを並べ、予定のある日にドットを打つ。 */
function YearView({ year, events, onSelectMonth, onSelectDay }) {
  const dotsByDate = useMemo(() => buildDotsByDate(events), [events])
  const today = useMemo(() => new Date(), [])

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, month) => (
          <MonthMini
            key={month}
            year={year}
            month={month}
            dotsByDate={dotsByDate}
            today={today}
            onSelectMonth={onSelectMonth}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
    </div>
  )
}

export default YearView

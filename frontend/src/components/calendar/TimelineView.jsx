import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { eventColor } from '../../store/calendarStore'
import { addDays, addMinutes, formatDateJa, isSameDay, startOfDay, toDateKey } from '../../utils/calendarDates'

/**
 * 横軸=時刻・縦軸=日付のタイムラインビュー。
 *
 * FullCalendar のタイムライン（Scheduler）はプレミアム扱いのため、必要な機能だけを自前で持つ。
 * 位置計算は「1分あたりのピクセル数」を単一の基準にし、描画・当たり判定・ドラッグ量の
 * 換算をすべてそこから導く。
 */

const CELL_PX = 72
export const ZOOM_STEPS = [60, 30, 15]

const EDGE_HIT_PX = 8
const ROW_HEIGHT = 46
const LANE_HEIGHT = 20
const LANE_GAP = 3

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** 同じ行で重なるバーを段に振り分ける。 */
function assignLanes(segments) {
  const laneEnds = []
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  for (const seg of sorted) {
    let lane = laneEnds.findIndex(end => end <= seg.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(seg.endMin)
    } else {
      laneEnds[lane] = seg.endMin
    }
    seg.lane = lane
  }
  return { segments: sorted, laneCount: Math.max(1, laneEnds.length) }
}

function TimelineView({
  events,
  rangeStart,
  dayCount,
  cellMinutes,
  snapMinutes,
  onZoomChange,
  onEventClick,
  onEventChange,
  onSelectRange,
}) {
  const pxPerMinute = CELL_PX / cellMinutes
  const dayWidth = 24 * 60 * pxPerMinute

  const [draft, setDraft] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const dragRef = useRef(null)
  const gridRef = useRef(null)
  // pointerdown の stopPropagation では後続の click は止まらない。
  // ドラッグ直後の click が行の「新規作成」を誤発火させるのを防ぐ。
  const suppressRowClickRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => startOfDay(addDays(rangeStart, i))),
    [rangeStart, dayCount],
  )

  /** 各日の行に載せるバー。複数日イベントは日ごとに切り出す。 */
  const rows = useMemo(() => {
    return days.map(day => {
      const dayStart = day
      const dayEnd = addDays(day, 1)
      const segments = []

      for (const event of events) {
        if (!event.start) continue
        const draftedStart = draft?.id === event.id ? draft.start : event.start
        const draftedEnd = draft?.id === event.id
          ? draft.end
          : (event.end ?? addMinutes(event.start, 60))
        if (draftedEnd <= dayStart || draftedStart >= dayEnd) continue

        const from = draftedStart < dayStart ? dayStart : draftedStart
        const to = draftedEnd > dayEnd ? dayEnd : draftedEnd
        segments.push({
          key: `${event.id}@${toDateKey(day)}`,
          event,
          startMin: (from - dayStart) / 60000,
          endMin: (to - dayStart) / 60000,
          continuesBefore: draftedStart < dayStart,
          continuesAfter: draftedEnd > dayEnd,
          dragging: draft?.id === event.id,
        })
      }

      return { day, ...assignLanes(segments) }
    })
  }, [days, events, draft])

  // ── ドラッグ ─────────────────────────────

  const beginDrag = useCallback((e, event, mode) => {
    if (event.source === 'launch') return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      mode,
      event,
      startX: e.clientX,
      startY: e.clientY,
      originStart: event.start,
      originEnd: event.end ?? addMinutes(event.start, 60),
      moved: false,
    }
    setDraft({ id: event.id, start: event.start, end: event.end ?? addMinutes(event.start, 60) })
  }, [])

  useEffect(() => {
    if (!draft) return

    const snap = value => Math.round(value / snapMinutes) * snapMinutes

    const onMove = e => {
      const drag = dragRef.current
      if (!drag) return
      const dxMinutes = snap((e.clientX - drag.startX) / pxPerMinute)
      const dyRows = Math.round((e.clientY - drag.startY) / ROW_HEIGHT)
      if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) {
        drag.moved = true
      }

      const shift = drag.event.allDay
        ? dyRows * 1440
        : dxMinutes + dyRows * 1440

      if (drag.mode === 'move') {
        setDraft({
          id: drag.event.id,
          start: addMinutes(drag.originStart, shift),
          end: addMinutes(drag.originEnd, shift),
        })
      } else if (drag.mode === 'resize-end') {
        const end = addMinutes(drag.originEnd, shift)
        setDraft({
          id: drag.event.id,
          start: drag.originStart,
          end: end <= drag.originStart ? addMinutes(drag.originStart, snapMinutes) : end,
        })
      } else {
        const start = addMinutes(drag.originStart, shift)
        setDraft({
          id: drag.event.id,
          start: start >= drag.originEnd ? addMinutes(drag.originEnd, -snapMinutes) : start,
          end: drag.originEnd,
        })
      }
    }

    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      const pending = draft
      setDraft(null)
      suppressRowClickRef.current = true
      if (!drag || !pending) return

      if (!drag.moved) {
        onEventClick?.(drag.event)
        return
      }
      if (pending.start.getTime() === drag.originStart.getTime()
        && pending.end.getTime() === drag.originEnd.getTime()) return

      onEventChange?.({
        event: drag.event,
        changes: { start: pending.start, end: pending.end, allDay: drag.event.allDay },
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draft, pxPerMinute, snapMinutes, onEventChange, onEventClick])

  /** 空き領域のクリックで、その時刻に新規作成する。 */
  const handleRowClick = useCallback((e, day) => {
    if (suppressRowClickRef.current) {
      suppressRowClickRef.current = false
      return
    }
    if (dragRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left + e.currentTarget.scrollLeft
    const minutes = clamp(Math.floor(offsetX / pxPerMinute / snapMinutes) * snapMinutes, 0, 1440 - snapMinutes)
    const start = addMinutes(day, minutes)
    onSelectRange?.({ start, end: addMinutes(start, 60), allDay: false, jsEvent: e })
  }, [pxPerMinute, snapMinutes, onSelectRange])

  const hourMarks = useMemo(() => {
    const step = cellMinutes >= 60 ? 60 : cellMinutes >= 30 ? 60 : 120
    return Array.from({ length: Math.floor(1440 / step) + 1 }, (_, i) => i * step)
  }, [cellMinutes])

  const zoomIndex = ZOOM_STEPS.indexOf(cellMinutes)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ズーム操作 */}
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <span className="text-[0.68rem] font-semibold text-white/40">目盛り</span>
        <div className="flex overflow-hidden rounded-full border border-sky-400/20">
          {ZOOM_STEPS.map(step => (
            <button
              key={step}
              type="button"
              onClick={() => onZoomChange?.(step)}
              className={[
                'cursor-pointer border-none px-2.5 py-1 font-[inherit] text-[0.68rem] font-bold transition-colors',
                step === cellMinutes
                  ? 'bg-[rgba(var(--accent),0.2)] text-[rgba(var(--accent),0.95)]'
                  : 'bg-white/5 text-muted hover:text-blue',
              ].join(' ')}
            >
              {step === 60 ? '1時間' : `${step}分`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            aria-label="ズームアウト"
            disabled={zoomIndex <= 0}
            onClick={() => onZoomChange?.(ZOOM_STEPS[zoomIndex - 1])}
            className="cursor-pointer rounded-md border border-sky-400/20 bg-white/5 px-2 py-1 text-[0.8rem] text-muted transition-colors hover:text-blue disabled:cursor-default disabled:opacity-30"
          >
            −
          </button>
          <button
            type="button"
            aria-label="ズームイン"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => onZoomChange?.(ZOOM_STEPS[zoomIndex + 1])}
            className="cursor-pointer rounded-md border border-sky-400/20 bg-white/5 px-2 py-1 text-[0.8rem] text-muted transition-colors hover:text-blue disabled:cursor-default disabled:opacity-30"
          >
            ＋
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-auto rounded-xl border border-[rgba(100,160,255,0.12)] bg-[rgba(4,8,16,0.5)]">
        {/* 日付の固定列 */}
        <div className="sticky left-0 z-20 shrink-0 border-r border-[rgba(100,160,255,0.12)] bg-[#04080f]">
          <div className="h-7 border-b border-[rgba(100,160,255,0.12)]" />
          {rows.map(row => (
            <div
              key={toDateKey(row.day)}
              className={[
                'flex w-[92px] items-center px-3 text-[0.7rem] font-semibold',
                isSameDay(row.day, now) ? 'text-[rgba(var(--accent),0.95)]' : 'text-muted',
              ].join(' ')}
              style={{ height: Math.max(ROW_HEIGHT, row.laneCount * (LANE_HEIGHT + LANE_GAP) + 10) }}
            >
              {formatDateJa(row.day)}
            </div>
          ))}
        </div>

        <div ref={gridRef} className="relative min-w-max">
          {/* 時刻目盛り */}
          <div className="sticky top-0 z-10 flex h-7 border-b border-[rgba(100,160,255,0.12)] bg-[#04080f]">
            {hourMarks.slice(0, -1).map(minutes => (
              <div
                key={minutes}
                className="shrink-0 border-r border-[rgba(100,160,255,0.08)] px-1.5 text-[0.64rem] leading-7 text-white/40"
                style={{ width: (hourMarks[1] - hourMarks[0]) * pxPerMinute }}
              >
                {String(Math.floor(minutes / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {rows.map(row => {
            const rowHeight = Math.max(ROW_HEIGHT, row.laneCount * (LANE_HEIGHT + LANE_GAP) + 10)
            const isToday = isSameDay(row.day, now)
            return (
              <div
                key={toDateKey(row.day)}
                className="relative border-b border-[rgba(100,160,255,0.08)]"
                style={{ width: dayWidth, height: rowHeight }}
                onClick={e => handleRowClick(e, row.day)}
              >
                {/* 目盛り線と営業時間外の陰影 */}
                <div className="pointer-events-none absolute inset-0">
                  {hourMarks.slice(0, -1).map(minutes => (
                    <div
                      key={minutes}
                      className="absolute top-0 bottom-0 border-r border-[rgba(100,160,255,0.06)]"
                      style={{ left: minutes * pxPerMinute, width: (hourMarks[1] - hourMarks[0]) * pxPerMinute }}
                    />
                  ))}
                  <div className="absolute top-0 bottom-0 bg-black/25" style={{ left: 0, width: 8 * 60 * pxPerMinute }} />
                  <div className="absolute top-0 bottom-0 bg-black/25" style={{ left: 21 * 60 * pxPerMinute, width: 3 * 60 * pxPerMinute }} />
                </div>

                {/* 今日の現在時刻を示す縦線 */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] bg-[#ff453a]"
                    style={{ left: (now.getHours() * 60 + now.getMinutes()) * pxPerMinute }}
                  />
                )}

                {row.segments.map(seg => {
                  const color = eventColor(seg.event)
                  const left = seg.startMin * pxPerMinute
                  const width = Math.max(6, (seg.endMin - seg.startMin) * pxPerMinute)
                  const readOnly = seg.event.source === 'launch'
                  return (
                    <div
                      key={seg.key}
                      role="button"
                      tabIndex={0}
                      title={seg.event.title}
                      onPointerDown={e => !readOnly && beginDrag(e, seg.event, hitMode(e, EDGE_HIT_PX))}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onEventClick?.(seg.event)
                        }
                      }}
                      className={[
                        'absolute overflow-hidden whitespace-nowrap rounded-[4px] px-1.5 text-[0.66rem] font-semibold leading-[20px]',
                        readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                        seg.dragging ? 'opacity-70 shadow-[0_6px_18px_rgba(0,0,0,0.5)] ring-1 ring-white/40' : '',
                        seg.continuesBefore ? 'rounded-l-none' : '',
                        seg.continuesAfter ? 'rounded-r-none' : '',
                      ].filter(Boolean).join(' ')}
                      style={{
                        left,
                        width,
                        top: 5 + seg.lane * (LANE_HEIGHT + LANE_GAP),
                        height: LANE_HEIGHT,
                        background: color,
                        color: '#04101f',
                      }}
                    >
                      {seg.event.title}
                      {!readOnly && !seg.event.allDay && (
                        <>
                          <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" data-edge="start" />
                          <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" data-edge="end" />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** バーのどこを掴んだかで、移動かリサイズかを決める。 */
function hitMode(e, edgePx) {
  const rect = e.currentTarget.getBoundingClientRect()
  if (e.clientX - rect.left <= edgePx) return 'resize-start'
  if (rect.right - e.clientX <= edgePx) return 'resize-end'
  return 'move'
}

export default TimelineView

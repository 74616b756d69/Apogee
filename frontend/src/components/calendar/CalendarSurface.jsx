import { useCallback, useEffect, useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import jaLocale from '@fullcalendar/core/locales/ja'
import { eventColor } from '../../store/calendarStore'
import { snapToMinutes } from '../../utils/calendarDates'
import './calendar-theme.css'

const VIEW_BY_MODE = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
}

/**
 * ドラッグ中のスナップ間隔（分）。
 *
 * timeGrid のドラッグ位置は snapDuration ではなく slotDuration の格子に量子化される。
 * そこでスロット自体を最小刻み（5分）にしておき、確定時にこちら側で 15 分へ丸める。
 * Option を押している間は丸めを省き、5 分刻みのまま保存する。
 * 5分スロットのままだと目盛りが密になりすぎるので、罫線と時刻ラベルは CSS で間引く。
 */
const SLOT_DURATION = '00:05:00'
const COARSE_SNAP_MINUTES = 15

/**
 * 正規化イベント → FullCalendar のイベントオブジェクト。
 * 終日イベントの end は双方とも排他的なのでそのまま渡せる。
 */
function toFcEvent(event) {
  const color = eventColor(event)
  const isLaunch = event.source === 'launch'
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    backgroundColor: color,
    borderColor: color,
    textColor: pickTextColor(color),
    // 打ち上げ情報は外部データなので編集させない
    editable: !isLaunch && !event.pending,
    startEditable: !isLaunch && !event.pending,
    durationEditable: !isLaunch && !event.pending,
    classNames: [
      isLaunch ? 'apogee-launch' : 'apogee-event',
      event.pending ? 'apogee-pending' : '',
    ].filter(Boolean),
    extendedProps: { source: event.source, model: event },
  }
}

/** 背景色の明度から、読みやすい文字色を選ぶ。 */
function pickTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#04101f'
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#04101f' : '#f2f7ff'
}

function CalendarSurface({
  viewMode,
  currentDate,
  events,
  businessHours,
  showWeekNumbers,
  maxEventsPerDay,
  onSelectRange,
  onEventClick,
  onEventChange,
  onDatesChange,
  onViewDateChange,
  calendarRef,
}) {
  const innerRef = useRef(null)
  const api = () => innerRef.current?.getApi() ?? null

  // FullCalendar がコールバックに渡す jsEvent は、操作の種類によって
  // 修飾キーの状態を持たないことがある。自前で押下状態を追って判定に使う。
  const altHeldRef = useRef(false)
  useEffect(() => {
    const sync = e => { altHeldRef.current = e.altKey }
    const reset = () => { altHeldRef.current = false }
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const wantsFineSnap = jsEvent => altHeldRef.current || !!jsEvent?.altKey

  useEffect(() => {
    if (calendarRef) calendarRef.current = { getApi: api }
  }, [calendarRef])

  // 外部（ツールバー・ミニカレンダー）からの日付・ビュー変更を反映する。
  // FullCalendar は内部状態を持つので、prop ではなく命令的に同期させる。
  useEffect(() => {
    const cal = api()
    if (!cal) return
    const targetView = VIEW_BY_MODE[viewMode]
    if (targetView && cal.view.type !== targetView) cal.changeView(targetView)
  }, [viewMode])

  useEffect(() => {
    const cal = api()
    if (!cal || !currentDate) return
    if (cal.getDate().getTime() !== currentDate.getTime()) cal.gotoDate(currentDate)
  }, [currentDate])

  const fcEvents = useMemo(() => events.map(toFcEvent), [events])

  const handleSelect = useCallback(info => {
    const fine = wantsFineSnap(info.jsEvent)
    const coarse = date => (info.allDay || fine ? date : snapToMinutes(date, COARSE_SNAP_MINUTES))
    const start = coarse(info.start)
    let end = coarse(info.end)
    if (!info.allDay && end <= start) end = new Date(start.getTime() + COARSE_SNAP_MINUTES * 60000)

    onSelectRange?.({ start, end, allDay: info.allDay, jsEvent: info.jsEvent })
    api()?.unselect()
  }, [onSelectRange])

  const handleEventClick = useCallback(info => {
    const model = info.event.extendedProps.model
    if (!model || model.source === 'launch') return
    onEventClick?.(model, info.jsEvent, info.el)
  }, [onEventClick])

  /**
   * ドラッグ移動。ドロップ後に粗いスナップへ丸めてから確定する。
   * 楽観更新はストア側で行い、サーバーが拒否したら revert() で見た目を戻す。
   */
  const handleDrop = useCallback(info => {
    const model = info.event.extendedProps.model
    if (!model) { info.revert(); return }

    const allDay = info.event.allDay
    const fine = wantsFineSnap(info.jsEvent)
    let start = info.event.start
    let end = info.event.end ?? null

    if (!allDay && !fine) {
      // 移動では長さを保ちたいので、開始だけ丸めて終了は元の長さから決める
      const durationMs = end ? end - start : null
      start = snapToMinutes(start, COARSE_SNAP_MINUTES)
      end = durationMs != null ? new Date(start.getTime() + durationMs) : end
    }

    onEventChange?.({
      event: model,
      changes: { start, end: end ?? undefined, allDay },
      revert: info.revert,
    })
  }, [onEventChange])

  /** リサイズ。動かした側の端だけを丸め、もう一方は触らない。 */
  const handleResize = useCallback(info => {
    const model = info.event.extendedProps.model
    if (!model) { info.revert(); return }

    const allDay = info.event.allDay
    const fine = wantsFineSnap(info.jsEvent)
    let start = info.event.start
    let end = info.event.end ?? null

    if (!allDay && !fine) {
      const startMoved = model.start && start.getTime() !== model.start.getTime()
      if (startMoved) start = snapToMinutes(start, COARSE_SNAP_MINUTES)
      else if (end) end = snapToMinutes(end, COARSE_SNAP_MINUTES)
      if (end && end <= start) end = new Date(start.getTime() + COARSE_SNAP_MINUTES * 60000)
    }

    onEventChange?.({
      event: model,
      changes: { start, end: end ?? undefined, allDay },
      revert: info.revert,
    })
  }, [onEventChange])

  const handleDatesSet = useCallback(info => {
    onDatesChange?.({ start: info.start, end: info.end })
    // ツールバーの前後移動でも左パネルの日付表示を追随させる
    onViewDateChange?.(info.view.calendar.getDate())
  }, [onDatesChange, onViewDateChange])

  return (
    <div className="apogee-calendar">
      <FullCalendar
        ref={innerRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={VIEW_BY_MODE[viewMode] ?? 'dayGridMonth'}
        initialDate={currentDate}
        locale={jaLocale}
        headerToolbar={false}
        height="100%"
        expandRows

        events={fcEvents}
        eventOrder="start,-duration,allDay,title"

        /* 作成: セルクリック / ドラッグ範囲選択 */
        selectable
        selectMirror
        unselectAuto={false}
        select={handleSelect}

        /* 移動・リサイズ */
        editable
        eventResizableFromStart
        eventStartEditable
        eventDurationEditable
        eventDrop={handleDrop}
        eventResize={handleResize}
        eventClick={handleEventClick}
        dragScroll
        eventDragMinDistance={3}

        slotDuration={SLOT_DURATION}
        slotLabelInterval="01:00"
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="08:00:00"

        /* 営業時間外のグレーアウト */
        businessHours={businessHours}

        nowIndicator
        allDaySlot
        allDayText="終日"
        slotEventOverlap={false}
        weekNumbers={showWeekNumbers}
        weekNumberFormat={{ week: 'numeric' }}
        fixedWeekCount
        showNonCurrentDates
        dayMaxEvents={maxEventsPerDay}
        moreLinkClick="popover"
        moreLinkText={n => `+${n}件`}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}

        datesSet={handleDatesSet}
      />
    </div>
  )
}

export default CalendarSurface

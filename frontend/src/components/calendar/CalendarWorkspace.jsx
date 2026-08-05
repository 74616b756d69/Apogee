import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import CalendarSurface from './CalendarSurface'
import TimelineView, { ZOOM_STEPS } from './TimelineView'
import YearView from './YearView'
import QuickCreatePopover from './QuickCreatePopover'
import EventDetailModal from './EventDetailModal'
import RecurrenceScopeDialog from './RecurrenceScopeDialog'
import { LAUNCH_COLOR, useCalendarStore } from '../../store/calendarStore'
import {
  addDays,
  addMinutes,
  formatDateJa,
  startOfDay,
  startOfWeek,
  toDateKey,
} from '../../utils/calendarDates'

const VIEW_MODES = [
  { mode: 'day', label: '日' },
  { mode: 'week', label: '週' },
  { mode: 'month', label: '月' },
  { mode: 'timeline', label: 'タイムライン' },
  { mode: 'year', label: '年' },
]

/**
 * 1 日に表示するイベントの上限。
 *
 * true は「行の高さに収まるだけ表示し、あふれた分は +N件 にまとめる」という指定。
 * 数値にすると FullCalendar が unbalanced モードになり、イベント枠が行の高さを
 * 押し広げるため、予定の多い週だけ縦に広がって週ごとの高さが揃わなくなる。
 */
const DAY_MAX_EVENTS = true
const TIMELINE_DAYS = 7

/** 打ち上げ情報を、カレンダーと同じ形の読み取り専用イベントにする。 */
function launchToEvent(launch) {
  const start = launch.net ? new Date(launch.net) : null
  if (!start || Number.isNaN(start.getTime())) return null
  return {
    id: `launch-${launch.id}`,
    rawUid: null,
    title: launch.name,
    start,
    end: addMinutes(start, 60),
    allDay: false,
    calendarName: 'Launch',
    calendarColor: LAUNCH_COLOR,
    tagColor: null,
    location: launch.locationName ?? '',
    url: launch.webcastUrl ?? '',
    notes: '',
    rrule: null,
    recurring: false,
    recurrenceId: null,
    reminders: [],
    etag: null,
    source: 'launch',
  }
}

const CalendarWorkspace = forwardRef(function CalendarWorkspace(
  { onSelectDate, featuredLaunch, onJumpToLaunch },
  ref,
) {
  const events = useCalendarStore(s => s.events)
  const launches = useCalendarStore(s => s.launches)
  const collections = useCalendarStore(s => s.collections)
  const loading = useCalendarStore(s => s.loading)
  const error = useCalendarStore(s => s.error)
  const showLaunches = useCalendarStore(s => s.showLaunches)
  const showWeekNumbers = useCalendarStore(s => s.showWeekNumbers)
  const businessHoursEnabled = useCalendarStore(s => s.businessHoursEnabled)
  const businessHours = useCalendarStore(s => s.businessHours)
  const snapMinutes = useCalendarStore(s => s.snapMinutes)
  const setPref = useCalendarStore(s => s.setPref)
  const setSnapMinutes = useCalendarStore(s => s.setSnapMinutes)
  const loadRange = useCalendarStore(s => s.loadRange)
  const createEvent = useCalendarStore(s => s.createEvent)
  const updateEvent = useCalendarStore(s => s.updateEvent)
  const deleteEvent = useCalendarStore(s => s.deleteEvent)
  const clearError = useCalendarStore(s => s.clearError)

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('cal-view-mode') ?? 'month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [timelineZoom, setTimelineZoom] = useState(60)

  const [quickDraft, setQuickDraft] = useState(null)
  const [editing, setEditing] = useState(null)
  const [scopePrompt, setScopePrompt] = useState(null)
  const [busy, setBusy] = useState({ saving: false, deleting: false })

  const surfaceRef = useRef(null)

  useImperativeHandle(ref, () => ({
    /** 左パネルからカレンダーを特定の日へ送る。 */
    goToDate(date) {
      setCurrentDate(new Date(date))
      onSelectDate?.(date)
      if (viewMode === 'year') setViewMode('month')
    },
    /** アジェンダの行から、そのまま詳細編集を開く。 */
    openEvent(event) {
      if (!event || event.source === 'launch') return
      setEditing({ event, mode: 'edit' })
    },
  }), [onSelectDate, viewMode])

  useEffect(() => {
    localStorage.setItem('cal-view-mode', viewMode)
  }, [viewMode])

  // Option（Alt）押下で、タイムラインのスナップを 5 分刻みに切り替える。
  // 月/週/日グリッド側は CalendarSurface が確定時の altKey を直接見るため、ここでは扱わない。
  useEffect(() => {
    const sync = e => setSnapMinutes(e.altKey ? 5 : 15)
    const reset = () => setSnapMinutes(15)
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', reset)
    }
  }, [setSnapMinutes])

  // ── 表示範囲とデータ取得 ───────────────────────

  const timelineStart = useMemo(
    () => (viewMode === 'timeline' ? startOfWeek(currentDate) : null),
    [viewMode, currentDate],
  )

  useEffect(() => {
    if (viewMode === 'year') {
      const year = currentDate.getFullYear()
      loadRange(`${year}-01-01`, `${year + 1}-01-01`)
    } else if (viewMode === 'timeline' && timelineStart) {
      loadRange(toDateKey(timelineStart), toDateKey(addDays(timelineStart, TIMELINE_DAYS)))
    }
    // 月/週/日は FullCalendar の datesSet から実際の可視範囲を受け取る
  }, [viewMode, currentDate, timelineStart, loadRange])

  const handleDatesChange = useCallback(({ start, end }) => {
    loadRange(toDateKey(start), toDateKey(end))
  }, [loadRange])

  const visibleEvents = useMemo(() => {
    if (!showLaunches) return events
    return [...events, ...launches.map(launchToEvent).filter(Boolean)]
  }, [events, launches, showLaunches])

  // ── 作成・編集 ───────────────────────────────

  const handleSelectRange = useCallback(({ start, end, allDay, jsEvent }) => {
    setQuickDraft({
      start,
      end,
      allDay,
      calendarName: collections[0]?.name ?? null,
      location: '', url: '', notes: '', reminders: [], tagColor: null, rrule: null,
      anchor: jsEvent ? { x: jsEvent.clientX, y: jsEvent.clientY } : null,
    })
    onSelectDate?.(startOfDay(start))
  }, [collections, onSelectDate])

  const handleEventClick = useCallback(event => {
    // 打ち上げ情報は外部データなので編集画面を開かない
    if (!event || event.source === 'launch') return
    setEditing({ event, mode: 'edit' })
  }, [])

  /**
   * ドラッグ移動・リサイズの確定。繰り返しイベントは適用範囲を尋ねてから送る。
   * 尋ねている間の見た目は動かしたままにし、キャンセルされたら元に戻す。
   */
  const handleEventChange = useCallback(({ event, changes, revert }) => {
    if (event.recurring) {
      setScopePrompt({
        action: 'edit',
        onSelect: async scope => {
          setScopePrompt(null)
          const ok = await updateEvent(event, changes, scope)
          if (!ok) revert?.()
        },
        onCancel: () => {
          setScopePrompt(null)
          revert?.()
        },
      })
      return
    }
    updateEvent(event, changes).then(ok => { if (!ok) revert?.() })
  }, [updateEvent])

  const handleQuickSubmit = useCallback(draft => createEvent(withoutAnchor(draft)), [createEvent])

  const openDetailFromQuick = useCallback(draft => {
    setQuickDraft(null)
    setEditing({
      event: { ...withoutAnchor(draft), rawUid: null, source: 'calendar' },
      mode: 'create',
    })
  }, [])

  const saveFromModal = useCallback(async values => {
    const target = editing.event
    const run = async scope => {
      setBusy(b => ({ ...b, saving: true }))
      const ok = target.rawUid
        ? await updateEvent(target, values, scope)
        : await createEvent(values)
      setBusy(b => ({ ...b, saving: false }))
      if (ok) setEditing(null)
    }

    if (target.rawUid && target.recurring) {
      setScopePrompt({
        action: 'edit',
        onSelect: scope => { setScopePrompt(null); run(scope) },
        onCancel: () => setScopePrompt(null),
      })
      return
    }
    run(null)
  }, [editing, updateEvent, createEvent])

  const deleteFromModal = useCallback(() => {
    const target = editing.event
    const run = async scope => {
      setBusy(b => ({ ...b, deleting: true }))
      const ok = await deleteEvent(target, scope)
      setBusy(b => ({ ...b, deleting: false }))
      if (ok) setEditing(null)
    }

    if (target.recurring) {
      setScopePrompt({
        action: 'delete',
        onSelect: scope => { setScopePrompt(null); run(scope) },
        onCancel: () => setScopePrompt(null),
      })
      return
    }
    run('all')
  }, [editing, deleteEvent])

  // ── ツールバー ───────────────────────────────

  const step = useCallback(direction => {
    setCurrentDate(prev => {
      switch (viewMode) {
        case 'day': return addDays(prev, direction)
        case 'week': return addDays(prev, direction * 7)
        case 'timeline': return addDays(prev, direction * TIMELINE_DAYS)
        case 'year': return new Date(prev.getFullYear() + direction, prev.getMonth(), 1)
        default: return new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
      }
    })
  }, [viewMode])

  const goToday = useCallback(() => {
    const today = new Date()
    setCurrentDate(today)
    onSelectDate?.(today)
  }, [onSelectDate])

  const periodLabel = useMemo(() => {
    if (viewMode === 'year') return `${currentDate.getFullYear()}年`
    if (viewMode === 'month') return `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`
    if (viewMode === 'day') return `${currentDate.getFullYear()}年 ${formatDateJa(currentDate)}`
    const start = viewMode === 'timeline' ? timelineStart : startOfWeek(currentDate)
    const end = addDays(start, (viewMode === 'timeline' ? TIMELINE_DAYS : 7) - 1)
    return `${start.getFullYear()}年 ${formatDateJa(start, { withWeekday: false })} 〜 ${formatDateJa(end, { withWeekday: false })}`
  }, [viewMode, currentDate, timelineStart])

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {/* ツールバー */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="前へ" className={navButtonClass}>‹</button>
          <button type="button" onClick={goToday} className={`${navButtonClass} px-3 text-[0.72rem] font-bold`}>今日</button>
          <button type="button" onClick={() => step(1)} aria-label="次へ" className={navButtonClass}>›</button>
        </div>

        <p className="text-[0.86rem] font-bold text-body-text">{periodLabel}</p>

        {loading && <span className="text-[0.66rem] text-white/35">読み込み中…</span>}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {VIEW_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'cursor-pointer rounded-full border px-3 py-1 font-[inherit] text-[0.72rem] font-bold transition-colors',
                viewMode === mode
                  ? 'border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.18)] text-[rgba(var(--accent),0.95)]'
                  : 'border-sky-400/20 bg-white/5 text-muted hover:text-blue',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 表示オプション */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-white/45">
        <OptionToggle checked={showLaunches} onChange={v => setPref('showLaunches', v)}>打ち上げ</OptionToggle>
        {viewMode === 'month' && (
          <OptionToggle checked={showWeekNumbers} onChange={v => setPref('showWeekNumbers', v)}>週番号</OptionToggle>
        )}
        {(viewMode === 'week' || viewMode === 'day') && (
          <OptionToggle checked={businessHoursEnabled} onChange={v => setPref('businessHoursEnabled', v)}>
            営業時間外を暗く
          </OptionToggle>
        )}
        {featuredLaunch && (
          <button
            type="button"
            onClick={onJumpToLaunch}
            className="cursor-pointer rounded-full border border-[#e06a3a]/30 bg-[#e06a3a]/10 px-2.5 py-0.5 font-[inherit] text-[0.66rem] text-[#e8956a] transition-colors hover:bg-[#e06a3a]/20"
          >
            ▲ 次の打ち上げへ
          </button>
        )}
        <span className="ml-auto hidden sm:inline">
          ドラッグで移動・端をドラッグで長さ変更（Option を押しながらで5分刻み）
        </span>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[0.72rem] text-[#e08080]">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} aria-label="閉じる" className="cursor-pointer border-none bg-transparent text-[#e08080]">✕</button>
        </div>
      )}

      {/* 本体 */}
      <div className="min-h-0 flex-1">
        {viewMode === 'year' ? (
          <YearView
            year={currentDate.getFullYear()}
            events={visibleEvents}
            onSelectMonth={date => { setCurrentDate(date); setViewMode('month') }}
            onSelectDay={date => { setCurrentDate(date); onSelectDate?.(date); setViewMode('month') }}
          />
        ) : viewMode === 'timeline' ? (
          <TimelineView
            events={visibleEvents}
            rangeStart={timelineStart}
            dayCount={TIMELINE_DAYS}
            cellMinutes={timelineZoom}
            snapMinutes={snapMinutes}
            onZoomChange={z => setTimelineZoom(ZOOM_STEPS.includes(z) ? z : 60)}
            onEventClick={handleEventClick}
            onEventChange={handleEventChange}
            onSelectRange={handleSelectRange}
          />
        ) : (
          <CalendarSurface
            calendarRef={surfaceRef}
            viewMode={viewMode}
            currentDate={currentDate}
            events={visibleEvents}
            showWeekNumbers={showWeekNumbers}
            dayMaxEvents={DAY_MAX_EVENTS}
            businessHours={businessHoursEnabled
              ? { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: businessHours.start, endTime: businessHours.end }
              : false}
            onSelectRange={handleSelectRange}
            onEventClick={handleEventClick}
            onEventChange={handleEventChange}
            onDatesChange={handleDatesChange}
            onViewDateChange={date => setCurrentDate(prev => (
              prev.getTime() === date.getTime() ? prev : date
            ))}
          />
        )}
      </div>

      {quickDraft && (
        <QuickCreatePopover
          draft={quickDraft}
          collections={collections}
          onSubmit={handleQuickSubmit}
          onOpenDetail={openDetailFromQuick}
          onClose={() => setQuickDraft(null)}
        />
      )}

      {editing && (
        <EventDetailModal
          event={editing.event}
          collections={collections}
          saving={busy.saving}
          deleting={busy.deleting}
          error={error}
          onSave={saveFromModal}
          onDelete={deleteFromModal}
          onClose={() => setEditing(null)}
        />
      )}

      {scopePrompt && (
        <RecurrenceScopeDialog
          action={scopePrompt.action}
          onSelect={scopePrompt.onSelect}
          onCancel={scopePrompt.onCancel}
        />
      )}
    </div>
  )
})

/** ポップオーバーの表示位置はサーバーへ送らないので落とす。 */
function withoutAnchor(draft) {
  const payload = { ...draft }
  delete payload.anchor
  return payload
}

const navButtonClass =
  'cursor-pointer rounded-lg border border-sky-400/20 bg-white/5 px-2 py-1 font-[inherit] text-[0.9rem] leading-none text-muted transition-colors hover:text-blue'

function OptionToggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-3 w-3 cursor-pointer accent-[#7ab8ff]"
      />
      <span>{children}</span>
    </label>
  )
}

export default CalendarWorkspace

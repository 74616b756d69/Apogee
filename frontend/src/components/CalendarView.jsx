import { useEffect, useMemo, useRef, useState } from 'react'
import LaunchLoader from './LaunchLoader'
import CalendarWorkspace from './calendar/CalendarWorkspace'
import EventDetailModal from './calendar/EventDetailModal'
import { eventColor, useCalendarStore } from '../store/calendarStore'
import {
  addDays,
  addMinutes,
  formatDateJa,
  formatTimeJa,
  isSameDay,
  startOfDay,
} from '../utils/calendarDates'

const LAUNCH_REFRESH_MS = 5 * 60 * 1000

function formatLaunchTime(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch {
    return dateStr
  }
}

function formatLaunchDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch {
    return dateStr
  }
}

function formatUpdatedAt(date) {
  if (!date) return '未取得'
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Tokyo', hour12: false,
  }) + ' JST'
}

function calcCountdown(net) {
  if (!net) return null
  const diff = new Date(net).getTime() - Date.now()
  if (diff <= 0) return { launched: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    launched: false,
  }
}

function pad2(n) { return String(n).padStart(2, '0') }

/** その日にかかるイベントを、時刻順（終日を先頭）に並べる。 */
function eventsOnDay(events, day) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  return events
    .filter(e => e.start && (e.end ?? addMinutes(e.start, 60)) > dayStart && e.start < dayEnd)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return a.start - b.start
    })
}

function CalendarView({ isActive }) {
  const events = useCalendarStore(s => s.events)
  const launches = useCalendarStore(s => s.launches)
  const launchesUpdatedAt = useCalendarStore(s => s.launchesUpdatedAt)
  const collections = useCalendarStore(s => s.collections)
  const loading = useCalendarStore(s => s.loading)
  const error = useCalendarStore(s => s.error)
  const loadCollections = useCalendarStore(s => s.loadCollections)
  const loadLaunches = useCalendarStore(s => s.loadLaunches)
  const createEvent = useCalendarStore(s => s.createEvent)

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [countdown, setCountdown] = useState(null)
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)

  const workspaceRef = useRef(null)

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  useEffect(() => {
    loadLaunches()
    const id = setInterval(loadLaunches, LAUNCH_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadLaunches()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadLaunches])

  const featuredLaunch = launches[featuredIdx] ?? launches[0] ?? null

  useEffect(() => {
    if (!featuredLaunch?.net) return
    const tick = () => setCountdown(calcCountdown(featuredLaunch.net))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [featuredLaunch?.net])

  const dayEvents = useMemo(() => eventsOnDay(events, selectedDate), [events, selectedDate])
  const dayLaunches = useMemo(
    () => launches.filter(l => l.net && isSameDay(new Date(l.net), selectedDate)),
    [launches, selectedDate],
  )
  const totalEvents = dayEvents.length + dayLaunches.length

  const jumpToLaunch = () => {
    if (!featuredLaunch?.net) return
    const date = new Date(featuredLaunch.net)
    setSelectedDate(date)
    workspaceRef.current?.goToDate(date)
  }

  const openCreate = () => {
    const start = new Date(selectedDate)
    start.setHours(10, 0, 0, 0)
    setCreating({
      title: '',
      start,
      end: addMinutes(start, 60),
      allDay: false,
      calendarName: collections[0]?.name ?? null,
      location: '', url: '', notes: '', reminders: [], tagColor: null, rrule: null,
      rawUid: null,
      source: 'calendar',
    })
  }

  const submitCreate = async values => {
    setSaving(true)
    const ok = await createEvent(values)
    setSaving(false)
    if (ok) setCreating(null)
  }

  return (
    <div className="min-h-full flex flex-col bg-[#080d16] md:flex-row md:h-dvh md:overflow-hidden">

      {/* 左パネル: アジェンダ（上）+ 打ち上げ情報（下） */}
      <div className="order-2 flex flex-col md:order-1 md:w-[340px] md:shrink-0 md:overflow-hidden md:border-r md:border-[rgba(100,160,255,0.08)] md:bg-[#04080f]">

        <div className="px-5 pt-5 pb-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:bg-[rgba(4,8,16,0.97)] md:px-5 md:py-3.5">
          <div className="flex items-baseline justify-between mb-3.5 md:mb-2">
            <p className="text-[0.92rem] font-bold text-body-text">{formatDateJa(selectedDate)}</p>
            {totalEvents > 0 && (
              <span className="text-[0.72rem] font-semibold text-[rgba(var(--accent),0.8)]">{totalEvents}件</span>
            )}
          </div>

          {dayEvents.map(e => (
            <div
              className="relative pl-3.5 flex gap-3 items-center py-3 border-t border-[rgba(100,160,255,0.12)] rounded-[6px] transition-colors cursor-pointer hover:bg-white/[0.04]"
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => workspaceRef.current?.openEvent(e)}
              onKeyDown={ev => { if (ev.key === 'Enter') workspaceRef.current?.openEvent(e) }}
            >
              <span
                className="absolute left-0 top-4 bottom-4 w-[3px] rounded-sm"
                style={{ background: eventColor(e) }}
              />
              <div className="w-[38px] h-[38px] rounded-[9px] shrink-0 flex items-center justify-center bg-[rgba(var(--accent),0.12)] text-[10px]">
                <span className="leading-none" style={{ color: eventColor(e) }}>●</span>
              </div>
              <div className="flex-1 min-w-0">
                <b className="block text-[0.85rem] font-semibold text-body-text mb-0.5">{e.title}</b>
                <span className="block text-[0.75rem] text-meta">
                  {e.allDay ? '終日' : `${formatTimeJa(e.start)}〜${formatTimeJa(e.end)}`}
                  {e.recurring && ' · 繰り返し'}
                </span>
                {e.calendarName && <span className="text-[0.62rem] text-white/35 ml-0.5">{e.calendarName}</span>}
              </div>
            </div>
          ))}

          {dayLaunches.map(launch => (
            <div className="relative pl-3.5 flex gap-3 items-center py-3 border-t border-[rgba(100,160,255,0.12)]" key={launch.id}>
              <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-sm bg-[#e8c060]" />
              <div className="w-[38px] h-[38px] rounded-[9px] shrink-0 flex items-center justify-center p-0 overflow-hidden bg-[#0e1a2e]">
                {launch.imageUrl
                  ? <img src={launch.imageUrl} alt="" className="w-full h-full object-cover block" onError={e => { e.target.style.display = 'none' }} />
                  : <span className="text-[12px] text-[rgba(var(--accent),0.7)]">&#9650;</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <b className="block text-[0.85rem] font-semibold text-body-text mb-0.5">{launch.name}</b>
                <span className="block text-[0.75rem] text-meta">{[formatLaunchTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
              </div>
              {launch.statusName && (
                <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-[#7ab8ff]">
                  {launch.statusName}
                </span>
              )}
            </div>
          ))}

          {loading && totalEvents === 0 && <LaunchLoader />}

          {!loading && totalEvents === 0 && (
            <div className="py-14 text-center text-base text-muted">この日の予定はありません</div>
          )}

          <div className="h-[88px]" />
        </div>

        {/* 打ち上げアコーディオン (PC のみ表示) */}
        {featuredLaunch && (
          <div className="hidden md:flex md:flex-col md:shrink-0 md:border-t md:border-white/[0.08] md:max-h-[50vh]">
            <button
              className="flex items-center gap-2 w-full px-4 py-[10px] bg-transparent border-none text-[#c8daea] text-[0.78rem] font-[inherit] cursor-pointer text-left transition-colors hover:bg-white/[0.04]"
              onClick={() => setLaunchOpen(o => !o)}
            >
              <span className="text-[0.9rem]">&#9650;</span>
              <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{featuredLaunch.name}</span>
              <span className="text-[0.7rem] text-white/40">{launchOpen ? '▾' : '▸'}</span>
            </button>

            {launchOpen && (
              <div className="overflow-y-auto min-h-0">
                <div className="relative h-[280px] overflow-hidden">
                  {featuredLaunch.imageUrl && (
                    <img src={featuredLaunch.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, rgba(4,8,16,0.05) 0%, rgba(4,8,16,0.40) 38%, rgba(4,8,16,0.90) 68%, rgba(4,8,16,0.98) 100%)' }}
                  />
                  <div className="absolute inset-0 flex flex-col justify-end px-[22px] pb-5">
                    <div className="mb-[18px]">
                      <p className="text-[0.58rem] font-black tracking-[0.24em] text-[rgba(var(--accent),0.75)] mb-2.5">T − MINUS</p>
                      {countdown && !countdown.launched && (
                        <div className="flex items-start gap-1">
                          {[
                            { val: countdown.days, lbl: 'DAYS' },
                            { val: countdown.hours, lbl: 'HOURS' },
                            { val: countdown.minutes, lbl: 'MINS' },
                            { val: countdown.seconds, lbl: 'SECS', gold: true },
                          ].map(({ val, lbl, gold }, i) => (
                            <div key={lbl} className="flex items-start gap-1">
                              {i > 0 && (
                                <span className="font-mono text-[1.6rem] font-light text-[rgba(122,184,255,0.35)] leading-none pt-1 self-start">:</span>
                              )}
                              <div className="flex flex-col items-center gap-[5px] min-w-[46px]">
                                <span
                                  className={`font-mono text-[2.0rem] font-extrabold tracking-[-0.03em] leading-none ${gold ? 'text-[#e8c060]' : 'text-white'}`}
                                  style={{ textShadow: gold ? '0 0 22px rgba(232,192,96,0.55), 0 2px 10px rgba(0,0,0,0.9)' : '0 0 28px rgba(122,184,255,0.5), 0 2px 10px rgba(0,0,0,0.9)' }}
                                >
                                  {pad2(val)}
                                </span>
                                <span className="text-[0.58rem] font-bold tracking-[0.1em] text-white/40">{lbl}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {countdown?.launched && (
                        <p className="mt-[18px] text-[0.88rem] text-white/45 italic tracking-[0.04em]">LAUNCHED</p>
                      )}
                    </div>

                    <div className="border-t border-white/10 pt-3.5">
                      <p className="text-[0.56rem] font-extrabold tracking-[0.20em] text-[rgba(var(--accent),0.9)] mb-[5px]">NEXT LAUNCH</p>
                      <p className="text-[0.98rem] font-bold text-white mb-[5px] leading-[1.45]">{featuredLaunch.name}</p>
                      <p className="text-[0.70rem] text-white/55 mt-[1px]">{formatLaunchDate(featuredLaunch.net)}</p>
                      {featuredLaunch.locationName && (
                        <p className="text-[0.70rem] text-white/55 mt-[1px]">{featuredLaunch.locationName}</p>
                      )}
                      {featuredLaunch.webcastUrl && (
                        <a
                          className="inline-flex items-center gap-[7px] mt-[14px] px-[14px] py-[7px] bg-[rgba(var(--accent),0.10)] border border-[rgba(var(--accent),0.30)] rounded-[6px] text-[rgba(var(--accent),0.95)] text-[0.74rem] font-bold tracking-[0.02em] no-underline transition-colors hover:bg-[rgba(var(--accent),0.22)]"
                          href={featuredLaunch.webcastUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ▶ ライブ配信を見る
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {launches.length > 1 && (
                  <div className="flex flex-col gap-0.5 px-2 py-1 pb-2.5 max-h-[140px] overflow-y-auto">
                    {launches.map((l, i) => (
                      <button
                        key={l.id}
                        className={[
                          'flex items-center gap-2 w-full px-2.5 py-1.5 border-none rounded-[6px] text-[0.72rem] font-[inherit] cursor-pointer text-left transition-colors hover:bg-white/[0.06]',
                          i === featuredIdx
                            ? 'bg-[rgba(var(--accent),0.12)] text-[rgba(200,218,234,0.95)]'
                            : 'bg-transparent text-[rgba(200,218,234,0.7)]',
                        ].join(' ')}
                        onClick={() => setFeaturedIdx(i)}
                      >
                        <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{l.name}</span>
                        <span className="shrink-0 text-[0.65rem] text-white/35">{formatLaunchDate(l.net)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右パネル: カレンダー本体 */}
      <div className="order-1 flex min-h-[70vh] flex-col px-4 pt-2 md:order-2 md:min-h-0 md:flex-1 md:overflow-hidden md:bg-[rgba(8,14,26,0.6)] md:px-6 md:py-4">
        <p className="mb-1 shrink-0 text-[0.64rem] font-semibold tracking-[0.06em] text-white/45">
          打ち上げデータ最終更新: {formatUpdatedAt(launchesUpdatedAt)}
        </p>
        <div className="min-h-0 flex-1">
          <CalendarWorkspace
            ref={workspaceRef}
            onSelectDate={setSelectedDate}
            featuredLaunch={featuredLaunch}
            onJumpToLaunch={jumpToLaunch}
          />
        </div>
      </div>

      {/* FAB */}
      {isActive && (
        <button
          className="fixed bottom-[calc(52px+env(safe-area-inset-bottom))] right-[22px] w-[50px] h-[50px] rounded-full bg-[rgba(var(--accent),1)] border-none text-[rgba(var(--accent-text,4,16,31),1)] text-[1.7rem] leading-none cursor-pointer z-30 flex items-center justify-center shadow-[0_4px_18px_rgba(var(--accent),0.45)] transition-[transform,box-shadow] active:scale-[0.91] active:shadow-[0_2px_8px_rgba(var(--accent),0.3)] md:bottom-[50px] md:right-auto md:left-[calc(340px-66px)]"
          onClick={openCreate}
          aria-label="予定を追加"
        >
          +
        </button>
      )}

      {isActive && creating && (
        <EventDetailModal
          event={creating}
          collections={collections}
          saving={saving}
          deleting={false}
          error={error}
          onSave={submitCreate}
          onDelete={() => {}}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  )
}

export default CalendarView

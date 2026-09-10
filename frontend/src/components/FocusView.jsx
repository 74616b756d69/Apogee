// 勉強・作業中に開きっぱなしにするフォーカスモード。
// タイマーは App が持つポモドーロ state をそのまま使い、ここでは大きく見せるだけにする。
import { useState, useEffect, useRef, useMemo } from 'react'
import * as taskApi from '../api/taskApi'

const POMO_DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }

const MODE_LABEL = { work: '集中', short: '小休憩', long: '長休憩' }

const CURRENT_TASK_KEY = 'apogee.focus.currentTaskUid'

function formatSecs(secs) {
  const m = Math.floor(Math.max(secs, 0) / 60)
  const s = Math.max(secs, 0) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}時間${String(m).padStart(2, '0')}分` : `${m}分`
}

/** 'HH:mm' を今日の Date に変換する。表示は JST 前提。 */
function timeToDate(hhmm, base) {
  const [h, m] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

/** 開始時刻がまだ来ていない直近のイベント。全て終わっていれば null。 */
function pickNextEvent(events, now) {
  return events
    .filter(e => !e.allDay && e.startTime)
    .map(e => ({ ...e, startAt: timeToDate(e.startTime, now) }))
    .filter(e => e.startAt && e.startAt.getTime() > now.getTime())
    .sort((a, b) => a.startAt - b.startAt)[0] ?? null
}

function untilLabel(startAt, now) {
  const mins = Math.round((startAt.getTime() - now.getTime()) / 60000)
  if (mins < 60) return `あと ${mins} 分`
  const h = Math.floor(mins / 60)
  return `あと ${h} 時間 ${mins % 60} 分`
}

function Panel({ title, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <p className="mb-3 text-[0.58rem] font-extrabold tracking-[0.22em] text-[rgba(var(--accent),0.6)]">{title}</p>
      {children}
    </section>
  )
}

function FocusView({ pomo, setPomo, stats, onClose, calEvents }) {
  const [clock, setClock] = useState(() => new Date())
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [currentUid, setCurrentUid] = useState(() => {
    try { return localStorage.getItem(CURRENT_TASK_KEY) } catch { return null }
  })
  const [busyUid, setBusyUid] = useState(null)
  const wakeLockRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Esc でいつでも抜けられるようにしておく。
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 作業中に画面が消えないようにする。未対応ブラウザでは何もしない。
  useEffect(() => {
    let released = false
    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock?.request('screen')
      } catch { /* 取得できなくてもフォーカスモード自体は成立する */ }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      wakeLockRef.current?.release?.().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  const loadTasks = () => {
    taskApi.fetchTasks('today')
      .then(json => setTasks(Array.isArray(json) ? json : []))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false))
  }

  useEffect(loadTasks, [])

  useEffect(() => {
    try {
      if (currentUid) localStorage.setItem(CURRENT_TASK_KEY, currentUid)
      else localStorage.removeItem(CURRENT_TASK_KEY)
    } catch { /* プライベートモードなどでは保存できないが動作には支障ない */ }
  }, [currentUid])

  const openTasks = useMemo(() => tasks.filter(t => !t.completed), [tasks])
  const currentTask = openTasks.find(t => t.rawUid === currentUid) ?? null
  const otherTasks  = openTasks.filter(t => t.rawUid !== currentTask?.rawUid)
  const nextEvent   = useMemo(() => pickNextEvent(calEvents ?? [], clock), [calEvents, clock])

  const toggleTask = async task => {
    setBusyUid(task.rawUid)
    try {
      await taskApi.updateTask(task.rawUid, { completed: !task.completed })
      if (task.rawUid === currentUid) setCurrentUid(null)
      loadTasks()
    } catch { /* 失敗したら一覧を再取得して実際の状態に合わせる */
      loadTasks()
    } finally {
      setBusyUid(null)
    }
  }

  const total    = POMO_DURATIONS[pomo.mode]
  const progress = total > 0 ? 1 - pomo.secs / total : 0
  const R = 132
  const C = 2 * Math.PI * R
  const filledDots = pomo.mode === 'long' ? 4 : pomo.count % 4

  const skip = () => setPomo(p => {
    if (p.mode === 'work') {
      const count = p.count + 1
      const mode  = count % 4 === 0 ? 'long' : 'short'
      return { mode, secs: POMO_DURATIONS[mode], running: false, count }
    }
    return { mode: 'work', secs: POMO_DURATIONS.work, running: false, count: p.count }
  })

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-body text-body-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(18px+env(safe-area-inset-top))] sm:px-8">

        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[2rem] font-extralight leading-none tracking-[-0.02em] text-white/90 [font-variant-numeric:tabular-nums] sm:text-[2.6rem]">
              {clock.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hour12: false })}
            </p>
            <p className="mt-1.5 text-[0.72rem] font-semibold tracking-[0.08em] text-white/40">
              {clock.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' })}
            </p>
          </div>
          <button
            className="shrink-0 cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[0.72rem] font-bold tracking-[0.08em] text-white/60 transition-colors hover:border-[rgba(var(--accent),0.45)] hover:text-white"
            onClick={onClose}
          >
            終了 <span className="text-white/30">Esc</span>
          </button>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

          <div className="flex flex-col items-center justify-center gap-7 py-6">
            <div className="relative">
              <svg viewBox="0 0 300 300" className="h-[260px] w-[260px] -rotate-90 sm:h-[320px] sm:w-[320px]">
                <circle cx="150" cy="150" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
                <circle
                  cx="150" cy="150" r={R} fill="none"
                  stroke="rgba(var(--accent), 0.9)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="text-[0.6rem] font-extrabold tracking-[0.22em] text-[rgba(var(--accent),0.75)]">
                  {MODE_LABEL[pomo.mode]}
                </span>
                <span className="font-mono text-[3.6rem] font-extralight leading-none tracking-[-0.04em] text-white [font-variant-numeric:tabular-nums] sm:text-[4.6rem]">
                  {formatSecs(pomo.secs)}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full border transition-colors ${
                        i < filledDots
                          ? 'border-transparent bg-[rgba(var(--accent),0.85)]'
                          : 'border-white/18 bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="cursor-pointer rounded-full border border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.14)] px-8 py-3 text-[0.86rem] font-bold tracking-[0.06em] text-[rgba(var(--accent),1)] transition-[background,border-color] hover:bg-[rgba(var(--accent),0.24)]"
                onClick={() => setPomo(p => ({ ...p, running: !p.running }))}
              >
                {pomo.running ? '一時停止' : '開始'}
              </button>
              <button
                className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-5 py-3 text-[0.8rem] text-white/60 transition-colors hover:border-[rgba(var(--accent),0.45)] hover:text-white"
                onClick={() => setPomo(p => ({ ...p, secs: POMO_DURATIONS[p.mode], running: false }))}
              >
                リセット
              </button>
              <button
                className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-5 py-3 text-[0.8rem] text-white/60 transition-colors hover:border-[rgba(var(--accent),0.45)] hover:text-white"
                onClick={skip}
              >
                スキップ
              </button>
            </div>

            <div className="w-full max-w-md text-center">
              {currentTask ? (
                <div className="rounded-2xl border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.08)] px-5 py-4">
                  <p className="mb-2 text-[0.56rem] font-extrabold tracking-[0.22em] text-[rgba(var(--accent),0.8)]">いま取り組んでいること</p>
                  <p className="text-[1.05rem] font-bold leading-snug text-white">{currentTask.title}</p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[0.72rem] text-white/60 transition-colors hover:text-white disabled:opacity-40"
                      onClick={() => toggleTask(currentTask)}
                      disabled={busyUid === currentTask.rawUid}
                    >
                      完了にする
                    </button>
                    <button
                      className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[0.72rem] text-white/60 transition-colors hover:text-white"
                      onClick={() => setCurrentUid(null)}
                    >
                      解除
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[0.82rem] text-white/38">
                  {openTasks.length > 0 ? '右のリストから取り組むタスクを選んでください' : '今日のタスクはありません'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 pb-4">
            <Panel title="NEXT UP">
              {nextEvent ? (
                <>
                  <p className="font-mono text-[1.5rem] font-light leading-none tracking-[-0.02em] text-[rgba(var(--accent),0.95)] [font-variant-numeric:tabular-nums]">
                    {nextEvent.startTime}
                  </p>
                  <p className="mt-2 text-[0.92rem] font-semibold leading-snug text-white">{nextEvent.title}</p>
                  <p className="mt-1.5 text-[0.72rem] font-bold tracking-[0.06em] text-gold">
                    {untilLabel(nextEvent.startAt, clock)}
                  </p>
                </>
              ) : (
                <p className="text-[0.82rem] text-white/38">このあとの予定はありません</p>
              )}
            </Panel>

            <Panel title="TODAY'S TASKS" className="min-h-0 flex-1">
              {tasksLoading ? (
                <p className="text-[0.82rem] text-white/38">読み込み中…</p>
              ) : otherTasks.length > 0 ? (
                <ul className="flex list-none flex-col gap-1">
                  {otherTasks.map(task => (
                    <li key={task.rawUid} className="flex items-start gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]">
                      <button
                        className="mt-[3px] h-[16px] w-[16px] shrink-0 cursor-pointer rounded-full border border-white/30 transition-colors hover:border-[rgba(var(--accent),0.7)] disabled:opacity-40"
                        onClick={() => toggleTask(task)}
                        disabled={busyUid === task.rawUid}
                        aria-label="完了にする"
                      />
                      <button
                        className="min-w-0 flex-1 cursor-pointer text-left text-[0.84rem] font-semibold leading-snug text-[#e4edf7] transition-colors hover:text-[rgba(var(--accent),1)]"
                        onClick={() => setCurrentUid(task.rawUid)}
                      >
                        {task.title}
                        {task.scheduledStartTime && (
                          <span className="ml-2 font-mono text-[0.64rem] font-medium text-[rgba(var(--accent),0.8)]">
                            {task.scheduledStartTime}–{task.scheduledEndTime}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.82rem] text-white/38">未完了のタスクはありません</p>
              )}
            </Panel>

            <Panel title="TODAY'S FOCUS">
              <div className="flex items-end gap-8">
                <div>
                  <p className="font-mono text-[2rem] font-extralight leading-none text-white [font-variant-numeric:tabular-nums]">
                    {stats.sessions}
                  </p>
                  <p className="mt-1.5 text-[0.62rem] font-bold tracking-[0.1em] text-white/35">セッション</p>
                </div>
                <div>
                  <p className="font-mono text-[2rem] font-extralight leading-none text-white [font-variant-numeric:tabular-nums]">
                    {formatDuration(stats.focusSecs)}
                  </p>
                  <p className="mt-1.5 text-[0.62rem] font-bold tracking-[0.1em] text-white/35">合計集中時間</p>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FocusView

import { useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../api/taskApi'

const FILTERS = [
  { id: 'today',    label: '今日' },
  { id: 'open',     label: '未完了' },
  { id: 'upcoming', label: '予定' },
  { id: 'completed', label: '完了' },
]

const PRIORITY_LABEL = { HIGH: '高', MEDIUM: '中', LOW: '低' }

const PRIORITY_STYLE = {
  HIGH:   'border-rose-400/35 bg-rose-400/12 text-rose-200/90',
  MEDIUM: 'border-amber-400/35 bg-amber-400/12 text-amber-200/90',
  LOW:    'border-sky-400/25 bg-sky-400/10 text-sky-200/80',
}

function todayKey() {
  // 表示は JST 固定。サーバ側の期限判定と揃える。
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function formatDue(dueDate) {
  if (!dueDate) return null
  const today = todayKey()
  if (dueDate === today) return '今日'
  const diff = (new Date(dueDate) - new Date(today)) / 86400000
  if (diff === 1) return '明日'
  if (diff === -1) return '昨日'
  try {
    return new Date(dueDate).toLocaleDateString('ja-JP', {
      month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo',
    })
  } catch {
    return dueDate
  }
}

function TaskRow({ task, onToggle, onDelete, busy }) {
  const overdue = !task.completed && task.dueDate && task.dueDate < todayKey()
  const due = formatDue(task.dueDate)

  return (
    <li className={`group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04] ${busy ? 'opacity-50' : ''}`}>
      <button
        className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border text-[0.6rem] leading-none transition-[background,border-color] ${
          task.completed
            ? 'border-transparent bg-[rgba(var(--accent),0.85)] text-[rgb(var(--accent-text,4_16_31))]'
            : 'border-white/30 bg-transparent hover:border-[rgba(var(--accent),0.7)]'
        }`}
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={task.completed ? '未完了に戻す' : '完了にする'}
        aria-pressed={task.completed}
      >
        {task.completed ? '✓' : ''}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-[0.88rem] font-semibold leading-snug ${
          task.completed ? 'text-white/35 line-through' : 'text-[#e4edf7]'
        }`}>
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {due && (
            <span className={`text-[0.64rem] font-bold tracking-[0.04em] ${
              overdue ? 'text-rose-300/90' : 'text-white/38'
            }`}>
              {overdue ? `期限切れ · ${due}` : due}
            </span>
          )}
          {task.scheduledStartTime && (
            <span className="font-mono text-[0.64rem] font-medium tracking-[0.03em] text-[rgba(var(--accent),0.9)]">
              {task.scheduledStartTime}–{task.scheduledEndTime}
            </span>
          )}
          {PRIORITY_LABEL[task.priority] && (
            <span className={`rounded border px-1 py-px text-[0.58rem] font-bold ${PRIORITY_STYLE[task.priority]}`}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {task.calendarName && (
            <span className="flex items-center gap-1 text-[0.6rem] text-white/28">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: task.calendarColor || '#4a9eff' }}
              />
              {task.calendarName}
            </span>
          )}
        </div>
      </div>

      <button
        className="mt-0.5 shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[0.8rem] leading-none text-white/0 transition-colors hover:bg-rose-400/10 hover:text-rose-300/90 focus-visible:text-rose-300/90 group-hover:text-white/30"
        onClick={() => onDelete(task)}
        disabled={busy}
        aria-label={`「${task.title}」を削除`}
      >
        ×
      </button>
    </li>
  )
}

function TaskSection() {
  const [filter, setFilter]   = useState('today')
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [busyUid, setBusyUid] = useState(null)
  const [draft, setDraft]     = useState('')
  const [adding, setAdding]   = useState(false)

  // タブを素早く切り替えたとき、遅れて返ってきた古い応答で上書きされないようにする。
  const requestSeq = useRef(0)

  const load = useCallback((target = filter) => {
    const seq = ++requestSeq.current
    return api.fetchTasks(target)
      .then(json => {
        if (seq !== requestSeq.current) return
        setTasks(Array.isArray(json) ? json : [])
        setError(null)
      })
      .catch(err => {
        if (seq !== requestSeq.current) return
        setError(err.message || '読み込みに失敗しました')
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [filter])

  useEffect(() => {
    load(filter)
  }, [filter, load])

  const changeFilter = (next) => {
    if (next === filter) return
    setLoading(true)
    setFilter(next)
  }

  const handleToggle = async (task) => {
    const next = !task.completed
    // 楽観更新。CalDAV は往復が遅いので、先に画面へ反映する。
    setTasks(prev => prev.map(t => t.rawUid === task.rawUid ? { ...t, completed: next } : t))
    setBusyUid(task.rawUid)
    try {
      await api.updateTask(task.rawUid, { completed: next })
      await load()
    } catch (err) {
      setTasks(prev => prev.map(t => t.rawUid === task.rawUid ? { ...t, completed: !next } : t))
      setError(err.message || '更新に失敗しました')
    } finally {
      setBusyUid(null)
    }
  }

  const handleDelete = async (task) => {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return
    const snapshot = tasks
    setTasks(prev => prev.filter(t => t.rawUid !== task.rawUid))
    setBusyUid(task.rawUid)
    try {
      await api.deleteTask(task.rawUid)
    } catch (err) {
      setTasks(snapshot)
      setError(err.message || '削除に失敗しました')
    } finally {
      setBusyUid(null)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      // 「今日」タブから足したものがその場で消えないよう、期限を今日にしておく
      await api.createTask({ title, dueDate: filter === 'today' ? todayKey() : null })
      setDraft('')
      await load()
    } catch (err) {
      setError(err.message || '追加に失敗しました')
    } finally {
      setAdding(false)
    }
  }

  const remaining = tasks.filter(t => !t.completed).length

  return (
    <section className="flex flex-col gap-2.5 bg-[#06090f] px-4 pt-7 sm:px-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-[0.58rem] font-extrabold tracking-[0.22em] text-[rgba(var(--accent),0.5)]">TASKS</p>
        {!loading && remaining > 0 && (
          <span className="text-[0.62rem] font-semibold text-white/30">残り {remaining} 件</span>
        )}
      </div>

      <div className="mb-1 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-[0.68rem] font-bold transition-colors ${
              filter === f.id
                ? 'border-[rgba(var(--accent),0.55)] bg-[rgba(var(--accent),0.14)] text-[rgba(var(--accent),1)]'
                : 'border-sky-400/12 bg-white/[0.03] text-white/40 hover:border-sky-400/25 hover:text-white/70'
            }`}
            onClick={() => changeFilter(f.id)}
            aria-pressed={filter === f.id}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form className="mb-1 flex gap-2" onSubmit={handleAdd}>
        <input
          className="min-w-0 flex-1 rounded-xl border border-sky-400/12 bg-white/[0.03] px-3 py-2 font-[inherit] text-[0.82rem] text-[#e4edf7] outline-none transition-colors placeholder:text-white/25 focus:border-[rgba(var(--accent),0.45)]"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="タスクを追加"
          aria-label="タスクを追加"
          maxLength={200}
        />
        <button
          className="shrink-0 cursor-pointer rounded-xl border border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.14)] px-3.5 py-2 font-[inherit] text-[0.8rem] font-bold text-[rgba(var(--accent),1)] transition-[background,border-color] hover:bg-[rgba(var(--accent),0.24)] disabled:cursor-default disabled:opacity-40"
          type="submit"
          disabled={!draft.trim() || adding}
        >
          {adding ? '…' : '追加'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-rose-400/25 bg-rose-400/8 px-3 py-2 text-[0.72rem] text-rose-200/90">
          {error}
        </p>
      )}

      {loading ? (
        <p className="px-2.5 py-3 text-[0.8rem] text-white/30">読み込み中…</p>
      ) : tasks.length > 0 ? (
        <ul className="flex list-none flex-col gap-0.5">
          {tasks.map(task => (
            <TaskRow
              key={task.uid}
              task={task}
              onToggle={handleToggle}
              onDelete={handleDelete}
              busy={busyUid === task.rawUid}
            />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-3 text-[0.8rem] text-white/35">
          {filter === 'completed' ? '完了したタスクはありません' : 'タスクはありません'}
        </p>
      )}
    </section>
  )
}

export default TaskSection

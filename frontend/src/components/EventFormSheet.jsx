import { useRef, useEffect } from 'react'

function EventFormSheet({
  editingEvent, form, setForm, collections,
  submitting, deleting, submitError,
  onSubmit, onDelete, onClose,
}) {
  const titleRef = useRef(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [])

  return (
    <div
      className="fixed inset-0 z-80 flex items-end justify-center bg-black/65"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl rounded-t-[24px] border border-white/10 bg-[#0c1420] px-5 pb-6 pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15" />
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[1.05rem] font-bold text-[#dce8f5]">{editingEvent ? '予定を編集' : '新しい予定'}</p>
          <button className="rounded-lg px-2 py-1 text-[1.1rem] text-[#5a7a9a] transition hover:bg-white/5 hover:text-[#dce8f5]" onClick={onClose}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <input
            ref={titleRef}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-[#dce8f5] outline-none placeholder:text-[#4a6480] focus:border-sky-400/40"
            placeholder="タイトルを入力"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && onSubmit()}
          />

          {collections.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6a88a8]">カレンダー</label>
              <div className="flex flex-wrap gap-2">
                {collections.map(c => (
                  <button
                    key={c.name}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${form.calendarName === c.name ? 'border-sky-400/40 bg-sky-400/10 text-[#7ab8ff]' : 'border-white/10 bg-white/5 text-[#7a93b0] hover:bg-white/10 hover:text-[#dce8f5]'}`}
                    onClick={() => setForm(f => ({ ...f, calendarName: c.name }))}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6a88a8]">日付</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#dce8f5] outline-none focus:border-sky-400/40"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6a88a8]">時間</label>
              <label className="flex items-center gap-2 text-sm text-[#7a93b0]">
                <input
                  className="peer sr-only"
                  type="checkbox"
                  checked={form.allDay}
                  onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                />
                <span className="relative h-5 w-10 rounded-full bg-white/15 transition peer-checked:bg-sky-400/35 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-[#5a7a9a] after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-[#7ab8ff]" />
                <span>終日</span>
              </label>
            </div>
            {!form.allDay && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <span className="mb-1 block text-[0.7rem] uppercase tracking-[0.04em] text-[#5a7a9a]">開始</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#dce8f5] outline-none focus:border-sky-400/40"
                    type="time"
                    step="300"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <span className="pt-4 text-[#4a6480]">→</span>
                <div className="flex-1">
                  <span className="mb-1 block text-[0.7rem] uppercase tracking-[0.04em] text-[#5a7a9a]">終了</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#dce8f5] outline-none focus:border-sky-400/40"
                    type="time"
                    step="300"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {submitError && <p className="text-[0.8rem] text-[#e08080]">{submitError}</p>}
          <div className="mt-1 flex flex-col gap-2">
            <button
              className="rounded-xl bg-[#7ab8ff] px-4 py-3 font-semibold text-[#04101f] transition active:scale-[0.97] disabled:cursor-default disabled:opacity-35"
              onClick={onSubmit}
              disabled={submitting || deleting || !form.title.trim() || !form.date}
            >
              {submitting ? (editingEvent ? '更新中...' : '追加中...') : (editingEvent ? '更新' : '追加')}
            </button>
            {editingEvent && (
              <button
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 font-semibold text-[#e88080] transition active:scale-[0.97] disabled:cursor-default disabled:opacity-35"
                onClick={onDelete}
                disabled={deleting || submitting}
              >
                {deleting ? '削除中...' : '削除'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EventFormSheet

import { useEffect, useMemo, useState } from 'react'
import RecurrenceEditor from './RecurrenceEditor'
import {
  ColorPicker,
  DangerButton,
  Field,
  GhostButton,
  INPUT_CLASS,
  PrimaryButton,
  ReminderPicker,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from './formControls'
import {
  addDays,
  addMinutes,
  fromDateKey,
  fromDateTimeInput,
  toDateKey,
  toDateTimeInput,
} from '../../utils/calendarDates'

/**
 * 予定の詳細編集。作成・編集どちらもここで扱う。
 *
 * 終日イベントの終了日は、内部表現では排他的（翌日）だが、入力欄では
 * 「最終日」を見せる。境界の扱いをフォーム内に閉じ込め、外へは常に排他的な値を返す。
 */
function EventDetailModal({ event, collections, saving, deleting, error, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => toForm(event, collections))

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !saving && !deleting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving, deleting])

  const isNew = !event.rawUid
  const patch = changes => setForm(f => ({ ...f, ...changes }))

  const startDate = useMemo(
    () => (form.allDay ? fromDateKey(form.startDate) : fromDateTimeInput(form.startAt)) ?? new Date(),
    [form.allDay, form.startDate, form.startAt],
  )

  const handleAllDayToggle = allDay => {
    if (allDay) {
      const start = fromDateTimeInput(form.startAt) ?? new Date()
      const end = fromDateTimeInput(form.endAt) ?? start
      patch({ allDay: true, startDate: toDateKey(start), endDate: toDateKey(end) })
    } else {
      const start = fromDateKey(form.startDate)
      start.setHours(10, 0, 0, 0)
      patch({
        allDay: false,
        startAt: toDateTimeInput(start),
        endAt: toDateTimeInput(addMinutes(start, 60)),
      })
    }
  }

  const submit = () => {
    const values = fromForm(form)
    if (!values) return
    onSave(values)
  }

  const invalid = !form.title.trim()

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center"
      onMouseDown={e => { if (e.target === e.currentTarget && !saving && !deleting) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? '新しい予定' : '予定を編集'}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[24px] border border-white/10 bg-[#0c1420] shadow-2xl sm:rounded-[24px]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
          <p className="text-[1.02rem] font-bold text-[#dce8f5]">{isNew ? '新しい予定' : '予定を編集'}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[1.05rem] text-[#5a7a9a] transition hover:bg-white/5 hover:text-[#dce8f5]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <input
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base font-semibold text-[#dce8f5] outline-none placeholder:text-[#4a6480] focus:border-sky-400/40"
            placeholder="タイトルを入力"
            value={form.title}
            onChange={e => patch({ title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          />

          <div className="flex items-center justify-between">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#6a88a8]">日時</span>
            <Toggle checked={form.allDay} onChange={handleAllDayToggle}>終日</Toggle>
          </div>

          {form.allDay ? (
            <div className="flex items-end gap-2">
              <Field label="開始日">
                <input
                  className={INPUT_CLASS}
                  type="date"
                  value={form.startDate}
                  onChange={e => patch({
                    startDate: e.target.value,
                    endDate: e.target.value > form.endDate ? e.target.value : form.endDate,
                  })}
                />
              </Field>
              <span className="pb-3 text-[#4a6480]">→</span>
              <Field label="終了日">
                <input
                  className={INPUT_CLASS}
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={e => patch({ endDate: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Field label="開始">
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  step="300"
                  value={form.startAt}
                  onChange={e => {
                    const start = fromDateTimeInput(e.target.value)
                    const end = fromDateTimeInput(form.endAt)
                    patch({
                      startAt: e.target.value,
                      endAt: start && end && end <= start ? toDateTimeInput(addMinutes(start, 60)) : form.endAt,
                    })
                  }}
                />
              </Field>
              <span className="pb-3 text-[#4a6480]">→</span>
              <Field label="終了">
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  step="300"
                  min={form.startAt}
                  value={form.endAt}
                  onChange={e => patch({ endAt: e.target.value })}
                />
              </Field>
            </div>
          )}

          <RecurrenceEditor
            rrule={form.rrule}
            startDate={startDate}
            onChange={rrule => patch({ rrule })}
          />

          {collections.length > 0 && (
            <Select
              label="カレンダー"
              value={form.calendarName ?? ''}
              onChange={e => patch({ calendarName: e.target.value })}
            >
              {collections.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </Select>
          )}

          <TextInput
            label="場所"
            placeholder="例: 第1会議室"
            value={form.location}
            onChange={e => patch({ location: e.target.value })}
          />

          <TextInput
            label="URL"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={form.url}
            onChange={e => patch({ url: e.target.value })}
          />

          <TextArea
            label="メモ"
            placeholder="詳細を入力"
            value={form.notes}
            onChange={e => patch({ notes: e.target.value })}
          />

          <ReminderPicker value={form.reminders} onChange={reminders => patch({ reminders })} />

          <ColorPicker
            value={form.tagColor}
            fallbackColor={event.calendarColor}
            onChange={tagColor => patch({ tagColor })}
          />

          {error && <p className="text-[0.8rem] text-[#e08080]">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-5 py-3.5">
          {!isNew && (
            <DangerButton onClick={onDelete} disabled={saving || deleting}>
              {deleting ? '削除中…' : '削除'}
            </DangerButton>
          )}
          <div className="ml-auto flex gap-2">
            <GhostButton onClick={onClose} disabled={saving || deleting}>キャンセル</GhostButton>
            <PrimaryButton onClick={submit} disabled={invalid || saving || deleting}>
              {saving ? '保存中…' : isNew ? '追加' : '更新'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function toForm(event, collections) {
  const start = event.start ?? new Date()
  const end = event.end ?? addMinutes(start, 60)
  return {
    title: event.title ?? '',
    allDay: !!event.allDay,
    startDate: toDateKey(start),
    // 内部の end は排他的なので、表示上は 1 日戻して「最終日」にする
    endDate: toDateKey(event.allDay ? addDays(end, -1) : end),
    startAt: toDateTimeInput(start),
    endAt: toDateTimeInput(end),
    calendarName: event.calendarName ?? collections[0]?.name ?? null,
    location: event.location ?? '',
    url: event.url ?? '',
    notes: event.notes ?? '',
    reminders: event.reminders ?? [],
    tagColor: event.tagColor ?? null,
    rrule: event.rrule ?? null,
  }
}

function fromForm(form) {
  let start
  let end
  if (form.allDay) {
    start = fromDateKey(form.startDate)
    const lastDay = fromDateKey(form.endDate < form.startDate ? form.startDate : form.endDate)
    end = addDays(lastDay, 1) // サーバーへは排他的な終了日で渡す
  } else {
    start = fromDateTimeInput(form.startAt)
    end = fromDateTimeInput(form.endAt)
    if (!start) return null
    if (!end || end <= start) end = addMinutes(start, 60)
  }
  return {
    title: form.title.trim(),
    start,
    end,
    allDay: form.allDay,
    calendarName: form.calendarName || null,
    location: form.location.trim(),
    url: form.url.trim(),
    notes: form.notes,
    reminders: form.reminders,
    tagColor: form.tagColor,
    rrule: form.rrule || null,
  }
}

export default EventDetailModal

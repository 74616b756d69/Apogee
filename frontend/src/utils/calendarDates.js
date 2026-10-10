// カレンダー全体で使う日付ユーティリティ。
//
// 表示・入力はブラウザのローカルタイムゾーンで扱い、サーバーへは
// 時間指定イベントは UTC の ISO-8601、終日イベントは "YYYY-MM-DD" で送る。
// 終日を toISOString() で送ると UTC 変換で日付がずれるため、必ず使い分ける。

export const MS_PER_DAY = 86400000

export function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Date → "YYYY-MM-DD"（ローカル日付） */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "YYYY-MM-DD" → ローカル 0 時の Date */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Date → "HH:mm"（ローカル時刻） */
export function toTimeKey(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

export function startOfWeek(date, firstDay = 0) {
  const d = startOfDay(date)
  const diff = (d.getDay() - firstDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 分単位でスナップした新しい Date を返す。 */
export function snapToMinutes(date, minutes) {
  if (!minutes || minutes <= 0) return new Date(date)
  const d = new Date(date)
  d.setSeconds(0, 0)
  const snapped = Math.round(d.getMinutes() / minutes) * minutes
  d.setMinutes(0)
  return addMinutes(d, snapped)
}

/** サーバーへ送る開始・終了値。allDay かどうかで表現を切り替える。 */
export function toServerDateTime(date, allDay) {
  return allDay ? toDateKey(date) : date.toISOString()
}

/**
 * サーバーから来た start/end を Date にする。
 * 終日は "YYYY-MM-DD" なので、そのまま new Date() に渡すと UTC 解釈で
 * 前日にずれることがある。日付のみは明示的にローカル解釈する。
 */
export function parseServerDateTime(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fromDateKey(value)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function weekdayLabel(date) {
  return WEEKDAY_LABELS[date.getDay()]
}

export function formatDateJa(date, { withWeekday = true } = {}) {
  if (!date) return ''
  const base = `${date.getMonth() + 1}月${date.getDate()}日`
  return withWeekday ? `${base}（${weekdayLabel(date)}）` : base
}

export function formatTimeJa(date) {
  return date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : ''
}

/**
 * イベントの期間を「8月5日（水） 10:00 〜 11:00」のように整形する。
 * 終日イベントの end は排他的なので、表示では 1 日戻す。
 */
export function formatEventRange(start, end, allDay) {
  if (!start) return ''
  if (allDay) {
    const lastDay = end ? addDays(end, -1) : start
    return isSameDay(start, lastDay)
      ? `${formatDateJa(start)} 終日`
      : `${formatDateJa(start)} 〜 ${formatDateJa(lastDay)}`
  }
  if (!end) return `${formatDateJa(start)} ${formatTimeJa(start)}`
  return isSameDay(start, end)
    ? `${formatDateJa(start)} ${formatTimeJa(start)} 〜 ${formatTimeJa(end)}`
    : `${formatDateJa(start)} ${formatTimeJa(start)} 〜 ${formatDateJa(end)} ${formatTimeJa(end)}`
}

/** datetime-local input 用の "YYYY-MM-DDTHH:mm" */
export function toDateTimeInput(date) {
  return date ? `${toDateKey(date)}T${toTimeKey(date)}` : ''
}

export function fromDateTimeInput(value) {
  if (!value) return null
  const [datePart, timePart = '00:00'] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0)
}

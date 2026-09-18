// RFC 5545 の RRULE のうち、カレンダー UI で扱う範囲を解析・生成する。
// サーバー側が iCal4j で展開するため、ここでの責務は「文字列の組み立てと読み下し」に限る。

export const WEEKDAYS = [
  { code: 'SU', label: '日', index: 0 },
  { code: 'MO', label: '月', index: 1 },
  { code: 'TU', label: '火', index: 2 },
  { code: 'WE', label: '水', index: 3 },
  { code: 'TH', label: '木', index: 4 },
  { code: 'FR', label: '金', index: 5 },
  { code: 'SA', label: '土', index: 6 },
]

const WEEKDAY_BY_CODE = Object.fromEntries(WEEKDAYS.map(d => [d.code, d]))
const WEEKDAY_BY_INDEX = Object.fromEntries(WEEKDAYS.map(d => [d.index, d]))

const ORDINAL_LABELS = { 1: '第1', 2: '第2', 3: '第3', 4: '第4', '-1': '最終' }

/**
 * "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" → 構造化オブジェクト。
 * 空文字・null は「繰り返しなし」を表す null を返す。
 */
export function parseRRule(rrule) {
  if (!rrule || !rrule.trim()) return null
  const parts = {}
  for (const chunk of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [rawKey, rawValue] = chunk.split('=')
    if (!rawKey || rawValue === undefined) continue
    parts[rawKey.trim().toUpperCase()] = rawValue.trim()
  }
  if (!parts.FREQ) return null

  return {
    freq: parts.FREQ.toUpperCase(),
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map(s => s.trim()).filter(Boolean) : [],
    byMonthDay: parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY, 10) : null,
    byMonth: parts.BYMONTH ? parseInt(parts.BYMONTH, 10) : null,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? untilToDateInput(parts.UNTIL) : null,
  }
}

/** 構造化オブジェクト → "FREQ=...;..."。null / freq 無しなら null。 */
export function buildRRule(rule) {
  if (!rule || !rule.freq) return null
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`)
  if (rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay}`)
  if (rule.byMonth) parts.push(`BYMONTH=${rule.byMonth}`)

  // COUNT と UNTIL は RFC 上排他。UI 側でも終了条件は一つだけ選ばせる。
  if (rule.count) parts.push(`COUNT=${rule.count}`)
  else if (rule.until) parts.push(`UNTIL=${dateInputToUntil(rule.until)}`)

  return parts.join(';')
}

/** "20270331T145959Z" / "20270331" → "2027-03-31"（date input 用） */
export function untilToDateInput(until) {
  if (!until) return null
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(until)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** "2027-03-31" → "20270331T235959Z"（その日いっぱいを含める） */
export function dateInputToUntil(dateInput) {
  if (!dateInput) return null
  return `${dateInput.replace(/-/g, '')}T235959Z`
}

/** "2TU" → { ordinal: 2, code: 'TU' }、"MO" → { ordinal: null, code: 'MO' } */
export function splitByDay(token) {
  const m = /^(-?\d+)?([A-Z]{2})$/.exec(token)
  if (!m) return { ordinal: null, code: token }
  return { ordinal: m[1] ? parseInt(m[1], 10) : null, code: m[2] }
}

export function weekdayCodeFromDate(date) {
  return WEEKDAY_BY_INDEX[date.getDay()].code
}

/** その月の何番目の曜日か（1〜5）。 */
export function ordinalOfWeekdayInMonth(date) {
  return Math.floor((date.getDate() - 1) / 7) + 1
}

/**
 * 開始日から、UI のプリセット選択に対応する RRULE オブジェクトを作る。
 * preset: none | daily | weekly | monthly | monthlyNth | yearly | weekdays | custom
 */
export function ruleFromPreset(preset, startDate) {
  const base = { interval: 1, byDay: [], byMonthDay: null, byMonth: null, count: null, until: null }
  switch (preset) {
    case 'daily':
      return { ...base, freq: 'DAILY' }
    case 'weekdays':
      return { ...base, freq: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }
    case 'weekly':
      return { ...base, freq: 'WEEKLY', byDay: [weekdayCodeFromDate(startDate)] }
    case 'biweekly':
      return { ...base, freq: 'WEEKLY', interval: 2, byDay: [weekdayCodeFromDate(startDate)] }
    case 'monthly':
      return { ...base, freq: 'MONTHLY', byMonthDay: startDate.getDate() }
    case 'monthlyNth':
      return {
        ...base,
        freq: 'MONTHLY',
        byDay: [`${ordinalOfWeekdayInMonth(startDate)}${weekdayCodeFromDate(startDate)}`],
      }
    case 'yearly':
      return { ...base, freq: 'YEARLY', byMonth: startDate.getMonth() + 1, byMonthDay: startDate.getDate() }
    default:
      return null
  }
}

/** 既存の RRULE がどのプリセットに一致するかを判定する。一致しなければ 'custom'。 */
export function presetOfRule(rule, startDate) {
  if (!rule) return 'none'
  for (const preset of ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'monthlyNth', 'yearly']) {
    const candidate = ruleFromPreset(preset, startDate)
    if (!candidate) continue
    if (
      candidate.freq === rule.freq &&
      candidate.interval === rule.interval &&
      candidate.byDay.join(',') === (rule.byDay || []).join(',') &&
      (candidate.byMonthDay ?? null) === (rule.byMonthDay ?? null) &&
      (candidate.byMonth ?? null) === (rule.byMonth ?? null)
    ) {
      return preset
    }
  }
  return 'custom'
}

const FREQ_UNIT = { DAILY: '日', WEEKLY: '週間', MONTHLY: 'ヶ月', YEARLY: '年' }

/** RRULE を日本語の一行説明にする。 */
export function describeRRule(rrule) {
  const rule = typeof rrule === 'string' ? parseRRule(rrule) : rrule
  if (!rule) return '繰り返さない'

  const unit = FREQ_UNIT[rule.freq] ?? ''
  let head = rule.interval > 1 ? `${rule.interval}${unit}ごと` : `毎${unit === '週間' ? '週' : unit === 'ヶ月' ? '月' : unit}`

  if (rule.freq === 'WEEKLY' && rule.byDay?.length) {
    const days = rule.byDay.map(t => WEEKDAY_BY_CODE[splitByDay(t).code]?.label).filter(Boolean)
    if (days.length) head += ` ${days.join('・')}曜日`
  }

  if (rule.freq === 'MONTHLY') {
    if (rule.byMonthDay) {
      head += ` ${rule.byMonthDay}日`
    } else if (rule.byDay?.length) {
      const { ordinal, code } = splitByDay(rule.byDay[0])
      const ordLabel = ORDINAL_LABELS[String(ordinal)] ?? (ordinal ? `第${ordinal}` : '')
      head += ` ${ordLabel}${WEEKDAY_BY_CODE[code]?.label ?? ''}曜日`
    }
  }

  if (rule.freq === 'YEARLY' && rule.byMonth && rule.byMonthDay) {
    head += ` ${rule.byMonth}月${rule.byMonthDay}日`
  }

  if (rule.count) return `${head}（${rule.count}回）`
  if (rule.until) return `${head}（${rule.until} まで）`
  return head
}

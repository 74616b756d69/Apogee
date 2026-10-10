import { useMemo } from 'react'
import {
  WEEKDAYS,
  buildRRule,
  describeRRule,
  ordinalOfWeekdayInMonth,
  parseRRule,
  presetOfRule,
  ruleFromPreset,
  splitByDay,
  weekdayCodeFromDate,
} from '../../utils/rrule'
import { Field, INPUT_CLASS, LABEL_CLASS } from './formControls'

const PRESETS = [
  { value: 'none', label: '繰り返さない' },
  { value: 'daily', label: '毎日' },
  { value: 'weekdays', label: '平日（月〜金）' },
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly', label: '毎月（日付）' },
  { value: 'monthlyNth', label: '毎月（第n曜日）' },
  { value: 'yearly', label: '毎年' },
  { value: 'custom', label: 'カスタム' },
]

const FREQ_OPTIONS = [
  { value: 'DAILY', label: '日' },
  { value: 'WEEKLY', label: '週' },
  { value: 'MONTHLY', label: 'ヶ月' },
  { value: 'YEARLY', label: '年' },
]

/**
 * RRULE を組み立てる UI。
 * プリセットで大半のケースを覆い、外れるものだけカスタムに落とす。
 */
function RecurrenceEditor({ rrule, startDate, onChange }) {
  const rule = useMemo(() => parseRRule(rrule), [rrule])
  const preset = useMemo(() => presetOfRule(rule, startDate), [rule, startDate])

  const emit = next => onChange(buildRRule(next))

  const handlePreset = value => {
    if (value === 'none') return onChange(null)
    if (value === 'custom') {
      // カスタムへ切り替えるときは、現在の設定を出発点にする
      return emit(rule ?? ruleFromPreset('weekly', startDate))
    }
    const next = ruleFromPreset(value, startDate)
    // 終了条件は引き継ぐ
    emit({ ...next, count: rule?.count ?? null, until: rule?.until ?? null })
  }

  const endMode = rule?.count ? 'count' : rule?.until ? 'until' : 'never'

  const handleEndMode = mode => {
    if (!rule) return
    if (mode === 'never') emit({ ...rule, count: null, until: null })
    else if (mode === 'count') emit({ ...rule, count: rule.count ?? 10, until: null })
    else emit({ ...rule, count: null, until: rule.until ?? defaultUntil(startDate) })
  }

  const toggleWeekday = code => {
    const current = rule.byDay.map(t => splitByDay(t).code)
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code]
    // 全部外すと展開できないので、最低1つは残す
    emit({ ...rule, byDay: next.length ? sortWeekdays(next) : [weekdayCodeFromDate(startDate)] })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="繰り返し">
        <select
          className={`${INPUT_CLASS} cursor-pointer`}
          value={preset}
          onChange={e => handlePreset(e.target.value)}
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </Field>

      {preset === 'custom' && rule && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-end gap-2">
            <div className="w-20">
              <label className={LABEL_CLASS}>間隔</label>
              <input
                className={`${INPUT_CLASS} mt-1.5`}
                type="number"
                min="1"
                max="99"
                value={rule.interval}
                onChange={e => emit({ ...rule, interval: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div className="flex-1">
              <label className={LABEL_CLASS}>単位</label>
              <select
                className={`${INPUT_CLASS} mt-1.5 cursor-pointer`}
                value={rule.freq}
                onChange={e => emit(changeFreq(rule, e.target.value, startDate))}
              >
                {FREQ_OPTIONS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}ごと</option>
                ))}
              </select>
            </div>
          </div>

          {rule.freq === 'WEEKLY' && (
            <Field label="曜日">
              <div className="flex gap-1">
                {WEEKDAYS.map(day => {
                  const selected = rule.byDay.some(t => splitByDay(t).code === day.code)
                  return (
                    <button
                      key={day.code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(day.code)}
                      className={[
                        'h-8 w-8 cursor-pointer rounded-full border font-[inherit] text-[0.72rem] font-bold transition',
                        selected
                          ? 'border-sky-400/40 bg-sky-400/20 text-[#7ab8ff]'
                          : 'border-white/10 bg-white/5 text-[#7a93b0] hover:bg-white/10',
                      ].join(' ')}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          {rule.freq === 'MONTHLY' && (
            <Field label="基準">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => emit({ ...rule, byMonthDay: startDate.getDate(), byDay: [] })}
                  className={chipClass(!!rule.byMonthDay)}
                >
                  {startDate.getDate()}日
                </button>
                <button
                  type="button"
                  onClick={() => emit({
                    ...rule,
                    byMonthDay: null,
                    byDay: [`${ordinalOfWeekdayInMonth(startDate)}${weekdayCodeFromDate(startDate)}`],
                  })}
                  className={chipClass(!rule.byMonthDay && rule.byDay.length > 0)}
                >
                  第{ordinalOfWeekdayInMonth(startDate)}
                  {WEEKDAYS.find(d => d.code === weekdayCodeFromDate(startDate))?.label}曜日
                </button>
              </div>
            </Field>
          )}
        </div>
      )}

      {rule && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <label className={LABEL_CLASS}>終了</label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: 'never', label: '無期限' },
              { value: 'until', label: '指定日まで' },
              { value: 'count', label: 'N回で終了' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleEndMode(opt.value)}
                className={chipClass(endMode === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {endMode === 'until' && (
            <input
              className={INPUT_CLASS}
              type="date"
              value={rule.until ?? ''}
              onChange={e => emit({ ...rule, until: e.target.value || null, count: null })}
            />
          )}
          {endMode === 'count' && (
            <input
              className={INPUT_CLASS}
              type="number"
              min="1"
              max="999"
              value={rule.count ?? 1}
              onChange={e => emit({ ...rule, count: Math.max(1, Number(e.target.value) || 1), until: null })}
            />
          )}

          <p className="text-[0.7rem] text-[#6a88a8]">{describeRRule(rule)}</p>
        </div>
      )}
    </div>
  )
}

function chipClass(active) {
  return [
    'cursor-pointer rounded-full border px-3 py-1.5 font-[inherit] text-[0.72rem] transition',
    active
      ? 'border-sky-400/40 bg-sky-400/15 text-[#7ab8ff]'
      : 'border-white/10 bg-white/5 text-[#7a93b0] hover:bg-white/10',
  ].join(' ')
}

const WEEKDAY_ORDER = WEEKDAYS.map(d => d.code)
function sortWeekdays(codes) {
  return [...codes].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
}

/** 単位を変えたとき、その単位で意味を持たない条件を落としつつ既定値を入れる。 */
function changeFreq(rule, freq, startDate) {
  const next = { ...rule, freq, byDay: [], byMonthDay: null, byMonth: null }
  if (freq === 'WEEKLY') next.byDay = [weekdayCodeFromDate(startDate)]
  if (freq === 'MONTHLY') next.byMonthDay = startDate.getDate()
  if (freq === 'YEARLY') {
    next.byMonth = startDate.getMonth() + 1
    next.byMonthDay = startDate.getDate()
  }
  return next
}

function defaultUntil(startDate) {
  const d = new Date(startDate)
  d.setFullYear(d.getFullYear() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default RecurrenceEditor

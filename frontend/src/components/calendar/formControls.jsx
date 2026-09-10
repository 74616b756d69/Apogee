// 予定フォームで繰り返し使う小さな部品。既存の EventFormSheet と同じ見た目に揃えている。

export const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-[#dce8f5] outline-none placeholder:text-[#4a6480] focus:border-sky-400/40'

export const LABEL_CLASS =
  'text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#6a88a8]'

export function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className={LABEL_CLASS}>{label}</label>}
      {children}
      {hint && <p className="text-[0.65rem] text-[#4a6480]">{hint}</p>}
    </div>
  )
}

export function TextInput({ label, hint, ...props }) {
  return (
    <Field label={label} hint={hint}>
      <input className={INPUT_CLASS} {...props} />
    </Field>
  )
}

export function TextArea({ label, hint, ...props }) {
  return (
    <Field label={label} hint={hint}>
      <textarea className={`${INPUT_CLASS} min-h-[76px] resize-y`} {...props} />
    </Field>
  )
}

export function Select({ label, hint, children, ...props }) {
  return (
    <Field label={label} hint={hint}>
      <select className={`${INPUT_CLASS} cursor-pointer`} {...props}>
        {children}
      </select>
    </Field>
  )
}

export function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#7a93b0]">
      <input
        className="peer sr-only"
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="relative h-5 w-10 rounded-full bg-white/15 transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-[#5a7a9a] after:transition peer-checked:bg-sky-400/35 peer-checked:after:translate-x-5 peer-checked:after:bg-[#7ab8ff]" />
      <span>{children}</span>
    </label>
  )
}

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-xl border-none bg-[#7ab8ff] px-4 py-2.5 font-[inherit] font-semibold text-[#04101f] transition active:scale-[0.97] disabled:cursor-default disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-[inherit] text-sm text-[#7a93b0] transition hover:bg-white/10 hover:text-[#dce8f5] disabled:cursor-default disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 font-[inherit] font-semibold text-[#e88080] transition active:scale-[0.97] disabled:cursor-default disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  )
}

/** イベントの色分けタグ。null は「カレンダーの色に従う」。 */
export const TAG_COLORS = [
  { value: null, label: 'カレンダー既定' },
  { value: '#ff453a', label: 'レッド' },
  { value: '#ff9f0a', label: 'オレンジ' },
  { value: '#ffd60a', label: 'イエロー' },
  { value: '#32d74b', label: 'グリーン' },
  { value: '#64d2ff', label: 'シアン' },
  { value: '#0a84ff', label: 'ブルー' },
  { value: '#bf5af2', label: 'パープル' },
]

export function ColorPicker({ value, onChange, fallbackColor }) {
  return (
    <Field label="色分けタグ">
      <div className="flex flex-wrap gap-1.5">
        {TAG_COLORS.map(tag => {
          const selected = (value ?? null) === tag.value
          return (
            <button
              key={tag.label}
              type="button"
              title={tag.label}
              aria-label={tag.label}
              aria-pressed={selected}
              onClick={() => onChange(tag.value)}
              className={[
                'h-7 w-7 cursor-pointer rounded-full border-2 transition',
                selected ? 'border-white/80 scale-110' : 'border-transparent hover:border-white/30',
              ].join(' ')}
              style={{ background: tag.value ?? fallbackColor ?? '#4a9eff' }}
            />
          )
        })}
      </div>
    </Field>
  )
}

/** 通知（開始の何分前）。複数選択できる。 */
export const REMINDER_OPTIONS = [
  { value: 0, label: '開始時' },
  { value: 5, label: '5分前' },
  { value: 15, label: '15分前' },
  { value: 30, label: '30分前' },
  { value: 60, label: '1時間前' },
  { value: 120, label: '2時間前' },
  { value: 1440, label: '1日前' },
  { value: 2880, label: '2日前' },
  { value: 10080, label: '1週間前' },
]

export function ReminderPicker({ value = [], onChange }) {
  const toggle = minutes => {
    const next = value.includes(minutes)
      ? value.filter(v => v !== minutes)
      : [...value, minutes].sort((a, b) => a - b)
    onChange(next)
  }
  return (
    <Field label="通知" hint={value.length ? null : '通知なし'}>
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_OPTIONS.map(opt => {
          const selected = value.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(opt.value)}
              className={[
                'cursor-pointer rounded-full border px-2.5 py-1 font-[inherit] text-[0.72rem] transition',
                selected
                  ? 'border-sky-400/40 bg-sky-400/15 text-[#7ab8ff]'
                  : 'border-white/10 bg-white/5 text-[#7a93b0] hover:bg-white/10',
              ].join(' ')}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

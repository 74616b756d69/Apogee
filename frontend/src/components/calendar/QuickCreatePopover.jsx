import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatEventRange } from '../../utils/calendarDates'

const WIDTH = 264
const MARGIN = 12

/**
 * セルクリック／範囲選択の直後に出す、タイトルだけの最小フォーム。
 * Enter で即保存し、「詳細」で通常の編集モーダルへ引き継ぐ。
 */
function QuickCreatePopover({ draft, collections, onSubmit, onOpenDetail, onClose }) {
  const [title, setTitle] = useState('')
  const [calendarName, setCalendarName] = useState(draft.calendarName ?? collections[0]?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [position, setPosition] = useState(null)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // クリック位置の近くに出す。画面外へはみ出す場合は内側へ寄せる。
  useLayoutEffect(() => {
    const height = boxRef.current?.offsetHeight ?? 180
    const anchorX = draft.anchor?.x ?? window.innerWidth / 2
    const anchorY = draft.anchor?.y ?? window.innerHeight / 2
    const left = Math.min(Math.max(MARGIN, anchorX - WIDTH / 2), window.innerWidth - WIDTH - MARGIN)
    const below = anchorY + MARGIN
    const top = below + height > window.innerHeight - MARGIN
      ? Math.max(MARGIN, anchorY - height - MARGIN)
      : below
    setPosition({ left, top })
  }, [draft.anchor])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    const ok = await onSubmit({ ...draft, title: title.trim(), calendarName: calendarName || null })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-[70]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={boxRef}
        className="absolute rounded-2xl border border-white/12 bg-[#0c1420] p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
        style={{ width: WIDTH, left: position?.left ?? -9999, top: position?.top ?? -9999 }}
      >
        <p className="mb-2 text-[0.68rem] font-semibold text-[#6a88a8]">
          {formatEventRange(draft.start, draft.end, draft.allDay)}
        </p>

        <input
          ref={inputRef}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#dce8f5] outline-none placeholder:text-[#4a6480] focus:border-sky-400/40"
          placeholder="タイトルを入力"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
          }}
        />

        {collections.length > 1 && (
          <select
            className="mt-2 w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] text-[#dce8f5] outline-none focus:border-sky-400/40"
            value={calendarName}
            onChange={e => setCalendarName(e.target.value)}
          >
            {collections.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim() || saving}
            className="flex-1 cursor-pointer rounded-xl border-none bg-[#7ab8ff] px-3 py-2 font-[inherit] text-sm font-semibold text-[#04101f] transition active:scale-[0.97] disabled:cursor-default disabled:opacity-35"
          >
            {saving ? '追加中…' : '追加'}
          </button>
          <button
            type="button"
            onClick={() => onOpenDetail({ ...draft, title: title.trim(), calendarName: calendarName || null })}
            className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-[inherit] text-sm text-[#7a93b0] transition hover:bg-white/10 hover:text-[#dce8f5]"
          >
            詳細
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuickCreatePopover

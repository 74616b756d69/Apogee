import { useEffect } from 'react'

const SCOPES = [
  { value: 'this', label: 'このイベントのみ', hint: '他の回はそのまま残ります' },
  { value: 'thisAndFuture', label: 'このイベント以降をすべて', hint: 'これより前の回は変更されません' },
  { value: 'all', label: 'すべての繰り返し', hint: 'シリーズ全体に反映されます' },
]

/**
 * 繰り返しイベントを編集・削除するときの適用範囲を選ばせる。
 * Apple Calendar と同じ 3 択で、選択結果をそのままサーバーの editScope に渡す。
 */
function RecurrenceScopeDialog({ action = 'edit', onSelect, onCancel }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const verb = action === 'delete' ? '削除' : '変更'

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-5"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label={`繰り返し予定の${verb}範囲`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c1420] p-5 shadow-2xl">
        <p className="mb-1 text-[1rem] font-bold text-[#dce8f5]">繰り返し予定の{verb}</p>
        <p className="mb-4 text-[0.78rem] text-[#6a88a8]">どの範囲に{verb}を適用しますか？</p>

        <div className="flex flex-col gap-2">
          {SCOPES.map(scope => (
            <button
              key={scope.value}
              type="button"
              onClick={() => onSelect(scope.value)}
              className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left font-[inherit] transition hover:border-sky-400/40 hover:bg-sky-400/10"
            >
              <span className="block text-sm font-semibold text-[#dce8f5]">{scope.label}</span>
              <span className="block text-[0.68rem] text-[#6a88a8]">{scope.hint}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent px-4 py-2.5 font-[inherit] text-sm text-[#7a93b0] transition hover:bg-white/5"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

export default RecurrenceScopeDialog

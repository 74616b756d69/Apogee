import { useState } from 'react'
import LocationMapModal from './LocationMapModal'
import LaunchLoader from './LaunchLoader'

/** JST の日付キー (例: "2026-07-25") を返す */
function toJstDateKey(dateStr) {
  if (!dateStr) return null
  const jst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

/** 日付キーを「7月25日(土)」形式に変換 */
function formatDateHeading(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  return `${m}月${d}日(${weekday})`
}

function toTime(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    })
  } catch { return null }
}

/** ステータス名に応じてバッジの CSS クラスを返す */
function getStatusBadgeClass(status) {
  if (!status) return 'badge-default'
  const s = status.toLowerCase()
  if (s.includes('go') || s.includes('success')) return 'badge-success'
  if (s.includes('hold') || s.includes('fail'))  return 'badge-danger'
  if (s.includes('tbd') || s.includes('tbc'))    return 'badge-warning'
  return 'badge-default'
}

/** 過去の打ち上げを日付ごとのタイムラインで表示 */
function PreviousLaunchesView({ launches, loading, error }) {
  const [mapLaunch, setMapLaunch] = useState(null)

  if (loading) return <LaunchLoader />
  if (error)   return <div className="py-8 text-center text-[0.95rem] text-[#e08080]">データの取得に失敗しました: {error}</div>
  if (!launches?.length) return <div className="py-8 text-center text-[0.95rem] text-[#7a93b0]">データがありません</div>

  const groups = []
  for (const launch of launches) {
    const key = toJstDateKey(launch.net)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(launch)
    } else {
      groups.push({ key, items: [launch] })
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.key ?? 'unknown'}>
          <p className="mb-3 text-sm font-semibold text-[#dce8f5]">{group.key ? formatDateHeading(group.key) : '日時未定'}</p>
          <div className="space-y-3">
            {group.items.map(launch => (
              <button
                key={launch.id}
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10"
                onClick={() => setMapLaunch(launch)}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                  {launch.imageUrl
                    ? <img src={launch.imageUrl} alt="" className="h-full w-full object-cover" onError={e => { e.target.style.display = 'none' }} />
                    : <span className="text-[0.9rem] text-[#7ab8ff]">▲</span>
                  }
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <b className="block text-sm font-semibold text-[#e4edf7]">{launch.name}</b>
                  <span className="mt-1 block text-xs text-[#6a88a8]">{[toTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
                </div>
                {launch.statusName && (
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusBadgeClass(launch.statusName) === 'badge-success' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : getStatusBadgeClass(launch.statusName) === 'badge-danger' ? 'border-rose-400/30 bg-rose-500/10 text-rose-300' : getStatusBadgeClass(launch.statusName) === 'badge-warning' ? 'border-amber-400/30 bg-amber-500/10 text-amber-300' : 'border-sky-400/20 bg-sky-400/10 text-[#7ab8ff]'}`}>
                    {launch.statusName}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {mapLaunch && (
        <LocationMapModal launch={mapLaunch} onClose={() => setMapLaunch(null)} />
      )}
    </div>
  )
}

export default PreviousLaunchesView

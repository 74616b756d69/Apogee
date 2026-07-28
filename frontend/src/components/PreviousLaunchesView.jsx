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
  if (error)   return <div className="state-msg error">データの取得に失敗しました: {error}</div>
  if (!launches?.length) return <div className="state-msg">データがありません</div>

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
    <div className="timeline">
      {groups.map(group => (
        <div className="timeline-group" key={group.key ?? 'unknown'}>
          <p className="timeline-date">{group.key ? formatDateHeading(group.key) : '日時未定'}</p>
          {group.items.map(launch => (
            <button
              key={launch.id}
              className="launch-row timeline-row"
              onClick={() => setMapLaunch(launch)}
            >
              <div className="launch-thumb launch-thumb--img">
                {launch.imageUrl
                  ? <img src={launch.imageUrl} alt="" className="launch-row-img" onError={e => { e.target.style.display = 'none' }} />
                  : <span className="launch-thumb-icon">&#9650;</span>
                }
              </div>
              <div className="launch-info">
                <b>{launch.name}</b>
                <span>{[toTime(launch.net), launch.locationName].filter(Boolean).join(' · ')}</span>
              </div>
              {launch.statusName && (
                <span className={`badge ${getStatusBadgeClass(launch.statusName)}`}>{launch.statusName}</span>
              )}
            </button>
          ))}
        </div>
      ))}

      {mapLaunch && (
        <LocationMapModal launch={mapLaunch} onClose={() => setMapLaunch(null)} />
      )}
    </div>
  )
}

export default PreviousLaunchesView

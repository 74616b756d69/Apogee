import { useState } from 'react'
import LocationMapModal from './LocationMapModal'

/**
 * 打ち上げ1件分のカードコンポーネント
 */
function LaunchCard({ launch }) {
  const [showMap, setShowMap] = useState(false)
  const formattedDate = formatDate(launch.net)
  const badgeClass   = getStatusBadgeClass(launch.statusName)

  return (
    <article className="card">
      {/* 画像 */}
      {launch.imageUrl && (
        <img
          src={launch.imageUrl}
          alt={launch.name}
          className="card-image"
          onError={e => { e.target.style.display = 'none' }}
        />
      )}

      <div className="card-body">
        {/* タイトル + ステータスバッジ */}
        <div className="card-header">
          <div className="card-title-group">
            {launch.locationName && (
              <button
                className="info-icon-btn"
                aria-label="打ち上げ場所を地図で見る"
                onClick={() => setShowMap(true)}
              >
                i
              </button>
            )}
            <h3 className="card-title">{launch.name}</h3>
          </div>
          {launch.statusName && (
            <span className={`badge ${badgeClass}`}>{launch.statusName}</span>
          )}
        </div>

        {/* 詳細情報 */}
        <ul className="card-meta">
          {formattedDate  && <li>📅 {formattedDate}</li>}
          {launch.rocketName   && <li>🚀 {launch.rocketName}</li>}
          {launch.missionType  && <li>🎯 {launch.missionType}</li>}
          {launch.locationName && <li>📍 {launch.locationName}</li>}
        </ul>

        {/* ミッション説明 */}
        {launch.missionDescription && (
          <p className="card-desc">{launch.missionDescription}</p>
        )}
      </div>

      {showMap && (
        <LocationMapModal launch={launch} onClose={() => setShowMap(false)} />
      )}
    </article>
  )
}

/** ISO 8601 文字列を日本時間の読みやすい形式に変換 */
function formatDate(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year:   'numeric',
      month:  'long',
      day:    'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch {
    return dateStr
  }
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

export default LaunchCard

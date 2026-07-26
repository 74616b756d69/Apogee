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

/**
 * 打ち上げの詳細情報と場所を Google マップで表示するモーダル
 */
function LocationMapModal({ launch, onClose }) {
  const { padName, locationName, padLatitude, padLongitude, rocketName, missionType, statusName, net, missionDescription } = launch

  const hasCoords = padLatitude != null && padLongitude != null
  const mapSrc = hasCoords
    ? `https://www.google.com/maps?q=${padLatitude},${padLongitude}&z=15&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(padName || locationName)}&output=embed`

  const formattedDate = formatDate(net)

  return (
    <div className="map-modal-overlay" onClick={onClose}>
      <div className="map-modal" onClick={e => e.stopPropagation()}>
        <div className="map-modal-header">
          <span className="map-modal-title">📍 {padName || locationName}</span>
          <button className="map-modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <ul className="map-modal-meta">
          {formattedDate      && <li>📅 {formattedDate}</li>}
          {rocketName         && <li>🚀 {rocketName}</li>}
          {missionType        && <li>🎯 {missionType}</li>}
          {statusName         && <li>🛰️ {statusName}</li>}
          {locationName && locationName !== padName && <li>📍 {locationName}</li>}
        </ul>

        {missionDescription && (
          <p className="map-modal-desc">{missionDescription}</p>
        )}

        <iframe
          className="map-modal-frame"
          title={`${padName || locationName} の地図`}
          src={mapSrc}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  )
}

export default LocationMapModal

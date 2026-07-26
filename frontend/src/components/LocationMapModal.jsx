import { useEffect, useState } from 'react'
import LaunchLoader from './LaunchLoader'

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

/** ISO 8601 文字列を日本時間の日付のみに変換（ニュース記事用） */
function formatNewsDate(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo',
    })
  } catch {
    return dateStr
  }
}

/** 打ち上げに関連するニュース記事一覧（Spaceflight News API 経由） */
function NewsSection({ launchId }) {
  const [articles, setArticles] = useState(null)

  useEffect(() => {
    let cancelled = false
    setArticles(null)
    fetch(`/api/launches/${launchId}/news`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => { if (!cancelled) setArticles(json) })
      .catch(() => { if (!cancelled) setArticles([]) })
    return () => { cancelled = true }
  }, [launchId])

  return (
    <div className="map-modal-news">
      <p className="map-modal-news-label">関連ニュース</p>
      {articles === null ? (
        <LaunchLoader size="small" label="" />
      ) : articles.length === 0 ? (
        <p className="map-modal-news-empty">関連ニュースはまだありません</p>
      ) : (
        <ul className="map-modal-news-list">
          {articles.map(a => (
            <li key={a.id}>
              <a className="map-modal-news-item" href={a.url} target="_blank" rel="noreferrer">
                {a.imageUrl && <img src={a.imageUrl} alt="" className="map-modal-news-thumb" />}
                <div className="map-modal-news-body">
                  <p className="map-modal-news-title">{a.title}</p>
                  <p className="map-modal-news-meta">
                    {[a.newsSite, formatNewsDate(a.publishedAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 打ち上げの詳細情報・場所・関連ニュースを表示するモーダル
 */
function LocationMapModal({ launch, onClose }) {
  const { id, padName, locationName, padLatitude, padLongitude, rocketName, missionType, statusName, net, missionDescription } = launch

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

        <div className="map-modal-scroll">
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

          {id && <NewsSection launchId={id} />}
        </div>
      </div>
    </div>
  )
}

export default LocationMapModal

import { useEffect, useState } from 'react'
import LaunchLoader from './LaunchLoader'

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

function NewsSection({ launchId }) {
  const [articles, setArticles] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/launches/${launchId}/news`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => { if (!cancelled) setArticles(json) })
      .catch(() => { if (!cancelled) setArticles([]) })
    return () => { cancelled = true }
  }, [launchId])

  if (articles === null) return (
    <div className="border-t border-white/10 px-4 pb-4 pt-3">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#7ab8ff]">関連ニュース</p>
      <LaunchLoader size="small" label="" />
    </div>
  )

  if (articles.length === 0) return (
    <div className="border-t border-white/10 px-4 pb-4 pt-3">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#7ab8ff]">関連ニュース</p>
      <p className="py-1 text-[0.8rem] text-[#5d7188]">関連ニュースはまだありません</p>
    </div>
  )

  return (
    <div className="border-t border-white/10 px-4 pb-4 pt-3">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#7ab8ff]">関連ニュース</p>
      <ul className="flex flex-col gap-2.5">
        {articles.map(a => (
          <li key={a.id}>
            <a className="flex items-start gap-2.5 rounded-[10px] px-1.5 py-1.5 no-underline transition hover:bg-white/5" href={a.url} target="_blank" rel="noreferrer">
              {a.imageUrl && <img src={a.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <p className="text-[0.82rem] font-semibold leading-5 text-[#dce8f5]">{a.title}</p>
                <p className="mt-1 text-[0.7rem] text-[#6a88a8]">
                  {[a.newsSite, formatNewsDate(a.publishedAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LocationMapModal({ launch, onClose }) {
  const { id, padName, locationName, padLatitude, padLongitude,
          rocketName, missionType, statusName, net, missionDescription, webcastUrl } = launch

  const hasCoords = padLatitude != null && padLongitude != null
  const mapSrc = hasCoords
    ? `https://www.google.com/maps?q=${padLatitude},${padLongitude}&z=15&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(padName || locationName)}&output=embed`

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(4,8,14,0.72)] p-5 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-sky-400/25 bg-[#0c1420] shadow-[0_20px_60px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <span className="text-[0.9rem] font-semibold text-[#dce8f5]">{padName || locationName}</span>
          <button className="h-7 w-7 rounded-full bg-white/10 text-[1.1rem] text-[#dce8f5] transition hover:bg-white/15" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div className="overflow-y-auto">
          {webcastUrl && (
            <div className="px-4 pt-3">
              <a
                className="inline-flex items-center gap-2 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-[#7ab8ff]"
                href={webcastUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span className="text-xs">▶</span>
                ライブ配信・アーカイブを見る
              </a>
            </div>
          )}

          <ul className="flex flex-col gap-1 px-4 pt-3 text-[0.82rem] text-[#9db3c8]">
            {formatDate(net)                                 && <li>{formatDate(net)}</li>}
            {rocketName                                      && <li>{rocketName}</li>}
            {missionType                                     && <li>{missionType}</li>}
            {statusName                                      && <li>{statusName}</li>}
            {locationName && locationName !== padName        && <li>{locationName}</li>}
          </ul>

          {missionDescription && (
            <p className="px-4 pb-1 pt-2.5 text-[0.8rem] leading-6 text-[#7f95a8]">{missionDescription}</p>
          )}

          {id && <NewsSection launchId={id} />}

          <iframe
            className="mt-3 block h-[260px] w-full border-0"
            title={`${padName || locationName} の地図`}
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  )
}

export default LocationMapModal

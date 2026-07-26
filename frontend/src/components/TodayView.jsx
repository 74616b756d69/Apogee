import { useState, useEffect, useRef } from 'react'
import LocationMapModal from './LocationMapModal'
import LaunchLoader from './LaunchLoader'

const LAUNCH_PHASE_MS = 8000   // NEXT LAUNCH 表示時間
const TODAY_PHASE_MS  = 15000  // TODAY 表示時間

function extractDominantColor(imgEl) {
  try {
    const W = 80, H = 80
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgEl, 0, 0, W, H)
    const { data } = ctx.getImageData(0, 0, W, H)
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      if (lum > 30 && lum < 220) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++ }
    }
    if (!n) return null
    const avg = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
    const max = Math.max(avg.r, avg.g, avg.b)
    if (max < 80) {
      const f = 160 / Math.max(max, 1)
      return { r: Math.min(255, Math.round(avg.r * f)), g: Math.min(255, Math.round(avg.g * f)), b: Math.min(255, Math.round(avg.b * f)) }
    }
    return avg
  } catch { return null }
}

function calcCountdown(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return null
  const total = Math.floor(diff / 1000)
  return {
    days:    Math.floor(total / 86400),
    hours:   Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

function formatLaunchDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    }) + ' JST'
  } catch { return dateStr }
}

function formatDateFull(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    timeZone: 'Asia/Tokyo',
  })
}

function toLaunchDateParam(dateStr) {
  if (!dateStr) return null
  const jst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

function todayDateKey() {
  return toLaunchDateParam(new Date().toISOString())
}

function CountUnit({ n, label, gold }) {
  return (
    <div className="countdown-unit">
      <span className={`countdown-num${gold ? ' countdown-num--sec' : ''}`}>
        {String(n).padStart(2, '0')}
      </span>
      <span className="countdown-lbl">{label}</span>
    </div>
  )
}

// カウントダウンは自身のタイマーで秒ごとに更新する（親の再レンダリングを避けるため分離）
function Countdown({ net }) {
  const [countdown, setCountdown] = useState(() => calcCountdown(net))

  useEffect(() => {
    setCountdown(calcCountdown(net))
    if (!net) return
    const id = setInterval(() => setCountdown(calcCountdown(net)), 1000)
    return () => clearInterval(id)
  }, [net])

  if (!countdown) return null
  return (
    <div className="countdown hero-anim hero-anim--5">
      <CountUnit n={countdown.days}    label="DAYS"  />
      <span className="countdown-sep">:</span>
      <CountUnit n={countdown.hours}   label="HOURS" />
      <span className="countdown-sep">:</span>
      <CountUnit n={countdown.minutes} label="MINS"  />
      <span className="countdown-sep">:</span>
      <CountUnit n={countdown.seconds} label="SECS" gold />
    </div>
  )
}

function TodayView({ onColorDetected }) {
  const [launches, setLaunches]     = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [phase, setPhase]           = useState('launch')
  const [cycleKey, setCycleKey]     = useState(0)
  const [calEvents, setCalEvents]   = useState([])
  const [calLoading, setCalLoading] = useState(true)
  const [showMap, setShowMap]       = useState(false)
  const imgRef     = useRef(null)
  const pageRef    = useRef(null)

  const selectedLaunch = launches[selectedIdx] ?? null
  const heroUrl        = selectedLaunch?.imageUrl ?? null
  const launchDateKey  = toLaunchDateParam(selectedLaunch?.net)
  const isLaunchToday  = launchDateKey === todayDateKey()

  // ロケット情報を取得
  useEffect(() => {
    fetch('/api/launches/upcoming')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => setLaunches(json))
      .catch(() => {})
  }, [])

  // NEXT LAUNCH → TODAY → NEXT LAUNCH → ... をループ
  // データが揃ってから開始（ネットワーク遅延でフェーズが空振りしないよう）
  const dataLoaded = launches.length > 0
  useEffect(() => {
    if (!dataLoaded) return
    let id
    const cycle = (current) => {
      const duration = current === 'launch' ? LAUNCH_PHASE_MS : TODAY_PHASE_MS
      const next     = current === 'launch' ? 'today' : 'launch'
      id = setTimeout(() => { setPhase(next); cycle(next) }, duration)
    }
    cycle('launch')
    return () => clearTimeout(id)
  }, [cycleKey, dataLoaded])

  // バックグラウンド復帰時、間引かれていたタイマーが一気に発火して
  // フェーズが連続で切り替わるのを防ぐため、フォアグラウンド復帰時にクリーンな状態から再開する
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setPhase('launch')
      setCycleKey(k => k + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // カレンダー取得: 選択中の打ち上げが今日なら今日のカレンダー、それ以外は打ち上げ日のカレンダー
  useEffect(() => {
    setCalLoading(true)
    const url = isLaunchToday ? '/api/calendar/today' : `/api/calendar/date?date=${launchDateKey}`
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => setCalEvents(json))
      .catch(() => setCalEvents([]))
      .finally(() => setCalLoading(false))
  }, [isLaunchToday, launchDateKey])

  const handleLoad = () => {
    const color = extractDominantColor(imgRef.current)
    if (color) onColorDetected?.(color)
  }

  const handleCardSelect = (idx) => {
    setSelectedIdx(idx)
    setPhase('launch')
    setCycleKey(k => k + 1)
    setShowMap(false)
    // ページの先頭へスクロール
    pageRef.current?.closest('.page')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isToday = phase === 'today'

  return (
    <div className="today-view" ref={pageRef}>

      {/* ── ヒーローセクション（フルスクリーン） ── */}
      <div className="today-hero">
        {heroUrl ? (
          <img ref={imgRef} src={heroUrl} alt="" className="today-bg today-bg--img"
            crossOrigin="anonymous" onLoad={handleLoad} />
        ) : (
          <div className="today-bg today-bg--fallback" />
        )}
        <div className="today-scrim" />

        {/* Phase 1: NEXT LAUNCH + カウントダウン */}
        <div className={`hero-content hero-phase${isToday ? ' hero-phase--exit' : ''}`}>
          {selectedLaunch && (
            <>
              <p  className="hero-eyebrow hero-anim hero-anim--1">NEXT LAUNCH</p>
              <div className="hero-name-row hero-anim hero-anim--2">
                {selectedLaunch.locationName && (
                  <button
                    className="info-icon-btn info-icon-btn--hero"
                    aria-label="打ち上げ場所を地図で見る"
                    onClick={() => setShowMap(true)}
                  >
                    i
                  </button>
                )}
                <h2 className="hero-name">{selectedLaunch.name}</h2>
              </div>
              <p  className="hero-meta    hero-anim hero-anim--3">
                {[formatLaunchDate(selectedLaunch.net), selectedLaunch.locationName].filter(Boolean).join('  ·  ')}
              </p>
              <p className="countdown-label-t hero-anim hero-anim--4">T − MINUS</p>
              <Countdown net={selectedLaunch.net} />
            </>
          )}
        </div>

        {/* Phase 2: 打ち上げ日 + Appleカレンダー */}
        <div className={`hero-today hero-phase${isToday ? ' hero-phase--enter' : ''}`}>
          <p className="hero-eyebrow">{isLaunchToday ? 'TODAY' : 'LAUNCH DAY'}</p>
          <h1 className="hero-today-date">
            {formatDateFull(isLaunchToday ? null : selectedLaunch?.net)}
          </h1>
          {calLoading ? (
            <LaunchLoader size="small" label="" />
          ) : calEvents.length > 0 ? (
            <ul className="today-event-list">
              {calEvents.map((e, i) => (
                <li key={e.uid ?? i} className="today-event-item">
                  <span className="today-event-time">
                    {e.allDay ? '終日' : e.startTime}
                  </span>
                  <span className="today-event-title">{e.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="today-empty">今日の予定はありません</p>
          )}
        </div>

        {/* スクロールヒント */}
        {launches.length > 1 && (
          <div className="scroll-hint">
            <span className="scroll-hint-arrow">↓</span>
          </div>
        )}
      </div>

      {/* ── 下スクロールで見られる打ち上げリスト ── */}
      {launches.length > 1 && (
        <div className="upcoming-list">
          <p className="upcoming-list-label">UPCOMING LAUNCHES</p>
          {launches.map((launch, i) => {
            const isActive = selectedIdx === i
            return (
              <div
                key={launch.id}
                className={`upcoming-card${isActive ? ' upcoming-card--active' : ''}`}
                onClick={() => handleCardSelect(i)}
              >
                {launch.imageUrl && (
                  <img src={launch.imageUrl} alt="" className="upcoming-card-bg" />
                )}
                <div className="upcoming-card-overlay" />
                <div className="upcoming-card-body">
                  <span className="upcoming-card-index">{String(i + 1).padStart(2, '0')}</span>
                  <div className="upcoming-card-info">
                    {i === 0 && <p className="upcoming-card-nearest">NEAREST</p>}
                    <p className="upcoming-card-name">{launch.name}</p>
                    <p className="upcoming-card-date">{formatLaunchDate(launch.net)}</p>
                    {launch.locationName && (
                      <p className="upcoming-card-loc">{launch.locationName}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showMap && selectedLaunch?.locationName && (
        <LocationMapModal launch={selectedLaunch} onClose={() => setShowMap(false)} />
      )}
    </div>
  )
}

export default TodayView

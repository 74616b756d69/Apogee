import { useState, useEffect, useRef } from 'react'
import LocationMapModal from './LocationMapModal'
import LaunchLoader from './LaunchLoader'
import TaskSection from './TaskSection'

const LAUNCH_PHASE_MS = 8000
const TODAY_PHASE_MS  = 15000
const LAUNCH_REFRESH_MS = 5 * 60 * 1000

const HERO_ANIM = 'opacity-0 animate-slide-up [animation-fill-mode:both]'

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

function formatUpdatedAt(date) {
  if (!date) return '未取得'
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Tokyo',
    hour12: false,
  }) + ' JST'
}

function CountUnit({ n, label, gold }) {
  return (
    <div className="flex min-w-[62px] max-[480px]:min-w-11 flex-col items-center gap-[5px]">
      <span className={`font-mono text-[3.2rem] max-[480px]:text-[2.2rem] font-extrabold leading-none tracking-[-0.03em] ${
        gold
          ? 'text-gold [text-shadow:0_0_22px_rgba(232,192,96,0.55),0_2px_10px_rgba(0,0,0,0.9)]'
          : 'text-white [text-shadow:0_0_28px_rgba(122,184,255,0.5),0_2px_10px_rgba(0,0,0,0.9)]'
      }`}>
        {String(n).padStart(2, '0')}
      </span>
      <span className="text-[0.58rem] font-bold tracking-[0.1em] text-white/40">{label}</span>
    </div>
  )
}

function Countdown({ net }) {
  const [countdown, setCountdown] = useState(() => calcCountdown(net))

  useEffect(() => {
    if (!net) return
    const id = setInterval(() => setCountdown(calcCountdown(net)), 1000)
    return () => clearInterval(id)
  }, [net])

  if (!countdown) return null
  return (
    <div className={`flex items-start gap-1 ${HERO_ANIM} [animation-delay:1.5s]`}>
      <CountUnit n={countdown.days}    label="DAYS"  />
      <span className="self-start pt-1 font-mono text-[2.6rem] max-[480px]:text-[1.8rem] font-light leading-none text-[rgba(122,184,255,0.35)]">:</span>
      <CountUnit n={countdown.hours}   label="HOURS" />
      <span className="self-start pt-1 font-mono text-[2.6rem] max-[480px]:text-[1.8rem] font-light leading-none text-[rgba(122,184,255,0.35)]">:</span>
      <CountUnit n={countdown.minutes} label="MINS"  />
      <span className="self-start pt-1 font-mono text-[2.6rem] max-[480px]:text-[1.8rem] font-light leading-none text-[rgba(122,184,255,0.35)]">:</span>
      <CountUnit n={countdown.seconds} label="SECS" gold />
    </div>
  )
}

const POMO_DURATIONS_TV = { work: 25 * 60, short: 5 * 60, long: 15 * 60 }

function sectorPath(cx, cy, r, progress) {
  if (progress >= 0.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`
  }
  if (progress <= 0.001) return ''
  const endAngle = -Math.PI / 2 + progress * 2 * Math.PI
  const ex = (cx + r * Math.cos(endAngle)).toFixed(3)
  const ey = (cy + r * Math.sin(endAngle)).toFixed(3)
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${progress > 0.5 ? 1 : 0} 1 ${ex} ${ey} Z`
}

const POMO_SECTOR_FILL = {
  work:  'rgba(var(--accent), 0.50)',
  short: 'rgba(var(--accent), 0.32)',
  long:  'rgba(var(--accent), 0.22)',
}

function AnalogTimer({ secs, mode }) {
  const total = POMO_DURATIONS_TV[mode]
  const progress = total > 0 ? secs / total : 1
  const R = 44
  const d = sectorPath(60, 60, R, progress)

  return (
    <svg viewBox="0 0 120 120" className="h-[148px] w-[148px]">
      <circle cx="60" cy="60" r={R} fill="rgba(255,255,255,0.04)" />
      {d && <path d={d} fill={POMO_SECTOR_FILL[mode]} />}
      <circle cx="60" cy="60" r={R} fill="none"
        stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
    </svg>
  )
}

function TodayView({ onColorDetected, pomo, setPomo }) {
  const [launches, setLaunches]     = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [phase, setPhase]           = useState('launch')
  const [cycleKey, setCycleKey]     = useState(0)
  const [calEvents, setCalEvents]   = useState([])
  const [calLoading, setCalLoading] = useState(true)
  const [showMap, setShowMap]       = useState(false)
  const [launchKey, setLaunchKey]   = useState(0)
  const [launchUpdatedAt, setLaunchUpdatedAt] = useState(null)
  const [clock, setClock] = useState(() => new Date())
  const imgRef     = useRef(null)
  const pageRef    = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const selectedLaunch = launches[selectedIdx] ?? null
  const heroUrl        = selectedLaunch?.imageUrl ?? null

  const loadUpcomingLaunches = () => {
    fetch('/api/launches/upcoming', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => {
        setLaunches(Array.isArray(json) ? json : [])
        setLaunchUpdatedAt(new Date())
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadUpcomingLaunches()

    const id = setInterval(() => {
      loadUpcomingLaunches()
    }, LAUNCH_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadUpcomingLaunches()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setPhase('launch')
      setCycleKey(k => k + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!pomo.running || launches.length <= 1) return
    const id = setInterval(() => {
      setSelectedIdx(prev => (prev + 1) % launches.length)
      setLaunchKey(k => k + 1)
      setPhase('launch')
      setCycleKey(k => k + 1)
    }, LAUNCH_PHASE_MS + TODAY_PHASE_MS)
    return () => clearInterval(id)
  }, [pomo.running, launches.length])

  useEffect(() => {
    let cancelled = false
    fetch('/api/calendar/today')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => { if (!cancelled) setCalEvents(json) })
      .catch(() => { if (!cancelled) setCalEvents([]) })
      .finally(() => { if (!cancelled) setCalLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleLoad = () => {
    const color = extractDominantColor(imgRef.current)
    if (color) onColorDetected?.(color)
  }

  const handleCardSelect = (idx) => {
    setSelectedIdx(idx)
    setLaunchKey(k => k + 1)
    setPhase('launch')
    setCycleKey(k => k + 1)
    setShowMap(false)
    pageRef.current?.closest('.page')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isToday = phase === 'today'
  const phaseBase = 'absolute bottom-0 left-0 right-0 z-[2] will-change-[opacity,transform] transition-[opacity,transform] duration-[900ms] ease-in-out px-7 pb-[calc(52px+env(safe-area-inset-bottom))] sm:px-8 lg:px-10'

  return (
    <div className="flex min-h-full w-full flex-col bg-body" ref={pageRef}>

      <div className="relative h-dvh shrink-0 overflow-hidden">
        <p className="absolute right-5 top-4 z-[3] text-[0.62rem] font-semibold tracking-[0.06em] text-white/55 sm:right-7 sm:top-5">
          打ち上げデータ最終更新: {formatUpdatedAt(launchUpdatedAt)}
        </p>
        {heroUrl ? (
          <img
            key={`bg-${launchKey}`}
            ref={imgRef}
            src={heroUrl}
            alt=""
            className="absolute inset-0 z-0 h-full w-full origin-center animate-hero-reveal object-cover"
            crossOrigin="anonymous"
            onLoad={handleLoad}
          />
        ) : (
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#0b1a3b] via-[#1a2a6c] to-[#3a2f28]" />
        )}
        <div className="absolute inset-0 z-[1] translate-z-0 bg-gradient-to-b from-black/[0.08] via-black/[0.15] to-black/[0.94] will-change-[opacity]" />

        <div
          key={`hero-${launchKey}`}
          className={`${phaseBase} ${isToday ? 'pointer-events-none -translate-y-7 opacity-0' : ''}`}
        >
          {selectedLaunch && (
            <>
              <p className={`mb-2.5 text-[0.65rem] font-extrabold tracking-[0.2em] text-[rgba(var(--accent),0.9)] [text-shadow:0_0_14px_rgba(var(--accent),0.45)] ${HERO_ANIM} [animation-delay:0.2s]`}>
                NEXT LAUNCH
              </p>
              <div className={`mb-2 flex items-start gap-2 ${HERO_ANIM} [animation-delay:0.5s]`}>
                {selectedLaunch.locationName && (
                  <button
                    className="mt-1 flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/60 bg-white/12 p-0 font-[Georgia,'Times_New_Roman',serif] text-[0.85rem] font-bold italic leading-none text-white transition-[background,transform] duration-150 hover:scale-[1.08] hover:bg-white/25"
                    aria-label="打ち上げ場所を地図で見る"
                    onClick={() => setShowMap(true)}
                  >
                    i
                  </button>
                )}
                <h2 className="text-[clamp(1.4rem,4vw,2.1rem)] font-extrabold leading-tight tracking-[-0.01em] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.8)]">
                  {selectedLaunch.name}
                </h2>
              </div>
              <p className={`mb-6 text-[0.82rem] tracking-[0.02em] text-white/60 [text-shadow:0_1px_6px_rgba(0,0,0,0.7)] ${HERO_ANIM} [animation-delay:0.8s]`}>
                {[formatLaunchDate(selectedLaunch.net), selectedLaunch.locationName].filter(Boolean).join('  ·  ')}
              </p>
              <p className={`mb-2.5 mt-[22px] text-[0.62rem] font-extrabold tracking-[0.22em] text-[rgba(122,184,255,0.75)] [text-shadow:0_0_10px_rgba(122,184,255,0.4)] ${HERO_ANIM} [animation-delay:1.2s]`}>
                T − MINUS
              </p>
              <Countdown net={selectedLaunch.net} />
            </>
          )}
        </div>

        <div
          className={`${phaseBase} ${isToday ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-7 opacity-0'}`}
        >
          <p className="mb-2.5 text-[0.65rem] font-extrabold tracking-[0.2em] text-[rgba(var(--accent),0.9)] [text-shadow:0_0_14px_rgba(var(--accent),0.45)]">
            TODAY
          </p>
          <h1 className="mb-1.5 text-[clamp(1.6rem,5vw,2.4rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.8)] md:mr-[216px]">
            {formatDateFull(null)}
          </h1>
          {calLoading ? (
            <LaunchLoader size="small" label="" />
          ) : calEvents.length > 0 ? (
            <ul className="mt-4 flex list-none flex-col gap-2.5 border-t border-white/14 pt-3.5 md:mr-[216px]">
              {calEvents.map((e, i) => (
                <li key={e.uid ?? i} className="flex items-baseline gap-3">
                  <span className="min-w-9 shrink-0 whitespace-nowrap text-[0.72rem] font-bold tracking-[0.06em] text-[rgba(var(--accent),0.9)]">
                    {e.allDay ? '終日' : e.startTime}
                  </span>
                  <span className="text-[0.9rem] font-semibold leading-snug text-white">{e.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3.5 text-[0.84rem] text-white/42 md:mr-[216px]">今日の予定はありません</p>
          )}
        </div>

        {launches.length > 1 && (
          <div className="pointer-events-none absolute bottom-[calc(36px+env(safe-area-inset-bottom))] right-6 z-10">
            <span className="block animate-bounce-hint text-[1.1rem] text-white/45">↓</span>
          </div>
        )}

        {pomo && (
          <div className="absolute bottom-7 right-7 z-10 hidden w-44 flex-col items-center gap-2 p-3.5 md:flex">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[1.45rem] font-extralight leading-none tracking-[-0.02em] text-white/90 [font-variant-numeric:tabular-nums]">
                {clock.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo', hour12: false })}
              </span>
              <span className="text-[0.56rem] font-bold tracking-[0.14em] text-white/30">JST</span>
            </div>

            <AnalogTimer secs={pomo.secs} mode={pomo.mode} />

            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map(i => {
                const filled = pomo.mode === 'long' ? 4 : pomo.count % 4
                return (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full border transition-colors ${
                      i < filled
                        ? 'border-transparent bg-[rgba(var(--accent),0.85)]'
                        : 'border-white/18 bg-white/12'
                    }`}
                  />
                )
              })}
            </div>

            <div className="flex gap-1.5">
              <button
                className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border border-[rgba(var(--accent),0.4)] bg-[rgba(var(--accent),0.14)] text-[rgba(var(--accent),1)] text-[0.82rem] transition-[background,border-color] hover:border-[rgba(var(--accent),0.45)] hover:bg-[rgba(var(--accent),0.24)]"
                onClick={() => setPomo(p => ({ ...p, running: !p.running }))}
                aria-label={pomo.running ? '一時停止' : '開始'}
              >
                {pomo.running ? '⏸' : '▶'}
              </button>
              <button
                className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border border-sky-400/22 bg-white/5 text-[#b0c8e0] text-[0.82rem] transition-[background,border-color] hover:border-[rgba(var(--accent),0.45)] hover:bg-[rgba(var(--accent),0.08)]"
                onClick={() => setPomo(p => ({ ...p, secs: POMO_DURATIONS_TV[p.mode], running: false }))}
                aria-label="リセット"
              >
                ↺
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`bg-[#06090f] ${launches.length > 1 ? '' : 'pb-[calc(72px+env(safe-area-inset-bottom))]'}`}>
        <TaskSection />
      </div>

      {launches.length > 1 && (
        <div className="flex flex-col gap-2.5 bg-[#06090f] px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-7 sm:px-6">
          <p className="mb-2.5 text-[0.58rem] font-extrabold tracking-[0.22em] text-[rgba(var(--accent),0.5)]">UPCOMING LAUNCHES</p>
          {launches.map((launch, i) => {
            const isActive = selectedIdx === i
            return (
              <div
                key={launch.id}
                className={`relative h-[148px] cursor-pointer overflow-hidden rounded-[14px] bg-[#0b1422] transition-[box-shadow,transform] duration-200 active:scale-[0.98] ${
                  isActive ? 'shadow-[0_0_0_2px_rgba(var(--accent),0.8),0_0_24px_rgba(var(--accent),0.25)]' : ''
                }`}
                onClick={() => handleCardSelect(i)}
              >
                {launch.imageUrl && (
                  <img src={launch.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-[rgba(6,9,19,0.18)] via-[rgba(6,9,19,0.55)] to-[rgba(6,9,19,0.93)]" />
                <div className="absolute inset-0 flex items-end gap-3 p-4 px-[18px]">
                  <span className="select-none self-start pt-0.5 font-mono text-[3.4rem] font-extrabold leading-none tracking-[-0.05em] text-white/[0.05]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    {i === 0 && (
                      <p className="mb-1 text-[0.58rem] font-extrabold tracking-[0.16em] text-[rgba(var(--accent),0.9)]">NEAREST</p>
                    )}
                    <p className="mb-1.5 truncate text-[0.92rem] font-bold leading-snug text-[#e4edf7]">{launch.name}</p>
                    <p className="mb-0.5 font-mono text-[0.68rem] font-medium tracking-[0.03em] text-[rgba(var(--accent),0.95)]">
                      {formatLaunchDate(launch.net)}
                    </p>
                    {launch.locationName && (
                      <p className="truncate text-[0.67rem] text-white/28">{launch.locationName}</p>
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

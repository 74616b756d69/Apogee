import { useState, useEffect, useRef } from 'react'
import LaunchLoader from './LaunchLoader'

function StatCard({ value, label, sub, accent }) {
  return (
    <div className={`rounded-[14px] border p-4 ${accent ? 'border-sky-400/20 bg-sky-400/10' : 'border-white/10 bg-[#0d1829]'}`}>
      <span className="text-2xl font-semibold text-white">{value}</span>
      <span className="mt-1 block text-[0.9rem] text-[#dce8f5]">{label}</span>
      {sub && <span className="mt-1 block text-sm text-[#7a93b0]">{sub}</span>}
    </div>
  )
}

function BarItem({ rank, name, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  const fillRef = useRef(null)

  useEffect(() => {
    const el = fillRef.current
    if (!el) return
    requestAnimationFrame(() => { el.style.width = `${pct}%` })
  }, [pct])

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
      <span className="w-6 text-sm font-semibold text-[#7ab8ff]">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-[#e4edf7]">{name}</span>
          <span className="text-sm text-[#7ab8ff]">{count}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10">
          <div ref={fillRef} className="h-full rounded-full bg-[#7ab8ff] transition-[width] duration-500" style={{ width: 0 }} />
        </div>
      </div>
    </div>
  )
}

function StatsView() {
  const [previous, setPrevious] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/launches/previous').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/launches/upcoming').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([prev, up]) => {
      setPrevious(prev)
      setUpcoming(up)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="mx-auto w-full max-w-[1200px] px-4 py-6"><LaunchLoader /></div>

  const all = [...previous, ...upcoming]

  const successCount = previous.filter(l =>
    (l.statusName || '').toLowerCase().includes('success')
  ).length
  const successRate = previous.length > 0
    ? Math.round((successCount / previous.length) * 100)
    : null

  const rocketMap = {}
  for (const l of all) {
    if (!l.rocketName) continue
    rocketMap[l.rocketName] = (rocketMap[l.rocketName] || 0) + 1
  }
  const rocketRanking = Object.entries(rocketMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const maxRocket = rocketRanking[0]?.[1] ?? 1

  const missionMap = {}
  for (const l of all) {
    const t = l.missionType || '不明'
    missionMap[t] = (missionMap[t] || 0) + 1
  }
  const missionTypes = Object.entries(missionMap).sort((a, b) => b[1] - a[1])

  const statusMap = {}
  for (const l of upcoming) {
    const s = l.statusName || '不明'
    statusMap[s] = (statusMap[s] || 0) + 1
  }
  const upcomingStatuses = Object.entries(statusMap).sort((a, b) => b[1] - a[1])

  const locationMap = {}
  for (const l of all) {
    if (!l.locationName) continue
    locationMap[l.locationName] = (locationMap[l.locationName] || 0) + 1
  }
  const locationRanking = Object.entries(locationMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const maxLocation = locationRanking[0]?.[1] ?? 1

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-[calc(56px+env(safe-area-inset-bottom))]">
      <div className="mb-6">
        <p className="mb-2 text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-[#7ab8ff]">STATISTICS</p>
        <h2 className="text-2xl font-semibold text-white">打ち上げ統計</h2>
        <p className="mt-2 text-sm text-[#7a93b0]">直近データに基づく集計</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          value={upcoming.length}
          label="打ち上げ予定"
          sub="今後"
        />
        <StatCard
          value={previous.length}
          label="直近の実績"
          sub="過去2ヶ月"
        />
        <StatCard
          value={successRate !== null ? `${successRate}%` : '—'}
          label="成功率"
          sub={`${successCount} / ${previous.length}`}
          accent
        />
      </div>

      {rocketRanking.length > 0 && (
        <div className="mt-6 rounded-[14px] border border-white/10 bg-[#0d1829] p-4">
          <p className="mb-3 text-sm font-semibold text-[#dce8f5]">ロケット別打ち上げ数</p>
          <div className="space-y-3">
            {rocketRanking.map(([name, count], i) => (
              <BarItem key={name} rank={i + 1} name={name} count={count} max={maxRocket} />
            ))}
          </div>
        </div>
      )}

      {locationRanking.length > 0 && (
        <div className="mt-6 rounded-[14px] border border-white/10 bg-[#0d1829] p-4">
          <p className="mb-3 text-sm font-semibold text-[#dce8f5]">打ち上げ拠点ランキング</p>
          <div className="space-y-3">
            {locationRanking.map(([name, count], i) => (
              <BarItem key={name} rank={i + 1} name={name} count={count} max={maxLocation} />
            ))}
          </div>
        </div>
      )}

      {missionTypes.length > 0 && (
        <div className="mt-6 rounded-[14px] border border-white/10 bg-[#0d1829] p-4">
          <p className="mb-3 text-sm font-semibold text-[#dce8f5]">ミッションタイプ</p>
          <div className="flex flex-wrap gap-2">
            {missionTypes.map(([type, count]) => (
              <div key={type} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#dce8f5]">
                <span>{type}</span>
                <span className="text-[#7ab8ff]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcomingStatuses.length > 0 && (
        <div className="mt-6 rounded-[14px] border border-white/10 bg-[#0d1829] p-4">
          <p className="mb-3 text-sm font-semibold text-[#dce8f5]">打ち上げ予定の状況</p>
          <div className="flex flex-wrap gap-2">
            {upcomingStatuses.map(([status, count]) => (
              <div key={status} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#dce8f5]">
                <span>{status}</span>
                <span className="text-[#7ab8ff]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StatsView

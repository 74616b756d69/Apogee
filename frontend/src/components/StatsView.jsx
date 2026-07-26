import { useState, useEffect, useRef } from 'react'
import LaunchLoader from './LaunchLoader'

function StatCard({ value, label, sub, accent }) {
  return (
    <div className={`stat-card${accent ? ' stat-card--accent' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
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
    <div className="stats-bar-item">
      <span className="stats-bar-rank">{rank}</span>
      <div className="stats-bar-body">
        <div className="stats-bar-header">
          <span className="stats-bar-name">{name}</span>
          <span className="stats-bar-count">{count}</span>
        </div>
        <div className="stats-bar-track">
          <div ref={fillRef} className="stats-bar-fill" style={{ width: 0 }} />
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

  if (loading) return <div className="page-content"><LaunchLoader /></div>

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
    <div className="stats-view page-content">
      <div className="section-header">
        <p className="section-eyebrow">STATISTICS</p>
        <h2 className="section-title">打ち上げ統計</h2>
        <p className="section-sub">直近データに基づく集計</p>
      </div>

      <div className="stat-grid">
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
        <div className="stats-section">
          <p className="stats-section-label">ロケット別打ち上げ数</p>
          <div className="stats-bar-list">
            {rocketRanking.map(([name, count], i) => (
              <BarItem key={name} rank={i + 1} name={name} count={count} max={maxRocket} />
            ))}
          </div>
        </div>
      )}

      {locationRanking.length > 0 && (
        <div className="stats-section">
          <p className="stats-section-label">打ち上げ拠点ランキング</p>
          <div className="stats-bar-list">
            {locationRanking.map(([name, count], i) => (
              <BarItem key={name} rank={i + 1} name={name} count={count} max={maxLocation} />
            ))}
          </div>
        </div>
      )}

      {missionTypes.length > 0 && (
        <div className="stats-section">
          <p className="stats-section-label">ミッションタイプ</p>
          <div className="stats-type-wrap">
            {missionTypes.map(([type, count]) => (
              <div key={type} className="type-chip">
                <span className="type-chip-name">{type}</span>
                <span className="type-chip-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcomingStatuses.length > 0 && (
        <div className="stats-section">
          <p className="stats-section-label">打ち上げ予定の状況</p>
          <div className="stats-type-wrap">
            {upcomingStatuses.map(([status, count]) => (
              <div key={status} className="type-chip">
                <span className="type-chip-name">{status}</span>
                <span className="type-chip-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StatsView

import { useState, useEffect } from 'react'
import AgencyCard from './AgencyCard'
import LaunchLoader from './LaunchLoader'

function AgencyView() {
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/agencies')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => setAgencies(json))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search.trim()
    ? agencies.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.abbrev || '').toLowerCase().includes(search.toLowerCase())
      )
    : agencies

  return (
    <div className="agency-view page-content">
      <div className="section-header">
        <p className="section-eyebrow">ORGANIZATIONS</p>
        <h2 className="section-title">宇宙機関</h2>
        <p className="section-sub">打ち上げを手がける機関・企業一覧</p>
      </div>

      {!loading && agencies.length > 0 && (
        <div className="agency-search-wrap">
          <input
            className="agency-search"
            type="search"
            placeholder="名称・略称で検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <LaunchLoader />
      ) : filtered.length === 0 ? (
        <div className="state-msg">機関が見つかりません</div>
      ) : (
        <div className="grid">
          {filtered.map(agency => (
            <AgencyCard key={agency.id} agency={agency} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AgencyView

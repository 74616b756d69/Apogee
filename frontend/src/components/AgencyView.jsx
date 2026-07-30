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
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-[calc(56px+env(safe-area-inset-bottom))] sm:px-4">
      <div className="mb-6">
        <p className="mb-2 text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-[#7ab8ff]">ORGANIZATIONS</p>
        <h2 className="text-2xl font-semibold text-white">宇宙機関</h2>
        <p className="mt-2 text-sm text-[#7a93b0]">打ち上げを手がける機関・企業一覧</p>
      </div>

      {!loading && agencies.length > 0 && (
        <div className="mb-6">
          <input
            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#dce8f5] placeholder:text-[#6a88a8] focus:border-sky-400/40 focus:outline-none"
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
        <div className="py-14 text-center text-base text-[#7a93b0]">機関が見つかりません</div>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(agency => (
            <AgencyCard key={agency.id} agency={agency} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AgencyView

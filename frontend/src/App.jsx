import { useState, useEffect } from 'react'
import LaunchCard from './components/LaunchCard'
import AgencyCard from './components/AgencyCard'

const TABS = [
  { id: 'upcoming',  label: '🛸 打ち上げ予定',   endpoint: '/api/launches/upcoming' },
  { id: 'previous',  label: '📡 過去の打ち上げ',  endpoint: '/api/launches/previous' },
  { id: 'agencies',  label: '🏢 宇宙機関',        endpoint: '/api/agencies' },
]

function App() {
  const [activeTab, setActiveTab]   = useState('upcoming')
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  useEffect(() => {
    const tab = TABS.find(t => t.id === activeTab)
    if (!tab) return

    setLoading(true)
    setError(null)
    setData([])

    fetch(tab.endpoint)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => setData(json))
      .catch(err => setError(`データの取得に失敗しました: ${err.message}`))
      .finally(() => setLoading(false))
  }, [activeTab])

  return (
    <div className="app">
      {/* ヘッダー */}
      <header className="header">
        <h1>🚀 Space Launch Now</h1>
        <p>宇宙打ち上げ情報トラッカー</p>
      </header>

      {/* ナビゲーション */}
      <nav className="nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* メインコンテンツ */}
      <main className="main">
        {loading && <div className="state-msg">⏳ 読み込み中...</div>}
        {error   && <div className="state-msg error">{error}</div>}

        {!loading && !error && data.length === 0 && (
          <div className="state-msg">データがありません</div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="grid">
            {activeTab === 'agencies'
              ? data.map(agency  => <AgencyCard key={agency.id}  agency={agency}  />)
              : data.map(launch  => <LaunchCard key={launch.id}  launch={launch}  />)
            }
          </div>
        )}
      </main>
    </div>
  )
}

export default App

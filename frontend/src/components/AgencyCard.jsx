/**
 * 宇宙機関1件分のカードコンポーネント
 */
function AgencyCard({ agency }) {
  const logoSrc = agency.logoUrl || agency.imageUrl
  const desc    = agency.description
    ? agency.description.slice(0, 200) + (agency.description.length > 200 ? '…' : '')
    : null

  return (
    <article className="card">
      {/* ロゴ */}
      {logoSrc && (
        <div className="agency-logo-wrapper">
          <img
            src={logoSrc}
            alt={`${agency.name} logo`}
            className="agency-logo"
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
        </div>
      )}

      <div className="card-body">
        {/* 名称 + 略称バッジ */}
        <div className="card-header">
          <h3 className="card-title">{agency.name}</h3>
          {agency.abbrev && (
            <span className="badge badge-default">{agency.abbrev}</span>
          )}
        </div>

        {/* 詳細情報 */}
        <ul className="card-meta">
          {agency.type        && <li>🏛️ {agency.type}</li>}
          {agency.countryCode && <li>🌍 {agency.countryCode}</li>}
        </ul>

        {/* 説明文 */}
        {desc && <p className="card-desc">{desc}</p>}
      </div>
    </article>
  )
}

export default AgencyCard

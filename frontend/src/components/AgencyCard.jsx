function AgencyCard({ agency }) {
  const logoSrc = agency.logoUrl || agency.imageUrl
  const desc    = agency.description
    ? agency.description.slice(0, 200) + (agency.description.length > 200 ? '…' : '')
    : null

  return (
    <article className="card">
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
        <div className="card-header">
          <h3 className="card-title">{agency.name}</h3>
          {agency.abbrev && (
            <span className="badge badge-default">{agency.abbrev}</span>
          )}
        </div>

        <ul className="card-meta">
          {agency.type        && <li>{agency.type}</li>}
          {agency.countryCode && <li>{agency.countryCode}</li>}
        </ul>

        {desc && <p className="card-desc">{desc}</p>}
      </div>
    </article>
  )
}

export default AgencyCard

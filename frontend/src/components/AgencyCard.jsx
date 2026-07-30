function AgencyCard({ agency }) {
  const logoSrc = agency.logoUrl || agency.imageUrl
  const desc    = agency.description
    ? agency.description.slice(0, 200) + (agency.description.length > 200 ? '…' : '')
    : null

  return (
    <article className="group flex flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#0d1829] transition duration-200 hover:-translate-y-1 hover:border-sky-400/35 hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      {logoSrc && (
        <div className="flex min-h-[100px] items-center justify-center border-b border-white/10 bg-[#131f35] p-5">
          <img
            src={logoSrc}
            alt={`${agency.name} logo`}
            className="max-h-[72px] max-w-full object-contain brightness-110"
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-[0.95rem] font-semibold leading-5 text-[#dce8f5]">{agency.name}</h3>
          {agency.abbrev && (
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-[#7ab8ff]">
              {agency.abbrev}
            </span>
          )}
        </div>

        <ul className="flex list-none flex-col gap-1 text-[0.82rem] text-[#6a88a8]">
          {agency.type        && <li>{agency.type}</li>}
          {agency.countryCode && <li>{agency.countryCode}</li>}
        </ul>

        {desc && <p className="mt-auto text-[0.8rem] leading-6 text-[#556a80]">{desc}</p>}
      </div>
    </article>
  )
}

export default AgencyCard

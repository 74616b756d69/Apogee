/**
 * ロケットが軌道弧に沿って地球を通過するローディング演出
 */
function LaunchLoader({ label = '読み込み中...', size = 'default' }) {
  return (
    <div className={`launch-loader launch-loader--${size}`}>
      <svg className="launch-loader-svg" viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
        {/* 星 */}
        <g fill="#FFFFFF" stroke="none">
          <polygon className="loader-star" style={{ animationDelay: '0s' }}
            points="18,22 18.85,24.85 21,25.7 18.85,26.55 18,29.4 17.15,26.55 15,25.7 17.15,24.85" />
          <polygon className="loader-star" style={{ animationDelay: '0.6s' }}
            points="176,18 177.4,22.2 181,24 177.4,25.8 176,30 174.6,25.8 171,24 174.6,22.2" />
          <polygon className="loader-star" style={{ animationDelay: '1.2s' }}
            points="30,115 30.85,117.85 33,118.7 30.85,119.55 30,122.4 29.15,119.55 27,118.7 29.15,117.85" />
          <polygon className="loader-star" style={{ animationDelay: '0.3s' }}
            points="185,105 186.1,108.1 189,109 186.1,109.9 185,113 183.9,109.9 181,109 183.9,108.1" />
          <polygon className="loader-star" style={{ animationDelay: '1.5s' }}
            points="100,14 100.55,15.55 102,16 100.55,16.45 100,18 99.45,16.45 98,16 99.45,15.55" />
          <polygon className="loader-star" style={{ animationDelay: '0.9s' }}
            points="8,70 8.55,71.55 10,72 8.55,72.45 8,74 7.45,72.45 6,72 7.45,71.55" />
        </g>

        {/* 軌道弧 */}
        <path
          id="loader-orbit-path"
          className="loader-orbit"
          d="M20 100 A80 60 0 0 1 180 100"
          fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="5 6" strokeLinecap="round"
        />

        {/* 地球 */}
        <g className="loader-earth" transform="translate(76,72) scale(0.4)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="60" cy="60" r="48" stroke="#FFFFFF" strokeWidth="2.5" />
          <path d="M12 60 C30 78, 90 78, 108 60" stroke="#FFFFFF" strokeWidth="2.5" />
          <path d="M60 12 C40 30, 40 90, 60 108" stroke="#dce8f5" strokeWidth="2" />
          <path d="M42 30 C36 34, 34 42, 40 46 C46 48, 50 44, 54 48 C58 52, 52 58, 46 56 C40 54, 34 58, 38 64" stroke="#dce8f5" strokeWidth="2" />
          <path d="M74 40 C80 38, 88 42, 86 50 C84 56, 90 60, 86 66 C82 70, 74 68, 72 62" stroke="#dce8f5" strokeWidth="2" />
          <path d="M50 78 C56 76, 64 78, 62 84 C60 90, 66 94, 60 96" stroke="#dce8f5" strokeWidth="2" />
        </g>

        {/* ロケット（軌道弧に沿って周回） */}
        <g transform="scale(0.22) rotate(90) translate(-40,-80)"
           fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 6 C50 22, 56 40, 56 58 L56 128 L24 128 L24 58 C24 40, 30 22, 40 6 Z" />
          <line x1="24" y1="90" x2="56" y2="90" />
          <circle cx="40" cy="46" r="7" />
          <path d="M27 98 L10 132 L27 118 Z" />
          <path d="M53 98 L70 132 L53 118 Z" />
          <path d="M24 108 L6 148 L24 130 Z" />
          <path d="M56 108 L74 148 L56 130 Z" />
          <path d="M30 128 L26 140 L54 140 L50 128 Z" />

          <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto" calcMode="linear"
            keyPoints="0;1;0" keyTimes="0;0.5;1">
            <mpath href="#loader-orbit-path" />
          </animateMotion>
        </g>
      </svg>
      {label && <p className="launch-loader-label">{label}</p>}
    </div>
  )
}

export default LaunchLoader

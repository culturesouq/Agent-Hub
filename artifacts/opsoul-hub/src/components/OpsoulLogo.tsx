export default function OpsoulLogo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="340"
      height="104"
      viewBox="0 0 340 104"
      className={className}
    >
      <defs>
        <radialGradient id="bg2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a0a2e" />
          <stop offset="100%" stopColor="#0a0a12" />
        </radialGradient>
        <radialGradient id="core2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e8c8ff" />
          <stop offset="60%" stopColor="#cd96ff" />
          <stop offset="100%" stopColor="#9b5fd4" />
        </radialGradient>
        <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#40cef3" stopOpacity=".35" />
          <stop offset="100%" stopColor="#40cef3" stopOpacity="0" />
        </radialGradient>
        <filter id="logo-f1"><feGaussianBlur stdDeviation="2.5" /></filter>
        <filter id="logo-f2"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>

      <style>{`
        @keyframes logo-pulse1 { 0%,100%{r:22px;opacity:.15} 50%{r:36px;opacity:0} }
        @keyframes logo-pulse2 { 0%,100%{r:14px;opacity:.25} 50%{r:26px;opacity:0} }
        @keyframes logo-pulse3 { 0%,100%{r:6px;opacity:.9} 50%{r:9px;opacity:.6} }
        @keyframes logo-rotate { to{transform:rotate(360deg)} }
        @media (prefers-reduced-motion: no-preference) {
          .logo-p1{animation:logo-pulse1 3s ease-out infinite}
          .logo-p2{animation:logo-pulse2 3s ease-out infinite .6s}
          .logo-p3{animation:logo-pulse3 3s ease-in-out infinite}
          .logo-arc{animation:logo-rotate 12s linear infinite;transform-origin:52px 52px}
        }
      `}</style>

      <rect width="340" height="104" rx="16" fill="url(#bg2)" />
      <circle cx="52" cy="52" r="36" fill="url(#glow2)" filter="url(#logo-f2)" />
      <circle className="logo-p1" cx="52" cy="52" r="22" fill="none" stroke="#cd96ff" strokeWidth="1" />
      <circle className="logo-p2" cx="52" cy="52" r="14" fill="none" stroke="#40cef3" strokeWidth="1.2" />
      <g className="logo-arc">
        <path d="M52 22 A30 30 0 0 1 82 52" fill="none" stroke="#cd96ff" strokeWidth="1" strokeLinecap="round" opacity=".5" />
        <path d="M52 82 A30 30 0 0 1 22 52" fill="none" stroke="#40cef3" strokeWidth="1" strokeLinecap="round" opacity=".5" />
      </g>
      <circle cx="52" cy="52" r="10" fill="url(#core2)" filter="url(#logo-f1)" />
      <circle className="logo-p3" cx="52" cy="52" r="6" fill="#f0e0ff" />
      <line x1="100" y1="28" x2="100" y2="76" stroke="#cd96ff" strokeWidth="0.5" opacity="0.3" />
      <text x="118" y="60" fontFamily="'Space Grotesk', system-ui, sans-serif" fontSize="32" fontWeight="600" letterSpacing="-1" fill="#f3eff5">
        Op<tspan fill="#cd96ff">Soul</tspan>
      </text>
    </svg>
  );
}

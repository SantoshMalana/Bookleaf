/** Soft pink clouds and waves, echoing the hero artwork on bookleafpub.in. Purely decorative. */
export function CloudBackdrop({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 420" preserveAspectRatio="xMidYMin slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="bl-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1f2" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect width="1200" height="420" fill="url(#bl-wash)" />
      <g fill="#ffe3e6" opacity=".9" className="float-slow">
        <path d="M860 120c8-34 40-50 70-42 14-30 58-38 84-14 30-6 56 14 58 40 22 4 38 22 36 42H830c-14-6-18-22-8-34 6-8 22-6 38 8z" transform="translate(30 -20)" />
      </g>
      <g fill="#ffd3d8" opacity=".55">
        <path d="M150 210c6-26 32-38 54-32 10-22 44-28 64-10 22-4 42 10 44 30 16 3 28 16 26 32H132c-10-4-13-16-6-26 5-6 17-5 24 6z" />
      </g>
      <path d="M0 330c120-48 240-48 360-10s240 54 360 20 300-84 480-22v102H0z" fill="#ffe7e9" opacity=".8" />
      <path d="M0 372c160-40 300-26 440 10s300 44 440 4 220-30 320-6v40H0z" fill="#ffd9dd" opacity=".6" />
    </svg>
  );
}

/** Left panel art for the sign-in screen. */
export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 900" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <g fill="#fff" opacity=".55" className="float-slow">
        <path d="M380 140c10-40 52-58 86-46 18-34 70-44 100-16 36-8 66 16 68 48 26 4 44 26 42 50H350c-16-8-20-26-8-40 8-10 26-8 38 4z" />
      </g>
      <g fill="#fff" opacity=".35">
        <path d="M30 330c6-26 32-38 54-32 10-22 44-28 64-10 22-4 42 10 44 30 16 3 28 16 26 32H12c-10-4-13-16-6-26 5-6 17-5 24 6z" />
      </g>
      <path d="M0 700c110-60 220-70 330-30s210 50 310-20v250H0z" fill="#fff" opacity=".5" />
      <path d="M0 770c120-50 230-40 340 0s200 40 300-10v140H0z" fill="#fff" opacity=".7" />
    </svg>
  );
}

/** Line icons, 18px, drawn on the same grid so the rail reads as one set. */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const PeopleIcon = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14c2 .6 3.2 2.4 3.2 5" />
  </svg>
)

export const StreamIcon = () => (
  <svg {...base}>
    <path d="M4 6h16M4 12h11M4 18h7" />
  </svg>
)

export const TodayIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    <path d="M7.5 13.5h4" />
  </svg>
)

export const LoopIcon = () => (
  <svg {...base}>
    <path d="M20 6.5H9.5a4 4 0 0 0 0 8h5a4 4 0 0 1 0 8H4" />
    <path d="m16.5 3.4 3.4 3.1-3.4 3.1" />
  </svg>
)

export const GiveIcon = () => (
  <svg {...base}>
    <path d="M12 20.5s-7.2-4.3-7.2-9.4A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 7.2 2.5c0 5.1-7.2 9.4-7.2 9.4Z" />
    <path d="M12 8.6V3.5M9.6 5.2 12 3.5l2.4 1.7" />
  </svg>
)

export const AskIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3" />
    <path d="M12 17.2v.01" />
  </svg>
)

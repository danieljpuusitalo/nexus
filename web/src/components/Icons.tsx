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

export const LoopIcon = () => (
  <svg {...base}>
    <path d="M20 6.5H9.5a4 4 0 0 0 0 8h5a4 4 0 0 1 0 8H4" />
    <path d="m16.5 3.4 3.4 3.1-3.4 3.1" />
  </svg>
)

export const AskIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3" />
    <path d="M12 17.2v.01" />
  </svg>
)

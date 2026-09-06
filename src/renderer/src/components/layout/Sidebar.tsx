import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../../App'
import type { SavedView, Favorite } from '../../types'

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [reminderBadge, setReminderBadge] = useState(0)
  const [keepInTouchBadge, setKeepInTouchBadge] = useState(0)
  const [reviewBadge, setReviewBadge] = useState(0)
  const [appVersion, setAppVersion] = useState('')
  const [views, setViews] = useState<SavedView[]>([])
  const [viewsOpen, setViewsOpen] = useState(true)
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    loadBadges()
    loadViews()
    loadFavorites()
    window.api.app.getVersion().then((v: unknown) => setAppVersion(v as string))
    // Slow fallback poll (5 min) — primary refresh via focus/visibility events
    const interval = setInterval(loadBadges, 300000)
    const handleFocus = () => { loadBadges() }
    window.addEventListener('focus', handleFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', handleFocus) }
  }, [])

  async function loadBadges() {
    try {
      const overdue = await window.api.reminders.getOverdueCount() as number
      const dueToday = (await window.api.reminders.getDueToday() as unknown[]).length
      setReminderBadge(overdue + dueToday)
      const kitDue = (await window.api.dashboard.getKeepInTouchDue() as unknown[]).length
      setKeepInTouchBadge(kitDue)
      // People the ledger could not place. Surfaced as a badge because an
      // unresolved attendee is a fixable gap, not a background condition.
      const toReview = (await window.api.ledger.getReviewQueue(200) as unknown[]).length
      setReviewBadge(toReview)
    } catch {
      // ignore on startup race
    }
  }

  async function loadViews() {
    try {
      const data = await window.api.views.getAll()
      setViews(data as SavedView[])
    } catch {
      // ignore
    }
  }

  async function loadFavorites() {
    try {
      const data = await window.api.favorites.getAll()
      setFavorites(data as Favorite[])
    } catch {
      // ignore
    }
  }

  function getFavoriteRoute(fav: Favorite): string {
    switch (fav.item_type) {
      case 'contact': return `/contacts?contactId=${fav.item_id}`
      case 'view': return `/contacts?viewId=${fav.item_id}`
      default: return '/contacts'
    }
  }

  function getFavoriteIcon(fav: Favorite): string {
    if (fav.emoji) return fav.emoji
    switch (fav.item_type) {
      case 'contact': return '👤'
      case 'view': return '📋'
      default: return '⭐'
    }
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
    }`

  return (
    <aside className="w-56 h-screen bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800/60 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-zinc-200 dark:border-zinc-800/60">
        <span className="text-base font-bold tracking-wide bg-gradient-to-r from-violet-500 to-indigo-500 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
          NEXUS
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          <NavLink to="/" end className={linkClass}>
            <DashboardIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Recent</span>
          </NavLink>
          <NavLink to="/people" className={linkClass}>
            <ContactsIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">People</span>
          </NavLink>
          <NavLink to="/review" className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 ml-6 rounded-lg text-xs transition-colors ${
              isActive ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
            }`
          }>
            <span className="flex-1">Who is this?</span>
            {reviewBadge > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white dark:text-zinc-950 px-1">
                {reviewBadge > 99 ? '99+' : reviewBadge}
              </span>
            )}
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800/60 space-y-0.5">
        <NavLink to="/settings" className={linkClass}>
          <SettingsIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Settings</span>
        </NavLink>
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider font-medium">
            {appVersion ? `v${appVersion}` : ''}
          </p>
          <button onClick={toggleTheme}
            className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
            {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}

// --- Inline SVG Icons ---

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  )
}

function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  )
}

function InteractionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10c0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6H5l-3 3V3c0-.5.2-1 .6-1.4C3 1.2 3.5 1 4 1h8c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4v7z" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4v4l2.5 2.5" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M13.5 8a5.5 5.5 0 01-.3 1.8l1.3.8-1 1.7-1.3-.8a5.5 5.5 0 01-1.5 1l.1 1.5h-2l.1-1.5a5.5 5.5 0 01-1.5-1l-1.3.8-1-1.7 1.3-.8A5.5 5.5 0 012.5 8c0-.6.1-1.2.3-1.8l-1.3-.8 1-1.7 1.3.8a5.5 5.5 0 011.5-1L5.2 2h2l-.1 1.5a5.5 5.5 0 011.5 1l1.3-.8 1 1.7-1.3.8c.2.6.3 1.2.3 1.8z" />
    </svg>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8.5A6.5 6.5 0 017.5 2 5.5 5.5 0 1014 8.5z" />
    </svg>
  )
}

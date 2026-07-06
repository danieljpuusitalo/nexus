import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../../App'
import type { GroupWithCount, SavedView, Favorite } from '../../types'

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [reminderBadge, setReminderBadge] = useState(0)
  const [keepInTouchBadge, setKeepInTouchBadge] = useState(0)
  const [appVersion, setAppVersion] = useState('')
  const [groups, setGroups] = useState<GroupWithCount[]>([])
  const [groupsOpen, setGroupsOpen] = useState(true)
  const [views, setViews] = useState<SavedView[]>([])
  const [viewsOpen, setViewsOpen] = useState(true)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [onboardingDone, setOnboardingDone] = useState(0)
  const [onboardingTotal] = useState(15)

  useEffect(() => {
    loadBadges()
    loadGroups()
    loadViews()
    loadFavorites()
    loadOnboarding()
    window.api.app.getVersion().then((v: unknown) => setAppVersion(v as string))
    const interval = setInterval(loadBadges, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadBadges() {
    try {
      const overdue = await window.api.reminders.getOverdueCount() as number
      const dueToday = (await window.api.reminders.getDueToday() as unknown[]).length
      setReminderBadge(overdue + dueToday)
      const kitDue = (await window.api.dashboard.getKeepInTouchDue() as unknown[]).length
      setKeepInTouchBadge(kitDue)
    } catch {
      // ignore on startup race
    }
  }

  async function loadGroups() {
    try {
      const data = await window.api.groups.getAllWithCounts()
      setGroups(data as GroupWithCount[])
    } catch {
      // ignore
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

  async function loadOnboarding() {
    try {
      const progress = await window.api.onboarding.getProgress() as Record<string, string>
      setOnboardingDone(Object.keys(progress).length)
    } catch {
      // ignore
    }
  }

  function getFavoriteRoute(fav: Favorite): string {
    switch (fav.item_type) {
      case 'contact': return `/contacts?contactId=${fav.item_id}`
      case 'group': return `/groups?groupId=${fav.item_id}`
      case 'view': return `/contacts?viewId=${fav.item_id}`
      default: return '/'
    }
  }

  function getFavoriteIcon(fav: Favorite): string {
    if (fav.emoji) return fav.emoji
    switch (fav.item_type) {
      case 'contact': return '👤'
      case 'group': return '👥'
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
        {/* Favorites */}
        {favorites.length > 0 && (
          <div className="mb-4 pb-3 border-b border-zinc-200 dark:border-zinc-800/60">
            <p className="px-3 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Favorites</p>
            <div className="space-y-0.5 mt-1">
              {favorites.map(fav => (
                <button key={fav.id}
                  onClick={() => navigate(getFavoriteRoute(fav))}
                  className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-sm font-medium transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                  <span className="w-4 text-center flex-shrink-0 text-xs">{getFavoriteIcon(fav)}</span>
                  <span className="flex-1 truncate text-xs">{fav.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          <NavLink to="/" end className={linkClass}>
            <DashboardIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Home</span>
            {keepInTouchBadge > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {keepInTouchBadge > 99 ? '99+' : keepInTouchBadge}
              </span>
            )}
          </NavLink>
          <NavLink to="/workspace" className={linkClass}>
            <WorkspaceIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Workspace</span>
          </NavLink>
          <NavLink to="/contacts" className={linkClass}>
            <ContactsIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Contacts</span>
          </NavLink>
          <NavLink to="/merge" className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 ml-6 rounded-lg text-xs transition-colors ${
              isActive ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
            }`
          }>
            <span className="flex-1">Clean Up</span>
          </NavLink>
          <NavLink to="/keep-in-touch" className={linkClass}>
            <RemindersIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Keep In Touch</span>
          </NavLink>
          <NavLink to="/interactions" className={linkClass}>
            <InteractionsIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Timeline</span>
          </NavLink>
          <NavLink to="/pipeline" className={linkClass}>
            <PipelineIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Pipeline</span>
          </NavLink>
          <NavLink to="/radar" className={linkClass}>
            <RadarIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Radar</span>
          </NavLink>
          <NavLink to="/map" className={linkClass}>
            <MapIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Map</span>
          </NavLink>
          <NavLink to="/reminders" className={linkClass}>
            <BellIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Reminders</span>
            {reminderBadge > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white dark:text-zinc-950 px-1">
                {reminderBadge > 99 ? '99+' : reminderBadge}
              </span>
            )}
          </NavLink>
          <NavLink to="/copilot" className={linkClass}>
            <CopilotIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Copilot</span>
          </NavLink>
          {onboardingDone < onboardingTotal && (
            <NavLink to="/onboarding" className={linkClass}>
              <OnboardingIcon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Get Started</span>
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white px-1">
                {onboardingDone}/{onboardingTotal}
              </span>
            </NavLink>
          )}
        </div>

        {/* Groups Section */}
        <div className="mt-6">
          <button onClick={() => setGroupsOpen(!groupsOpen)}
            className="flex items-center gap-1 px-3 py-1.5 w-full text-left">
            <svg className={`w-3 h-3 text-zinc-400 transition-transform ${groupsOpen ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 3l5 5-5 5z" />
            </svg>
            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Groups</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-auto">{groups.length}</span>
          </button>
          {groupsOpen && groups.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {groups.map(g => (
                <NavLink key={g.id} to={`/groups?groupId=${g.id}`} className={linkClass}>
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="flex-1 truncate text-xs">{g.name}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{g.contact_count}</span>
                </NavLink>
              ))}
            </div>
          )}
          <NavLink to="/groups" className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 ml-4 rounded-lg text-xs transition-colors ${
              isActive ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
            }`
          }>
            + Manage Groups
          </NavLink>
        </div>

        {/* Views Section */}
        {views.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setViewsOpen(!viewsOpen)}
              className="flex items-center gap-1 px-3 py-1.5 w-full text-left">
              <svg className={`w-3 h-3 text-zinc-400 transition-transform ${viewsOpen ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 3l5 5-5 5z" />
              </svg>
              <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Views</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-auto">{views.length}</span>
            </button>
            {viewsOpen && (
              <div className="space-y-0.5 mt-1">
                {views.map(v => (
                  <button key={v.id}
                    onClick={() => navigate(`/contacts?viewId=${v.id}`)}
                    className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg text-sm font-medium transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                    <span className="w-4 text-center flex-shrink-0 text-xs">{v.emoji || '📋'}</span>
                    <span className="flex-1 truncate text-xs">{v.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tags link */}
        <div className="mt-4">
          <NavLink to="/tags" className={linkClass}>
            <TagsIcon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Tags</span>
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800/60 space-y-0.5">
        <NavLink to="/import" className={linkClass}>
          <ImportIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Your Network</span>
        </NavLink>
        <NavLink to="/refer" className={linkClass}>
          <ReferIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Refer a Friend</span>
        </NavLink>
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

function PipelineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="3.5" height="12" rx="0.75" />
      <rect x="6.25" y="2" width="3.5" height="8" rx="0.75" />
      <rect x="11.5" y="2" width="3.5" height="5" rx="0.75" />
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

function TagsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8.8V2.5a1 1 0 011-1h6.3a1 1 0 01.7.3l5 5a1 1 0 010 1.4l-6.3 6.3a1 1 0 01-1.4 0l-5-5a1 1 0 01-.3-.7z" />
      <circle cx="5" cy="5" r="1" fill="currentColor" />
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

function RemindersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14.5c-.5 0-1-.2-1.4-.6-.4-.4-.6-.9-.6-1.4h4c0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6z" />
      <path d="M4 6.5a4 4 0 018 0c0 2 .5 3.5 1.5 4.5H2.5C3.5 10 4 8.5 4 6.5z" />
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

function ImportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5" />
      <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
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

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3.5l4.5-2 5 2.5 4.5-2v11l-4.5 2-5-2.5-4.5 2z" />
      <path d="M5.5 1.5v11M10.5 4v11" />
    </svg>
  )
}

function CopilotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
      <circle cx="8" cy="8" r="3" />
      <path d="M5.5 5.5L4 4M10.5 5.5L12 4M5.5 10.5L4 12M10.5 10.5L12 12" />
    </svg>
  )
}

function ReferIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1" />
      <circle cx="8" cy="5" r="2.5" />
      <path d="M13.5 6.5l1 1 2-2" />
    </svg>
  )
}

function OnboardingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h12v12H2z" rx="2" />
      <path d="M5 8h6M5 5h6M5 11h3" />
    </svg>
  )
}

function WorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
      <path d="M6 1.5v13" />
    </svg>
  )
}

function RadarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <circle cx="8" cy="8" r="4.5" />
      <circle cx="8" cy="8" r="6.5" />
    </svg>
  )
}

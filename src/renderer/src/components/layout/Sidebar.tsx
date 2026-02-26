import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/contacts', label: 'Contacts', icon: ContactsIcon },
  { to: '/groups', label: 'Groups', icon: GroupsIcon },
  { to: '/tags', label: 'Tags', icon: TagsIcon },
  { to: '/interactions', label: 'Interactions', icon: InteractionsIcon },
  { to: '/reminders', label: 'Reminders', icon: RemindersIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

export default function Sidebar() {
  const [reminderBadge, setReminderBadge] = useState(0)

  useEffect(() => {
    loadBadge()
    const interval = setInterval(loadBadge, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [])

  async function loadBadge() {
    try {
      const overdue = await window.api.reminders.getOverdueCount() as number
      const dueToday = (await window.api.reminders.getDueToday() as unknown[]).length
      setReminderBadge(overdue + dueToday)
    } catch {
      // ignore on startup race
    }
  }

  return (
    <aside className="w-56 h-screen bg-zinc-950 border-r border-zinc-800/60 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-zinc-800/60">
        <span className="text-base font-bold tracking-wide bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          NEXUS
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-violet-500/10 text-violet-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            {label === 'Reminders' && reminderBadge > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-zinc-950 px-1">
                {reminderBadge > 99 ? '99+' : reminderBadge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-800/60">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
          Nexus v1.0 — Local
        </p>
      </div>
    </aside>
  )
}

// --- Inline SVG Icons (simple, no dependencies) ---

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

function GroupsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="11" cy="5" r="2.5" />
      <path d="M1 14c0-2.5 2-4.5 5-4.5" />
      <path d="M15 14c0-2.5-2-4.5-5-4.5s-5 2-5 4.5" />
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

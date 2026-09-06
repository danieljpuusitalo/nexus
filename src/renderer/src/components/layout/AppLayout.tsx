import { useEffect, useState, useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from '../ui/CommandPalette'

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [bannerCount, setBannerCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const overdue = await window.api.reminders.getOverdueCount() as number
        const todayReminders = (await window.api.reminders.getDueToday() as unknown[]).length
        setBannerCount(overdue + todayReminders)
      } catch {
        // ignore
      }
    }
    check()
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)

    // Ctrl/Cmd + K → Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      setShowCommandPalette(prev => !prev)
      return
    }

    // Ctrl/Cmd + / → Toggle shortcuts overlay
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault()
      setShowShortcuts(prev => !prev)
      return
    }

    // Escape → Close modals/overlays
    if (e.key === 'Escape') {
      if (showCommandPalette) { setShowCommandPalette(false); return }
      if (showShortcuts) { setShowShortcuts(false); return }
      return
    }

    // Number shortcuts for navigation (only when not in an input)
    if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && !showCommandPalette) {
      const navMap: Record<string, string> = {
        '1': '/', '2': '/people', '3': '/review', '4': '/settings'
      }
      if (navMap[e.key]) {
        e.preventDefault()
        navigate(navMap[e.key])
      }
    }
  }, [showShortcuts, showCommandPalette, location.pathname])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 relative">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Notification banner */}
        {bannerCount > 0 && !dismissed && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
            <span className="text-amber-500 dark:text-amber-400 text-sm">&#9203;</span>
            <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
              You have <span className="font-semibold">{bannerCount}</span> overdue or due-today reminder{bannerCount !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-500/60 dark:text-amber-400/60 hover:text-amber-600 dark:hover:text-amber-300 transition-colors text-sm"
            >
              &#10005;
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto relative" key={location.pathname}>
          <div className="page-enter">
          <Outlet />
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 overlay-enter" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-6 w-full max-w-md shadow-2xl slide-over-enter">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">&times;</button>
            </div>
            <div className="space-y-3">
              <ShortcutRow keys="Ctrl + K" desc="Command palette" />
              <ShortcutRow keys="Ctrl + /" desc="Toggle this overlay" />
              <ShortcutRow keys="Esc" desc="Close modal / go back" />
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-3 mt-3">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-2">Navigation</p>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="1" desc="Recent" />
                  <ShortcutRow keys="2" desc="People" />
                  <ShortcutRow keys="3" desc="Review" />
                  <ShortcutRow keys="4" desc="Settings" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
      <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded text-[11px] font-mono text-zinc-600 dark:text-zinc-300">{keys}</kbd>
    </div>
  )
}

import { HashRouter, Routes, Route } from 'react-router-dom'
import { createContext, useContext, useEffect, useState } from 'react'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import Interactions from './pages/Interactions'
import ReviewQueue from './pages/ReviewQueue'
import Reminders from './pages/Reminders'
import Settings from './pages/Settings'
import Auth from './pages/Auth'
import { AuthProvider, useAuth } from './lib/auth'
import { PlanProvider } from './lib/plan'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { startSyncLoop, stopSyncLoop } from './lib/sync'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    window.api.settings.get('theme').then((saved: unknown) => {
      const t = (saved as string) === 'dark' ? 'dark' : 'light'
      setTheme(t)
      document.documentElement.classList.toggle('dark', t === 'dark')
    })
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    window.api.settings.set('theme', next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

function AuthGate() {
  const { user, loading, isOffline, isCloudEnabled } = useAuth()

  // Start/stop sync loop based on auth state
  useEffect(() => {
    if (user && isCloudEnabled && !isOffline) {
      startSyncLoop()
      return () => stopSyncLoop()
    }
  }, [user, isCloudEnabled, isOffline])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-wide bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent mb-2">NEXUS</h1>
          <p className="text-sm text-zinc-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Show auth screen if cloud is configured and user is not signed in and not in offline mode
  if (isCloudEnabled && !user && !isOffline) {
    return <Auth />
  }

  // User is authenticated, offline, or cloud is not configured — show the app
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/interactions" element={<Interactions />} />
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PlanProvider>
            <AuthGate />
          </PlanProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

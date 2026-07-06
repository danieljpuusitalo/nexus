import { HashRouter, Routes, Route } from 'react-router-dom'
import { createContext, useContext, useEffect, useState, lazy, Suspense } from 'react'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import Pipeline from './pages/Pipeline'
import Groups from './pages/Groups'
import Tags from './pages/Tags'
import Interactions from './pages/Interactions'
import Reminders from './pages/Reminders'
import Settings from './pages/Settings'
import QuickAction from './pages/QuickAction'
import Import from './pages/Import'
import KeepInTouch from './pages/KeepInTouch'
import Locations from './pages/Locations'
import Onboarding from './pages/Onboarding'
import Refer from './pages/Refer'
import MergeFix from './pages/MergeFix'
import Workspace from './pages/Workspace'
import Welcome from './pages/Welcome'
import NetworkSetup from './pages/NetworkSetup'
import NetworkReveal from './pages/NetworkReveal'
import Auth from './pages/Auth'

// Lazy-load heavy pages (Leaflet, D3, AI)
const MapView = lazy(() => import('./pages/MapView'))
const Copilot = lazy(() => import('./pages/Copilot'))
const Radar = lazy(() => import('./pages/Radar'))
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
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/network-setup" element={<NetworkSetup />} />
          <Route path="/network-reveal" element={<NetworkReveal />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/interactions" element={<Interactions />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/quick-action" element={<QuickAction />} />
            <Route path="/keep-in-touch" element={<KeepInTouch />} />
            <Route path="/copilot" element={<Suspense fallback={<LazyFallback />}><Copilot /></Suspense>} />
            <Route path="/import" element={<Import />} />
            <Route path="/map" element={<ErrorBoundary><Suspense fallback={<LazyFallback />}><MapView /></Suspense></ErrorBoundary>} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/refer" element={<Refer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/merge" element={<MergeFix />} />
            <Route path="/radar" element={<ErrorBoundary><Suspense fallback={<LazyFallback />}><Radar /></Suspense></ErrorBoundary>} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

function LazyFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-sm text-zinc-400 animate-pulse">Loading...</p>
    </div>
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

import { useEffect, useState } from 'react'
import { useTheme } from '../App'
import { useAuth } from '../lib/auth'
import { syncAll } from '../lib/sync'
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '../lib/push-notifications'
import { useToast } from '../components/ui/Toast'

const LINKEDIN_COLUMNS: Record<string, string> = {
  'First Name': 'first_name',
  'Last Name': 'last_name',
  'Email Address': 'email',
  'Company': 'company',
  'Position': 'job_title',
  'Connected On': 'how_we_met'
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { result.push(current.trim()); current = '' }
        else current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function formatSettingsRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme()
  const { user, isOffline, isCloudEnabled, signOut } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')

  // Google integration state
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; email: string | null }>({ configured: false, connected: false, email: null })
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')

  // Google auto-sync state
  const [googleAutoSync, setGoogleAutoSync] = useState<{ enabled: boolean; frequency: string; lastSync: string | null }>({ enabled: false, frequency: 'daily', lastSync: null })

  // Microsoft integration state
  const [msStatus, setMsStatus] = useState<{ configured: boolean; connected: boolean; email: string | null }>({ configured: false, connected: false, email: null })
  const [msClientId, setMsClientId] = useState('')
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState('')
  const [showMsSetup, setShowMsSetup] = useState(false)
  const [msSyncResult, setMsSyncResult] = useState('')

  // Microsoft auto-sync state
  const [msAutoSync, setMsAutoSync] = useState<{ enabled: boolean; frequency: string; lastSync: string | null }>({ enabled: false, frequency: 'daily', lastSync: null })

  // AI state
  const [aiStatus, setAiStatus] = useState<{ configured: boolean }>({ configured: false })
  const [aiKey, setAiKey] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiMessage, setAiMessage] = useState('')

  // Import state
  const [importStep, setImportStep] = useState<'idle' | 'mapping' | 'preview' | 'done'>('idle')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  // Reset confirm
  const [resetStep, setResetStep] = useState(0)

  useEffect(() => { loadStats(); loadGoogleStatus(); loadMsStatus(); loadAiStatus(); loadGoogleAutoSync(); loadMsAutoSync() }, [])

  async function loadAiStatus() {
    const status = await window.api.ai.getStatus() as { configured: boolean }
    setAiStatus(status)
  }

  async function handleSaveAiKey() {
    if (!aiKey.trim()) return
    setAiSaving(true)
    setAiMessage('')
    try {
      await window.api.ai.setApiKey(aiKey.trim())
      setAiKey('')
      setAiMessage('API key saved successfully')
      await loadAiStatus()
    } catch (err) {
      setAiMessage(String(err))
    }
    setAiSaving(false)
  }

  async function handleRemoveAiKey() {
    await window.api.ai.removeApiKey()
    setAiMessage('API key removed')
    await loadAiStatus()
  }

  async function handleTestAiKey() {
    setAiMessage('')
    try {
      await window.api.ai.chat([{ role: 'user', content: 'Reply with OK' }], 'Reply with exactly "OK"')
      setAiMessage('API key is valid')
    } catch {
      setAiMessage('API key test failed. Check your key and try again.')
    }
  }

  async function loadGoogleStatus() {
    const status = await window.api.google.getStatus() as { configured: boolean; connected: boolean; email: string | null }
    setGoogleStatus(status)
  }

  async function handleGoogleConnect() {
    setGoogleLoading(true)
    setGoogleError('')
    try {
      const result = await window.api.google.connect() as { success: boolean; error?: string }
      if (result.success) {
        await loadGoogleStatus()
      } else {
        setGoogleError(result.error || 'Connection failed')
      }
    } catch (err) {
      setGoogleError(String(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  // Microsoft functions
  async function loadMsStatus() {
    const status = await window.api.microsoft.getStatus() as { configured: boolean; connected: boolean; email: string | null }
    setMsStatus(status)
  }

  async function handleMsSaveCredentials() {
    if (!msClientId.trim()) return
    setMsError('')
    await window.api.microsoft.setCredentials(msClientId.trim())
    await loadMsStatus()
    setShowMsSetup(false)
  }

  async function handleMsConnect() {
    setMsLoading(true)
    setMsError('')
    try {
      const result = await window.api.microsoft.connect() as { success: boolean; error?: string }
      if (result.success) {
        await loadMsStatus()
      } else {
        setMsError(result.error || 'Connection failed')
      }
    } catch (err) {
      setMsError(String(err))
    } finally {
      setMsLoading(false)
    }
  }

  async function handleMsDisconnect() {
    await window.api.microsoft.disconnect()
    await loadMsStatus()
  }

  async function handleMsSyncCalendar() {
    setMsSyncResult('Checking calendar...')
    try {
      const result = await window.api.microsoft.syncCalendar() as { total: number; matched: number }
      setMsSyncResult(`Found ${result.total} events, matched ${result.matched} to contacts`)
    } catch (err) {
      setMsSyncResult(`Error: ${err}`)
    }
  }

  async function handleMsSyncEmail() {
    setMsSyncResult('Checking emails...')
    try {
      const result = await window.api.microsoft.syncEmail() as { total: number; matched: number }
      setMsSyncResult(`Found ${result.total} emails, matched ${result.matched} to contacts`)
    } catch (err) {
      setMsSyncResult(`Error: ${err}`)
    }
  }

  async function handleGoogleDisconnect() {
    await window.api.google.disconnect()
    await loadGoogleStatus()
    setGoogleAutoSync({ enabled: false, frequency: 'daily', lastSync: null })
  }

  async function loadGoogleAutoSync() {
    try {
      const status = await window.api.google.getAutoSyncStatus() as { enabled: boolean; frequency: string; lastSync: string | null }
      setGoogleAutoSync(status)
    } catch { /* not connected */ }
  }

  async function handleGoogleAutoSyncToggle() {
    if (googleAutoSync.enabled) {
      await window.api.google.disableAutoSync()
    } else {
      await window.api.google.enableAutoSync(googleAutoSync.frequency)
    }
    await loadGoogleAutoSync()
  }

  async function handleGoogleAutoSyncFrequency(freq: string) {
    setGoogleAutoSync(prev => ({ ...prev, frequency: freq }))
    if (googleAutoSync.enabled) {
      await window.api.google.enableAutoSync(freq)
    }
  }

  async function loadMsAutoSync() {
    try {
      const status = await window.api.microsoft.getContactsAutoSyncStatus() as { enabled: boolean; frequency: string; lastSync: string | null }
      setMsAutoSync(status)
    } catch { /* not connected */ }
  }

  async function handleMsAutoSyncToggle() {
    if (msAutoSync.enabled) {
      await window.api.microsoft.disableContactsAutoSync()
    } else {
      await window.api.microsoft.enableContactsAutoSync(msAutoSync.frequency)
    }
    await loadMsAutoSync()
  }

  async function handleMsAutoSyncFrequency(freq: string) {
    setMsAutoSync(prev => ({ ...prev, frequency: freq }))
    if (msAutoSync.enabled) {
      await window.api.microsoft.enableContactsAutoSync(freq)
    }
  }

  async function loadStats() {
    const data = await window.api.data.stats()
    setStats(data as Record<string, number>)
  }

  const [exportMessage, setExportMessage] = useState('')

  async function handleExportCsv() {
    const result = await window.api.data.exportCsv() as { success: boolean; message: string }
    setExportMessage(result.message)
    if (result.success) toast('CSV exported')
  }
  async function handleExportFullCsv() {
    const result = await window.api.data.exportFullCsv() as { success: boolean; message: string }
    setExportMessage(result.message)
    if (result.success) toast('Full CSV exported')
  }
  async function handleExportJson() {
    const result = await window.api.data.exportJson() as { success: boolean; message: string }
    setExportMessage(result.message)
    if (result.success) toast('JSON exported')
  }
  async function handleBackup() {
    await window.api.data.backup()
    toast('Backup created')
  }

  async function handleImportCsv(linkedin = false) {
    const content = await window.api.data.importSelectCsv()
    if (!content) return
    const { headers, rows } = parseCsv(content as string)
    if (headers.length === 0) return
    setCsvHeaders(headers); setCsvRows(rows)

    const map: Record<string, string> = {}
    const contactFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'birthday']

    if (linkedin) {
      for (const h of headers) { if (LINKEDIN_COLUMNS[h]) map[h] = LINKEDIN_COLUMNS[h] }
    } else {
      for (const h of headers) {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '')
        const match = contactFields.find(f => f.replace('_', '') === lower || lower.includes(f.replace('_', '')))
        if (match) map[h] = match
        else if (lower.includes('first') && lower.includes('name')) map[h] = 'first_name'
        else if (lower.includes('last') && lower.includes('name')) map[h] = 'last_name'
        else if (lower.includes('email')) map[h] = 'email'
        else if (lower.includes('phone')) map[h] = 'phone'
        else if (lower.includes('company') || lower.includes('organization')) map[h] = 'company'
        else if (lower.includes('title') || lower.includes('position')) map[h] = 'job_title'
        else if (lower.includes('linkedin')) map[h] = 'linkedin_url'
        else if (lower.includes('birthday') || lower.includes('birth')) map[h] = 'birthday'
      }
    }
    setColumnMap(map)
    setImportStep('mapping')
  }

  function handlePreview() { setImportStep('preview') }

  async function handleExecuteImport() {
    const mapped = csvRows.map(row => {
      const obj: Record<string, string> = {}
      csvHeaders.forEach((h, i) => {
        const field = columnMap[h]
        if (field && row[i]) obj[field] = row[i]
      })
      return obj
    })
    const result = await window.api.data.importExecute(mapped, duplicateMode)
    setImportResult(result as { imported: number; skipped: number })
    setImportStep('done')
    await loadStats()
  }

  function resetImport() {
    setImportStep('idle'); setCsvHeaders([]); setCsvRows([]); setColumnMap({}); setImportResult(null)
  }

  async function handleReset() {
    if (resetStep < 2) { setResetStep(resetStep + 1); return }
    await window.api.data.resetDatabase()
    setResetStep(0)
    toast('Database reset complete', 'info')
    await loadStats()
  }

  const contactFields = [
    { value: '', label: '— skip —' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'linkedin_url', label: 'LinkedIn URL' },
    { value: 'notes', label: 'Notes' },
    { value: 'how_we_met', label: 'How We Met' },
    { value: 'birthday', label: 'Birthday' }
  ]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Data management and preferences</p>
        </div>

        {/* Appearance */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Appearance</h2>
          <div className="flex gap-3">
            <button
              onClick={() => { if (theme !== 'light') toggleTheme() }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                theme === 'light'
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'border-zinc-200 dark:border-zinc-700/50 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
            >
              <SunIcon className="w-4 h-4" />
              Light
            </button>
            <button
              onClick={() => { if (theme !== 'dark') toggleTheme() }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'border-zinc-200 dark:border-zinc-700/50 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
            >
              <MoonIcon className="w-4 h-4" />
              Dark
            </button>
          </div>
        </section>

        {/* Plan */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Plan</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">
                N
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Nexus is free for all users</p>
                <p className="text-xs text-zinc-500">All features unlocked. Premium add-ons coming soon.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        {isCloudEnabled && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Account</h2>
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center text-sm font-semibold text-violet-600 dark:text-violet-400">
                      {(user.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{user.email}</p>
                      <p className="text-xs text-emerald-500">Signed in &middot; Cloud sync active</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setSyncStatus('syncing')
                        setSyncMessage('')
                        try {
                          const result = await syncAll()
                          setSyncStatus('done')
                          setSyncMessage(`Pushed ${result.pushed}, pulled ${result.pulled}${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`)
                        } catch {
                          setSyncStatus('error')
                          setSyncMessage('Sync failed')
                        }
                      }}
                      disabled={syncStatus === 'syncing'}
                      className="px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                    >
                      {syncStatus === 'syncing' ? 'Updating...' : 'Update now'}
                    </button>
                    <button
                      onClick={signOut}
                      className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                  {syncMessage && (
                    <p className={`text-xs ${syncStatus === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>{syncMessage}</p>
                  )}
                </>
              ) : (
                <div>
                  <p className="text-sm text-zinc-500">Sign in to sync your Nexus data across devices.</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Your local data is always your primary copy.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Gmail */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Gmail</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
            {googleStatus.connected ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <GoogleIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Connected{googleStatus.email ? ` as ${googleStatus.email}` : ''}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {googleAutoSync.lastSync
                        ? `Last updated: ${formatSettingsRelativeTime(googleAutoSync.lastSync)}`
                        : 'Not yet updated'}
                      {googleAutoSync.enabled
                        ? ` \u00B7 Auto-updates ${googleAutoSync.frequency === 'hourly' ? 'every hour' : 'every day'}`
                        : ''}
                    </p>
                  </div>
                </div>

                {/* Auto-sync toggle */}
                <div className="border border-zinc-200/50 dark:border-zinc-800/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">Keep contacts up to date automatically</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Nexus will check for new contacts in the background
                      </p>
                    </div>
                    <button
                      onClick={handleGoogleAutoSyncToggle}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        googleAutoSync.enabled ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        googleAutoSync.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  {googleAutoSync.enabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Check for new contacts:</span>
                      <select
                        value={googleAutoSync.frequency}
                        onChange={e => handleGoogleAutoSyncFrequency(e.target.value)}
                        className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
                      >
                        <option value="hourly">Every hour</option>
                        <option value="daily">Once a day</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGoogleConnect}
                    disabled={googleLoading}
                    className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                  >
                    {googleLoading ? 'Updating...' : 'Update now'}
                  </button>
                  <button
                    onClick={handleGoogleDisconnect}
                    className="px-3 py-2 text-sm text-zinc-500 hover:text-red-500 transition-colors"
                  >
                    Disconnect Gmail
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Connect your Gmail to find contacts from your email history. Your emails are never stored.
                </p>
                <button
                  onClick={handleGoogleConnect}
                  disabled={googleLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  <GoogleIcon className="w-4 h-4" />
                  {googleLoading ? 'Connecting...' : 'Connect Gmail'}
                </button>
                {googleError && (
                  <p className="text-xs text-red-500 mt-2">{googleError}</p>
                )}
              </>
            )}
          </div>
        </section>

        {/* Outlook */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Outlook</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
            {msStatus.connected ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg">
                    {'\u{1F4C5}'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Connected{msStatus.email ? ` as ${msStatus.email}` : ''}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {msAutoSync.lastSync
                        ? `Last updated: ${formatSettingsRelativeTime(msAutoSync.lastSync)}`
                        : 'Not yet updated'}
                      {msAutoSync.enabled
                        ? ` \u00B7 Auto-updates ${msAutoSync.frequency === 'hourly' ? 'every hour' : 'every day'}`
                        : ''}
                    </p>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                  <button onClick={handleMsSyncCalendar}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                    Sync Calendar
                  </button>
                  <button onClick={handleMsSyncEmail}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                    Sync Email
                  </button>
                </div>
                {msSyncResult && <p className="text-xs text-zinc-500">{msSyncResult}</p>}

                {/* Auto-sync toggle */}
                <div className="border border-zinc-200/50 dark:border-zinc-800/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">Keep contacts up to date automatically</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Nexus will check for new contacts in the background
                      </p>
                    </div>
                    <button
                      onClick={handleMsAutoSyncToggle}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        msAutoSync.enabled ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        msAutoSync.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  {msAutoSync.enabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Check for new contacts:</span>
                      <select
                        value={msAutoSync.frequency}
                        onChange={e => handleMsAutoSyncFrequency(e.target.value)}
                        className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 outline-none"
                      >
                        <option value="hourly">Every hour</option>
                        <option value="daily">Once a day</option>
                      </select>
                    </div>
                  )}
                </div>

                <button onClick={handleMsDisconnect}
                  className="px-3 py-2 text-sm text-zinc-500 hover:text-red-500 transition-colors">
                  Disconnect Outlook
                </button>
              </>
            ) : msStatus.configured ? (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Your Outlook is set up. Connect to start finding contacts from your emails and calendar.
                </p>
                <div className="flex gap-2">
                  <button onClick={handleMsConnect} disabled={msLoading}
                    className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50">
                    {msLoading ? 'Connecting...' : 'Connect Outlook'}
                  </button>
                  <button onClick={() => setShowMsSetup(true)}
                    className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                    Change settings
                  </button>
                </div>
                {msError && <p className="text-xs text-red-500 mt-1">{msError}</p>}
              </>
            ) : showMsSetup ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  To connect Outlook, you need a Microsoft App ID.{' '}
                  <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="text-violet-500 hover:underline">Create one here</a>
                  {' '}(App registrations, redirect URI: http://localhost).
                </p>
                <input type="text" value={msClientId} onChange={e => setMsClientId(e.target.value)}
                  placeholder="Paste your App ID here"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500/50" />
                <div className="flex gap-2">
                  <button onClick={handleMsSaveCredentials} className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">Save</button>
                  <button onClick={() => setShowMsSetup(false)} className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                  Connect your Outlook to find contacts from your emails and calendar meetings.
                </p>
                <button onClick={() => setShowMsSetup(true)}
                  className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">
                  Connect Outlook
                </button>
              </div>
            )}
          </div>
        </section>

        {/* AI / Copilot */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">AI / Copilot</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
            {aiStatus.configured ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center">
                    <AiIcon className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Anthropic API Connected</p>
                    <p className="text-xs text-emerald-500">Copilot, AI tools, and smart suggestions enabled</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleTestAiKey}
                    className="px-3 py-1.5 text-sm text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors"
                  >
                    Test Key
                  </button>
                  <button
                    onClick={handleRemoveAiKey}
                    className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    Remove API Key
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600">Your API key is stored locally and never sent to Nexus servers.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-500">
                  Connect your Anthropic API key to enable Copilot, smart reconnection messages, meeting briefings, and AI-powered tagging.
                </p>
                <div className="space-y-3 border border-zinc-200/60 dark:border-zinc-800/40 rounded-lg p-4 bg-zinc-50 dark:bg-zinc-900/30">
                  <p className="text-xs text-zinc-400">
                    Get your API key from{' '}
                    <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
                      className="text-violet-500 hover:text-violet-400 underline">console.anthropic.com</a>
                  </p>
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">API Key</label>
                    <input
                      type="password"
                      value={aiKey}
                      onChange={e => setAiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full bg-white dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveAiKey() }}
                    />
                  </div>
                  <button
                    onClick={handleSaveAiKey}
                    disabled={!aiKey.trim() || aiSaving}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiSaving ? 'Saving...' : 'Save API Key'}
                  </button>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-600">Your API key is stored locally and never sent to Nexus servers.</p>
                </div>
              </>
            )}
            {aiMessage && (
              <p className={`text-xs ${aiMessage.includes('failed') || aiMessage.includes('removed') ? 'text-zinc-500' : 'text-emerald-500'}`}>{aiMessage}</p>
            )}
          </div>
        </section>

        {/* Data Stats */}
        {stats && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Data Overview</h2>
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(stats).map(([key, val]) => (
                <div key={key} className="border border-zinc-200 dark:border-zinc-800/60 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{val}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{key}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Import / Export */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Import &amp; Export</h2>
          <div className="space-y-4">
            {/* Import */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Import</p>
              {importStep === 'idle' && (
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => handleImportCsv(false)}
                    className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors">Add from spreadsheet</button>
                  <button onClick={() => handleImportCsv(true)}
                    className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">Add from LinkedIn</button>
                </div>
              )}

              {importStep === 'mapping' && (
                <div className="border border-violet-500/20 rounded-xl p-5 bg-violet-500/5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-violet-600 dark:text-violet-400">Match your columns</h3>
                    <span className="text-xs text-zinc-500">{csvRows.length} contacts found</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {csvHeaders.map(h => (
                      <div key={h} className="flex items-center gap-3">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 w-40 truncate flex-shrink-0">{h}</span>
                        <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-600 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M10 5l3 3-3 3" /></svg>
                        <select value={columnMap[h] || ''} onChange={e => setColumnMap({ ...columnMap, [h]: e.target.value })}
                          className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none">
                          {contactFields.map(f => (<option key={f.value} value={f.value}>{f.label}</option>))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs text-zinc-500">If a contact already exists:</span>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input type="radio" name="dup" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} className="accent-violet-500" /> Skip
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input type="radio" name="dup" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} className="accent-violet-500" /> Update
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handlePreview} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">Preview</button>
                    <button onClick={resetImport} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div className="border border-violet-500/20 rounded-xl p-5 bg-violet-500/5">
                  <h3 className="text-sm font-medium text-violet-600 dark:text-violet-400 mb-3">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-500">
                          {Object.values(columnMap).filter(Boolean).map(f => (<th key={f} className="text-left px-2 py-1 font-medium">{f}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-t border-zinc-200/30 dark:border-zinc-800/30">
                            {csvHeaders.map((h, hi) => {
                              if (!columnMap[h]) return null
                              return <td key={hi} className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">{row[hi] || ''}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleExecuteImport} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">Add {csvRows.length} contacts</button>
                    <button onClick={() => setImportStep('mapping')} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Back</button>
                    <button onClick={resetImport} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                  </div>
                </div>
              )}

              {importStep === 'done' && importResult && (
                <div className="border border-emerald-500/20 rounded-xl p-5 bg-emerald-500/5">
                  <h3 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">All done!</h3>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Added <span className="font-semibold text-emerald-600 dark:text-emerald-400">{importResult.imported}</span> new contacts.
                    {importResult.skipped > 0 && <> {importResult.skipped} already existed and were skipped.</>}
                  </p>
                  <button onClick={resetImport} className="mt-3 px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Done</button>
                </div>
              )}
            </div>

            {/* Export */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Export</p>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleExportCsv}
                  className="px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                  Spreadsheet (basic)
                </button>
                <button onClick={handleExportFullCsv}
                  className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors">
                  Spreadsheet (with tags &amp; groups)
                </button>
                <button onClick={handleExportJson}
                  className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
                  Complete backup
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Full spreadsheet includes tags, groups, and keep-in-touch. Complete backup includes everything: contacts, interactions, reminders, and custom fields.</p>
              {exportMessage && <p className="text-xs text-emerald-500 mt-2">{exportMessage}</p>}
            </div>
          </div>
        </section>

        {/* Push Notifications (Web only) */}
        {isPushSupported() && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Notifications</h2>
            <NotificationToggle />
          </section>
        )}

        {/* Backup */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Backup</h2>
          <button onClick={handleBackup}
            className="px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">Export Database Backup</button>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-2">Saves a copy of the entire SQLite database file.</p>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-xs font-semibold text-red-400/70 uppercase tracking-wider mb-3">Danger Zone</h2>
          <div className="border border-red-500/15 rounded-xl p-5 bg-red-500/5">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">Permanently delete all data. This cannot be undone.</p>
            {resetStep === 0 && (
              <button onClick={handleReset} className="px-4 py-2 text-sm font-medium text-red-500 dark:text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">Reset Database</button>
            )}
            {resetStep === 1 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-500 dark:text-red-400">Are you sure? This deletes everything.</span>
                <button onClick={handleReset} className="px-3 py-1.5 text-sm font-medium text-red-500 dark:text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">Yes, continue</button>
                <button onClick={() => setResetStep(0)} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
              </div>
            )}
            {resetStep === 2 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-500 dark:text-red-400 font-semibold">Final confirmation — all data will be lost.</span>
                <button onClick={handleReset} className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors">Delete Everything</button>
                <button onClick={() => setResetStep(0)} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
              </div>
            )}
          </div>
        </section>

        {/* Help / FAQ */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Help</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
            <details className="group">
              <summary className="text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">Where is my data stored?</summary>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 pl-1">All your data is stored locally on your computer in a SQLite database. Nothing is sent to any server unless you explicitly enable online backup via your Supabase account. Your local data is always the primary copy.</p>
            </details>
            <details className="group">
              <summary className="text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">How do I set up the AI Copilot?</summary>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 pl-1">Nexus Copilot uses your own Anthropic API key (BYOK). Go to Settings &gt; AI / Copilot, paste your key, and click Save. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">console.anthropic.com</a>. Your key is stored locally and never shared.</p>
            </details>
            <details className="group">
              <summary className="text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">How do I import from LinkedIn?</summary>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 pl-1">Two ways: (1) Use the Nexus Chrome extension to save profiles one-by-one from LinkedIn. (2) Export your connections from LinkedIn (Settings &gt; Data Privacy &gt; Get a copy of your data &gt; Connections), then go to Import in Nexus and upload the CSV file. Nexus auto-detects LinkedIn's format.</p>
            </details>
            <details className="group">
              <summary className="text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">How do I sync across devices?</summary>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 pl-1">Sign in with your Supabase account under Settings &gt; Account to enable online backup. Your data is encrypted in transit and stored in your own Supabase project. Local data always takes priority in case of conflict.</p>
            </details>
            <details className="group">
              <summary className="text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">Is Nexus really free?</summary>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 pl-1">Yes. Nexus is completely free with unlimited contacts and all core features. Premium add-ons (like advanced sales and VC tools) may be offered in the future, but the core CRM will always remain free.</p>
            </details>
            <div className="pt-1 text-xs text-zinc-400">
              More info on <a href="https://github.com/danieljpuusitalo/nexus" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">GitHub</a>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">About</h2>
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Nexus — Personal CRM</p>
                <p className="text-xs text-zinc-500">Version 1.0.0</p>
              </div>
              <button
                onClick={() => window.open('https://github.com/danieljpuusitalo/nexus/releases', '_blank')}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                Check for Updates
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a href="https://github.com/danieljpuusitalo/nexus" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">GitHub</a>
              <a href="https://github.com/danieljpuusitalo/nexus/issues" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">Report a Bug</a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function NotificationToggle() {
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    isSubscribedToPush().then(v => { setSubscribed(v); setLoading(false) })
  }, [])

  async function handleToggle() {
    setLoading(true)
    if (subscribed) {
      await unsubscribeFromPush()
      setSubscribed(false)
    } else {
      const ok = await subscribeToPush()
      setSubscribed(ok)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Push notifications</p>
        <p className="text-xs text-zinc-400 mt-0.5">Get notified about reminders and overdue contacts</p>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          subscribed ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'
        } ${loading ? 'opacity-50' : ''}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          subscribed ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
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

function AiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
      <circle cx="8" cy="8" r="3" />
      <path d="M5.5 5.5L4 4M10.5 5.5L12 4M5.5 10.5L4 12M10.5 10.5L12 12" />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

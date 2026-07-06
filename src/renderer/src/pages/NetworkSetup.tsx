import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SourceCard, GmailConnectFlow, OutlookConnectFlow } from '../components/import'
import type { SourceStatus } from '../components/import'
import { useToast } from '../components/ui/Toast'

interface SourceState {
  status: SourceStatus
  contactCount?: number
}

const SOURCES = [
  { id: 'gmail', name: 'Gmail', description: 'Find contacts from your email history', icon: '\u{1F4E7}' },
  { id: 'outlook', name: 'Outlook', description: 'Find contacts from your email and calendar', icon: '\u{1F4C5}' },
  { id: 'linkedin', name: 'LinkedIn', description: 'Save profiles with Chrome extension', icon: '\u{1F4BC}' },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Add contacts from a chat export', icon: '\u{1F4AC}' },
  { id: 'telegram', name: 'Telegram', description: 'Add contacts from your data export', icon: '\u{2708}\u{FE0F}' },
  { id: 'instagram', name: 'Instagram', description: 'Import people you follow', icon: '\u{1F4F7}' },
  { id: 'phone', name: 'Phone Contacts', description: 'Import from a contacts file', icon: '\u{1F4F1}' },
  { id: 'imessage', name: 'iMessage', description: 'Mac only — import chat contacts', icon: '\u{1F4AC}', comingSoon: true },
  { id: 'csv', name: 'Any File', description: 'CSV, VCard, or JSON file', icon: '\u{1F4C4}' },
] as const

export default function NetworkSetup() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [sources, setSources] = useState<Record<string, SourceState>>({})
  const [showGmailFlow, setShowGmailFlow] = useState(false)
  const [showOutlookFlow, setShowOutlookFlow] = useState(false)

  useEffect(() => {
    checkConnectedSources()
  }, [])

  async function checkConnectedSources() {
    const state: Record<string, SourceState> = {}

    // Check Google
    try {
      const gs = await window.api.google.getStatus() as { connected?: boolean }
      if (gs?.connected) state.gmail = { status: 'connected' }
    } catch { /* ignore */ }

    // Check Microsoft
    try {
      const ms = await window.api.microsoft.getStatus() as { connected?: boolean }
      if (ms?.connected) state.outlook = { status: 'connected' }
    } catch { /* ignore */ }

    // Check if any import has happened (for csv/linkedin/instagram/phone)
    try {
      const hasImported = await window.api.settings.get('has_imported') as string | null
      if (hasImported === 'true') state.csv = { status: 'connected' }
    } catch { /* ignore */ }

    setSources(state)
  }

  function getStatus(id: string): SourceStatus {
    return sources[id]?.status || 'not_connected'
  }

  const connectedCount = Object.values(sources).filter(s => s.status === 'connected').length

  function handleGmail() {
    if (getStatus('gmail') === 'connected') {
      navigate('/import')
      return
    }
    setShowGmailFlow(true)
  }

  function handleOutlook() {
    if (getStatus('outlook') === 'connected') {
      navigate('/import')
      return
    }
    setShowOutlookFlow(true)
  }

  function handleConnectComplete() {
    checkConnectedSources()
  }

  function handleLinkedin() {
    // Open extension store or instructions
    navigate('/import')
  }

  function handleInstagram() {
    navigate('/import')
  }

  function handleWhatsApp() {
    navigate('/import')
  }

  function handleTelegram() {
    navigate('/import')
  }

  function handlePhone() {
    navigate('/import')
  }

  function handleCsv() {
    navigate('/import')
  }

  async function handleSkip() {
    await window.api.settings.set('network_setup_complete', 'true')
    navigate('/')
  }

  async function handleFinish() {
    await window.api.settings.set('network_setup_complete', 'true')
    navigate('/contacts')
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Let's build your network
          </h1>
          <p className="text-base text-zinc-500 dark:text-zinc-400">
            Connect where your contacts already live. Takes about 2 minutes.
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            You can skip any step.
          </p>
        </div>

        {/* Source card grid: 3x3 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {SOURCES.map(source => (
            <SourceCard
              key={source.id}
              icon={<span>{source.icon}</span>}
              name={source.name}
              description={source.description}
              status={getStatus(source.id)}
              contactCount={sources[source.id]?.contactCount}
              comingSoon={'comingSoon' in source && source.comingSoon}
              onAction={
                source.id === 'gmail' ? handleGmail :
                source.id === 'outlook' ? handleOutlook :
                source.id === 'linkedin' ? handleLinkedin :
                source.id === 'instagram' ? handleInstagram :
                source.id === 'whatsapp' ? handleWhatsApp :
                source.id === 'telegram' ? handleTelegram :
                source.id === 'phone' ? handlePhone :
                source.id === 'csv' ? handleCsv :
                () => {}
              }
              actionLabel={
                getStatus(source.id) === 'connected' ? 'View in Import' :
                source.id === 'linkedin' ? 'How to Import' :
                source.id === 'csv' ? 'Upload File' :
                source.id === 'phone' ? 'Import Contacts' :
                source.id === 'instagram' ? 'How to Import' :
                source.id === 'whatsapp' ? 'Upload File' :
                source.id === 'telegram' ? 'Upload File' :
                undefined
              }
            />
          ))}
        </div>

        {/* Footer: skip link + connected counter */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Skip — I'll add contacts later
          </button>

          <div className="flex items-center gap-4">
            {connectedCount > 0 && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {connectedCount} connected
              </span>
            )}

            {connectedCount >= 3 && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-zinc-500">Great start! You can always add more later.</span>
                <button
                  onClick={handleFinish}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
                >
                  Go to My Contacts
                </button>
              </div>
            )}

            {connectedCount > 0 && connectedCount < 3 && (
              <button
                onClick={handleFinish}
                className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gmail Connect Flow */}
      {showGmailFlow && (
        <GmailConnectFlow
          onClose={() => setShowGmailFlow(false)}
          onComplete={() => { setShowGmailFlow(false); handleConnectComplete() }}
        />
      )}

      {/* Outlook Connect Flow */}
      {showOutlookFlow && (
        <OutlookConnectFlow
          onClose={() => setShowOutlookFlow(false)}
          onComplete={() => { setShowOutlookFlow(false); handleConnectComplete() }}
        />
      )}
    </div>
  )
}

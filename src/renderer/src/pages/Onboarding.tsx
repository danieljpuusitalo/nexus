import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Step {
  id: string
  label: string
  description: string
  tier: 1 | 2 | 3
  checkFn?: (status: DataStatus) => boolean
  action?: string // route to navigate to
}

interface DataStatus {
  contacts: number
  interactions: number
  groups: number
  kitContacts: number
  hasGroupWith10: boolean
  notes: number
  googleConnected: boolean
  hasImported: boolean
}

const TIERS = [
  { id: 1, name: 'Getting Started', color: 'emerald' },
  { id: 2, name: 'Organize Your Contacts', color: 'blue' },
  { id: 3, name: 'Make the Most of Nexus', color: 'violet' }
]

const STEPS: Step[] = [
  // Tier 1 — Getting Started
  { id: 'add_5_contacts', label: 'Add your first 5 contacts', description: 'Start building your network by adding contacts. You can import from CSV, Google Contacts, or add them manually.', tier: 1, checkFn: s => s.contacts >= 5, action: '/contacts' },
  { id: 'connect_or_import', label: 'Connect a platform or import contacts', description: 'Connect Google or Microsoft to sync your contacts, or import a CSV file from LinkedIn, Dex, Clay, or another source.', tier: 1, checkFn: s => s.hasImported, action: '/import' },
  { id: 'add_3_notes', label: 'Add 3 interaction notes', description: 'Log meetings, calls, or notes to keep track of your conversations. Go to any contact and click "Log Interaction".', tier: 1, checkFn: s => s.notes >= 3, action: '/contacts' },
  { id: 'create_group', label: 'Create a group', description: 'Organize your contacts into groups like "Work", "Family", or "Investors". Groups help you filter and manage your network.', tier: 1, checkFn: s => s.groups >= 1, action: '/groups' },
  { id: 'set_frequency', label: 'Set a keep-in-touch frequency', description: 'Pick a contact and set how often you want to stay in touch. Nexus will remind you when you\'re falling behind.', tier: 1, checkFn: s => s.kitContacts >= 1, action: '/contacts' },

  // Tier 2 — Organize
  { id: 'connect_google', label: 'Connect Google', description: 'Sync your calendar events and contacts from your Google account. Go to Settings to connect.', tier: 2, checkFn: s => s.googleConnected, action: '/settings' },
  { id: 'group_with_10', label: 'Create a group with 10+ contacts', description: 'Build a meaningful group by adding at least 10 contacts. Try grouping by industry, location, or relationship type.', tier: 2, checkFn: s => s.hasGroupWith10, action: '/groups' },
  { id: 'kit_10', label: 'Set keep-in-touch for 10 contacts', description: 'The more contacts you track, the better Nexus can help you maintain your relationships. Set frequency for at least 10 people.', tier: 2, checkFn: s => s.kitContacts >= 10, action: '/keep-in-touch' },
  { id: 'try_bulk_edit', label: 'Try bulk edit', description: 'Select multiple contacts on the Contacts page and use bulk actions to add tags, set groups, or change frequencies at once.', tier: 2, action: '/contacts' },
  { id: 'try_quick_action', label: 'Try Quick Action', description: 'Quick Action lets you rapidly triage uncategorized contacts. Use keyboard shortcuts to set frequencies in seconds.', tier: 2, action: '/quick-action' },

  // Tier 3 — Make the Most
  { id: 'try_search', label: 'Try global search (Ctrl+K)', description: 'Press Ctrl+K to open the command palette. Search for contacts, groups, tags, or jump to any page instantly.', tier: 3 },
  { id: 'view_shortcuts', label: 'View keyboard shortcuts', description: 'Press ? to see all keyboard shortcuts. Nexus is designed for power users who want to navigate quickly.', tier: 3 },
  { id: 'try_copilot', label: 'Try Copilot', description: 'Ask Nexus Copilot about your network. Try questions like "Who should I reconnect with?" or "Who works at Google?"', tier: 3, action: '/copilot' },
  { id: 'kit_15', label: 'Set keep-in-touch for 15 contacts', description: 'You\'re becoming a relationship pro! Keep expanding your active network by tracking more connections.', tier: 3, checkFn: s => s.kitContacts >= 15, action: '/keep-in-touch' },
  { id: 'explore_map', label: 'Explore the Map view', description: 'See where your contacts are located around the world. Click on markers to view contacts in each city.', tier: 3, action: '/map' }
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<Record<string, string>>({})
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)
  const [selectedStep, setSelectedStep] = useState<string>(STEPS[0].id)

  useEffect(() => {
    loadProgress()
  }, [])

  async function loadProgress() {
    const [prog, status] = await Promise.all([
      window.api.onboarding.getProgress() as Promise<Record<string, string>>,
      window.api.onboarding.checkStatus() as Promise<DataStatus>
    ])

    // Auto-complete steps whose data checks pass
    const autoComplete: string[] = []
    for (const step of STEPS) {
      if (!prog[step.id] && step.checkFn && step.checkFn(status)) {
        autoComplete.push(step.id)
      }
    }
    if (autoComplete.length > 0) {
      for (const id of autoComplete) {
        await window.api.onboarding.completeStep(id)
        prog[id] = new Date().toISOString()
      }
    }

    setProgress(prog)
    setDataStatus(status)

    // Select first incomplete step
    const firstIncomplete = STEPS.find(s => !prog[s.id])
    if (firstIncomplete) setSelectedStep(firstIncomplete.id)
  }

  async function handleMarkComplete(stepId: string) {
    await window.api.onboarding.completeStep(stepId)
    await loadProgress()
  }

  async function handleDismiss() {
    await window.api.settings.set('checklist_dismissed', 'true')
    navigate('/')
  }

  const completedCount = STEPS.filter(s => progress[s.id]).length
  const totalSteps = STEPS.length
  const selected = STEPS.find(s => s.id === selectedStep) || STEPS[0]
  const isCompleted = !!progress[selected.id]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Get Started with Nexus</h1>
            <button
              onClick={handleDismiss}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              Dismiss checklist
            </button>
          </div>
          <p className="text-sm text-zinc-500 mt-1">Complete these steps to get the most out of your personal CRM.</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / totalSteps) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{completedCount}/{totalSteps}</span>
          </div>
        </div>

        {/* Layout: Steps list + Detail panel */}
        <div className="flex gap-6 min-h-[400px]">
          {/* Left: Steps */}
          <div className="w-80 flex-shrink-0 space-y-6">
            {TIERS.map(tier => {
              const tierSteps = STEPS.filter(s => s.tier === tier.id)
              const tierCompleted = tierSteps.filter(s => progress[s.id]).length

              return (
                <div key={tier.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                      tier.color === 'emerald' ? 'text-emerald-500' :
                      tier.color === 'blue' ? 'text-blue-500' : 'text-violet-500'
                    }`}>{tier.name}</span>
                    <span className="text-[10px] text-zinc-400">{tierCompleted}/{tierSteps.length}</span>
                  </div>
                  <div className="space-y-1">
                    {tierSteps.map(step => {
                      const done = !!progress[step.id]
                      const active = selectedStep === step.id
                      return (
                        <button key={step.id}
                          onClick={() => setSelectedStep(step.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                            active
                              ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                          }`}>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            done
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}>
                            {done && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8l3 3 7-7" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm ${
                            done ? 'text-zinc-400 dark:text-zinc-600 line-through' : 'text-zinc-700 dark:text-zinc-300'
                          }`}>{step.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right: Detail panel */}
          <div className="flex-1 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selected.label}</h2>
                <span className={`text-xs font-medium ${
                  selected.tier === 1 ? 'text-emerald-500' :
                  selected.tier === 2 ? 'text-blue-500' : 'text-violet-500'
                }`}>{TIERS.find(t => t.id === selected.tier)?.name}</span>
              </div>
              {isCompleted ? (
                <span className="px-3 py-1 text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-full">
                  Completed
                </span>
              ) : (
                <button
                  onClick={() => handleMarkComplete(selected.id)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-500 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  Mark as done
                </button>
              )}
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">{selected.description}</p>

            {selected.action && !isCompleted && (
              <button
                onClick={() => navigate(selected.action!)}
                className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
              >
                Go to {selected.action === '/contacts' ? 'Contacts' :
                  selected.action === '/groups' ? 'Groups' :
                  selected.action === '/keep-in-touch' ? 'Keep In Touch' :
                  selected.action === '/quick-action' ? 'Quick Action' :
                  selected.action === '/copilot' ? 'Copilot' :
                  selected.action === '/settings' ? 'Settings' :
                  selected.action === '/import' ? 'Import' :
                  selected.action === '/map' ? 'Map' : selected.action}
              </button>
            )}

            {/* Data-driven progress hint */}
            {selected.checkFn && dataStatus && !isCompleted && (
              <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
                <p className="text-xs text-zinc-500">
                  {selected.id === 'add_5_contacts' && `Current progress: ${dataStatus.contacts}/5 contacts`}
                  {selected.id === 'connect_or_import' && (dataStatus.hasImported ? 'Contacts imported!' : 'No import yet')}
                  {selected.id === 'add_3_notes' && `Current progress: ${dataStatus.notes}/3 notes`}
                  {selected.id === 'create_group' && `Groups created: ${dataStatus.groups}`}
                  {selected.id === 'set_frequency' && `Contacts with frequency: ${dataStatus.kitContacts}/1`}
                  {selected.id === 'connect_google' && (dataStatus.googleConnected ? 'Google connected!' : 'Not connected yet')}
                  {selected.id === 'group_with_10' && (dataStatus.hasGroupWith10 ? 'You have a group with 10+ contacts!' : 'No group with 10+ contacts yet')}
                  {selected.id === 'kit_10' && `Contacts with frequency: ${dataStatus.kitContacts}/10`}
                  {selected.id === 'kit_15' && `Contacts with frequency: ${dataStatus.kitContacts}/15`}
                </p>
              </div>
            )}

            {completedCount === totalSteps && (
              <div className="mt-6 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800/40 rounded-xl text-center">
                <p className="text-lg font-bold text-violet-600 dark:text-violet-400 mb-1">All done!</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">You've completed the onboarding checklist. You're a Nexus pro!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

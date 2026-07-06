import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ImportProgress from './ImportProgress'
import ResultsScreen from './ResultsScreen'
import ErrorState from './ErrorState'
import type { ImportResultData } from './ResultsScreen'

type FlowStep = 'intro' | 'progress' | 'results' | 'error'

interface Props {
  onClose: () => void
  onComplete: () => void
}

const SYNC_STEPS = [
  'Connecting to Outlook...',
  'Reading your contacts...',
  'Looking for extra details in signatures...',
  'Skipping contacts you already have...',
  'Done!',
]

export default function OutlookConnectFlow({ onClose, onComplete }: Props) {
  const navigate = useNavigate()
  const [step, setStep] = useState<FlowStep>('intro')
  const [currentSyncStep, setCurrentSyncStep] = useState(0)
  const [result, setResult] = useState<ImportResultData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleConnect() {
    setStep('progress')
    setCurrentSyncStep(0)

    try {
      const authResult = await window.api.microsoft.connect() as { success?: boolean; error?: string }
      if (!authResult?.success) {
        setErrorMsg(authResult?.error || 'Outlook didn\'t accept the connection. This usually happens if you cancelled the login. Try again?')
        setStep('error')
        return
      }

      setCurrentSyncStep(1)
      const syncResult = await window.api.microsoft.importContacts() as {
        success: boolean; imported?: number; updated?: number; skipped?: number; error?: string
      }

      if (!syncResult.success) {
        setErrorMsg(syncResult.error || 'Could not read your contacts. Try again?')
        setStep('error')
        return
      }

      // Signature enrichment (optional)
      setCurrentSyncStep(2)
      try {
        await window.api.google.runSignatureEnrichment?.()
      } catch { /* optional */ }

      setCurrentSyncStep(3)
      setCurrentSyncStep(4)

      const total = (syncResult.imported || 0) + (syncResult.updated || 0) + (syncResult.skipped || 0)
      setResult({
        source: 'Outlook',
        total,
        newContacts: syncResult.imported || 0,
        existing: syncResult.updated || 0,
        skipped: syncResult.skipped || 0,
      })
      setStep('results')
    } catch {
      setErrorMsg('Something went wrong connecting to Outlook. This usually happens if you cancelled the login. Try again?')
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={step === 'intro' ? onClose : undefined} />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-8 w-full max-w-md shadow-2xl">

        {step === 'intro' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-3xl">
                {'\u{1F4C5}'}
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Connect your Outlook or Office 365
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Nexus will find contacts from your emails and calendar meetings.
              </p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Works with personal Outlook, Office 365, and work Microsoft accounts</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Your emails are never stored</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">You can disconnect at any time</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConnect}
                className="flex-1 px-5 py-3 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
              >
                Connect Outlook — opens Microsoft login
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Not now
              </button>
            </div>
          </>
        )}

        {step === 'progress' && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2 text-center">
              Setting up Outlook...
            </h2>
            <p className="text-sm text-zinc-500 text-center mb-4">
              This may take a moment. Please don't close this window.
            </p>
            <ImportProgress
              steps={SYNC_STEPS.map((label, i) => ({ label, done: i < currentSyncStep }))}
              currentStep={currentSyncStep}
            />
          </div>
        )}

        {step === 'results' && result && (
          <ResultsScreen
            result={result}
            onViewContacts={() => { onComplete(); navigate('/contacts') }}
            onDone={() => { onComplete(); onClose() }}
          />
        )}

        {step === 'error' && (
          <ErrorState
            message={errorMsg}
            onRetry={() => setStep('intro')}
            onSkip={onClose}
          />
        )}
      </div>
    </div>
  )
}

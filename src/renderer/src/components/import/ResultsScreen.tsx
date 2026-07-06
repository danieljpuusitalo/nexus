export interface ImportResultData {
  source: string
  total: number
  newContacts: number
  existing: number
  skipped: number
}

interface ResultsScreenProps {
  result: ImportResultData
  onViewContacts: () => void
  onDone: () => void
}

export default function ResultsScreen({ result, onViewContacts, onDone }: ResultsScreenProps) {
  return (
    <div className="text-center py-6">
      {/* Success icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Done!</h3>

      <p className="text-base text-zinc-600 dark:text-zinc-400 mb-4">
        Found {result.total} contact{result.total !== 1 ? 's' : ''} from {result.source}
      </p>

      {/* Breakdown */}
      <div className="inline-block text-left space-y-1 mb-6">
        {result.newContacts > 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-emerald-500">+</span>
            <span>{result.newContacts} new contact{result.newContacts !== 1 ? 's' : ''} added</span>
          </div>
        )}
        {result.existing > 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-blue-500">~</span>
            <span>{result.existing} already in Nexus</span>
          </div>
        )}
        {result.skipped > 0 && (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-400">-</span>
            <span>{result.skipped} duplicate{result.skipped !== 1 ? 's' : ''} skipped</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        {result.newContacts > 0 && (
          <button
            onClick={onViewContacts}
            className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
          >
            View New Contacts
          </button>
        )}
        <button
          onClick={onDone}
          className="px-5 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          {result.newContacts > 0 ? 'Go to Dashboard' : 'Done'}
        </button>
      </div>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  detail?: string
  onRetry: () => void
  onSkip?: () => void
}

export default function ErrorState({ message, detail, onRetry, onSkip }: ErrorStateProps) {
  return (
    <div className="text-center py-6">
      {/* Error icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>

      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
        Something went wrong
      </h3>

      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1 max-w-sm mx-auto">
        {message}
      </p>

      {detail && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4 max-w-sm mx-auto">
          {detail}
        </p>
      )}

      {!detail && <div className="mb-4" />}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onRetry}
          className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
        >
          Try Again
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="px-5 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

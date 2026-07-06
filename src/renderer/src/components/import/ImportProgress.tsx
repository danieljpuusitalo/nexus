export interface ImportProgressProps {
  steps: { label: string; done: boolean }[]
  currentStep: number
  percent?: number
}

export default function ImportProgress({ steps, currentStep, percent }: ImportProgressProps) {
  return (
    <div className="w-full space-y-4 py-4">
      {/* Progress bar */}
      <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent ?? Math.round(((currentStep + 1) / steps.length) * 100)}%` }}
        />
      </div>

      {/* Steps list */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            {step.done ? (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : i === currentStep ? (
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
            )}
            <span className={`text-sm ${
              step.done
                ? 'text-emerald-600 dark:text-emerald-400'
                : i === currentStep
                  ? 'text-zinc-900 dark:text-zinc-100 font-medium'
                  : 'text-zinc-400 dark:text-zinc-600'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

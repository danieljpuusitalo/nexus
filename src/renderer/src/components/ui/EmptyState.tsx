import { useNavigate } from 'react-router-dom'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  body: string
  actionLabel?: string
  actionRoute?: string
  onAction?: () => void
}

export default function EmptyState({ icon, title, body, actionLabel, actionRoute, onAction }: EmptyStateProps) {
  const navigate = useNavigate()

  function handleClick() {
    if (onAction) onAction()
    else if (actionRoute) navigate(actionRoute)
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="text-zinc-300 dark:text-zinc-700 mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{title}</h3>
      <p className="text-sm text-zinc-400 max-w-sm">{body}</p>
      {actionLabel && (
        <button
          onClick={handleClick}
          className="mt-5 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

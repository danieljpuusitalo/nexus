import { useState } from 'react'

export type SourceStatus = 'not_connected' | 'connecting' | 'connected' | 'syncing' | 'error'

export interface SourceCardProps {
  icon: React.ReactNode
  name: string
  description: string
  status: SourceStatus
  contactCount?: number
  lastSync?: string | null
  actionLabel?: string
  onAction: () => void
  onSecondaryAction?: () => void
  secondaryLabel?: string
  disabled?: boolean
  comingSoon?: boolean
}

function formatRelativeTime(iso: string): string {
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

const STATUS_STYLES: Record<SourceStatus, { border: string; badge: string; dot: string; label: string }> = {
  not_connected: {
    border: 'border-zinc-200 dark:border-zinc-800/60',
    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
    dot: 'bg-zinc-400',
    label: 'Not connected'
  },
  connecting: {
    border: 'border-blue-300 dark:border-blue-800/60',
    badge: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500 animate-pulse',
    label: 'Connecting...'
  },
  connected: {
    border: 'border-emerald-300 dark:border-emerald-800/60',
    badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'Connected'
  },
  syncing: {
    border: 'border-blue-300 dark:border-blue-800/60',
    badge: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500 animate-pulse',
    label: 'Updating...'
  },
  error: {
    border: 'border-red-300 dark:border-red-800/60',
    badge: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    label: 'Problem connecting'
  }
}

export default function SourceCard({
  icon, name, description, status, contactCount, lastSync,
  actionLabel, onAction, onSecondaryAction, secondaryLabel,
  disabled, comingSoon
}: SourceCardProps) {
  const [hovered, setHovered] = useState(false)
  const styles = STATUS_STYLES[status]
  const isActive = status === 'connecting' || status === 'syncing'

  const defaultActionLabel = status === 'connected'
    ? 'Update Now'
    : status === 'error'
      ? 'Try Again'
      : `Connect ${name}`

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative rounded-xl border ${styles.border} bg-white dark:bg-zinc-900/50 p-5 transition-all duration-200 ${
        hovered && !comingSoon ? 'shadow-lg shadow-zinc-200/50 dark:shadow-black/20 -translate-y-0.5' : ''
      } ${comingSoon ? 'opacity-60' : ''}`}
      style={{ minHeight: '140px' }}
    >
      {/* Header: icon + name + status */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-zinc-50 dark:bg-zinc-800/50">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{name}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      {/* Connected status info */}
      {status === 'connected' && (contactCount !== undefined || lastSync) && (
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
            {styles.label}
          </span>
          {contactCount !== undefined && (
            <span className="text-xs text-zinc-500">{contactCount} contact{contactCount !== 1 ? 's' : ''}</span>
          )}
          {lastSync && (
            <span className="text-xs text-zinc-400">Last updated {formatRelativeTime(lastSync)}</span>
          )}
        </div>
      )}

      {/* Progress indicator for connecting/syncing */}
      {isActive && (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-600 dark:text-blue-400">{styles.label}</span>
          </div>
        </div>
      )}

      {/* Error state badge */}
      {status === 'error' && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
            {styles.label}
          </span>
        </div>
      )}

      {/* Action buttons */}
      {comingSoon ? (
        <span className="inline-block px-4 py-2 text-sm font-medium text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-default">
          Coming Soon
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={onAction}
            disabled={disabled || isActive}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              status === 'connected'
                ? 'text-violet-600 dark:text-violet-400 border border-violet-500/30 hover:bg-violet-500/10'
                : 'text-white bg-violet-600 hover:bg-violet-500'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {actionLabel || defaultActionLabel}
          </button>
          {onSecondaryAction && secondaryLabel && (
            <button
              onClick={onSecondaryAction}
              disabled={disabled || isActive}
              className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function SlideOver({ open, onClose, title, children }: SlideOverProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 overlay-enter"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-zinc-950 border-l border-zinc-800/60 h-full flex flex-col slide-over-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800/60 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

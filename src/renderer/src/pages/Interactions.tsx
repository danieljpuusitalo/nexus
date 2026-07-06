import { useEffect, useState, useMemo } from 'react'
import type { Interaction } from '../types'
import EmptyState from '../components/ui/EmptyState'

const TYPE_ICONS: Record<string, string> = {
  meeting: '\u{1F91D}', call: '\u{1F4DE}', email: '\u{1F4E7}', note: '\u{1F4DD}',
  coffee: '\u2615', event: '\u{1F3AF}', calendar: '\u{1F4C5}', job_change: '\u{1F4BC}',
  other: '\u{1F4AC}'
}

const TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting', call: 'Call', email: 'Email', note: 'Note',
  coffee: 'Coffee', event: 'Event', calendar: 'Calendar', job_change: 'Job Change',
  other: 'Other'
}

const ALL_TYPES = ['meeting', 'call', 'email', 'note', 'coffee', 'event', 'calendar', 'job_change', 'other'] as const

export default function Interactions() {
  const [loading, setLoading] = useState(true)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [filterType, setFilterType] = useState<string>('')

  useEffect(() => { loadInteractions().finally(() => setLoading(false)) }, [])

  async function loadInteractions() {
    const data = await window.api.interactions.getAll()
    setInteractions(data as Interaction[])
  }

  async function handleDelete(id: number) {
    await window.api.interactions.delete(id)
    await loadInteractions()
  }

  const filtered = useMemo(() => {
    if (!filterType) return interactions
    return interactions.filter(i => i.type === filterType)
  }, [interactions, filterType])

  const grouped = useMemo(() => {
    const groups: Map<string, Interaction[]> = new Map()
    for (const item of filtered) {
      const key = item.date
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return Array.from(groups.entries())
  }, [filtered])

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (diff < 1 && diff >= 0) return 'Today'
    if (diff < 2 && diff >= 1) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 w-40 bg-zinc-800 rounded animate-pulse" />
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Interactions</h1>
          <p className="text-sm text-zinc-500 mt-1">{filtered.length} interaction{filtered.length !== 1 ? 's' : ''} logged</p>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 outline-none focus:border-violet-500/50">
          <option value="">All Types</option>
          {ALL_TYPES.map(t => (<option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>))}
        </select>
      </div>

      {filtered.length === 0 ? (
        interactions.length === 0 ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>}
            title="No interactions logged yet"
            body="Start by adding a note on any contact."
            actionLabel="Go to Contacts"
            actionRoute="/contacts"
          />
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-12 text-center">
            <p className="text-sm text-zinc-400">No interactions match this filter.</p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{formatDate(date)}</h3>
              <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
                {items.map(int => (
                  <div key={int.id} className="flex items-start gap-3 px-5 py-3.5 group hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[int.type] || '\u{1F4AC}'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">{int.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{int.first_name} {int.last_name}</span>
                        <span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">{TYPE_LABELS[int.type] || int.type}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(int.id)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

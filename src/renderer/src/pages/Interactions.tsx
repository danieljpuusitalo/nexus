import { useEffect, useState, useMemo } from 'react'
import type { Interaction } from '../types'

const TYPE_ICONS: Record<string, string> = {
  meeting: '\u{1F91D}', call: '\u{1F4DE}', email: '\u{1F4E7}', note: '\u{1F4DD}',
  coffee: '\u2615', event: '\u{1F3AF}', other: '\u{1F4AC}'
}

const ALL_TYPES = ['meeting', 'call', 'email', 'note', 'coffee', 'event', 'other'] as const

export default function Interactions() {
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [filterType, setFilterType] = useState<string>('')

  useEffect(() => { loadInteractions() }, [])

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

  // Group by date
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

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Interactions</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {filtered.length} interaction{filtered.length !== 1 ? 's' : ''} logged
          </p>
        </div>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-zinc-900 border border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
        >
          <option value="">All Types</option>
          {ALL_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-zinc-800/60 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">{'\u{1F4AC}'}</div>
          <p className="text-sm text-zinc-500">
            {interactions.length === 0
              ? 'No interactions yet. Log one from a contact\'s detail page.'
              : 'No interactions match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                {formatDate(date)}
              </h3>
              <div className="border border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-800/40">
                {items.map(int => (
                  <div key={int.id} className="flex items-start gap-3 px-5 py-3.5 group hover:bg-zinc-800/20 transition-colors">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[int.type] || '\u{1F4AC}'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{int.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-400">{int.first_name} {int.last_name}</span>
                        <span className="text-xs text-zinc-700">&middot;</span>
                        <span className="text-xs text-zinc-600">{int.type}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(int.id)}
                      className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0"
                    >
                      &#10005;
                    </button>
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

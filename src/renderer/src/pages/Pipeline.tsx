import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Tag } from '../types'
import EmptyState from '../components/ui/EmptyState'

interface PipelineContact {
  id: number
  first_name: string
  last_name: string
  company: string
  photo_url: string
  keep_in_touch_days: number
  last_interaction_date: string | null
  tags: Tag[]
}

interface Column {
  label: string
  range: string
  color: string
  borderColor: string
  bgColor: string
  contacts: PipelineContact[]
}

function getHealth(daysSince: number, frequency: number): 'fresh' | 'good' | 'stale' | 'cold' {
  const freq = frequency || 30
  if (daysSince <= freq * 0.5) return 'fresh'
  if (daysSince <= freq) return 'good'
  if (daysSince <= freq * 1.5) return 'stale'
  return 'cold'
}

const HEALTH_DOT: Record<string, string> = {
  fresh: 'bg-emerald-400',
  good: 'bg-blue-400',
  stale: 'bg-amber-400',
  cold: 'bg-red-400',
  none: 'bg-zinc-400'
}

export default function Pipeline() {
  const navigate = useNavigate()
  const [columns, setColumns] = useState<Column[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const data = await window.api.pipeline.getData() as PipelineContact[]
    const now = new Date()

    const thisWeek: PipelineContact[] = []
    const thisMonth: PipelineContact[] = []
    const oneToThree: PipelineContact[] = []
    const threePlus: PipelineContact[] = []
    const neverContacted: PipelineContact[] = []

    for (const c of data) {
      if (!c.last_interaction_date) {
        neverContacted.push(c)
        continue
      }
      const daysSince = Math.floor((now.getTime() - new Date(c.last_interaction_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince <= 7) thisWeek.push(c)
      else if (daysSince <= 30) thisMonth.push(c)
      else if (daysSince <= 90) oneToThree.push(c)
      else threePlus.push(c)
    }

    setColumns([
      { label: 'This Week', range: '0-7 days', color: 'text-emerald-600 dark:text-emerald-400', borderColor: 'border-emerald-500/30', bgColor: 'bg-emerald-500/5', contacts: thisWeek },
      { label: 'This Month', range: '8-30 days', color: 'text-blue-600 dark:text-blue-400', borderColor: 'border-blue-500/30', bgColor: 'bg-blue-500/5', contacts: thisMonth },
      { label: '1-3 Months', range: '31-90 days', color: 'text-amber-600 dark:text-amber-400', borderColor: 'border-amber-500/30', bgColor: 'bg-amber-500/5', contacts: oneToThree },
      { label: '3+ Months', range: '91+ days', color: 'text-red-600 dark:text-red-400', borderColor: 'border-red-500/30', bgColor: 'bg-red-500/5', contacts: threePlus },
      { label: 'Never Contacted', range: 'No interactions', color: 'text-zinc-500 dark:text-zinc-400', borderColor: 'border-zinc-300 dark:border-zinc-700/30', bgColor: 'bg-zinc-100/50 dark:bg-zinc-800/20', contacts: neverContacted }
    ])
    setLoading(false)
  }

  function getDaysSince(dateStr: string | null): number {
    if (!dateStr) return -1
    return Math.floor((new Date().getTime() - new Date(dateStr + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Pipeline</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Contacts sorted by last interaction</p>
      </div>

      {/* Empty state */}
      {columns.every(col => col.contacts.length === 0) ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>}
          title="No contacts in your pipeline yet"
          body="Add contacts to track your relationships over time."
          actionLabel="Add Contact"
          actionRoute="/contacts"
        />
      ) : (
      <div className="flex-1 overflow-x-auto px-8 pb-8">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map(col => (
            <div key={col.label} className={`w-72 flex flex-col rounded-xl border ${col.borderColor} ${col.bgColor} flex-shrink-0`}>
              {/* Column Header */}
              <div className="px-4 py-3 border-b border-zinc-200/50 dark:border-zinc-800/30">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</h3>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{col.contacts.length}</span>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">{col.range}</p>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {col.contacts.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center py-4">No contacts</p>
                ) : (
                  col.contacts.map(contact => {
                    const daysSince = getDaysSince(contact.last_interaction_date)
                    const health = daysSince < 0 ? 'none' : getHealth(daysSince, contact.keep_in_touch_days)
                    const initials = (contact.first_name[0] || '') + (contact.last_name?.[0] || '')

                    return (
                      <button
                        key={contact.id}
                        onClick={() => navigate(`/contacts?contactId=${contact.id}`)}
                        className="w-full text-left p-3 rounded-lg bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex-shrink-0">
                            {contact.photo_url ? (
                              <img src={`file://${contact.photo_url}`} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                {initials}
                              </div>
                            )}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${HEALTH_DOT[health]}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {contact.first_name} {contact.last_name}
                            </p>
                            {contact.company && (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{contact.company}</p>
                            )}
                          </div>
                        </div>

                        {/* Tags + last contact */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {contact.tags?.slice(0, 2).map((tag: Tag) => (
                            <span
                              key={tag.id}
                              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{ backgroundColor: tag.color + '18', color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-auto">
                            {contact.last_interaction_date
                              ? new Date(contact.last_interaction_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : 'Never'}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

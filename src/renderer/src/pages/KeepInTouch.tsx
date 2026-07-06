import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact, Group } from '../types'
import EmptyState from '../components/ui/EmptyState'

interface ContactWithLastDate extends Contact {
  last_contact_date: string | null
  days_since: number
  tags?: { id: number; name: string; color: string }[]
  groups?: { id: number; name: string; color: string }[]
}

const FREQUENCY_BUCKETS = [
  { label: 'Every week', value: 7 },
  { label: 'Every 2 weeks', value: 14 },
  { label: 'Every month', value: 30 },
  { label: 'Every 6 weeks', value: 42 },
  { label: 'Every 3 months', value: 90 },
  { label: 'Every 6 months', value: 180 },
  { label: 'Every year', value: 365 },
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

function getStatusColor(daysSince: number, freq: number): string {
  if (daysSince < 0) return 'text-zinc-400'
  if (daysSince <= freq) return 'text-emerald-500'
  if (daysSince <= freq * 1.5) return 'text-amber-500'
  return 'text-red-500'
}

export default function KeepInTouch() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<ContactWithLastDate[]>([])
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [groups, setGroups] = useState<Group[]>([])
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null)
  const [showDontTrack, setShowDontTrack] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [displayCompany, setDisplayCompany] = useState(true)
  const [displayTags, setDisplayTags] = useState(true)
  const [displayLastContact, setDisplayLastContact] = useState(true)

  useEffect(() => {
    Promise.all([
      loadData(),
      window.api.groups.getAll().then((g: unknown) => setGroups(g as Group[])),
      window.api.settings.get('kit_display').then((v: unknown) => {
        if (v) {
          try {
            const s = JSON.parse(v as string)
            if (s.company !== undefined) setDisplayCompany(s.company)
            if (s.tags !== undefined) setDisplayTags(s.tags)
            if (s.lastContact !== undefined) setDisplayLastContact(s.lastContact)
          } catch { /* ignore */ }
        }
      })
    ]).finally(() => setLoading(false))
  }, [])

  async function loadData() {
    const all = await window.api.contacts.getAllWithTags() as ContactWithLastDate[]
    const lastInteractions = await window.api.interactions.getLastForContacts() as { contact_id: number; last_date: string }[]
    const lastMap = new Map<number, string>()
    for (const r of lastInteractions) lastMap.set(r.contact_id, r.last_date)

    const now = new Date()
    const enriched: ContactWithLastDate[] = all.map(c => {
      const lastDate = lastMap.get(c.id) || null
      const daysSince = lastDate
        ? Math.floor((now.getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
        : -1
      return { ...c, last_contact_date: lastDate, days_since: daysSince }
    })
    setContacts(enriched)
    setUncategorizedCount(enriched.filter(c => c.keep_in_touch_days === 0).length)
  }

  function saveDisplaySettings(company: boolean, tags: boolean, lastContact: boolean) {
    setDisplayCompany(company)
    setDisplayTags(tags)
    setDisplayLastContact(lastContact)
    window.api.settings.set('kit_display', JSON.stringify({ company, tags, lastContact }))
  }

  // Filter by group
  const filteredContacts = useMemo(() => {
    if (!filterGroupId) return contacts
    return contacts.filter(c => c.groups?.some(g => g.id === filterGroupId))
  }, [contacts, filterGroupId])

  const grouped = useMemo(() => {
    const buckets = new Map<number, ContactWithLastDate[]>()
    for (const b of FREQUENCY_BUCKETS) buckets.set(b.value, [])

    for (const c of filteredContacts) {
      if (!c.keep_in_touch_days || c.keep_in_touch_days < 0) continue
      const bucket = FREQUENCY_BUCKETS.find(b => b.value === c.keep_in_touch_days)
      if (bucket) {
        buckets.get(bucket.value)!.push(c)
      } else {
        const nearest = FREQUENCY_BUCKETS.reduce((prev, curr) =>
          Math.abs(curr.value - c.keep_in_touch_days) < Math.abs(prev.value - c.keep_in_touch_days) ? curr : prev
        )
        buckets.get(nearest.value)!.push(c)
      }
    }

    for (const [, list] of buckets) {
      list.sort((a, b) => {
        const overdueA = a.days_since >= 0 ? a.days_since - a.keep_in_touch_days : -999
        const overdueB = b.days_since >= 0 ? b.days_since - b.keep_in_touch_days : -999
        return overdueB - overdueA
      })
    }

    return buckets
  }, [filteredContacts])

  const dontTrackContacts = useMemo(() => {
    return filteredContacts.filter(c => c.keep_in_touch_days === -1)
  }, [filteredContacts])

  function renderContactCard(c: ContactWithLastDate) {
    const overdue = c.days_since >= 0 && c.keep_in_touch_days > 0 ? c.days_since - c.keep_in_touch_days : -999
    const statusColor = c.keep_in_touch_days > 0 ? getStatusColor(c.days_since, c.keep_in_touch_days) : 'text-zinc-400'
    return (
      <button key={c.id} onClick={() => navigate(`/contacts?contactId=${c.id}`)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left group">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ backgroundColor: getAvatarColor(`${c.first_name} ${c.last_name}`) }}>
          {c.first_name[0]}{c.last_name?.[0] || ''}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.first_name} {c.last_name}</p>
          {displayCompany && c.company && <p className="text-xs text-zinc-500 truncate">{c.company}</p>}
          {displayTags && c.tags && c.tags.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {c.tags.slice(0, 3).map(t => (
                <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {c.keep_in_touch_days > 0 && overdue > 0 ? (
            <p className={`text-xs font-medium ${statusColor}`}>{overdue}d overdue</p>
          ) : c.keep_in_touch_days > 0 && c.days_since >= 0 ? (
            <p className={`text-xs ${statusColor}`}>
              {c.keep_in_touch_days - c.days_since}d left
            </p>
          ) : c.keep_in_touch_days === -1 ? (
            <p className="text-xs text-zinc-400">Don't track</p>
          ) : (
            <p className="text-xs text-zinc-400">No interactions</p>
          )}
          {displayLastContact && c.last_contact_date && (
            <p className="text-[10px] text-zinc-400 mt-0.5">
              Last: {new Date(c.last_contact_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-8 w-40 bg-zinc-800 rounded animate-pulse" />
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className={viewMode === 'board' ? '' : 'max-w-4xl mx-auto'}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Keep In Touch</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {filteredContacts.filter(c => c.keep_in_touch_days > 0).length} contacts with frequency set
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Group filter */}
            <select value={filterGroupId ?? ''} onChange={e => setFilterGroupId(e.target.value ? Number(e.target.value) : null)}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-violet-500/50">
              <option value="">All Contacts</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            {/* Display settings */}
            <div className="relative">
              <button onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm" title="Display settings">
                &#9881;
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 z-10 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={displayCompany} onChange={e => saveDisplaySettings(e.target.checked, displayTags, displayLastContact)} className="rounded" />
                    Show company
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={displayTags} onChange={e => saveDisplaySettings(displayCompany, e.target.checked, displayLastContact)} className="rounded" />
                    Show tags
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={displayLastContact} onChange={e => saveDisplaySettings(displayCompany, displayTags, e.target.checked)} className="rounded" />
                    Show last contact
                  </label>
                </div>
              )}
            </div>

            {/* View mode toggle */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                List
              </button>
              <button onClick={() => setViewMode('board')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'board' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                Board
              </button>
            </div>

            {uncategorizedCount > 0 && (
              <button onClick={() => navigate('/quick-action')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors border border-violet-200 dark:border-violet-800/40">
                Quick Action
                <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{uncategorizedCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Overall empty state */}
        {filteredContacts.filter(c => c.keep_in_touch_days > 0).length === 0 && uncategorizedCount === 0 ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title="No keep-in-touch contacts"
            body="No contacts with keep-in-touch frequency set. Open Quick Action to get started."
            actionLabel="Quick Action"
            actionRoute="/quick-action"
          />
        ) : viewMode === 'board' ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {FREQUENCY_BUCKETS.map(bucket => {
              const bucketContacts = grouped.get(bucket.value) || []
              return (
                <div key={bucket.value} className="w-64 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{bucket.label}</h2>
                    <span className="text-xs text-zinc-400">({bucketContacts.length})</span>
                  </div>
                  <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl max-h-[60vh] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/40 bg-zinc-50/50 dark:bg-zinc-900/30">
                    {bucketContacts.length === 0 ? (
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 italic p-4 text-center">Empty</p>
                    ) : (
                      bucketContacts.map(c => renderContactCard(c))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-6">
            {FREQUENCY_BUCKETS.map(bucket => {
              const bucketContacts = grouped.get(bucket.value) || []
              return (
                <section key={bucket.value}>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{bucket.label}</h2>
                    <span className="text-xs text-zinc-400">({bucketContacts.length})</span>
                  </div>
                  {bucketContacts.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-600 italic px-4 py-3">No matching contacts.</p>
                  ) : (
                    <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
                      {bucketContacts.map(c => renderContactCard(c))}
                    </div>
                  )}
                </section>
              )
            })}

            {/* Don't Track bucket */}
            {dontTrackContacts.length > 0 && (
              <section>
                <button onClick={() => setShowDontTrack(!showDontTrack)} className="flex items-center gap-2 mb-3 group">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Don't Track</h2>
                  <span className="text-xs text-zinc-400">({dontTrackContacts.length})</span>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">{showDontTrack ? '\u25B2' : '\u25BC'}</span>
                </button>
                {showDontTrack && (
                  <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
                    {dontTrackContacts.map(c => renderContactCard(c))}
                  </div>
                )}
              </section>
            )}

            {/* Uncategorized */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Uncategorized</h2>
                <span className="text-xs text-zinc-400">({uncategorizedCount})</span>
              </div>
              {uncategorizedCount === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-600 italic px-4 py-3">All contacts have a frequency set.</p>
              ) : (
                <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-5 text-center">
                  <p className="text-sm text-zinc-500 mb-3">{uncategorizedCount} contacts without a keep-in-touch frequency</p>
                  <button onClick={() => navigate('/quick-action')}
                    className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors">
                    Play Quick Action
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

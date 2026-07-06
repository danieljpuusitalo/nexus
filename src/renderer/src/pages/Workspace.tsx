import { useEffect, useState, useMemo } from 'react'
import type { ContactWithTags, Tag, Group } from '../types'
import ContactDetail from './ContactDetail'

interface KeepInTouchContact {
  id: number
  first_name: string
  last_name: string
  company: string
  photo_url: string
  keep_in_touch_days: number
  days_overdue: number
  last_contact_date: string | null
}

type TabKey = 'all' | 'reach-out' | 'recent'

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

function getHealthDot(contact: ContactWithTags, lastDates: Map<number, string>): string {
  const lastDate = lastDates.get(contact.id)
  if (!lastDate) return 'bg-zinc-400'
  const daysSince = Math.floor((new Date().getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
  const f = contact.keep_in_touch_days || 30
  if (daysSince <= f * 0.5) return 'bg-emerald-400'
  if (daysSince <= f) return 'bg-blue-400'
  if (daysSince <= f * 1.5) return 'bg-amber-400'
  return 'bg-red-400'
}

export default function Workspace() {
  const [tab, setTab] = useState<TabKey>('all')
  const [contacts, setContacts] = useState<ContactWithTags[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [kitContacts, setKitContacts] = useState<KeepInTouchContact[]>([])
  const [lastContacted, setLastContacted] = useState<Map<number, string>>(new Map())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [contactsData, tagsData, groupsData, kitData] = await Promise.all([
      window.api.contacts.getAllWithTags(),
      window.api.tags.getAll(),
      window.api.groups.getAll(),
      window.api.dashboard.getKeepInTouchDue()
    ])
    setContacts(contactsData as ContactWithTags[])
    setAllTags(tagsData as Tag[])
    setAllGroups(groupsData as Group[])
    setKitContacts(kitData as KeepInTouchContact[])

    // Load last interaction dates for health dots
    const dateMap = new Map<number, string>()
    for (const c of contactsData as ContactWithTags[]) {
      try {
        const interactions = await window.api.interactions.getForContact(c.id) as { date: string }[]
        if (interactions.length > 0) dateMap.set(c.id, interactions[0].date)
      } catch { /* ignore */ }
    }
    setLastContacted(dateMap)
  }

  async function handleRefresh() {
    await loadData()
  }

  async function handleDelete(id: number) {
    await window.api.contacts.delete(id)
    setSelectedId(null)
    await loadData()
  }

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedId) || null,
    [contacts, selectedId]
  )

  // Sorted lists per tab
  const displayContacts = useMemo(() => {
    const q = search.toLowerCase()

    if (tab === 'reach-out') {
      // Show overdue KIT contacts, sorted by most overdue
      const kitIds = new Set(kitContacts.map(k => k.id))
      let list = contacts.filter(c => kitIds.has(c.id))
      if (q) {
        list = list.filter(c => {
          const name = `${c.first_name} ${c.last_name}`.toLowerCase()
          return name.includes(q) || c.company?.toLowerCase().includes(q)
        })
      }
      // Sort by most overdue (kitContacts is already sorted)
      const orderMap = new Map(kitContacts.map((k, i) => [k.id, i]))
      list.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
      return list
    }

    if (tab === 'recent') {
      let list = [...contacts]
      if (q) {
        list = list.filter(c => {
          const name = `${c.first_name} ${c.last_name}`.toLowerCase()
          return name.includes(q) || c.company?.toLowerCase().includes(q)
        })
      }
      // Sort by last interaction date (most recent first), then by updated_at
      list.sort((a, b) => {
        const aDate = lastContacted.get(a.id) || ''
        const bDate = lastContacted.get(b.id) || ''
        if (aDate && bDate) return bDate.localeCompare(aDate)
        if (aDate) return -1
        if (bDate) return 1
        return b.updated_at.localeCompare(a.updated_at)
      })
      return list
    }

    // Default: all, sorted A-Z
    let list = [...contacts]
    if (q) {
      list = list.filter(c => {
        const name = `${c.first_name} ${c.last_name}`.toLowerCase()
        return name.includes(q) || c.company?.toLowerCase().includes(q)
      })
    }
    list.sort((a, b) => {
      const aName = `${a.first_name} ${a.last_name}`.toLowerCase()
      const bName = `${b.first_name} ${b.last_name}`.toLowerCase()
      return aName.localeCompare(bName)
    })
    return list
  }, [contacts, tab, search, kitContacts, lastContacted])

  function getOverdueDays(contactId: number): number | null {
    const kit = kitContacts.find(k => k.id === contactId)
    return kit ? kit.days_overdue : null
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: contacts.length },
    { key: 'reach-out', label: 'Reach Out', count: kitContacts.length },
    { key: 'recent', label: 'Recent' }
  ]

  return (
    <div className="h-full flex">
      {/* ========== LEFT PANEL ========== */}
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800/60 flex flex-col flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-950/50">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-2">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === t.key
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
              }`}>
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-[10px] text-zinc-400 dark:text-zinc-600">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 placeholder-zinc-400 dark:placeholder-zinc-600"
          />
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {displayContacts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                {search ? 'No contacts match your search' : tab === 'reach-out' ? 'No overdue contacts' : 'No contacts yet'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {displayContacts.map(c => {
                const isSelected = c.id === selectedId
                const fullName = `${c.first_name} ${c.last_name}`.trim()
                const initials = (c.first_name[0] || '') + (c.last_name?.[0] || '')
                const overdueDays = tab === 'reach-out' ? getOverdueDays(c.id) : null

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/30 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Avatar with health dot */}
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                        style={!c.photo_url ? { backgroundColor: getAvatarColor(fullName) } : undefined}>
                        {c.photo_url ? (
                          <img src={`file://${c.photo_url}`} className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-50 dark:border-zinc-950 ${getHealthDot(c, lastContacted)}`} />
                    </div>

                    {/* Name + company */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isSelected ? 'font-semibold text-violet-700 dark:text-violet-300' : 'font-medium text-zinc-800 dark:text-zinc-200'}`}>
                        {fullName}
                      </p>
                      {c.company && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate">{c.company}</p>
                      )}
                    </div>

                    {/* Overdue indicator */}
                    {overdueDays !== null && overdueDays > 0 && (
                      <span className="text-[10px] font-medium text-red-500 dark:text-red-400 flex-shrink-0">
                        {overdueDays}d
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========== RIGHT PANEL ========== */}
      <div className="flex-1 min-w-0">
        {selectedContact ? (
          <ContactDetail
            contact={selectedContact}
            allTags={allTags}
            allGroups={allGroups}
            onBack={() => setSelectedId(null)}
            onRefresh={handleRefresh}
            onDelete={handleDelete}
            mode="panel"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3 opacity-30">&#128100;</div>
              <p className="text-sm text-zinc-400 dark:text-zinc-600">Select a contact to view their details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ContactWithTags, Tag, Group, SavedView, ViewFilter } from '../types'
import SlideOver from '../components/ui/SlideOver'
import TagInput from '../components/ui/TagInput'
import ContactDetail from './ContactDetail'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '',
  company: '', job_title: '', linkedin_url: '',
  photo_url: '', notes: '', how_we_met: '', birthday: '',
  location: '', website: '', twitter_url: '', facebook_url: '',
  instagram_url: '', address: '', education: ''
}

type SortKey = 'name-asc' | 'name-desc' | 'recent' | 'last-contacted' | 'company'

function getHealthColor(daysSince: number, freq: number): string {
  const f = freq || 30
  if (daysSince <= f * 0.5) return 'bg-emerald-400'
  if (daysSince <= f) return 'bg-blue-400'
  if (daysSince <= f * 1.5) return 'bg-amber-400'
  return 'bg-red-400'
}

export default function Contacts() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [contacts, setContacts] = useState<ContactWithTags[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  const [slideOpen, setSlideOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactWithTags | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formTags, setFormTags] = useState<Tag[]>([])
  const [formGroups, setFormGroups] = useState<Group[]>([])
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [lastContacted, setLastContacted] = useState<Map<number, string>>(new Map())

  // Filters
  const [filterGroup, setFilterGroup] = useState<number | ''>('')
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('name-asc')

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkFreq, setShowBulkFreq] = useState(false)
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkGroup, setShowBulkGroup] = useState(false)

  // Saved views
  const [showSaveView, setShowSaveView] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewEmoji, setViewEmoji] = useState('')
  const [activeViewId, setActiveViewId] = useState<number | null>(null)
  const [activeViewName, setActiveViewName] = useState('')

  async function loadContacts() {
    const data = await window.api.contacts.getAllWithTags()
    setContacts(data as ContactWithTags[])
    return data as ContactWithTags[]
  }

  async function loadTags() {
    const data = await window.api.tags.getAll()
    setAllTags(data as Tag[])
  }

  async function loadGroups() {
    const data = await window.api.groups.getAll()
    setAllGroups(data as Group[])
  }

  async function loadLastContacted() {
    const rows = await window.api.interactions.getLastForContacts() as { contact_id: number; last_date: string }[]
    const map = new Map<number, string>()
    for (const r of rows) map.set(r.contact_id, r.last_date)
    setLastContacted(map)
  }

  useEffect(() => {
    Promise.all([
      loadContacts().then(allContacts => {
        const contactId = searchParams.get('contactId')
        if (contactId) {
          const match = allContacts.find(c => c.id === Number(contactId))
          if (match) setSelectedContact(match)
          setSearchParams({}, { replace: true })
        }
      }),
      loadTags(),
      loadGroups(),
      loadLastContacted()
    ]).finally(() => setLoading(false))

    // Load saved view if viewId is in URL
    const viewId = searchParams.get('viewId')
    if (viewId) {
      loadSavedView(Number(viewId))
    }
  }, [])

  async function loadSavedView(viewId: number) {
    try {
      const views = await window.api.views.getAll() as SavedView[]
      const view = views.find(v => v.id === viewId)
      if (!view) return
      const f: ViewFilter = JSON.parse(view.filter_json)
      if (f.search) setSearch(f.search)
      if (f.groupId) setFilterGroup(f.groupId)
      if (f.tagIds?.length) setFilterTags(f.tagIds)
      if (f.sortBy) setSortBy(f.sortBy as SortKey)
      setActiveViewId(view.id)
      setActiveViewName(`${view.emoji || '📋'} ${view.name}`)
    } catch {
      // ignore
    }
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let list = contacts

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.first_name + ' ' + c.last_name).toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.tags.some(t => t.name.toLowerCase().includes(q))
      )
    }

    if (filterGroup !== '') {
      list = list.filter(c => c.groups?.some(g => g.id === filterGroup))
    }

    if (filterTags.length > 0) {
      list = list.filter(c => filterTags.every(tid => c.tags.some(t => t.id === tid)))
    }

    const sorted = [...list]
    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name))
        break
      case 'name-desc':
        sorted.sort((a, b) => (b.first_name + b.last_name).localeCompare(a.first_name + a.last_name))
        break
      case 'recent':
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
      case 'last-contacted':
        sorted.sort((a, b) => {
          const da = lastContacted.get(a.id) || ''
          const db_ = lastContacted.get(b.id) || ''
          return db_.localeCompare(da)
        })
        break
      case 'company':
        sorted.sort((a, b) => (a.company || 'zzz').localeCompare(b.company || 'zzz'))
        break
    }
    return sorted
  }, [contacts, search, filterGroup, filterTags, sortBy, lastContacted])

  function openAdd() {
    setForm(emptyForm)
    setFormTags([])
    setFormGroups([])
    setEditMode(false)
    setSlideOpen(true)
  }

  async function handleSave() {
    if (!form.first_name.trim()) {
      setFormError('First name is required')
      return
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormError('Invalid email format')
      return
    }
    setFormError('')
    setSaving(true)

    try {
    if (editMode && selectedContact) {
      await window.api.contacts.update(selectedContact.id, form)
      const oldTagIds = selectedContact.tags.map(t => t.id)
      const newTagIds = formTags.map(t => t.id)
      for (const id of oldTagIds) {
        if (!newTagIds.includes(id)) await window.api.contactTags.remove(selectedContact.id, id)
      }
      for (const id of newTagIds) {
        if (!oldTagIds.includes(id)) await window.api.contactTags.add(selectedContact.id, id)
      }
      const oldGroupIds = (selectedContact.groups || []).map(g => g.id)
      const newGroupIds = formGroups.map(g => g.id)
      for (const id of oldGroupIds) {
        if (!newGroupIds.includes(id)) await window.api.contactGroups.remove(selectedContact.id, id)
      }
      for (const id of newGroupIds) {
        if (!oldGroupIds.includes(id)) await window.api.contactGroups.add(selectedContact.id, id)
      }
    } else {
      const contactId = await window.api.contacts.create(form) as number
      for (const tag of formTags) {
        await window.api.contactTags.add(contactId, tag.id)
      }
      for (const group of formGroups) {
        await window.api.contactGroups.add(contactId, group.id)
      }
    }

    setSlideOpen(false)
    toast(editMode ? 'Contact updated' : 'Contact created')
    await loadContacts()
    await loadTags()
    await loadGroups()

    if (editMode && selectedContact) {
      const updated = (await window.api.contacts.getAllWithTags()) as ContactWithTags[]
      const refreshed = updated.find(c => c.id === selectedContact.id)
      if (refreshed) setSelectedContact(refreshed)
      setContacts(updated)
    }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await window.api.contacts.delete(id)
    setSelectedContact(null)
    toast('Contact deleted')
    loadContacts()
  }

  async function handleRefresh() {
    const updated = (await window.api.contacts.getAllWithTags()) as ContactWithTags[]
    setContacts(updated)
    if (selectedContact) {
      const refreshed = updated.find(c => c.id === selectedContact.id)
      if (refreshed) setSelectedContact(refreshed)
    }
    await loadTags()
    await loadGroups()
    await loadLastContacted()
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    const id = await window.api.tags.create({ name, color }) as number
    const newTag = { id, name, color }
    setAllTags(prev => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
    return newTag
  }

  async function handleExportFiltered() {
    const ids = filtered.map(c => c.id)
    await window.api.data.exportFilteredCsv(ids)
  }

  function formatLastContacted(dateStr: string | undefined): string {
    if (!dateStr) return 'No interactions yet'
    return 'Last contacted ' + new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const hasFilters = filterGroup !== '' || filterTags.length > 0 || search.trim() !== ''

  async function handleSaveView() {
    if (!viewName.trim()) return
    const filterObj: ViewFilter = {}
    if (search.trim()) filterObj.search = search.trim()
    if (filterGroup !== '') filterObj.groupId = filterGroup as number
    if (filterTags.length > 0) filterObj.tagIds = filterTags
    if (sortBy !== 'name-asc') filterObj.sortBy = sortBy

    if (activeViewId) {
      await window.api.views.update(activeViewId, { name: viewName, emoji: viewEmoji, filter_json: JSON.stringify(filterObj) })
    } else {
      const newId = await window.api.views.create({ name: viewName, emoji: viewEmoji, filter_json: JSON.stringify(filterObj) }) as number
      setActiveViewId(newId)
    }
    setActiveViewName(`${viewEmoji || '📋'} ${viewName}`)
    setShowSaveView(false)
    setViewName('')
    setViewEmoji('')
  }

  async function handleDeleteView() {
    if (!activeViewId) return
    await window.api.views.delete(activeViewId)
    setActiveViewId(null)
    setActiveViewName('')
  }

  // Birthday this month check
  function isBirthdayThisMonth(birthday: string): boolean {
    if (!birthday) return false
    const now = new Date()
    const [, m] = birthday.split('-').map(Number)
    return m === now.getMonth() + 1
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(c => c.id)))
  }

  async function handleBulkFrequency(days: number) {
    await window.api.contacts.bulkSetFrequency(Array.from(selectedIds), days)
    toast(`Frequency set for ${selectedIds.size} contact(s)`)
    setSelectedIds(new Set()); setShowBulkFreq(false); await loadContacts()
  }

  async function handleBulkTag(tagId: number) {
    await window.api.contacts.bulkAddTag(Array.from(selectedIds), tagId)
    toast(`Tag added to ${selectedIds.size} contact(s)`)
    setSelectedIds(new Set()); setShowBulkTag(false); await loadContacts()
  }

  async function handleBulkGroup(groupId: number) {
    await window.api.contacts.bulkAddGroup(Array.from(selectedIds), groupId)
    toast(`Group added to ${selectedIds.size} contact(s)`)
    setSelectedIds(new Set()); setShowBulkGroup(false); await loadContacts()
  }

  function handleBulkArchive() {
    setConfirmDialog({
      title: `Archive ${selectedIds.size} contact(s)?`,
      message: 'Archived contacts will be hidden from your main list.',
      onConfirm: async () => {
        await window.api.contacts.bulkArchive(Array.from(selectedIds))
        setSelectedIds(new Set()); setConfirmDialog(null)
        toast(`${selectedIds.size} contact(s) archived`)
        await loadContacts()
      }
    })
  }

  function handleBulkDelete() {
    const count = selectedIds.size
    setConfirmDialog({
      title: `Delete ${count} contact(s)?`,
      message: 'This will permanently remove these contacts and all their interactions, reminders, and notes. This cannot be undone.',
      onConfirm: async () => {
        await window.api.contacts.bulkDelete(Array.from(selectedIds))
        setSelectedIds(new Set()); setConfirmDialog(null)
        toast(`${count} contact(s) deleted`)
        await loadContacts()
      }
    })
  }

  // --- Detail View ---
  if (selectedContact) {
    return <ContactDetail
      contact={selectedContact}
      allTags={allTags}
      allGroups={allGroups}
      onBack={() => setSelectedContact(null)}
      onRefresh={handleRefresh}
      onDelete={handleDelete}
    />
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col px-8 pt-8">
        <div className="h-8 w-32 bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="space-y-2">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  // --- List View ---
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Contacts</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{filtered.length} of {contacts.length} {contacts.length === 1 ? 'person' : 'people'}</p>
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <button
              onClick={handleExportFiltered}
              className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
            >
              Export
            </button>
          )}
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Contact
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="px-8 pb-4 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            data-search-input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, or tag..."
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value ? Number(e.target.value) : '')}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="">All Groups</option>
            {allGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <div className="relative group/tagfilter">
            <button className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:border-violet-500/50 transition-colors">
              {filterTags.length > 0 ? `${filterTags.length} tag${filterTags.length > 1 ? 's' : ''} selected` : 'All Tags'}
            </button>
            <div className="absolute z-20 top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl min-w-[180px] max-h-48 overflow-y-auto hidden group-hover/tagfilter:block">
              {filterTags.length > 0 && (
                <button
                  onClick={() => setFilterTags([])}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-200/40 dark:border-zinc-800/40"
                >
                  Clear all
                </button>
              )}
              {allTags.map(tag => (
                <label key={tag.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterTags.includes(tag.id)}
                    onChange={e => {
                      if (e.target.checked) setFilterTags([...filterTags, tag.id])
                      else setFilterTags(filterTags.filter(id => id !== tag.id))
                    }}
                    className="accent-violet-500"
                  />
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-zinc-700 dark:text-zinc-300">{tag.name}</span>
                </label>
              ))}
            </div>
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="recent">Recently Added</option>
            <option value="last-contacted">Last Contacted</option>
            <option value="company">Company</option>
          </select>

          {hasFilters && (
            <>
              <button
                onClick={() => { setFilterGroup(''); setFilterTags([]); setSearch(''); setActiveViewId(null); setActiveViewName('') }}
                className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 transition-colors"
              >
                Clear filters
              </button>
              <div className="relative">
                <button
                  onClick={() => { setShowSaveView(!showSaveView); setViewName(activeViewName ? activeViewName.replace(/^.+?\s/, '') : ''); setViewEmoji('') }}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  {activeViewId ? 'Update View' : 'Save as View'}
                </button>
                {showSaveView && (
                  <div className="absolute z-30 top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-xl p-3 w-60">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Save View</p>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={viewEmoji}
                        onChange={e => setViewEmoji(e.target.value)}
                        placeholder="📋"
                        className="w-10 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-violet-500/50"
                        maxLength={2}
                      />
                      <input
                        type="text"
                        value={viewName}
                        onChange={e => setViewName(e.target.value)}
                        placeholder="View name..."
                        className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') setShowSaveView(false) }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveView} className="flex-1 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">Save</button>
                      <button onClick={() => setShowSaveView(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeViewId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-lg">
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{activeViewName}</span>
              <button onClick={handleDeleteView} className="text-violet-400 hover:text-red-400 transition-colors" title="Delete view">
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="px-8 pb-3">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-xl">
            <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{selectedIds.size} selected</span>
            <div className="flex-1" />
            <div className="relative">
              <button onClick={() => { setShowBulkTag(!showBulkTag); setShowBulkGroup(false); setShowBulkFreq(false) }}
                className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">Tag</button>
              {showBulkTag && (
                <div className="absolute z-30 top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl min-w-[150px] max-h-48 overflow-y-auto">
                  {allTags.map(t => (
                    <button key={t.id} onClick={() => handleBulkTag(t.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowBulkGroup(!showBulkGroup); setShowBulkTag(false); setShowBulkFreq(false) }}
                className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">Group</button>
              {showBulkGroup && (
                <div className="absolute z-30 top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl min-w-[150px] max-h-48 overflow-y-auto">
                  {allGroups.map(g => (
                    <button key={g.id} onClick={() => handleBulkGroup(g.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{g.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowBulkFreq(!showBulkFreq); setShowBulkTag(false); setShowBulkGroup(false) }}
                className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">Frequency</button>
              {showBulkFreq && (
                <div className="absolute z-30 top-full right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl min-w-[150px]">
                  {[{l:'Weekly',v:7},{l:'Biweekly',v:14},{l:'Monthly',v:30},{l:'Quarterly',v:90},{l:'Biannual',v:180},{l:'Yearly',v:365},{l:'None',v:0}].map(o => (
                    <button key={o.v} onClick={() => handleBulkFrequency(o.v)} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{o.l}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleBulkArchive} className="px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800/40 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">Archive</button>
            <button onClick={handleBulkDelete} className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/40 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Clear</button>
          </div>
        </div>
      )}

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {filtered.length === 0 ? (
          contacts.length === 0 ? (
            <EmptyState
              icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
              title="No contacts yet"
              body="Import from LinkedIn, Google, or add manually."
              actionLabel="Import"
              actionRoute="/import"
            />
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-12 text-center">
              <p className="text-sm text-zinc-400">No contacts match your filters.</p>
            </div>
          )
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
            {/* Select All header */}
            <div className="flex items-center gap-3 px-5 py-2 bg-zinc-50/50 dark:bg-zinc-900/30">
              <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll} className="accent-violet-500 w-3.5 h-3.5" />
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Select all</span>
            </div>
            {filtered.map(contact => {
              const lastDate = lastContacted.get(contact.id)
              const daysSince = lastDate ? Math.floor((new Date().getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)) : -1
              const healthDot = daysSince >= 0 ? getHealthColor(daysSince, contact.keep_in_touch_days) : 'bg-zinc-300 dark:bg-zinc-600'
              const isSelected = selectedIds.has(contact.id)

              return (
                <div
                  key={contact.id}
                  className={`flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group ${isSelected ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                >
                  {/* Checkbox */}
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(contact.id)}
                    className="accent-violet-500 w-3.5 h-3.5 flex-shrink-0" />

                  {/* Clickable row */}
                  <button onClick={() => setSelectedContact(contact)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                    {/* Avatar with health dot */}
                    <div className="relative flex-shrink-0">
                      {contact.photo_url ? (
                        <img src={`file://${contact.photo_url}`} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                          {contact.first_name[0]}{contact.last_name?.[0] || ''}
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-950 ${healthDot}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {contact.first_name} {contact.last_name}
                        </span>
                        {isBirthdayThisMonth(contact.birthday) && (
                          <span className="text-xs" title="Birthday this month">&#127874;</span>
                        )}
                        {contact.tags.map(tag => (
                          <span key={tag.id} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                            style={{ backgroundColor: tag.color + '18', color: tag.color }}>{tag.name}</span>
                        ))}
                        {contact.groups?.map(g => (
                          <span key={g.id} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border"
                            style={{ borderColor: g.color + '40', color: g.color + 'cc' }}>{g.name}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {/* Social link icons */}
                        {contact.linkedin_url && (
                          <span className="text-blue-500 text-[10px] font-bold" title="LinkedIn">in</span>
                        )}
                        {contact.twitter_url && (
                          <span className="text-zinc-800 dark:text-zinc-200 text-[10px] font-bold" title="Twitter/X">X</span>
                        )}
                        {contact.facebook_url && (
                          <span className="text-[10px] font-bold" style={{ color: '#1877F2' }} title="Facebook">f</span>
                        )}
                        {contact.instagram_url && (
                          <span className="text-[10px] font-bold" style={{ color: '#E4405F' }} title="Instagram">ig</span>
                        )}
                        {contact.website && (
                          <span className="text-zinc-400 text-[10px]" title={contact.website}>&#127760;</span>
                        )}
                        {contact.email && (
                          <span className="text-zinc-400 text-[10px]" title={contact.email}>&#9993;</span>
                        )}
                        {contact.job_title && (
                          <span className="text-xs text-zinc-500 truncate">{contact.job_title}</span>
                        )}
                        {contact.job_title && contact.company && (
                          <span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span>
                        )}
                        {contact.company && (
                          <span className="text-xs text-zinc-500 truncate">{contact.company}</span>
                        )}
                        {(contact.job_title || contact.company) && (
                          <span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span>
                        )}
                        <span className={`text-xs ${lastContacted.has(contact.id) ? 'text-zinc-500' : 'text-zinc-400 dark:text-zinc-600'}`}>
                          {formatLastContacted(lastContacted.get(contact.id))}
                        </span>
                      </div>
                    </div>

                    <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 transition-colors flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Slide-Over */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editMode ? 'Edit Contact' : 'Add Contact'}
      >
        <ContactForm
          form={form}
          setForm={setForm}
          formTags={formTags}
          setFormTags={setFormTags}
          formGroups={formGroups}
          setFormGroups={setFormGroups}
          allTags={allTags}
          allGroups={allGroups}
          onSave={handleSave}
          onCancel={() => setSlideOpen(false)}
          onCreateTag={handleCreateTag}
          editMode={editMode}
          saving={saving}
          formError={formError}
        />
      </SlideOver>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  )
}

function ContactForm({
  form, setForm, formTags, setFormTags, formGroups, setFormGroups, allTags, allGroups, onSave, onCancel, onCreateTag, editMode, saving, formError
}: {
  form: typeof emptyForm
  setForm: (f: typeof emptyForm) => void
  formTags: Tag[]
  setFormTags: (t: Tag[]) => void
  formGroups: Group[]
  setFormGroups: (g: Group[]) => void
  allTags: Tag[]
  allGroups: Group[]
  onSave: () => void
  onCancel: () => void
  onCreateTag: (name: string) => Promise<Tag>
  editMode: boolean
  saving: boolean
  formError: string
}) {
  function update(field: string, value: string) {
    setForm({ ...form, [field]: value })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name *" value={form.first_name} onChange={v => update('first_name', v)} autoFocus />
        <Field label="Last name" value={form.last_name} onChange={v => update('last_name', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" value={form.email} onChange={v => update('email', v)} type="email" />
        <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} type="tel" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company" value={form.company} onChange={v => update('company', v)} />
        <Field label="Job title" value={form.job_title} onChange={v => update('job_title', v)} />
      </div>
      <Field label="LinkedIn URL" value={form.linkedin_url} onChange={v => update('linkedin_url', v)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="How we met" value={form.how_we_met} onChange={v => update('how_we_met', v)} />
        <Field label="Location" value={form.location} onChange={v => update('location', v)} />
      </div>
      <Field label="Birthday" value={form.birthday} onChange={v => update('birthday', v)} type="date" />

      <div>
        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Tags</label>
        <TagInput
          selectedTags={formTags}
          allTags={allTags}
          onAdd={tag => setFormTags([...formTags, tag])}
          onRemove={id => setFormTags(formTags.filter(t => t.id !== id))}
          onCreate={onCreateTag}
        />
      </div>

      {allGroups.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Groups</label>
          <div className="flex flex-wrap gap-2">
            {allGroups.map(g => {
              const selected = formGroups.some(fg => fg.id === g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    if (selected) setFormGroups(formGroups.filter(fg => fg.id !== g.id))
                    else setFormGroups([...formGroups, g])
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    selected
                      ? 'border-current bg-current/10'
                      : 'border-zinc-300 dark:border-zinc-700/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                  style={selected ? { color: g.color, borderColor: g.color + '60', backgroundColor: g.color + '15' } : undefined}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={4}
          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
          placeholder="Any notes about this contact..."
        />
      </div>

      {formError && <p className="text-xs text-red-500 pb-1">{formError}</p>}
      <div className="flex gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/60">
        <button
          type="button"
          onClick={onSave}
          disabled={!form.first_name.trim() || saving}
          className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Add Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
      />
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}

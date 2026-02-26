import { useEffect, useState, useMemo } from 'react'
import type { ContactWithTags, Tag, Group } from '../types'
import SlideOver from '../components/ui/SlideOver'
import TagInput from '../components/ui/TagInput'
import ContactDetail from './ContactDetail'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '',
  company: '', job_title: '', linkedin_url: '',
  photo_url: '', notes: '', how_we_met: ''
}

type SortKey = 'name-asc' | 'name-desc' | 'recent' | 'last-contacted' | 'company'

export default function Contacts() {
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
  const [lastContacted, setLastContacted] = useState<Map<number, string>>(new Map())

  // Filters
  const [filterGroup, setFilterGroup] = useState<number | ''>('')
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('name-asc')

  async function loadContacts() {
    const data = await window.api.contacts.getAllWithTags()
    setContacts(data as ContactWithTags[])
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

  useEffect(() => { loadContacts(); loadTags(); loadGroups(); loadLastContacted() }, [])

  // Filter + sort
  const filtered = useMemo(() => {
    let list = contacts

    // Text search
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

    // Group filter
    if (filterGroup !== '') {
      list = list.filter(c => c.groups?.some(g => g.id === filterGroup))
    }

    // Tag filter
    if (filterTags.length > 0) {
      list = list.filter(c => filterTags.every(tid => c.tags.some(t => t.id === tid)))
    }

    // Sort
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
          const db = lastContacted.get(b.id) || ''
          return db.localeCompare(da)
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
    if (!form.first_name.trim()) return

    if (editMode && selectedContact) {
      await window.api.contacts.update(selectedContact.id, form)
      // Sync tags
      const oldTagIds = selectedContact.tags.map(t => t.id)
      const newTagIds = formTags.map(t => t.id)
      for (const id of oldTagIds) {
        if (!newTagIds.includes(id)) await window.api.contactTags.remove(selectedContact.id, id)
      }
      for (const id of newTagIds) {
        if (!oldTagIds.includes(id)) await window.api.contactTags.add(selectedContact.id, id)
      }
      // Sync groups
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
    await loadContacts()
    await loadTags()
    await loadGroups()

    if (editMode && selectedContact) {
      const updated = (await window.api.contacts.getAllWithTags()) as ContactWithTags[]
      const refreshed = updated.find(c => c.id === selectedContact.id)
      if (refreshed) setSelectedContact(refreshed)
      setContacts(updated)
    }
  }

  async function handleDelete(id: number) {
    await window.api.contacts.delete(id)
    setSelectedContact(null)
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

  const hasFilters = filterGroup !== '' || filterTags.length > 0

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

  // --- List View ---
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Contacts</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{filtered.length} of {contacts.length} {contacts.length === 1 ? 'person' : 'people'}</p>
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <button
              onClick={handleExportFiltered}
              className="px-3 py-2 text-sm text-zinc-400 border border-zinc-700/50 rounded-lg hover:bg-zinc-800/50 transition-colors"
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
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            data-search-input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, or tag..."
            className="w-full bg-zinc-900 border border-zinc-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Group filter */}
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value ? Number(e.target.value) : '')}
            className="bg-zinc-900 border border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="">All Groups</option>
            {allGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          {/* Tag filter */}
          <div className="relative group/tagfilter">
            <button className="bg-zinc-900 border border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-500/50 transition-colors">
              {filterTags.length > 0 ? `${filterTags.length} tag${filterTags.length > 1 ? 's' : ''} selected` : 'All Tags'}
            </button>
            <div className="absolute z-20 top-full left-0 mt-1 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl min-w-[180px] max-h-48 overflow-y-auto hidden group-hover/tagfilter:block">
              {filterTags.length > 0 && (
                <button
                  onClick={() => setFilterTags([])}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 border-b border-zinc-800/40"
                >
                  Clear all
                </button>
              )}
              {allTags.map(tag => (
                <label key={tag.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-800 cursor-pointer">
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
                  <span className="text-zinc-300">{tag.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-zinc-900 border border-zinc-800/60 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="recent">Recently Added</option>
            <option value="last-contacted">Last Contacted</option>
            <option value="company">Company</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => { setFilterGroup(''); setFilterTags([]) }}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {filtered.length === 0 ? (
          <div className="border border-zinc-800/60 rounded-xl p-12 text-center">
            <div className="text-3xl mb-3">{contacts.length === 0 ? '\u{1F464}' : '\u{1F50D}'}</div>
            <p className="text-sm text-zinc-500">
              {contacts.length === 0
                ? 'No contacts yet. Click "Add Contact" to get started.'
                : 'No contacts match your filters.'}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-800/40">
            {filtered.map(contact => (
              <button
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className="w-full text-left px-5 py-3.5 hover:bg-zinc-800/30 transition-colors flex items-center gap-4 group"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-zinc-400 group-hover:text-zinc-300">
                  {contact.first_name[0]}{contact.last_name?.[0] || ''}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {contact.first_name} {contact.last_name}
                    </span>
                    {contact.tags.map(tag => (
                      <span
                        key={tag.id}
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                        style={{ backgroundColor: tag.color + '18', color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {contact.groups?.map(g => (
                      <span
                        key={g.id}
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border"
                        style={{ borderColor: g.color + '40', color: g.color + 'cc' }}
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {contact.job_title && (
                      <span className="text-xs text-zinc-500 truncate">{contact.job_title}</span>
                    )}
                    {contact.job_title && contact.company && (
                      <span className="text-xs text-zinc-700">&middot;</span>
                    )}
                    {contact.company && (
                      <span className="text-xs text-zinc-500 truncate">{contact.company}</span>
                    )}
                    {(contact.job_title || contact.company) && (
                      <span className="text-xs text-zinc-700">&middot;</span>
                    )}
                    <span className={`text-xs ${lastContacted.has(contact.id) ? 'text-zinc-500' : 'text-zinc-600'}`}>
                      {formatLastContacted(lastContacted.get(contact.id))}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <svg className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500 transition-colors flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3l5 5-5 5" />
                </svg>
              </button>
            ))}
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
        />
      </SlideOver>
    </div>
  )
}

// --- Contact Form (inside slide-over) ---
function ContactForm({
  form, setForm, formTags, setFormTags, formGroups, setFormGroups, allTags, allGroups, onSave, onCancel, onCreateTag, editMode
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
      <Field label="How we met" value={form.how_we_met} onChange={v => update('how_we_met', v)} />

      {/* Tags */}
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

      {/* Groups */}
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
                      : 'border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
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

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
          placeholder="Any notes about this contact..."
        />
      </div>

      <div className="flex gap-3 pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={onSave}
          disabled={!form.first_name.trim()}
          className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {editMode ? 'Save Changes' : 'Add Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
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
        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
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

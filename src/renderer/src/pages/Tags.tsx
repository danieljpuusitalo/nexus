import { useEffect, useState } from 'react'
import type { TagWithCount, Contact } from '../types'
import EmptyState from '../components/ui/EmptyState'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

export default function Tags() {
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [selectedTag, setSelectedTag] = useState<TagWithCount | null>(null)
  const [tagContacts, setTagContacts] = useState<Contact[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLORS[0])
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [editingTag, setEditingTag] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => { loadTags() }, [])

  async function loadTags() {
    const data = await window.api.tags.getAllWithCounts()
    setTags(data as TagWithCount[])
  }

  async function selectTag(tag: TagWithCount) {
    setSelectedTag(tag)
    const contacts = await window.api.tags.getContacts(tag.id)
    setTagContacts(contacts as Contact[])
  }

  async function handleCreate() {
    if (!name.trim()) return
    await window.api.tags.create({ name: name.trim(), color })
    setName(''); setColor(TAG_COLORS[0]); setShowCreate(false)
    await loadTags()
  }

  async function handleDelete(id: number) {
    await window.api.tags.delete(id)
    if (selectedTag?.id === id) { setSelectedTag(null); setTagContacts([]) }
    setDeleteConfirm(null)
    await loadTags()
  }

  function startEdit(tag: TagWithCount) {
    setEditingTag(tag.id); setEditName(tag.name); setEditColor(tag.color)
  }

  async function handleSaveEdit() {
    if (!editName.trim() || !editingTag) return
    await window.api.tags.update(editingTag, { name: editName.trim(), color: editColor })
    setEditingTag(null)
    await loadTags()
    if (selectedTag?.id === editingTag) setSelectedTag({ ...selectedTag, name: editName.trim(), color: editColor })
  }

  if (selectedTag) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <button onClick={() => { setSelectedTag(null); setTagContacts([]) }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-6">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
          Back to tags
        </button>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedTag.color + '20' }}>
            <span className="text-sm font-bold" style={{ color: selectedTag.color }}>#</span>
          </div>
          <div className="flex-1"><h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedTag.name}</h1></div>
          <span className="text-sm text-zinc-500">{tagContacts.length} {tagContacts.length === 1 ? 'contact' : 'contacts'}</span>
        </div>
        {tagContacts.length === 0 ? (
          <div className="border border-zinc-200/40 dark:border-zinc-800/40 rounded-xl p-12 text-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-600">No contacts with this tag.</p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
            {tagContacts.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{c.first_name[0]}{c.last_name?.[0] || ''}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{c.first_name} {c.last_name}</span>
                  {(c.job_title || c.company) && <p className="text-xs text-zinc-500 mt-0.5">{c.job_title}{c.job_title && c.company ? ' at ' : ''}{c.company}</p>}
                </div>
                {c.email && <span className="text-xs text-zinc-400 dark:text-zinc-600 truncate max-w-[200px]">{c.email}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tags</h1>
          <p className="text-sm text-zinc-500 mt-1">Label and categorize contacts</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">+ Create Tag</button>
      </div>

      {showCreate && (
        <div className="border border-violet-500/20 rounded-xl p-5 mb-6 bg-violet-500/5">
          <h3 className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3">New Tag</h3>
          <div className="space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tag name..." autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Color</label>
              <div className="flex gap-2">
                {TAG_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white/40 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={!name.trim()} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors">Create</button>
              <button onClick={() => { setShowCreate(false); setName('') }} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {tags.length === 0 && !showCreate ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>}
          title="No tags yet"
          body="Tags help you categorize and filter your contacts."
          actionLabel="New Tag"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
              {editingTag === tag.id ? (
                <div className="flex items-center gap-3 flex-1">
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingTag(null) }}
                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 w-48" />
                  <div className="flex gap-1">
                    {TAG_COLORS.map(c => (
                      <button key={c} onClick={() => setEditColor(c)} className={`w-5 h-5 rounded-full transition-all ${editColor === c ? 'ring-2 ring-white/30 scale-110' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <button onClick={handleSaveEdit} className="px-2 py-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 font-medium">Save</button>
                  <button onClick={() => setEditingTag(null)} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => selectTag(tag)} className="flex items-center gap-4 flex-1 text-left min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tag.color + '20' }}>
                      <span className="text-xs font-bold" style={{ color: tag.color }}>#</span>
                    </div>
                    <div className="flex-1 min-w-0"><span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{tag.name}</span></div>
                    <span className="text-xs text-zinc-500 flex-shrink-0">{tag.contact_count} {tag.contact_count === 1 ? 'contact' : 'contacts'}</span>
                  </button>
                  <button onClick={() => startEdit(tag)} className="text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-all text-xs flex-shrink-0">Edit</button>
                  {deleteConfirm === tag.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => handleDelete(tag.id)} className="px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:text-white hover:bg-red-600 rounded transition-colors">Delete</button>
                      <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(tag.id)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

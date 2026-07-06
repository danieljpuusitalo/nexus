import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GroupWithCount, Contact } from '../types'
import EmptyState from '../components/ui/EmptyState'

const GROUP_COLORS = [
  '#6366F1', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#06B6D4'
]

export default function Groups() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [groups, setGroups] = useState<GroupWithCount[]>([])
  const [selectedGroup, setSelectedGroup] = useState<GroupWithCount | null>(null)
  const [groupContacts, setGroupContacts] = useState<Contact[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => { loadGroups() }, [])

  // Open a specific group when navigated via sidebar with ?groupId=
  useEffect(() => {
    const groupId = searchParams.get('groupId')
    if (!groupId || groups.length === 0) return
    const group = groups.find(g => g.id === Number(groupId))
    if (group) {
      selectGroup(group)
      setSearchParams({}, { replace: true })
    }
  }, [groups, searchParams])

  async function loadGroups() {
    const data = await window.api.groups.getAllWithCounts()
    setGroups(data as GroupWithCount[])
  }

  async function selectGroup(group: GroupWithCount) {
    setSelectedGroup(group)
    const contacts = await window.api.groups.getContacts(group.id)
    setGroupContacts(contacts as Contact[])
  }

  async function handleCreate() {
    if (!name.trim()) return
    await window.api.groups.create({ name: name.trim(), description, color })
    setName(''); setDescription(''); setColor(GROUP_COLORS[0]); setShowCreate(false)
    await loadGroups()
  }

  async function handleDelete(id: number) {
    await window.api.groups.delete(id)
    if (selectedGroup?.id === id) { setSelectedGroup(null); setGroupContacts([]) }
    setDeleteConfirm(null)
    await loadGroups()
  }

  if (selectedGroup) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <button onClick={() => { setSelectedGroup(null); setGroupContacts([]) }}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-6">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
          Back to groups
        </button>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: selectedGroup.color }}>{selectedGroup.name[0]}</div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedGroup.name}</h1>
            {selectedGroup.description && <p className="text-sm text-zinc-500 mt-0.5">{selectedGroup.description}</p>}
          </div>
          <span className="text-sm text-zinc-500">{groupContacts.length} {groupContacts.length === 1 ? 'contact' : 'contacts'}</span>
        </div>
        {groupContacts.length === 0 ? (
          <div className="border border-zinc-200/40 dark:border-zinc-800/40 rounded-xl p-12 text-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-600">No contacts in this group yet.</p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
            {groupContacts.map(c => (
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Groups</h1>
          <p className="text-sm text-zinc-500 mt-1">Organize contacts into groups</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">+ Create Group</button>
      </div>

      {showCreate && (
        <div className="border border-violet-500/20 rounded-xl p-5 mb-6 bg-violet-500/5">
          <h3 className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3">New Group</h3>
          <div className="space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Group name..." autoFocus
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)..."
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Color</label>
              <div className="flex gap-2">
                {GROUP_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white/40 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={!name.trim()} className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors">Create</button>
              <button onClick={() => { setShowCreate(false); setName(''); setDescription('') }} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 && !showCreate ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
          title="No groups yet"
          body="Create a group to organize your network."
          actionLabel="New Group"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
          {groups.map(group => (
            <div key={group.id} className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
              <button onClick={() => selectGroup(group)} className="flex items-center gap-4 flex-1 text-left min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: group.color }}>{group.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{group.name}</span>
                  {group.description && <p className="text-xs text-zinc-500 mt-0.5 truncate">{group.description}</p>}
                </div>
                <span className="text-xs text-zinc-500 flex-shrink-0">{group.contact_count} {group.contact_count === 1 ? 'contact' : 'contacts'}</span>
              </button>
              {deleteConfirm === group.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleDelete(group.id)} className="px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:text-white hover:bg-red-600 rounded transition-colors">Delete</button>
                  <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">No</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(group.id)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

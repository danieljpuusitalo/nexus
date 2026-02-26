import { useEffect, useState, useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import SlideOver from '../ui/SlideOver'
import TagInput from '../ui/TagInput'
import type { Tag, Group } from '../../types'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '',
  company: '', job_title: '', linkedin_url: '',
  photo_url: '', notes: '', how_we_met: ''
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [bannerCount, setBannerCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Quick Add state
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formTags, setFormTags] = useState<Tag[]>([])
  const [formGroups, setFormGroups] = useState<Group[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])

  useEffect(() => {
    async function check() {
      try {
        const overdue = await window.api.reminders.getOverdueCount() as number
        const todayReminders = (await window.api.reminders.getDueToday() as unknown[]).length
        setBannerCount(overdue + todayReminders)
      } catch {
        // ignore
      }
    }
    check()
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)

    // Ctrl/Cmd + N → Quick Add Contact
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault()
      openQuickAdd()
      return
    }

    // Ctrl/Cmd + K → Navigate to contacts + focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      if (location.pathname !== '/contacts') navigate('/contacts')
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
        searchInput?.focus()
      }, 100)
      return
    }

    // Ctrl/Cmd + / → Toggle shortcuts overlay
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault()
      setShowShortcuts(prev => !prev)
      return
    }

    // Escape → Close modals/overlays
    if (e.key === 'Escape') {
      if (showShortcuts) { setShowShortcuts(false); return }
      if (quickAddOpen) { setQuickAddOpen(false); return }
      return
    }

    // Number shortcuts for navigation (only when not in an input)
    if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const navMap: Record<string, string> = {
        '1': '/', '2': '/contacts', '3': '/groups',
        '4': '/tags', '5': '/interactions', '6': '/reminders', '7': '/settings'
      }
      if (navMap[e.key]) {
        e.preventDefault()
        navigate(navMap[e.key])
      }
    }
  }, [quickAddOpen, showShortcuts, location.pathname])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function openQuickAdd() {
    setForm(emptyForm)
    setFormTags([])
    setFormGroups([])
    const [tags, groups] = await Promise.all([
      window.api.tags.getAll(),
      window.api.groups.getAll()
    ])
    setAllTags(tags as Tag[])
    setAllGroups(groups as Group[])
    setQuickAddOpen(true)
  }

  async function handleQuickSave() {
    if (!form.first_name.trim()) return
    const contactId = await window.api.contacts.create(form) as number
    for (const tag of formTags) {
      await window.api.contactTags.add(contactId, tag.id)
    }
    for (const group of formGroups) {
      await window.api.contactGroups.add(contactId, group.id)
    }
    setQuickAddOpen(false)
    navigate('/contacts')
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    const id = await window.api.tags.create({ name, color }) as number
    const newTag = { id, name, color }
    setAllTags(prev => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
    return newTag
  }

  function updateForm(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Notification banner */}
        {bannerCount > 0 && !dismissed && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
            <span className="text-amber-400 text-sm">&#9203;</span>
            <p className="text-sm text-amber-300 flex-1">
              You have <span className="font-semibold">{bannerCount}</span> overdue or due-today reminder{bannerCount !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-400/60 hover:text-amber-300 transition-colors text-sm"
            >
              &#10005;
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto relative" key={location.pathname}>
          <div className="page-enter">
          <Outlet />

          {/* Quick Add FAB */}
          <button
            onClick={openQuickAdd}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 flex items-center justify-center text-2xl transition-all hover:scale-105 z-40"
            title="Quick Add Contact (Ctrl+N)"
          >
            +
          </button>
          </div>
        </main>
      </div>

      {/* Quick Add Slide-Over */}
      <SlideOver
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        title="Quick Add Contact"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <QField label="First name *" value={form.first_name} onChange={v => updateForm('first_name', v)} autoFocus />
            <QField label="Last name" value={form.last_name} onChange={v => updateForm('last_name', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QField label="Email" value={form.email} onChange={v => updateForm('email', v)} type="email" />
            <QField label="Phone" value={form.phone} onChange={v => updateForm('phone', v)} type="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <QField label="Company" value={form.company} onChange={v => updateForm('company', v)} />
            <QField label="Job title" value={form.job_title} onChange={v => updateForm('job_title', v)} />
          </div>
          <QField label="LinkedIn URL" value={form.linkedin_url} onChange={v => updateForm('linkedin_url', v)} />
          <QField label="How we met" value={form.how_we_met} onChange={v => updateForm('how_we_met', v)} />

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Tags</label>
            <TagInput
              selectedTags={formTags}
              allTags={allTags}
              onAdd={tag => setFormTags([...formTags, tag])}
              onRemove={id => setFormTags(formTags.filter(t => t.id !== id))}
              onCreate={handleCreateTag}
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
                        selected ? '' : 'border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
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
              onChange={e => updateForm('notes', e.target.value)}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
              placeholder="Any notes..."
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={handleQuickSave}
              disabled={!form.first_name.trim()}
              className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add Contact
            </button>
            <button
              type="button"
              onClick={() => setQuickAddOpen(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </SlideOver>

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 overlay-enter" onClick={() => setShowShortcuts(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 w-full max-w-md shadow-2xl slide-over-enter">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">&times;</button>
            </div>
            <div className="space-y-3">
              <ShortcutRow keys="Ctrl + N" desc="Quick add contact" />
              <ShortcutRow keys="Ctrl + K" desc="Search contacts" />
              <ShortcutRow keys="Ctrl + /" desc="Toggle this overlay" />
              <ShortcutRow keys="Esc" desc="Close modal / go back" />
              <div className="border-t border-zinc-800/60 pt-3 mt-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Navigation</p>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="1" desc="Dashboard" />
                  <ShortcutRow keys="2" desc="Contacts" />
                  <ShortcutRow keys="3" desc="Groups" />
                  <ShortcutRow keys="4" desc="Tags" />
                  <ShortcutRow keys="5" desc="Interactions" />
                  <ShortcutRow keys="6" desc="Reminders" />
                  <ShortcutRow keys="7" desc="Settings" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{desc}</span>
      <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700/60 rounded text-[11px] font-mono text-zinc-300">{keys}</kbd>
    </div>
  )
}

function QField({ label, value, onChange, type = 'text', autoFocus }: {
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

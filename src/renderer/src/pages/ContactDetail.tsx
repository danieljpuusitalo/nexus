import { useEffect, useState } from 'react'
import type { ContactWithTags, Tag, Group, Interaction, Reminder } from '../types'
import TagInput from '../components/ui/TagInput'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

const INTERACTION_TYPES = [
  { value: 'meeting', label: 'Meeting', icon: '\u{1F91D}' },
  { value: 'call', label: 'Call', icon: '\u{1F4DE}' },
  { value: 'email', label: 'Email', icon: '\u{1F4E7}' },
  { value: 'note', label: 'Note', icon: '\u{1F4DD}' },
  { value: 'coffee', label: 'Coffee', icon: '\u2615' },
  { value: 'event', label: 'Event', icon: '\u{1F3AF}' },
  { value: 'other', label: 'Other', icon: '\u{1F4AC}' }
] as const

const TYPE_ICONS: Record<string, string> = {
  meeting: '\u{1F91D}', call: '\u{1F4DE}', email: '\u{1F4E7}', note: '\u{1F4DD}',
  coffee: '\u2615', event: '\u{1F3AF}', other: '\u{1F4AC}'
}

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

interface Props {
  contact: ContactWithTags
  allTags: Tag[]
  allGroups: Group[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export default function ContactDetail({ contact, allTags, allGroups, onBack, onRefresh, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(contactToForm(contact))
  const [formTags, setFormTags] = useState<Tag[]>(contact.tags)
  const [formGroups, setFormGroups] = useState<Group[]>(contact.groups || [])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showInteractionForm, setShowInteractionForm] = useState(false)
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Interaction form state
  const [intType, setIntType] = useState<string>('meeting')
  const [intDate, setIntDate] = useState(today())
  const [intDesc, setIntDesc] = useState('')

  // Reminder form state
  const [remMessage, setRemMessage] = useState('')
  const [remDate, setRemDate] = useState(today())
  const [remRepeat, setRemRepeat] = useState<string>('none')

  const fullName = `${contact.first_name} ${contact.last_name}`.trim()
  const initials = (contact.first_name[0] || '') + (contact.last_name?.[0] || '')

  useEffect(() => {
    loadInteractions()
    loadReminders()
  }, [contact.id])

  // Reset form when contact changes
  useEffect(() => {
    setForm(contactToForm(contact))
    setFormTags(contact.tags)
    setFormGroups(contact.groups || [])
    setEditing(false)
  }, [contact])

  async function loadInteractions() {
    const data = await window.api.interactions.getForContact(contact.id)
    setInteractions(data as Interaction[])
  }

  async function loadReminders() {
    const data = await window.api.reminders.getForContact(contact.id)
    setReminders(data as Reminder[])
  }

  function contactToForm(c: ContactWithTags) {
    return {
      first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone,
      company: c.company, job_title: c.job_title, linkedin_url: c.linkedin_url,
      photo_url: c.photo_url, notes: c.notes, how_we_met: c.how_we_met
    }
  }

  function updateForm(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.first_name.trim()) return
    await window.api.contacts.update(contact.id, form)

    // Sync tags
    const oldIds = contact.tags.map(t => t.id)
    const newIds = formTags.map(t => t.id)
    for (const id of oldIds) {
      if (!newIds.includes(id)) await window.api.contactTags.remove(contact.id, id)
    }
    for (const id of newIds) {
      if (!oldIds.includes(id)) await window.api.contactTags.add(contact.id, id)
    }

    // Sync groups
    const oldGroupIds = (contact.groups || []).map(g => g.id)
    const newGroupIds = formGroups.map(g => g.id)
    for (const id of oldGroupIds) {
      if (!newGroupIds.includes(id)) await window.api.contactGroups.remove(contact.id, id)
    }
    for (const id of newGroupIds) {
      if (!oldGroupIds.includes(id)) await window.api.contactGroups.add(contact.id, id)
    }

    setEditing(false)
    await onRefresh()
  }

  function handleCancelEdit() {
    setForm(contactToForm(contact))
    setFormTags(contact.tags)
    setFormGroups(contact.groups || [])
    setEditing(false)
  }

  async function handleSaveNotes() {
    await window.api.contacts.update(contact.id, { ...contactToForm(contact), notes: form.notes })
    await onRefresh()
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    const id = await window.api.tags.create({ name, color }) as number
    return { id, name, color }
  }

  // --- Interaction handlers ---
  async function handleSaveInteraction() {
    if (!intDesc.trim()) return
    await window.api.interactions.create({
      contact_id: contact.id,
      type: intType,
      description: intDesc,
      date: intDate
    })
    setIntDesc('')
    setIntType('meeting')
    setIntDate(today())
    setShowInteractionForm(false)
    await loadInteractions()
  }

  async function handleDeleteInteraction(id: number) {
    await window.api.interactions.delete(id)
    await loadInteractions()
  }

  // --- Reminder handlers ---
  async function handleSaveReminder() {
    if (!remMessage.trim()) return
    await window.api.reminders.create({
      contact_id: contact.id,
      message: remMessage,
      due_date: remDate,
      repeat: remRepeat
    })
    setRemMessage('')
    setRemDate(today())
    setRemRepeat('none')
    setShowReminderForm(false)
    await loadReminders()
  }

  async function handleToggleReminder(id: number) {
    await window.api.reminders.toggleComplete(id)
    await loadReminders()
  }

  async function handleDeleteReminder(id: number) {
    await window.api.reminders.delete(id)
    await loadReminders()
  }

  async function confirmDelete() {
    await onDelete(contact.id)
  }

  const activeReminders = reminders.filter(r => !r.completed)

  return (
    <div className="h-full overflow-y-auto">
      {/* Back bar */}
      <div className="px-8 pt-6 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Back to contacts
        </button>
      </div>

      <div className="px-8 pb-8">
        {/* ── Profile Header ── */}
        <div className="flex items-start gap-5 mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
            style={{ backgroundColor: getAvatarColor(fullName) }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input
                  value={form.first_name}
                  onChange={e => updateForm('first_name', e.target.value)}
                  placeholder="First name"
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-lg font-bold text-zinc-100 outline-none focus:border-violet-500/50"
                />
                <input
                  value={form.last_name}
                  onChange={e => updateForm('last_name', e.target.value)}
                  placeholder="Last name"
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-lg font-bold text-zinc-100 outline-none focus:border-violet-500/50"
                />
              </div>
            ) : (
              <h1 className="text-2xl font-bold text-zinc-100">{fullName}</h1>
            )}
            {editing ? (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <input
                  value={form.job_title}
                  onChange={e => updateForm('job_title', e.target.value)}
                  placeholder="Job title"
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-violet-500/50"
                />
                <input
                  value={form.company}
                  onChange={e => updateForm('company', e.target.value)}
                  placeholder="Company"
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-violet-500/50"
                />
              </div>
            ) : (
              (contact.job_title || contact.company) && (
                <p className="text-sm text-zinc-400 mt-0.5">
                  {contact.job_title}{contact.job_title && contact.company ? ' at ' : ''}{contact.company}
                </p>
              )
            )}
            {/* Tags */}
            {editing ? (
              <div className="mt-3">
                <TagInput
                  selectedTags={formTags}
                  allTags={allTags}
                  onAdd={tag => setFormTags([...formTags, tag])}
                  onRemove={id => setFormTags(formTags.filter(t => t.id !== id))}
                  onCreate={handleCreateTag}
                />
              </div>
            ) : (
              (contact.tags.length > 0 || (contact.groups || []).length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {contact.tags.map(tag => (
                    <span
                      key={'t-' + tag.id}
                      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: tag.color + '20', color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {(contact.groups || []).map(g => (
                    <span
                      key={'g-' + g.id}
                      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border"
                      style={{ borderColor: g.color + '40', color: g.color + 'cc' }}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )
            )}
            {/* Groups (edit mode) */}
            {editing && allGroups.length > 0 && (
              <div className="mt-2">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Groups</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
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
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                          selected ? '' : 'border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
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
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={!form.first_name.trim()}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* ── Info Cards ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {editing ? (
            <>
              <EditField label="Email" value={form.email} onChange={v => updateForm('email', v)} type="email" />
              <EditField label="Phone" value={form.phone} onChange={v => updateForm('phone', v)} type="tel" />
              <EditField label="LinkedIn URL" value={form.linkedin_url} onChange={v => updateForm('linkedin_url', v)} />
              <EditField label="How we met" value={form.how_we_met} onChange={v => updateForm('how_we_met', v)} />
            </>
          ) : (
            <>
              <InfoCard label="Email" value={contact.email} mailto />
              <InfoCard label="Phone" value={contact.phone} />
              <InfoCard label="LinkedIn" value={contact.linkedin_url} link />
              <InfoCard label="How we met" value={contact.how_we_met} />
            </>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="border border-zinc-800/60 rounded-xl p-5 mb-6">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Notes</h3>
          {editing ? (
            <textarea
              value={form.notes}
              onChange={e => updateForm('notes', e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50 resize-none"
              placeholder="Any notes about this contact..."
            />
          ) : (
            <>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed min-h-[2rem]">
                {contact.notes || <span className="text-zinc-600 italic">No notes yet</span>}
              </p>
              {!editing && contact.notes !== form.notes && (
                <textarea
                  value={form.notes}
                  onChange={e => updateForm('notes', e.target.value)}
                  onBlur={handleSaveNotes}
                  rows={3}
                  className="w-full mt-2 bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50 resize-none"
                />
              )}
            </>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setShowInteractionForm(!showInteractionForm); setShowReminderForm(false) }}
            className="px-4 py-2 text-sm font-medium text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors"
          >
            Log Interaction
          </button>
          <button
            onClick={() => { setShowReminderForm(!showReminderForm); setShowInteractionForm(false) }}
            className="px-4 py-2 text-sm font-medium text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors"
          >
            Set Reminder
          </button>
          <div className="flex-1" />
          {deleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">Are you sure?</span>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm text-red-400/70 hover:text-red-400 border border-zinc-700/50 rounded-lg hover:bg-red-500/5 hover:border-red-500/20 transition-colors"
            >
              Delete Contact
            </button>
          )}
        </div>

        {/* ── Reminder Inline Form ── */}
        {showReminderForm && (
          <div className="border border-amber-500/20 rounded-xl p-5 mb-6 bg-amber-500/5">
            <h3 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-3">New Reminder</h3>
            <div className="space-y-3">
              <input
                value={remMessage}
                onChange={e => setRemMessage(e.target.value)}
                placeholder="Reminder message..."
                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={remDate}
                  onChange={e => setRemDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
                />
                <select
                  value={remRepeat}
                  onChange={e => setRemRepeat(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
                >
                  <option value="none">No repeat</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveReminder}
                  disabled={!remMessage.trim()}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-lg transition-colors"
                >
                  Save Reminder
                </button>
                <button
                  onClick={() => setShowReminderForm(false)}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Active Reminders ── */}
        {activeReminders.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Active Reminders ({activeReminders.length})
            </h3>
            <div className="space-y-2">
              {activeReminders.map(rem => (
                <div key={rem.id} className="flex items-center gap-3 border border-amber-500/15 rounded-lg p-3 bg-amber-500/5">
                  <button
                    onClick={() => handleToggleReminder(rem.id)}
                    className="w-5 h-5 rounded border border-zinc-600 hover:border-amber-400 flex items-center justify-center flex-shrink-0 transition-colors"
                  >
                    {rem.completed ? <span className="text-amber-400 text-xs">&#10003;</span> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{rem.message}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(rem.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {rem.repeat !== 'none' && <span className="ml-2 text-amber-400/60">{rem.repeat}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReminder(rem.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors text-sm flex-shrink-0"
                  >
                    &#10005;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Interaction Inline Form ── */}
        {showInteractionForm && (
          <div className="border border-violet-500/20 rounded-xl p-5 mb-4 bg-violet-500/5">
            <h3 className="text-xs font-medium text-violet-400 uppercase tracking-wider mb-3">Log Interaction</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={intType}
                  onChange={e => setIntType(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
                >
                  {INTERACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={intDate}
                  onChange={e => setIntDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
                />
              </div>
              <textarea
                value={intDesc}
                onChange={e => setIntDesc(e.target.value)}
                placeholder="What happened?"
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveInteraction}
                  disabled={!intDesc.trim()}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowInteractionForm(false)}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Activity Timeline ── */}
        <div className="mb-6">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Activity ({interactions.length})
          </h3>
          {interactions.length === 0 ? (
            <div className="border border-zinc-800/40 rounded-xl p-8 text-center">
              <p className="text-sm text-zinc-600">No interactions logged yet</p>
            </div>
          ) : (
            <div className="border border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-800/40 max-h-[400px] overflow-y-auto">
              {interactions.map(int => (
                <div key={int.id} className="flex items-start gap-3 px-4 py-3 group hover:bg-zinc-800/20">
                  <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[int.type] || '\u{1F4AC}'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{int.description}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {new Date(int.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="ml-2 text-zinc-600">{int.type}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteInteraction(int.id)}
                    className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0"
                  >
                    &#10005;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="text-xs text-zinc-600">
          Added {new Date(contact.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          {contact.updated_at !== contact.created_at && (
            <> &middot; Updated {new Date(contact.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Subcomponents ---

function InfoCard({ label, value, link, mailto }: { label: string; value: string; link?: boolean; mailto?: boolean }) {
  if (!value) return (
    <div className="border border-zinc-800/40 rounded-xl p-4">
      <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-zinc-700 italic">Not set</p>
    </div>
  )

  return (
    <div className="border border-zinc-800/60 rounded-xl p-4">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      {mailto ? (
        <a
          href={`mailto:${value}`}
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors truncate block"
        >
          {value}
        </a>
      ) : link ? (
        <a
          href={value.startsWith('http') ? value : 'https://' + value}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors truncate block"
        >
          {value}
        </a>
      ) : (
        <p className="text-sm text-zinc-200 truncate">{value}</p>
      )}
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="border border-zinc-800/60 rounded-xl p-4">
      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700/50 rounded px-2 py-1 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
      />
    </div>
  )
}

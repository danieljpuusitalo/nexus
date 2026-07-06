import { useEffect, useState } from 'react'
import type { ContactWithTags, Tag, Group, Interaction, Reminder, CustomField, ImportantDate, ContactRelationship, Contact, InteractionAttachment } from '../types'
import TagInput from '../components/ui/TagInput'
import { useToast } from '../components/ui/Toast'

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
  { value: 'calendar', label: 'Calendar', icon: '\u{1F4C5}' },
  { value: 'job_change', label: 'Job Change', icon: '\u{1F4BC}' },
  { value: 'other', label: 'Other', icon: '\u{1F4AC}' }
] as const

const TYPE_ICONS: Record<string, string> = {
  meeting: '\u{1F91D}', call: '\u{1F4DE}', email: '\u{1F4E7}', note: '\u{1F4DD}',
  coffee: '\u2615', event: '\u{1F3AF}', calendar: '\u{1F4C5}', job_change: '\u{1F4BC}',
  other: '\u{1F4AC}'
}

const TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting', call: 'Call', email: 'Email', note: 'Note',
  coffee: 'Coffee', event: 'Event', calendar: 'Calendar', job_change: 'Job Change',
  other: 'Other'
}

const KEEP_IN_TOUCH_OPTIONS = [
  { label: 'None', value: 0 },
  { label: 'Weekly', value: 7 },
  { label: 'Biweekly', value: 14 },
  { label: 'Monthly', value: 30 },
  { label: 'Quarterly', value: 90 },
  { label: 'Biannual', value: 180 },
  { label: 'Yearly', value: 365 }
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

function getHealthInfo(daysSince: number, freq: number): { color: string; ring: string; ringColor: string } {
  const f = freq || 30
  if (daysSince < 0) return { color: 'bg-zinc-400', ring: 'ring-zinc-400/30', ringColor: '#a1a1aa' }
  if (daysSince <= f * 0.5) return { color: 'bg-emerald-400', ring: 'ring-emerald-400/30', ringColor: '#34d399' }
  if (daysSince <= f) return { color: 'bg-blue-400', ring: 'ring-blue-400/30', ringColor: '#60a5fa' }
  if (daysSince <= f * 1.5) return { color: 'bg-amber-400', ring: 'ring-amber-400/30', ringColor: '#fbbf24' }
  return { color: 'bg-red-400', ring: 'ring-red-400/30', ringColor: '#f87171' }
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function formatBirthday(birthday: string): string {
  if (!birthday) return ''
  const [y, m, d] = birthday.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < d)) age--
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (turns ${age + 1})`
}

interface Props {
  contact: ContactWithTags
  allTags: Tag[]
  allGroups: Group[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onDelete: (id: number) => Promise<void>
  mode?: 'page' | 'panel'
}

export default function ContactDetail({ contact, allTags, allGroups, onBack, onRefresh, onDelete, mode = 'page' }: Props) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(contactToForm(contact))
  const [formTags, setFormTags] = useState<Tag[]>(contact.tags)
  const [formGroups, setFormGroups] = useState<Group[]>(contact.groups || [])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [importantDates, setImportantDates] = useState<ImportantDate[]>([])
  const [showInfoDrawer, setShowInfoDrawer] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Interaction form (inline at bottom)
  const [intType, setIntType] = useState<string>('meeting')
  const [intDate, setIntDate] = useState(today())
  const [intDesc, setIntDesc] = useState('')

  // Reminder form
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [remMessage, setRemMessage] = useState('')
  const [remDate, setRemDate] = useState(today())
  const [remRepeat, setRemRepeat] = useState<string>('none')

  // Custom field form
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldValue, setNewFieldValue] = useState('')

  // Important date form
  const [newDateLabel, setNewDateLabel] = useState('')
  const [newDateValue, setNewDateValue] = useState('')
  const [showDates, setShowDates] = useState(false)

  // Related contacts
  const [relationships, setRelationships] = useState<ContactRelationship[]>([])
  const [showRelateForm, setShowRelateForm] = useState(false)
  const [relateSearch, setRelateSearch] = useState('')
  const [relateType, setRelateType] = useState('')
  const [relateResults, setRelateResults] = useState<Contact[]>([])

  // AI tools
  const [showAiMenu, setShowAiMenu] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<{ type: string; content: string } | null>(null)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])

  // QR code
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // Attachments
  const [attachmentMap, setAttachmentMap] = useState<Record<number, InteractionAttachment[]>>({})
  const [pendingFiles, setPendingFiles] = useState<string[]>([])

  // Favorite
  const [isFavorite, setIsFavorite] = useState(false)

  const fullName = `${contact.first_name} ${contact.last_name}`.trim()
  const initials = (contact.first_name[0] || '') + (contact.last_name?.[0] || '')

  // Compute health
  const lastInteraction = interactions.length > 0 ? interactions[0] : null
  const daysSinceContact = lastInteraction
    ? Math.floor((new Date().getTime() - new Date(lastInteraction.date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : -1
  const health = getHealthInfo(daysSinceContact, contact.keep_in_touch_days)

  // Keep in touch status text
  function getKitStatus(): string | null {
    if (!contact.keep_in_touch_days) return null
    if (daysSinceContact < 0) return `${contact.keep_in_touch_days} days overdue`
    const diff = daysSinceContact - contact.keep_in_touch_days
    if (diff > 0) return `${diff} days overdue`
    if (diff === 0) return 'Due today'
    return `Due in ${Math.abs(diff)} days`
  }

  useEffect(() => {
    loadInteractions()
    loadReminders()
    loadCustomFields()
    loadImportantDates()
    loadRelationships()
    window.api.favorites.isFavorite('contact', contact.id).then((v: unknown) => setIsFavorite(v as boolean))
  }, [contact.id])

  useEffect(() => {
    setForm(contactToForm(contact))
    setFormTags(contact.tags)
    setFormGroups(contact.groups || [])
    setEditing(false)
  }, [contact])

  async function loadInteractions() {
    const data = await window.api.interactions.getForContact(contact.id) as Interaction[]
    setInteractions(data)
    const aMap: Record<number, InteractionAttachment[]> = {}
    for (const int of data) {
      const attachments = await window.api.attachments.getForInteraction(int.id) as InteractionAttachment[]
      if (attachments.length > 0) aMap[int.id] = attachments
    }
    setAttachmentMap(aMap)
  }

  async function loadReminders() {
    const data = await window.api.reminders.getForContact(contact.id)
    setReminders(data as Reminder[])
  }

  async function loadCustomFields() {
    const data = await window.api.customFields.getForContact(contact.id)
    setCustomFields(data as CustomField[])
  }

  async function loadImportantDates() {
    const data = await window.api.importantDates.getForContact(contact.id)
    setImportantDates(data as ImportantDate[])
  }

  async function loadRelationships() {
    const data = await window.api.relationships.getForContact(contact.id)
    setRelationships(data as ContactRelationship[])
  }

  async function handleSearchRelated(query: string) {
    setRelateSearch(query)
    if (query.length < 2) { setRelateResults([]); return }
    const all = await window.api.contacts.getAll() as Contact[]
    const existing = new Set([contact.id, ...relationships.map(r => r.related_id)])
    setRelateResults(all.filter(c => {
      if (existing.has(c.id)) return false
      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
      return name.includes(query.toLowerCase()) || c.company?.toLowerCase().includes(query.toLowerCase())
    }).slice(0, 5))
  }

  async function handleAddRelationship(relatedId: number) {
    await window.api.relationships.create({ contact_id_1: contact.id, contact_id_2: relatedId, relationship_type: relateType })
    setShowRelateForm(false)
    setRelateSearch('')
    setRelateType('')
    setRelateResults([])
    await loadRelationships()
  }

  async function handleDeleteRelationship(id: number) {
    await window.api.relationships.delete(id)
    await loadRelationships()
  }

  function contactToForm(c: ContactWithTags) {
    return {
      first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone,
      company: c.company, job_title: c.job_title, linkedin_url: c.linkedin_url,
      photo_url: c.photo_url, notes: c.notes, how_we_met: c.how_we_met,
      birthday: c.birthday || '', keep_in_touch_days: c.keep_in_touch_days || 0,
      location: c.location || '', website: c.website || '', twitter_url: c.twitter_url || '',
      facebook_url: c.facebook_url || '', instagram_url: c.instagram_url || '',
      address: c.address || '', education: c.education || ''
    }
  }

  function updateForm(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.first_name.trim()) return
    await window.api.contacts.update(contact.id, form)

    const oldIds = contact.tags.map(t => t.id)
    const newIds = formTags.map(t => t.id)
    for (const id of oldIds) { if (!newIds.includes(id)) await window.api.contactTags.remove(contact.id, id) }
    for (const id of newIds) { if (!oldIds.includes(id)) await window.api.contactTags.add(contact.id, id) }

    const oldGroupIds = (contact.groups || []).map(g => g.id)
    const newGroupIds = formGroups.map(g => g.id)
    for (const id of oldGroupIds) { if (!newGroupIds.includes(id)) await window.api.contactGroups.remove(contact.id, id) }
    for (const id of newGroupIds) { if (!oldGroupIds.includes(id)) await window.api.contactGroups.add(contact.id, id) }

    setEditing(false)
    toast('Contact saved')
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

  async function handleSelectPhoto() {
    const sourcePath = await window.api.contacts.selectPhoto() as string | null
    if (!sourcePath) return
    const savedPath = await window.api.contacts.savePhoto(contact.id, sourcePath) as string
    updateForm('photo_url', savedPath)
    await onRefresh()
  }

  async function handleKeepInTouchChange(days: number) {
    updateForm('keep_in_touch_days', days)
    await window.api.contacts.update(contact.id, { ...contactToForm(contact), keep_in_touch_days: days })
    await onRefresh()
  }

  async function handleAttachFile() {
    const filePath = await window.api.attachments.selectFile() as string | null
    if (filePath) setPendingFiles(prev => [...prev, filePath])
  }

  async function handleSaveInteraction() {
    if (!intDesc.trim()) return
    const intId = await window.api.interactions.create({ contact_id: contact.id, type: intType, description: intDesc, date: intDate }) as number
    for (const fp of pendingFiles) {
      await window.api.attachments.add(intId, fp)
    }
    setPendingFiles([])
    setIntDesc(''); setIntType('meeting'); setIntDate(today())
    toast('Interaction logged')
    await loadInteractions()
  }

  async function handleDeleteInteraction(id: number) {
    await window.api.interactions.delete(id)
    await loadInteractions()
  }

  async function handleSaveReminder() {
    if (!remMessage.trim()) return
    await window.api.reminders.create({ contact_id: contact.id, message: remMessage, due_date: remDate, repeat: remRepeat })
    setRemMessage(''); setRemDate(today()); setRemRepeat('none')
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

  async function handleAddCustomField() {
    if (!newFieldName.trim()) return
    await window.api.customFields.create({ contact_id: contact.id, field_name: newFieldName, field_value: newFieldValue })
    setNewFieldName(''); setNewFieldValue('')
    await loadCustomFields()
  }

  async function handleUpdateCustomField(field: CustomField, newName: string, newValue: string) {
    await window.api.customFields.update(field.id, { field_name: newName, field_value: newValue })
    await loadCustomFields()
  }

  async function handleDeleteCustomField(id: number) {
    await window.api.customFields.delete(id)
    await loadCustomFields()
  }

  async function handleAddImportantDate() {
    if (!newDateLabel.trim() || !newDateValue) return
    await window.api.importantDates.create({ contact_id: contact.id, label: newDateLabel, date: newDateValue })
    setNewDateLabel(''); setNewDateValue('')
    await loadImportantDates()
  }

  async function handleUpdateImportantDate(id: number, label: string, date: string) {
    await window.api.importantDates.update(id, { label, date })
    await loadImportantDates()
  }

  async function handleDeleteImportantDate(id: number) {
    await window.api.importantDates.delete(id)
    await loadImportantDates()
  }

  async function confirmDelete() {
    await onDelete(contact.id)
  }

  async function handleToggleFavorite() {
    if (isFavorite) {
      await window.api.favorites.remove('contact', contact.id)
      setIsFavorite(false)
    } else {
      await window.api.favorites.add('contact', contact.id)
      setIsFavorite(true)
    }
  }

  async function handleShowQR() {
    try {
      const dataUrl = await window.api.contacts.generateQR({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        company: contact.company || undefined,
        job_title: contact.job_title || undefined,
        website: contact.website || undefined,
        linkedin_url: contact.linkedin_url || undefined,
      }) as string
      setQrDataUrl(dataUrl)
    } catch {
      toast('Could not generate QR code', 'error')
    }
  }

  // AI tool handlers
  async function handleAiReconnect() {
    setShowAiMenu(false)
    setAiLoading('reconnect')
    setAiResult(null)
    try {
      const result = await window.api.ai.reconnectionMessages(contact.id) as string
      setAiResult({ type: 'Reconnection Messages', content: result })
    } catch (err) { setAiResult({ type: 'Error', content: String(err) }) }
    setAiLoading(null)
  }

  async function handleAiBriefing() {
    setShowAiMenu(false)
    setAiLoading('briefing')
    setAiResult(null)
    try {
      const result = await window.api.ai.meetingBriefing(contact.id) as string
      setAiResult({ type: 'Meeting Briefing', content: result })
    } catch (err) { setAiResult({ type: 'Error', content: String(err) }) }
    setAiLoading(null)
  }

  async function handleAiSummarize() {
    setShowAiMenu(false)
    if (interactions.length === 0) { setAiResult({ type: 'Error', content: 'No interactions to summarize.' }); return }
    setAiLoading('summarize')
    setAiResult(null)
    try {
      const notes = interactions.slice(0, 10).map(i => `[${i.date}] ${i.type}: ${i.description}`).join('\n')
      const result = await window.api.ai.summarizeNotes(notes) as string
      setAiResult({ type: 'Note Summary', content: result })
    } catch (err) { setAiResult({ type: 'Error', content: String(err) }) }
    setAiLoading(null)
  }

  async function handleAiSuggestTags() {
    setShowAiMenu(false)
    setAiLoading('tags')
    setSuggestedTags([])
    try {
      const tags = await window.api.ai.suggestTags(contact.id) as string[]
      setSuggestedTags(tags)
    } catch (err) { setAiResult({ type: 'Error', content: String(err) }) }
    setAiLoading(null)
  }

  async function handleApplySuggestedTag(tagName: string) {
    const existing = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
    let tagId: number
    if (existing) {
      tagId = existing.id
    } else {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
      tagId = await window.api.tags.create({ name: tagName, color }) as number
    }
    await window.api.contactTags.add(contact.id, tagId)
    setSuggestedTags(prev => prev.filter(t => t !== tagName))
    await onRefresh()
  }

  const activeReminders = reminders.filter(r => !r.completed)
  const kitStatus = getKitStatus()
  const isPanel = mode === 'panel'

  const subtitle = [contact.job_title, contact.company].filter(Boolean).join(' at ')

  return (
    <div className={`${isPanel ? 'h-full' : 'h-full'} flex flex-col relative`}>
      {/* ========== TOP BAR ========== */}
      <div className={`flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/60 flex-shrink-0 ${isPanel ? 'px-4 py-2.5' : 'px-6 py-3'}`}>
        {/* Back button (page mode only) */}
        {!isPanel && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mr-1 flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
        )}

        {/* Avatar with health ring */}
        <button
          onClick={handleSelectPhoto}
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden transition-all hover:opacity-80"
          style={{
            backgroundColor: contact.photo_url ? undefined : getAvatarColor(fullName),
            boxShadow: `0 0 0 2.5px ${health.ringColor}`
          }}
          title="Click to change photo"
        >
          {contact.photo_url ? (
            <img src={`file://${contact.photo_url}`} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </button>

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{fullName}</h1>
            {kitStatus && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${kitStatus.includes('overdue') ? 'bg-red-500/10 text-red-500 dark:text-red-400' : 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800'}`}>
                {kitStatus}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>
          )}
        </div>

        {/* Quick action icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {contact.email && (
            <a href={`mailto:${contact.email}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors text-xs"
              title={contact.email}>
              {'\u{1F4E7}'}
            </a>
          )}
          {contact.linkedin_url && (
            <a href={contact.linkedin_url.startsWith('http') ? contact.linkedin_url : 'https://' + contact.linkedin_url}
              target="_blank" rel="noreferrer"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors text-[10px] font-bold"
              title="LinkedIn">
              in
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors text-xs"
              title={contact.phone}>
              {'\u{1F4DE}'}
            </a>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/50 mx-1" />

          {/* Favorite */}
          <button
            onClick={handleToggleFavorite}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'}`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M10 2l2.4 5 5.6.8-4 3.9 1 5.5L10 14.4 4.9 17.2l1-5.5-4-3.9 5.6-.8z" />
            </svg>
          </button>

          {/* Edit */}
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
              title="Edit contact">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 1.5l3 3-9 9H2.5v-3z" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={handleSave} disabled={!form.first_name.trim()}
                className="px-2 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-md transition-colors">Save</button>
              <button onClick={handleCancelEdit}
                className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
            </div>
          )}

          {/* AI Tools dropdown */}
          <div className="relative">
            <button onClick={() => setShowAiMenu(!showAiMenu)}
              disabled={!!aiLoading}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors disabled:opacity-50 text-xs"
              title="AI Tools">
              {aiLoading ? '...' : '\u{2728}'}
            </button>
            {showAiMenu && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg overflow-hidden z-30">
                <button onClick={handleAiReconnect} className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  {'\u{1F4AC}'} Reconnection Messages
                </button>
                <button onClick={handleAiBriefing} className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  {'\u{1F4CB}'} Meeting Briefing
                </button>
                <button onClick={handleAiSummarize} className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  {'\u{1F4DD}'} Summarize Notes
                </button>
                <button onClick={handleAiSuggestTags} className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-t border-zinc-100 dark:border-zinc-800/40">
                  {'\u{1F3F7}'} Suggest Tags
                </button>
              </div>
            )}
          </div>

          {/* Info drawer toggle */}
          <button onClick={() => setShowInfoDrawer(!showInfoDrawer)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-xs ${showInfoDrawer ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            title="Contact info">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 7v4M8 5v.5" />
            </svg>
          </button>

          {/* More actions (delete, reminder) */}
          <div className="relative group">
            <button className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-xs">
              &#8943;
            </button>
            <div className="absolute top-full right-0 mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg overflow-hidden z-30 hidden group-hover:block">
              <button onClick={() => { setShowReminderForm(!showReminderForm) }}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                Set Reminder
              </button>
              <button onClick={handleShowQR}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                Share as QR Code
              </button>
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Delete Contact
                </button>
              ) : (
                <div className="px-4 py-2.5 space-y-2">
                  <p className="text-xs text-red-500">Are you sure?</p>
                  <div className="flex gap-2">
                    <button onClick={confirmDelete} className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors">Yes</button>
                    <button onClick={() => setDeleteConfirm(false)} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors">No</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========== QUICK-LOG BAR + RECENCY STRIP ========== */}
      <div className={`flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800/60 ${isPanel ? 'px-4 py-2' : 'px-6 py-2.5'}`}>
        {/* Recency strip — 12-month interaction heatmap */}
        <div className="flex items-center gap-0.5 mb-2" title="Interaction activity over the past 12 months">
          {(() => {
            const months: number[] = []
            const now = new Date()
            for (let m = 11; m >= 0; m--) {
              const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1)
              const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0)
              const startStr = monthStart.toISOString().split('T')[0]
              const endStr = monthEnd.toISOString().split('T')[0]
              const count = interactions.filter(i => i.date >= startStr && i.date <= endStr).length
              months.push(count)
            }
            const max = Math.max(...months, 1)
            return months.map((count, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: count === 0 ? 'var(--tw-ring-color, rgba(161,161,170,0.15))' : `rgba(139,92,246,${0.2 + (count / max) * 0.8})` }}
                title={`${count} interaction${count !== 1 ? 's' : ''}`}
              />
            ))
          })()}
        </div>
        {/* Quick-log chips */}
        <div className="flex items-center gap-1.5">
          {[
            { type: 'call', label: 'Call', icon: '\u{1F4DE}' },
            { type: 'coffee', label: 'Coffee', icon: '\u2615' },
            { type: 'email', label: 'Message', icon: '\u{1F4E7}' },
            { type: 'meeting', label: 'Met', icon: '\u{1F91D}' },
          ].map(chip => (
            <button key={chip.type}
              onClick={async () => {
                await window.api.interactions.create({ contact_id: contact.id, type: chip.type, description: `${chip.label} with ${contact.first_name}`, date: today() })
                toast(`${chip.label} logged`)
                await loadInteractions()
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 dark:hover:text-violet-400 rounded-md transition-colors"
            >
              <span>{chip.icon}</span> {chip.label}
            </button>
          ))}
          {/* Health explanation */}
          <div className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">
            {daysSinceContact >= 0
              ? daysSinceContact === 0
                ? 'Contacted today'
                : `${daysSinceContact}d since last contact${(contact.keep_in_touch_days || 0) > 0 ? ` (goal: every ${contact.keep_in_touch_days}d)` : ''}`
              : 'No interactions yet'}
          </div>
        </div>
      </div>

      {/* ========== MAIN CONTENT AREA ========== */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main scrollable area */}
        <div className={`flex-1 overflow-y-auto ${isPanel ? 'px-4 py-3' : 'px-6 py-4'}`}>

          {/* Edit Form (shown when editing) */}
          {editing && (
            <div className="mb-4 border border-violet-500/20 rounded-xl p-4 bg-violet-500/5">
              <h3 className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3">Edit Contact</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input value={form.first_name} onChange={e => updateForm('first_name', e.target.value)} placeholder="First name"
                  className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500/50" />
                <input value={form.last_name} onChange={e => updateForm('last_name', e.target.value)} placeholder="Last name"
                  className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <EditField label="Job Title" value={form.job_title} onChange={v => updateForm('job_title', v)} />
                <EditField label="Company" value={form.company} onChange={v => updateForm('company', v)} />
                <EditField label="Email" value={form.email} onChange={v => updateForm('email', v)} type="email" />
                <EditField label="Phone" value={form.phone} onChange={v => updateForm('phone', v)} type="tel" />
                <EditField label="LinkedIn URL" value={form.linkedin_url} onChange={v => updateForm('linkedin_url', v)} />
                <EditField label="How we met" value={form.how_we_met} onChange={v => updateForm('how_we_met', v)} />
                <EditField label="Location" value={form.location} onChange={v => updateForm('location', v)} />
                <EditField label="Website" value={form.website} onChange={v => updateForm('website', v)} />
                <EditField label="Twitter/X URL" value={form.twitter_url} onChange={v => updateForm('twitter_url', v)} />
                <EditField label="Facebook URL" value={form.facebook_url} onChange={v => updateForm('facebook_url', v)} />
                <EditField label="Instagram URL" value={form.instagram_url} onChange={v => updateForm('instagram_url', v)} />
                <EditField label="Address" value={form.address} onChange={v => updateForm('address', v)} />
                <EditField label="Education" value={form.education} onChange={v => updateForm('education', v)} />
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Birthday</label>
                  <input type="date" value={form.birthday} onChange={e => updateForm('birthday', e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                </div>
              </div>
              {/* Tags in edit mode */}
              <div className="mb-3">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Tags</span>
                <div className="mt-1">
                  <TagInput selectedTags={formTags} allTags={allTags}
                    onAdd={tag => setFormTags([...formTags, tag])}
                    onRemove={id => setFormTags(formTags.filter(t => t.id !== id))}
                    onCreate={handleCreateTag} />
                </div>
              </div>
              {/* Groups in edit mode */}
              {allGroups.length > 0 && (
                <div className="mb-3">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Groups</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {allGroups.map(g => {
                      const selected = formGroups.some(fg => fg.id === g.id)
                      return (
                        <button key={g.id} type="button"
                          onClick={() => { if (selected) setFormGroups(formGroups.filter(fg => fg.id !== g.id)); else setFormGroups([...formGroups, g]) }}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${selected ? '' : 'border-zinc-300 dark:border-zinc-700/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                          style={selected ? { color: g.color, borderColor: g.color + '60', backgroundColor: g.color + '15' } : undefined}
                        >{g.name}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* Notes in edit mode */}
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Notes</span>
                <textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)} rows={3}
                  className="w-full mt-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 resize-none"
                  placeholder="Any notes about this contact..." />
              </div>
            </div>
          )}

          {/* AI Suggested Tags */}
          {suggestedTags.length > 0 && (
            <div className="border border-indigo-500/20 rounded-xl p-3 mb-3 bg-indigo-500/5">
              <h3 className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">{'\u{1F3F7}'} Suggested Tags</h3>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map(tag => (
                  <button key={tag} onClick={() => handleApplySuggestedTag(tag)}
                    className="px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 rounded-full hover:bg-indigo-500/10 transition-colors">
                    + {tag}
                  </button>
                ))}
              </div>
              <button onClick={() => setSuggestedTags([])} className="text-[10px] text-zinc-400 mt-2 hover:text-zinc-600 dark:hover:text-zinc-300">Dismiss</button>
            </div>
          )}

          {/* AI Result */}
          {aiResult && (
            <div className={`border rounded-xl p-4 mb-3 ${aiResult.type === 'Error' ? 'border-red-500/20 bg-red-500/5' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-xs font-medium uppercase tracking-wider ${aiResult.type === 'Error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                  {'\u{2728}'} {aiResult.type}
                </h3>
                <button onClick={() => setAiResult(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs">{'\u2715'}</button>
              </div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {aiResult.content}
              </div>
            </div>
          )}

          {/* Reminder Form */}
          {showReminderForm && (
            <div className="border border-amber-500/20 rounded-xl p-4 mb-3 bg-amber-500/5">
              <h3 className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3">New Reminder</h3>
              <div className="space-y-3">
                <input value={remMessage} onChange={e => setRemMessage(e.target.value)} placeholder="Reminder message..."
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-amber-500/50" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={remDate} onChange={e => setRemDate(e.target.value)}
                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-amber-500/50" />
                  <select value={remRepeat} onChange={e => setRemRepeat(e.target.value)}
                    className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-amber-500/50">
                    <option value="none">No repeat</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveReminder} disabled={!remMessage.trim()} className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-lg transition-colors">Save Reminder</button>
                  <button onClick={() => setShowReminderForm(false)} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Active Reminders */}
          {activeReminders.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Active Reminders ({activeReminders.length})</h3>
              <div className="space-y-1.5">
                {activeReminders.map(rem => (
                  <div key={rem.id} className="flex items-center gap-3 border border-amber-500/15 rounded-lg p-2.5 bg-amber-500/5">
                    <button onClick={() => handleToggleReminder(rem.id)}
                      className="w-4 h-4 rounded border border-zinc-400 dark:border-zinc-600 hover:border-amber-400 flex items-center justify-center flex-shrink-0 transition-colors">
                      {rem.completed ? <span className="text-amber-500 dark:text-amber-400 text-[10px]">&#10003;</span> : null}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{rem.message}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(rem.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {rem.repeat !== 'none' && <span className="ml-2 text-amber-500/60 dark:text-amber-400/60">{rem.repeat}</span>}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteReminder(rem.id)} className="text-zinc-400 dark:text-zinc-600 hover:text-red-400 transition-colors text-sm flex-shrink-0">&#10005;</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========== INTERACTION TIMELINE (dominant element) ========== */}
          <div className="mb-3">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
              Activity ({interactions.length})
            </h3>
            {interactions.length === 0 ? (
              <div className="rounded-xl border border-zinc-200/40 dark:border-zinc-800/40 p-8 text-center">
                <p className="text-sm text-zinc-400 dark:text-zinc-600">No interactions logged yet</p>
                <p className="text-xs text-zinc-400/60 dark:text-zinc-600/60 mt-1">Use the input below to log your first interaction</p>
              </div>
            ) : (
              <div className="space-y-1">
                {interactions.map(int => (
                  <div key={int.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg group hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                    <span className="text-sm flex-shrink-0 mt-0.5">{TYPE_ICONS[int.type] || '\u{1F4AC}'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">{int.description}</p>
                      {attachmentMap[int.id] && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {attachmentMap[int.id].map(att => (
                            <button key={att.id} onClick={() => window.api.attachments.openFile(att.file_path)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors">
                              &#128206; {att.file_name}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(int.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <span className="ml-2 text-zinc-400 dark:text-zinc-600">{TYPE_LABELS[int.type] || int.type}</span>
                      </p>
                    </div>
                    <button onClick={() => handleDeleteInteraction(int.id)}
                      className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="text-xs text-zinc-400 dark:text-zinc-600 pb-4">
            Added {new Date(contact.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {contact.updated_at !== contact.created_at && (
              <> &middot; Updated {new Date(contact.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</>
            )}
          </div>
        </div>

        {/* ========== METADATA DRAWER (right side) ========== */}
        {showInfoDrawer && (
          <div className="w-80 border-l border-zinc-200 dark:border-zinc-800/60 overflow-y-auto flex-shrink-0 bg-white dark:bg-zinc-950">
            <div className={`space-y-4 ${isPanel ? 'p-3' : 'p-4'}`}>
              {/* Contact Info */}
              <div>
                <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Contact Info</h3>
                <div className="space-y-3">
                  <SidebarInfoRow icon={'\u{1F4E7}'} label="Email" value={contact.email} mailto />
                  <SidebarInfoRow icon={'\u{1F4DE}'} label="Phone" value={contact.phone} />
                  <SidebarInfoRow icon={'\u{1F310}'} label="Website" value={contact.website} link />
                  <SidebarInfoRow icon={'\u{1F4CD}'} label="Location" value={contact.location} />
                  <SidebarInfoRow icon={'\u{1F3E0}'} label="Address" value={contact.address} />
                  <SidebarInfoRow icon={'\u{1F393}'} label="Education" value={contact.education} />
                  <SidebarInfoRow icon={'\u{1F91D}'} label="How we met" value={contact.how_we_met} />
                </div>
              </div>

              {/* Social Links */}
              {(contact.linkedin_url || contact.twitter_url || contact.facebook_url || contact.instagram_url) && (
                <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                  <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Social Links</h3>
                  <div className="flex items-center gap-3">
                    {contact.linkedin_url && (
                      <a href={contact.linkedin_url.startsWith('http') ? contact.linkedin_url : 'https://' + contact.linkedin_url} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[11px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" title="LinkedIn">
                        in
                      </a>
                    )}
                    {contact.twitter_url && (
                      <a href={contact.twitter_url.startsWith('http') ? contact.twitter_url : 'https://' + contact.twitter_url} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-800 dark:text-zinc-200 text-[11px] font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" title="Twitter/X">
                        X
                      </a>
                    )}
                    {contact.facebook_url && (
                      <a href={contact.facebook_url.startsWith('http') ? contact.facebook_url : 'https://' + contact.facebook_url} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-[11px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" title="Facebook"
                        style={{ color: '#1877F2' }}>
                        f
                      </a>
                    )}
                    {contact.instagram_url && (
                      <a href={contact.instagram_url.startsWith('http') ? contact.instagram_url : 'https://' + contact.instagram_url} target="_blank" rel="noreferrer"
                        className="w-8 h-8 rounded-lg bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center text-[11px] font-bold hover:bg-pink-100 dark:hover:bg-pink-900/40 transition-colors" title="Instagram"
                        style={{ color: '#E4405F' }}>
                        ig
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Tags & Groups */}
              {(contact.tags.length > 0 || (contact.groups || []).length > 0) && (
                <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                  <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Tags & Groups</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map(tag => (
                      <span key={'t-' + tag.id} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: tag.color + '20', color: tag.color }}>{tag.name}</span>
                    ))}
                    {(contact.groups || []).map(g => (
                      <span key={'g-' + g.id} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border"
                        style={{ borderColor: g.color + '40', color: g.color + 'cc' }}>{g.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes (read-only in drawer) */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {contact.notes || <span className="text-zinc-400 dark:text-zinc-600 italic">No notes yet</span>}
                </p>
              </div>

              {/* Birthday */}
              {contact.birthday && (
                <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                  <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Birthday</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">&#127874; {formatBirthday(contact.birthday)}</p>
                </div>
              )}

              {/* Keep in Touch */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Keep in Touch</h3>
                <select
                  value={form.keep_in_touch_days}
                  onChange={e => handleKeepInTouchChange(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-violet-500/50"
                >
                  {KEEP_IN_TOUCH_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {kitStatus && (
                  <p className={`text-xs mt-2 ${kitStatus.includes('overdue') ? 'text-red-500 dark:text-red-400 font-medium' : 'text-zinc-500'}`}>
                    {kitStatus}
                  </p>
                )}
                {lastInteraction && (
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Last contact: {new Date(lastInteraction.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>

              {/* Custom Fields */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Custom Fields</h3>
                {customFields.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {customFields.map(cf => (
                      <CustomFieldRow key={cf.id} field={cf} onUpdate={handleUpdateCustomField} onDelete={handleDeleteCustomField} />
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                  <div className="flex gap-1.5">
                    <input value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)} placeholder="Value"
                      className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                    <button onClick={handleAddCustomField} disabled={!newFieldName.trim()}
                      className="px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-40">Add</button>
                  </div>
                </div>
              </div>

              {/* Important Dates */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                <button onClick={() => setShowDates(!showDates)} className="flex items-center gap-2 w-full text-left">
                  <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Important Dates</h3>
                  <span className="text-[10px] text-zinc-400">{importantDates.length > 0 ? `(${importantDates.length})` : ''}</span>
                  <svg className={`w-3 h-3 text-zinc-400 ml-auto transition-transform ${showDates ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
                </button>
                {showDates && (
                  <div className="mt-3">
                    {importantDates.map(d => (
                      <ImportantDateRow key={d.id} date={d} onUpdate={handleUpdateImportantDate} onDelete={handleDeleteImportantDate} />
                    ))}
                    <div className="space-y-1.5 mt-2">
                      <input value={newDateLabel} onChange={e => setNewDateLabel(e.target.value)} placeholder="Label"
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                      <div className="flex gap-1.5">
                        <input type="date" value={newDateValue} onChange={e => setNewDateValue(e.target.value)}
                          className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                        <button onClick={handleAddImportantDate} disabled={!newDateLabel.trim() || !newDateValue}
                          className="px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-40">Add</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Related Contacts */}
              <div className="border-t border-zinc-200 dark:border-zinc-800/60 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Related Contacts</h3>
                  <button onClick={() => setShowRelateForm(!showRelateForm)}
                    className="text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium">
                    {showRelateForm ? 'Cancel' : '+ Add'}
                  </button>
                </div>
                {showRelateForm && (
                  <div className="mb-3 space-y-2">
                    <input value={relateSearch} onChange={e => handleSearchRelated(e.target.value)} placeholder="Search contacts..."
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                    <input value={relateType} onChange={e => setRelateType(e.target.value)} placeholder="Relationship type"
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
                    {relateResults.length > 0 && (
                      <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-lg overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
                        {relateResults.map(c => (
                          <button key={c.id} onClick={() => handleAddRelationship(c.id)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: getAvatarColor(`${c.first_name} ${c.last_name}`) }}>
                              {c.first_name[0]}{c.last_name?.[0] || ''}
                            </div>
                            <span className="text-xs text-zinc-800 dark:text-zinc-200 truncate">{c.first_name} {c.last_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {relationships.length === 0 && !showRelateForm && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">No related contacts</p>
                )}
                {relationships.length > 0 && (
                  <div className="space-y-2">
                    {relationships.map(rel => (
                      <div key={rel.id} className="flex items-center gap-2 group">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: getAvatarColor(`${rel.first_name} ${rel.last_name}`) }}>
                          {rel.first_name[0]}{rel.last_name?.[0] || ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-800 dark:text-zinc-200 truncate">{rel.first_name} {rel.last_name}</p>
                          {rel.relationship_type && <p className="text-[10px] text-zinc-400 leading-tight">{rel.relationship_type}</p>}
                        </div>
                        <button onClick={() => handleDeleteRelationship(rel.id)}
                          className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs flex-shrink-0">&#10005;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== BOTTOM BAR — Interaction input ========== */}
      <div className={`border-t border-zinc-200 dark:border-zinc-800/60 flex-shrink-0 ${isPanel ? 'px-3 py-2' : 'px-6 py-3'}`}>
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((fp, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400">
                {fp.split(/[/\\]/).pop()}
                <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-400">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <select value={intType} onChange={e => setIntType(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-violet-500/50 w-28 flex-shrink-0">
            {INTERACTION_TYPES.map(t => (<option key={t.value} value={t.value}>{t.icon} {t.label}</option>))}
          </select>
          <input
            value={intDesc}
            onChange={e => setIntDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && intDesc.trim()) handleSaveInteraction() }}
            placeholder="What happened?"
            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50"
          />
          <input type="date" value={intDate} onChange={e => setIntDate(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-violet-500/50 w-32 flex-shrink-0" />
          <button onClick={handleAttachFile}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-sm flex-shrink-0"
            title="Attach file">
            &#128206;
          </button>
          <button onClick={handleSaveInteraction} disabled={!intDesc.trim()}
            className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors flex-shrink-0">
            Log
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      {qrDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setQrDataUrl(null)} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              {contact.first_name} {contact.last_name}
            </h2>
            <p className="text-sm text-zinc-500 mb-5">Scan this with any phone camera to save the contact</p>
            <div className="flex justify-center mb-5">
              <img src={qrDataUrl} alt="Contact QR Code" className="w-64 h-64 rounded-lg" />
            </div>
            <button
              onClick={() => setQrDataUrl(null)}
              className="px-5 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Subcomponents ---

function CustomFieldRow({ field, onUpdate, onDelete }: { field: CustomField; onUpdate: (f: CustomField, name: string, value: string) => void; onDelete: (id: number) => void }) {
  const [name, setName] = useState(field.field_name)
  const [value, setValue] = useState(field.field_value)

  function handleBlur() {
    if (name !== field.field_name || value !== field.field_value) {
      onUpdate(field, name, value)
    }
  }

  return (
    <div className="flex items-center gap-2 group">
      <input value={name} onChange={e => setName(e.target.value)} onBlur={handleBlur}
        className="flex-1 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-violet-500/50 px-1 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 outline-none" />
      <input value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur}
        className="flex-1 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-violet-500/50 px-1 py-0.5 text-xs text-zinc-800 dark:text-zinc-300 outline-none" />
      <button onClick={() => onDelete(field.id)} className="text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">&#10005;</button>
    </div>
  )
}

function ImportantDateRow({ date, onUpdate, onDelete }: { date: ImportantDate; onUpdate: (id: number, label: string, date: string) => void; onDelete: (id: number) => void }) {
  const [label, setLabel] = useState(date.label)
  const [dateVal, setDateVal] = useState(date.date)

  function handleBlur() {
    if (label !== date.label || dateVal !== date.date) {
      onUpdate(date.id, label, dateVal)
    }
  }

  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <input value={label} onChange={e => setLabel(e.target.value)} onBlur={handleBlur}
        className="flex-1 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-violet-500/50 px-1 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none" />
      <input type="date" value={dateVal} onChange={e => { setDateVal(e.target.value); }} onBlur={handleBlur}
        className="bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-violet-500/50 px-1 py-0.5 text-xs text-zinc-500 outline-none" />
      <button onClick={() => onDelete(date.id)} className="text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">&#10005;</button>
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50" />
    </div>
  )
}

function SidebarInfoRow({ icon, label, value, link, mailto }: { icon: string; label: string; value: string; link?: boolean; mailto?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs flex-shrink-0 mt-0.5 w-4 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
        {mailto ? (
          <a href={`mailto:${value}`} className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 truncate block">{value}</a>
        ) : link ? (
          <a href={value.startsWith('http') ? value : 'https://' + value} target="_blank" rel="noreferrer"
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 truncate block">
            {value.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
          </a>
        ) : (
          <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{value}</p>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '../types'

const FREQUENCY_OPTIONS = [
  { label: 'Archive', value: -1, key: ' ', hint: 'Space' },
  { label: 'No frequency', value: 0, key: '1', hint: '1' },
  { label: 'Every 3 months', value: 90, key: '2', hint: '2' },
  { label: 'Every 6 months', value: 180, key: '3', hint: '3' },
  { label: 'Every year', value: 365, key: '4', hint: '4' },
]

const EXTRA_FREQUENCIES = [
  { label: 'Every week', value: 7 },
  { label: 'Every 2 weeks', value: 14 },
  { label: 'Every month', value: 30 },
  { label: 'Every 6 weeks', value: 42 },
  { label: "Don't Track", value: -2 },
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

export default function QuickAction() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [showMore, setShowMore] = useState(false)
  const [history, setHistory] = useState<{ contact: Contact; action: string; value: number }[]>([])
  const [lastInteraction, setLastInteraction] = useState<string | null>(null)

  useEffect(() => {
    loadContacts()
  }, [])

  useEffect(() => {
    if (contacts[index]) loadLastInteraction(contacts[index].id)
  }, [index, contacts])

  async function loadContacts() {
    const data = await window.api.contacts.getUncategorized(50) as Contact[]
    const count = await window.api.contacts.countUncategorized() as number
    setContacts(data)
    setTotal(count)
    setIndex(0)
  }

  async function loadLastInteraction(contactId: number) {
    const interactions = await window.api.interactions.getForContact(contactId) as { date: string; description: string }[]
    if (interactions.length > 0) {
      const last = interactions[0]
      setLastInteraction(`${last.date} — ${last.description}`)
    } else {
      setLastInteraction(null)
    }
  }

  const handleAction = useCallback(async (value: number) => {
    const contact = contacts[index]
    if (!contact) return

    setHistory(prev => [...prev, { contact, action: value === -1 ? 'archive' : 'frequency', value }])

    if (value === -1) {
      await window.api.contacts.archive(contact.id)
    } else if (value === -2) {
      // "Don't Track" — set keep_in_touch_days to -1 sentinel
      await window.api.contacts.setKeepInTouch(contact.id, -1)
    } else {
      await window.api.contacts.setKeepInTouch(contact.id, value)
    }

    setShowMore(false)
    if (index < contacts.length - 1) {
      setIndex(prev => prev + 1)
    } else {
      // Reload more contacts
      const remaining = await window.api.contacts.getUncategorized(50) as Contact[]
      if (remaining.length > 0) {
        setContacts(remaining)
        setIndex(0)
      } else {
        setContacts([])
      }
    }
    setTotal(prev => prev - 1)
  }, [contacts, index])

  const handleUndo = useCallback(async () => {
    if (history.length === 0) return
    const last = history[history.length - 1]
    setHistory(prev => prev.slice(0, -1))

    if (last.action === 'archive') {
      // Restore archived contact
      await window.api.contacts.update(last.contact.id, {
        ...last.contact,
        deleted_at: null
      } as Record<string, unknown>)
    } else {
      await window.api.contacts.setKeepInTouch(last.contact.id, 0)
    }

    // Re-insert contact at current position
    setContacts(prev => {
      const newList = [...prev]
      newList.splice(index, 0, last.contact)
      return newList
    })
    setTotal(prev => prev + 1)
  }, [history, index])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (contacts.length === 0) return

      if (e.key === ' ') { e.preventDefault(); handleAction(-1) } // Archive
      else if (e.key === '1') handleAction(0)
      else if (e.key === '2') handleAction(90)
      else if (e.key === '3') handleAction(180)
      else if (e.key === '4') handleAction(365)
      else if (e.key === 'z' || e.key === 'Z') handleUndo()
      else if (e.key === 'f' || e.key === 'F') setShowMore(prev => !prev)
      else if (e.key === '!' || (e.shiftKey && e.key === '1')) {
        // Skip
        if (index < contacts.length - 1) setIndex(prev => prev + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [contacts, index, handleAction, handleUndo])

  const contact = contacts[index]
  const processed = history.length
  const fullName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : ''

  if (contacts.length === 0 && total <= 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">{'\u{2705}'}</div>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">All caught up!</h2>
          <p className="text-sm text-zinc-500 mb-6">Every contact has a keep-in-touch frequency set.</p>
          <button onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      {/* Progress */}
      <div className="mb-6 text-center">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Quick Action</p>
        <p className="text-sm text-zinc-400 mt-1">{processed} done &middot; {total} remaining</p>
      </div>

      {/* Card */}
      {contact && (
        <div className="w-full max-w-md glass p-8 mb-6">
          {/* Avatar */}
          <div className="flex justify-center mb-5">
            {contact.photo_url ? (
              <img src={contact.photo_url.startsWith('/') || contact.photo_url.startsWith('C:') ? `file://${contact.photo_url}` : contact.photo_url}
                alt={fullName}
                className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
                style={{ backgroundColor: getAvatarColor(fullName) }}>
                {contact.first_name[0]}{contact.last_name?.[0] || ''}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{fullName}</h2>
            {contact.job_title && (
              <p className="text-sm text-zinc-500 mt-1">{contact.job_title}{contact.company ? ` at ${contact.company}` : ''}</p>
            )}
            {!contact.job_title && contact.company && (
              <p className="text-sm text-zinc-500 mt-1">{contact.company}</p>
            )}
            {contact.email && (
              <p className="text-xs text-zinc-400 mt-1">{contact.email}</p>
            )}
            {contact.location && (
              <p className="text-xs text-zinc-400 mt-0.5">{'\u{1F4CD}'} {contact.location}</p>
            )}
          </div>

          {/* Last interaction */}
          <div className="text-center border-t border-zinc-100 dark:border-zinc-800/40 pt-4">
            {lastInteraction ? (
              <p className="text-xs text-zinc-500">Last: {lastInteraction}</p>
            ) : (
              <p className="text-xs text-zinc-400">No interactions logged</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-md space-y-2">
        <div className="grid grid-cols-5 gap-2">
          {FREQUENCY_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleAction(opt.value)}
              className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl text-xs font-medium transition-colors border ${
                opt.value === -1
                  ? 'border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400'
                  : 'border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 text-zinc-700 dark:text-zinc-300'
              }`}>
              <span className="text-[10px] text-zinc-400 font-mono">{opt.hint}</span>
              <span className="leading-tight text-center">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* More frequencies */}
        {showMore && (
          <div className="grid grid-cols-4 gap-2">
            {EXTRA_FREQUENCIES.map(opt => (
              <button key={opt.value} onClick={() => handleAction(opt.value)}
                className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl text-xs font-medium transition-colors border border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 text-zinc-700 dark:text-zinc-300">
                <span className="leading-tight text-center">{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <button onClick={() => setShowMore(prev => !prev)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <span className="font-mono text-[10px] mr-1">F</span> {showMore ? 'Less' : 'More frequencies'}
          </button>
          <button onClick={handleUndo} disabled={history.length === 0}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 transition-colors">
            <span className="font-mono text-[10px] mr-1">Z</span> Undo
          </button>
          <button onClick={() => { if (index < contacts.length - 1) setIndex(prev => prev + 1) }}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <span className="font-mono text-[10px] mr-1">!</span> Skip
          </button>
        </div>
      </div>
    </div>
  )
}

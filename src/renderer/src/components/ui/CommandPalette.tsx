import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../App'
import type { Contact, Tag, Group } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface ResultItem {
  id: string
  label: string
  sublabel?: string
  section: string
  action: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      Promise.all([
        window.api.contacts.getAll(),
        window.api.groups.getAll(),
        window.api.tags.getAll()
      ]).then(([c, g, t]) => {
        setContacts(c as Contact[])
        setGroups(g as Group[])
        setTags(t as Tag[])
      })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const buildResults = useCallback(() => {
    const q = query.toLowerCase().trim()
    const items: ResultItem[] = []

    // Actions (always shown, filtered by query)
    const actions = [
      { id: 'action-add', label: 'Add contact', sublabel: 'Ctrl+N', section: 'Actions', action: () => { onClose(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true })) } },
      { id: 'action-dashboard', label: 'Go to Dashboard', section: 'Actions', action: () => { onClose(); navigate('/') } },
      { id: 'action-pipeline', label: 'Go to Pipeline', section: 'Actions', action: () => { onClose(); navigate('/pipeline') } },
      { id: 'action-contacts', label: 'Go to Contacts', section: 'Actions', action: () => { onClose(); navigate('/contacts') } },
      { id: 'action-theme', label: 'Toggle theme', sublabel: 'Light/Dark', section: 'Actions', action: () => { toggleTheme(); onClose() } },
      { id: 'action-export', label: 'Export CSV', section: 'Actions', action: () => { window.api.data.exportCsv(); onClose() } },
      { id: 'action-copilot', label: 'Open Copilot', sublabel: 'AI', section: 'Actions', action: () => { onClose(); navigate('/copilot') } },
      { id: 'action-kit', label: 'Keep In Touch', section: 'Actions', action: () => { onClose(); navigate('/keep-in-touch') } },
      { id: 'action-quickaction', label: 'Quick Action', section: 'Actions', action: () => { onClose(); navigate('/quick-action') } },
      { id: 'action-import', label: 'Import Contacts', section: 'Actions', action: () => { onClose(); navigate('/import') } },
      { id: 'action-map', label: 'Open Map', sublabel: 'Locations', section: 'Actions', action: () => { onClose(); navigate('/map') } },
      { id: 'action-locations', label: 'Manage Locations', section: 'Actions', action: () => { onClose(); navigate('/locations') } },
      { id: 'action-refer', label: 'Refer a Friend', sublabel: 'Earn credits', section: 'Actions', action: () => { onClose(); navigate('/refer') } },
    ]

    // Contacts
    const filteredContacts = q
      ? contacts.filter(c =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q)
        ).slice(0, 8)
      : contacts.slice(0, 5)

    for (const c of filteredContacts) {
      items.push({
        id: `contact-${c.id}`,
        label: `${c.first_name} ${c.last_name}`.trim(),
        sublabel: c.company || c.email || undefined,
        section: 'Contacts',
        action: () => { onClose(); navigate(`/contacts?contactId=${c.id}`) }
      })
    }

    // Groups
    const filteredGroups = q
      ? groups.filter(g => g.name.toLowerCase().includes(q)).slice(0, 5)
      : groups.slice(0, 3)

    for (const g of filteredGroups) {
      items.push({
        id: `group-${g.id}`,
        label: g.name,
        sublabel: 'Group',
        section: 'Groups',
        action: () => { onClose(); navigate('/groups') }
      })
    }

    // Tags
    const filteredTags = q
      ? tags.filter(t => t.name.toLowerCase().includes(q)).slice(0, 5)
      : tags.slice(0, 3)

    for (const t of filteredTags) {
      items.push({
        id: `tag-${t.id}`,
        label: t.name,
        sublabel: 'Tag',
        section: 'Tags',
        action: () => { onClose(); navigate('/tags') }
      })
    }

    // Actions filtered
    const filteredActions = q
      ? actions.filter(a => a.label.toLowerCase().includes(q))
      : actions

    items.push(...filteredActions)

    setResults(items)
    setSelectedIndex(0)
  }, [query, contacts, groups, tags])

  useEffect(() => {
    buildResults()
  }, [buildResults])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      results[selectedIndex].action()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  // Group results by section
  const sections: { name: string; items: (ResultItem & { globalIndex: number })[] }[] = []
  let globalIdx = 0
  const sectionMap = new Map<string, (ResultItem & { globalIndex: number })[]>()
  for (const item of results) {
    if (!sectionMap.has(item.section)) sectionMap.set(item.section, [])
    sectionMap.get(item.section)!.push({ ...item, globalIndex: globalIdx++ })
  }
  for (const [name, items] of sectionMap) {
    sections.push({ name, items })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center" style={{ paddingTop: '20vh' }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm overlay-enter" onClick={onClose} />
      <div className="relative w-full max-w-lg h-fit slide-over-enter">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-800/60">
            <SearchIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search contacts, groups, tags, or actions..."
              className="w-full py-3.5 text-sm bg-transparent text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
            />
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded flex-shrink-0">ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-zinc-400 dark:text-zinc-500">No results found</p>
              </div>
            ) : (
              sections.map(section => (
                <div key={section.name}>
                  <p className="px-4 py-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{section.name}</p>
                  {section.items.map(item => (
                    <button
                      key={item.id}
                      data-index={item.globalIndex}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        item.globalIndex === selectedIndex
                          ? 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">{item.sublabel}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
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

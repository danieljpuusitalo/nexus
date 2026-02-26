import { useState, useRef, useEffect } from 'react'
import type { Tag } from '../../types'

const TAG_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4'
]

interface TagInputProps {
  selectedTags: Tag[]
  allTags: Tag[]
  onAdd: (tag: Tag) => void
  onRemove: (tagId: number) => void
  onCreate: (name: string) => Promise<Tag>
}

export default function TagInput({ selectedTags, allTags, onAdd, onRemove, onCreate }: TagInputProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = allTags.filter(
    t => t.name.toLowerCase().includes(query.toLowerCase()) && !selectedTags.some(s => s.id === t.id)
  )
  const showCreate = query.trim() && !allTags.some(t => t.name.toLowerCase() === query.trim().toLowerCase())

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleCreate() {
    const name = query.trim()
    if (!name) return
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    const tag = await onCreate(name)
    onAdd({ ...tag, color })
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selectedTags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: tag.color + '20', color: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => onRemove(tag.id)}
              className="hover:opacity-70 text-[10px] leading-none"
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' && showCreate) {
            e.preventDefault()
            handleCreate()
          }
          if (e.key === 'Backspace' && !query && selectedTags.length) {
            onRemove(selectedTags[selectedTags.length - 1].id)
          }
        }}
        placeholder="Search or create tags..."
        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
      />

      {/* Dropdown */}
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl max-h-40 overflow-y-auto">
          {filtered.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => { onAdd(tag); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="text-zinc-300">{tag.name}</span>
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors text-violet-400"
            >
              Create &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

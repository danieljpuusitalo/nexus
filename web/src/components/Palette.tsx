/**
 * Command palette.
 *
 * The fastest route to a person is typing three letters of their name, and a
 * tool that expects to be lived in should assume the keyboard first. Open with
 * cmd-K, arrow to a result, enter. Nothing here is reachable only by mouse.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ago, initials, load } from '../lib/data'

export default function Palette({ onClose }: { onClose: () => void }) {
  const { people, conversations } = load()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLInputElement>(null)

  useEffect(() => {
    box.current?.focus()
  }, [])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const byPerson = people.map(p => ({
      key: `p${p.id}`,
      label: p.name,
      detail: [p.role, p.company].filter(Boolean).join(', '),
      meta: ago(p.last_conversation_at),
      to: `/people/${p.id}`,
      mark: initials(p.name),
    }))
    const byConv = conversations.map(c => ({
      key: `c${c.id}`,
      label: c.title,
      detail: c.people.join(', '),
      meta: ago(c.started_at),
      to: c.person_ids[0] !== undefined ? `/people/${c.person_ids[0]}` : '/',
      mark: '',
    }))
    const all = [...byPerson, ...byConv]
    if (!needle) return byPerson.slice(0, 8)
    return all
      .filter(h => `${h.label} ${h.detail}`.toLowerCase().includes(needle))
      .slice(0, 9)
  }, [q, people, conversations])

  useEffect(() => {
    setCursor(0)
  }, [q])

  function go(to: string) {
    navigate(to)
    onClose()
  }

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="palette" onMouseDown={e => e.stopPropagation()}>
        <input
          ref={box}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Find a person or a conversation"
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor(c => Math.min(c + 1, hits.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor(c => Math.max(c - 1, 0))
            }
            if (e.key === 'Enter' && hits[cursor]) go(hits[cursor].to)
          }}
        />
        <div className="results">
          {hits.length === 0 ? (
            <div className="none">Nothing matches that.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.key}
                className={`hit ${i === cursor ? 'cursor' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(h.to)}
              >
                {h.mark ? <span className="av">{h.mark}</span> : null}
                <span style={{ minWidth: 0 }}>
                  {h.label}
                  {h.detail && <span style={{ color: 'var(--faint)' }}> · {h.detail}</span>}
                </span>
                <em>{h.meta}</em>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

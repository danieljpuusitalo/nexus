/**
 * People — everyone you have had a conversation with.
 *
 * Nothing here was typed in. These people exist because the record says you
 * spoke to them, which is why there is no "add person" and no import step.
 * Ordered by recency, never alphabetically: the person you spoke to yesterday
 * is far likelier to be the one you want than the one whose surname starts A.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { load, ago, initials } from '../lib/data'

export default function People() {
  const { people } = load()
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sorted = [...people].sort((a, b) =>
      b.last_conversation_at.localeCompare(a.last_conversation_at)
    )
    if (!needle) return sorted
    return sorted.filter(p =>
      `${p.name} ${p.email} ${p.company ?? ''} ${p.role ?? ''}`.toLowerCase().includes(needle)
    )
  }, [people, q])

  return (
    <div className="main">
      <p className="eyebrow">{people.length} in the record</p>
      <h1 className="display">People</h1>
      <p className="lede">Everyone you have spoken to, most recent first.</p>

      <input
        className="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search people, companies, roles…"
      />

      <div className="people">
        {shown.map((p, i) => (
          <Link
            key={p.id}
            to={`/people/${p.id}`}
            className="person-row"
            style={{ animationDelay: `${Math.min(i, 9) * 45}ms` }}
          >
            <span className="mark">{initials(p.name)}</span>
            <span className="who">
              <b>{p.name}</b>
              <span>
                {[p.role, p.company].filter(Boolean).join(' · ') || p.email}
                {' — '}
                {p.conversations} conversation{p.conversations === 1 ? '' : 's'}
              </span>
            </span>
            <span className="ago">{ago(p.last_conversation_at)}</span>
          </Link>
        ))}
        {shown.length === 0 && (
          <div className="empty" style={{ marginTop: 20 }}>
            <p>Nobody matches that.</p>
          </div>
        )}
      </div>
    </div>
  )
}

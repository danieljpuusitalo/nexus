/**
 * The index: the middle pane you scan.
 *
 * It never goes away. You pick something, read it, and pick the next thing
 * without losing your place, which is how anyone actually works through a body
 * of records and is the single reason for a three pane layout.
 *
 * People are grouped by when you last spoke rather than sorted alphabetically.
 * "This week" is a thought someone actually has; "surnames beginning with B" is
 * not. Each row carries a cadence strip so the shape of a relationship is
 * legible before the name is read.
 */

import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Cadence from './Cadence'
import { ago, bucket, companies, initials, load, sourceName } from '../lib/data'

type Mode = 'people' | 'companies' | 'stream'

export default function Index({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { people, conversations } = load()
  const navigate = useNavigate()
  // This pane lives outside <Routes>, so it has no route params of its own.
  // The selected id has to come from the path, or nothing ever looks selected.
  const path = useLocation().pathname
  const selected = Number(path.match(/^\/people\/(\d+)/)?.[1])
  const selectedOrg = path.match(/^\/company\/(.+)/)?.[1]
  const [q, setQ] = useState('')

  const dateIndex = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const c of conversations) {
      for (const pid of c.person_ids) {
        m.set(pid, [...(m.get(pid) ?? []), c.started_at])
      }
    }
    return m
  }, [conversations])

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = [...people]
      .filter(p =>
        !needle
          ? true
          : `${p.name} ${p.company ?? ''} ${p.role ?? ''} ${p.email}`.toLowerCase().includes(needle)
      )
      .sort((a, b) => b.last_conversation_at.localeCompare(a.last_conversation_at))

    const out: { label: string; rows: typeof rows }[] = []
    for (const r of rows) {
      const label = bucket(r.last_conversation_at)
      const tail = out[out.length - 1]
      if (tail && tail.label === label) tail.rows.push(r)
      else out.push({ label, rows: [r] })
    }
    return out
  }, [people, q])

  const orgs = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return companies().filter(c =>
      !needle ? true : `${c.name} ${c.people.map(p => p.name).join(' ')}`.toLowerCase().includes(needle)
    )
  }, [q])

  const stream = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...conversations]
      .filter(c => (!needle ? true : `${c.title} ${c.people.join(' ')}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
  }, [conversations, q])

  return (
    <div className="index">
      <div className="finder">
        <div className="finder-input">
          <span className="mag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m20 20-4.5-4.5" strokeLinecap="round" />
            </svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter" />
          <span className="kbd">/</span>
        </div>
        <div className="segs">
          <button className={mode === 'people' ? 'on' : ''} onClick={() => setMode('people')}>
            People
          </button>
          <button className={mode === 'companies' ? 'on' : ''} onClick={() => setMode('companies')}>
            Companies
          </button>
          <button className={mode === 'stream' ? 'on' : ''} onClick={() => setMode('stream')}>
            All
          </button>
        </div>
      </div>

      <div className="scroll">
        {mode === 'people'
          ? grouped.map(g => (
              <div key={g.label}>
                <div className="group-label">{g.label}</div>
                {g.rows.map(p => (
                  <button
                    key={p.id}
                    className={`row ${selected === p.id ? 'on' : ''}`}
                    onClick={() => navigate(`/people/${p.id}`)}
                  >
                    <span className="av">{initials(p.name)}</span>
                    <span className="row-main">
                      <span className="row-top">
                        <b>{p.name}</b>
                        <span className="when">{ago(p.last_conversation_at)}</span>
                      </span>
                      <span className="row-sub">
                        {[p.role, p.company].filter(Boolean).join(', ') || p.email}
                      </span>
                      <Cadence dates={dateIndex.get(p.id) ?? []} />
                    </span>
                  </button>
                ))}
              </div>
            ))
          : mode === 'companies'
          ? orgs.map(c => (
              <button
                key={c.slug}
                className={`row ${selectedOrg === c.slug ? 'on' : ''}`}
                onClick={() => navigate(`/company/${c.slug}`)}
              >
                <span className="av org">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="row-main">
                  <span className="row-top">
                    <b>{c.name}</b>
                    <span className="when">{ago(c.lastAt)}</span>
                  </span>
                  <span className="row-sub">
                    {c.people.map(p => p.name.split(' ')[0]).join(', ')} ·{' '}
                    {c.conversations.length} conversation{c.conversations.length === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            ))
          : stream.map(c => (
              <button
                key={c.id}
                className="row"
                onClick={() =>
                  c.person_ids[0] !== undefined && navigate(`/people/${c.person_ids[0]}`)
                }
              >
                <span className="row-main">
                  <span className="row-top">
                    <b>{c.title}</b>
                    <span className="when">{ago(c.started_at)}</span>
                  </span>
                  <span className="row-sub">
                    {sourceName(c.source)} · {c.people.join(', ') || 'no one placed yet'}
                  </span>
                </span>
              </button>
            ))}

        {((mode === 'people' && grouped.length === 0) ||
          (mode === 'companies' && orgs.length === 0) ||
          (mode === 'stream' && stream.length === 0)) && (
          <p style={{ padding: '20px 16px', color: 'var(--faint)', fontSize: 13 }}>
            Nothing matches that.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Who is this? — the people the record could not place.
 *
 * Nexus refuses to guess. When several people fit a name, or none do, the link
 * is left open rather than attached to whoever the database returned first — a
 * wrong link is invisible once made and every view built on top inherits it.
 *
 * That refusal is only worth something if the leftovers are trivial to clear,
 * which is the entire job of this screen: one question, one click.
 */

import { useState } from 'react'
import { load, longDate, sourceColour, sourceName } from '../lib/data'

export default function Review() {
  const { queries } = load()
  const [resolved, setResolved] = useState<Record<number, string>>({})

  const open = queries.filter(q => !resolved[q.id])

  return (
    <div className="main">
      <p className="eyebrow">{open.length} open</p>
      <h1 className="display">Who is this?</h1>
      <p className="lede">
        Nexus never guesses at a name. These are the only ones it could not place on its own.
      </p>

      {open.length === 0 ? (
        <div className="empty">
          <p>Everyone in your record has been placed.</p>
          <p style={{ fontSize: 13 }}>
            Anything Nexus cannot work out will wait here rather than be attached to the wrong
            person.
          </p>
        </div>
      ) : (
        open.map((q, i) => (
          <div className="query" key={q.id} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="spread">
              <div style={{ minWidth: 0 }}>
                <div className="name">{q.raw_name || q.raw_email}</div>
                <div className="meta" style={{ marginTop: 6, marginBottom: 0 }}>
                  <span className="src">
                    <i style={{ background: sourceColour(q.source) }} />
                    {sourceName(q.source)}
                  </span>
                  <span className="dot" />
                  <span>{q.title}</span>
                  <span className="dot" />
                  <span>{longDate(q.started_at)}</span>
                </div>
              </div>
              <span className={`tag ${q.resolution === 'ambiguous' ? 'amber' : 'quiet'}`}>
                {q.resolution === 'ambiguous'
                  ? `${q.candidates.length} could fit`
                  : 'nobody matched'}
              </span>
            </div>

            {q.candidates.length > 0 ? (
              <div className="options">
                {q.candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setResolved(r => ({ ...r, [q.id]: c.name }))}
                  >
                    {c.name}
                    <span style={{ color: 'var(--bone-faint)' }}> — {c.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="row" style={{ marginTop: 13 }}>
              <button
                className="btn primary"
                onClick={() => setResolved(r => ({ ...r, [q.id]: q.raw_name }))}
              >
                Someone new
              </button>
              <button className="btn">Not a person</button>
            </div>
          </div>
        ))
      )}

      {Object.keys(resolved).length > 0 && (
        <p
          className="eyebrow"
          style={{ marginTop: 26, color: 'var(--sage)' }}
        >
          {Object.keys(resolved).length} placed this session
        </p>
      )}
    </div>
  )
}

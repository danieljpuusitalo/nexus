/**
 * Who is this?
 *
 * Nexus never guesses at a name. When several people fit, or none do, the link
 * is left open rather than attached to whoever the database happened to return
 * first. A wrong link is invisible once made and everything built on top
 * inherits it.
 *
 * That refusal only earns its keep if clearing the leftovers is trivial, which
 * is this screen's entire job: one question, one click, gone.
 */

import { useState } from 'react'
import { initials, load, longDate, sourceColour, sourceName } from '../lib/data'

export default function Review() {
  const { queries } = load()
  const [done, setDone] = useState<Record<number, string>>({})
  const open = queries.filter(q => !done[q.id])

  return (
    <div className="record">
      <div className="record-inner">
        <div className="crumb">
          <span>Who is this?</span>
          <span>/</span>
          <span style={{ color: 'var(--dim)' }}>{open.length} open</span>
        </div>

        <p style={{ color: 'var(--dim)', fontSize: 13.5, margin: '0 0 22px', maxWidth: '54ch' }}>
          Nexus never guesses at a name. These are the only ones it could not place on its own.
        </p>

        {open.length === 0 ? (
          <p className="quiet">
            Everyone in the record has been placed. Anything Nexus cannot work out waits here rather
            than attaching itself to the wrong person.
          </p>
        ) : (
          open.map((q, i) => (
            <div className="ask" key={q.id} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="ask-top">
                <div style={{ minWidth: 0 }}>
                  <div className="subject">{q.raw_name || q.raw_email}</div>
                  <div className="ctx">
                    <span style={{ color: sourceColour(q.source) }}>●</span> {sourceName(q.source)} ·{' '}
                    {q.title} · {longDate(q.started_at)}
                  </div>
                </div>
                <span className={`chip ${q.resolution === 'ambiguous' ? 'warn' : 'mute'}`}>
                  {q.resolution === 'ambiguous' ? `${q.candidates.length} could fit` : 'no match'}
                </span>
              </div>

              {q.candidates.length > 0 && (
                <div className="picks">
                  {q.candidates.map(c => (
                    <button
                      key={c.id}
                      className="pick"
                      onClick={() => setDone(d => ({ ...d, [q.id]: c.name }))}
                    >
                      <span className="av">{initials(c.name)}</span>
                      <span>{c.name}</span>
                      <em>{c.detail}</em>
                    </button>
                  ))}
                </div>
              )}

              <div className="acts">
                <button className="act go" onClick={() => setDone(d => ({ ...d, [q.id]: q.raw_name }))}>
                  Someone new
                </button>
                <button className="act">Not a person</button>
              </div>
            </div>
          ))
        )}

        {Object.keys(done).length > 0 && (
          <p style={{ marginTop: 20, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--sage)' }}>
            {Object.keys(done).length} placed just now
          </p>
        )}
      </div>
    </div>
  )
}

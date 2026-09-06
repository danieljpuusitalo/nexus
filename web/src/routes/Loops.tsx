/**
 * Open loops: everything anyone said they would do, and has not.
 *
 * The commitments in a call are the substance of a working relationship, and
 * every notetaker records them verbatim and then throws them away. This is the
 * running inventory nobody has: what you owe, what you are owed, one list.
 *
 * "What you owe" leads deliberately. A tool that only shows what you are owed
 * is an extraction machine; the list that builds a reputation is the one where
 * you are the debtor.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { allLoops, ago, initials, shortDate, type OpenLoop } from '../lib/data'

function Loop({ l, onDone }: { l: OpenLoop; onDone: () => void }) {
  return (
    <div className={`loop ${l.late ? 'late' : ''}`}>
      <button className="tick" onClick={onDone} title="Mark as done" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="loop-text">{l.text}</div>
        <div className="loop-ctx">
          <Link to={`/people/${l.personId}`}>
            <span className="av">{initials(l.personName)}</span>
            {l.personName}
          </Link>
          <span>·</span>
          <span>agreed {ago(l.agreedAt)} in {l.conversationTitle}</span>
          {l.inferred && (
            <>
              <span>·</span>
              <span className="inferred">read from transcript</span>
            </>
          )}
        </div>
      </div>
      {l.due && <span className={`due ${l.late ? 'on' : ''}`}>by {shortDate(l.due)}</span>}
    </div>
  )
}

export default function Loops() {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const loops = allLoops().filter(l => !l.done && !closed[`${l.conversationId}:${l.text}`])
  const mine = loops.filter(l => l.owner === 'me')
  const theirs = loops.filter(l => l.owner === 'them')

  const close = (l: OpenLoop) => setClosed(c => ({ ...c, [`${l.conversationId}:${l.text}`]: true }))

  return (
    <div className="record">
      <div className="record-inner">
        <div className="crumb">
          <span>Open loops</span>
          <span>/</span>
          <span style={{ color: 'var(--dim)' }}>{loops.length} outstanding</span>
        </div>

        <p className="blurb">
          Everything anyone said they would do, pulled from the conversations where it was said.
          Nobody typed any of this in.
        </p>

        <div className="loop-head">
          <h2>You owe</h2>
          <span>{mine.length}</span>
        </div>
        {mine.length === 0 ? (
          <p className="quiet">Nothing outstanding on your side.</p>
        ) : (
          mine.map(l => <Loop key={`${l.conversationId}:${l.text}`} l={l} onDone={() => close(l)} />)
        )}

        <div className="loop-head" style={{ marginTop: 30 }}>
          <h2>You are owed</h2>
          <span>{theirs.length}</span>
        </div>
        {theirs.length === 0 ? (
          <p className="quiet">Nothing outstanding on their side.</p>
        ) : (
          theirs.map(l => <Loop key={`${l.conversationId}:${l.text}`} l={l} onDone={() => close(l)} />)
        )}
      </div>
    </div>
  )
}

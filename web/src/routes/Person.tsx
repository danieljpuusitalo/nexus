/**
 * A person, and every conversation you have had with them.
 *
 * This is the product. Every notetaker keeps a flat chronological list trapped
 * inside itself; finding what you discussed with someone means scrolling
 * through Tactiq, then Fathom, then your inbox. This page inverts that.
 *
 * There is no edit form, no tags, no fields to fill in. The record is not
 * something you maintain — it is something that accumulates.
 */

import { Link, useParams } from 'react-router-dom'
import Entry from '../components/Entry'
import { conversationsFor, personById, ago, initials, longDate } from '../lib/data'

export default function Person() {
  const { id } = useParams<{ id: string }>()
  const person = personById(Number(id))

  if (!person) {
    return (
      <div className="main">
        <Link to="/people" className="back">
          ← People
        </Link>
        <p className="silent">That person is not in the record.</p>
      </div>
    )
  }

  const conversations = conversationsFor(person.id)
  const generated = conversations.filter(c => !c.summary && c.generated_summary).length

  return (
    <div className="main">
      <Link to="/people" className="back">
        ← People
      </Link>

      <header className="profile">
        <span className="mark lg">{initials(person.name)}</span>
        <div style={{ minWidth: 0 }}>
          <h1>{person.name}</h1>
          <p className="sub">
            {[person.role, person.company].filter(Boolean).join(' · ')}
            {person.email && (
              <>
                {' · '}
                <a
                  href={`mailto:${person.email}`}
                  style={{ borderBottom: '1px solid var(--hairline-bright)' }}
                >
                  {person.email}
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      {/* The three numbers worth stating: how much record there is, how alive it
          is, and how far back it goes. Nothing else belongs above the record. */}
      <div className="stats">
        <div className="stat">
          <b>{person.conversations}</b>
          <span>conversation{person.conversations === 1 ? '' : 's'}</span>
        </div>
        <div className="stat">
          <b>{ago(person.last_conversation_at)}</b>
          <span>last spoke</span>
        </div>
        <div className="stat">
          <b style={{ fontSize: 19 }}>{longDate(person.first_conversation_at)}</b>
          <span>known since</span>
        </div>
        {generated > 0 && (
          <div className="stat">
            <b style={{ color: 'var(--sage)' }}>{generated}</b>
            <span>written from transcript</span>
          </div>
        )}
      </div>

      {conversations.length === 0 ? (
        <div className="empty">
          <p>No conversations recorded with {person.name.split(' ')[0]} yet.</p>
        </div>
      ) : (
        <div className="record">
          {conversations.map((c, i) => (
            <Entry key={c.id} c={c} index={i} linkPeople={c.person_ids.length > 1} />
          ))}
        </div>
      )}
    </div>
  )
}

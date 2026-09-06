/**
 * A person, and every conversation you have had with them.
 *
 * The product. The facts strip answers "how much history is here and how alive
 * is it" in one glance; everything below it is the record itself, in reverse
 * order because the last thing you said is almost always what you came for.
 *
 * No edit form and no fields to fill in. The record is not maintained, it
 * accumulates.
 */

import { Link, useParams } from 'react-router-dom'
import Conversation from '../components/Conversation'
import Cadence from '../components/Cadence'
import { ago, conversationsFor, initials, load, longDate, personById } from '../lib/data'

export default function Person() {
  const { id } = useParams<{ id: string }>()
  const person = personById(Number(id))
  const { sample } = load()

  if (!person) {
    return (
      <div className="record">
        <div className="blank">
          <div>
            <p>Nothing selected.</p>
            <p style={{ marginTop: 4, fontSize: 12 }}>
              Pick someone from the list, or press <span className="kbd">⌘K</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const conversations = conversationsFor(person.id)
  const machine = conversations.filter(c => !c.summary && c.generated_summary).length

  return (
    <div className="record">
      <div className="record-inner">
        {sample && (
          <div className="notice">
            <span className="live" />
            Sample record. Connect a source to replace it.
          </div>
        )}

        <div className="crumb">
          <Link to="/">People</Link>
          <span>/</span>
          <span style={{ color: 'var(--dim)' }}>{person.name}</span>
        </div>

        <header className="head">
          <span className="av">{initials(person.name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>{person.name}</h1>
            <div className="under">
              {[person.role, person.company].filter(Boolean).join(', ')}
              {person.email && (
                <>
                  {' · '}
                  <a href={`mailto:${person.email}`}>{person.email}</a>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="facts">
          <div className="fact">
            <b>{person.conversations}</b>
            <span>conversation{person.conversations === 1 ? '' : 's'}</span>
          </div>
          <div className="fact">
            <b>{ago(person.last_conversation_at)}</b>
            <span>last spoke</span>
          </div>
          <div className="fact">
            <b>{longDate(person.first_conversation_at).replace(/ \d{4}$/, '')}</b>
            <span>known since</span>
          </div>
          {machine > 0 && (
            <div className="fact">
              <b style={{ color: 'var(--sage)' }}>{machine}</b>
              <span>read from transcript</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <Cadence dates={conversations.map(c => c.started_at)} />
        </div>

        {conversations.length === 0 ? (
          <p className="quiet">No conversations recorded with {person.name.split(' ')[0]} yet.</p>
        ) : (
          conversations.map((c, i) => (
            <Conversation key={c.id} c={c} i={i} showPeople={c.person_ids.length > 1} />
          ))
        )}
      </div>
    </div>
  )
}

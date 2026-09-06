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

import { Link, Navigate, useParams } from 'react-router-dom'
import Conversation from '../components/Conversation'
import Grid from '../components/Grid'
import {
  ago,
  balance,
  conversationsFor,
  exchangesWith,
  loopsFor,
  initials,
  load,
  longDate,
  personById,
  rhythm,
  sourceMix,
} from '../lib/data'

export default function Person() {
  const { id } = useParams<{ id: string }>()
  const person = personById(Number(id))
  const { sample, people } = load()

  // Landing on People with nobody chosen should not show an empty pane. Open
  // the most recent conversation, which is what someone came looking for far
  // more often than not.
  if (!id && people.length > 0) {
    const recent = [...people].sort((a, b) =>
      b.last_conversation_at.localeCompare(a.last_conversation_at)
    )[0]
    return <Navigate to={`/people/${recent.id}`} replace />
  }

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
  const dates = conversations.map(c => c.started_at)
  const r = rhythm(dates)
  const mix = sourceMix(conversations)
  const bal = balance(loopsFor(person.id))
  const ex = exchangesWith(person.id)

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

        {/* Both directions, always, even when one side is empty. Showing only
            what you are owed would make this an extraction tool. */}
        <div className="balance">
          <section>
            <h4>
              You owe <b>{bal.iOwe.length}</b>
            </h4>
            {bal.iOwe.length === 0 ? (
              <p className="none">Nothing outstanding.</p>
            ) : (
              <ul>
                {bal.iOwe.map(l => (
                  <li key={l.text}>{l.text}</li>
                ))}
              </ul>
            )}
            {bal.iPromised > 0 && (
              <div className="kept-note">
                {bal.iDelivered} of {bal.iPromised} kept
              </div>
            )}
          </section>
          <section>
            <h4>
              They owe <b>{bal.theyOwe.length}</b>
            </h4>
            {bal.theyOwe.length === 0 ? (
              <p className="none">Nothing outstanding.</p>
            ) : (
              <ul>
                {bal.theyOwe.map(l => (
                  <li key={l.text}>{l.text}</li>
                ))}
              </ul>
            )}
            {bal.theyPromised > 0 && (
              <div className="kept-note">
                {bal.theyDelivered} of {bal.theyPromised} kept
              </div>
            )}
          </section>
        </div>

        {/* What has actually passed between you, both directions, counted and
            never scored. Kept promises plus the favours that never became
            promises at all, which is most of what people give each other. */}
        {(ex.gave.length > 0 || ex.received.length > 0) && (
          <div className="ledger">
            <div className="ledger-head">
              <span>
                You have given <b>{ex.gave.length}</b>
              </span>
              <div className="ledger-bar">
                <i
                  className="mine"
                  style={{
                    flex: Math.max(ex.gave.length, 0.15),
                  }}
                />
                <i
                  className="theirs"
                  style={{
                    flex: Math.max(ex.received.length, 0.15),
                  }}
                />
              </div>
              <span>
                <b>{ex.received.length}</b> received
              </span>
            </div>
            <div className="ledger-body">
              <ul className="tally-list">
                {ex.gave.map(e => (
                  <li key={e.id}>{e.text}</li>
                ))}
                {ex.gave.length === 0 && <li className="none">Nothing yet.</li>}
              </ul>
              <ul className="tally-list">
                {ex.received.map(e => (
                  <li key={e.id}>{e.text}</li>
                ))}
                {ex.received.length === 0 && <li className="none">Nothing yet.</li>}
              </ul>
            </div>
          </div>
        )}

        <Grid dates={dates} cell={10} gap={2} />

        {/* Descriptive, never a score. "Every 24 days, and it has been 3
            months" is actionable; "health: 62" invents a judgement the record
            cannot support. */}
        <div className="reads">
          {r.averageGap !== null && (
            <span>
              Speaks about every <b>{r.averageGap} days</b>
            </span>
          )}
          {r.longestGap !== null && (
            <span>
              Longest silence <b>{r.longestGap} days</b>
            </span>
          )}
          {r.busiestMonth && (
            <span>
              Busiest <b>{r.busiestMonth}</b>
            </span>
          )}
          {mix.length > 0 && (
            <span>
              Captured by <b>{mix.map(m => m.source).join(', ')}</b>
            </span>
          )}
          {r.overdue && (
            <span className="flag">
              <b style={{ color: 'inherit' }}>{r.sinceLast} days</b> since you spoke, past your
              usual
            </span>
          )}
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

/**
 * Today.
 *
 * The home, and the reason to open this at all. Everything else in the product
 * is storage; this is retrieval, at the only moment it reliably matters.
 *
 * Before you walk into a room with someone you want four things: when you last
 * spoke, what about, what you owe them, and what they owe you. Not a profile,
 * not a score, not their whole history. Those four, in the fifteen minutes
 * before the call, are worth more than every other screen combined.
 *
 * The order is deliberate. What you owe sits above what you are owed, because
 * the first list is the one that decides whether people find you reliable.
 */

import { Link } from 'react-router-dom'
import Connect from '../components/Connect'
import Stage from '../components/Stage'
import {
  ago,
  allLoops,
  brief,
  clockTime,
  dayLabel,
  initials,
  load,
  sourceName,
  until,
  upcoming,
  type Meeting,
} from '../lib/data'

function Prep({ personId }: { personId: number }) {
  const { person, last, iOwe, theyOwe } = brief(personId)
  if (!person) return null

  return (
    <div className="prep">
      <Link to={`/people/${person.id}`} className="prep-who">
        <span className="av">{initials(person.name)}</span>
        <span style={{ minWidth: 0 }}>
          <b>{person.name}</b>
          <span>{[person.role, person.company].filter(Boolean).join(', ')}</span>
        </span>
      </Link>

      {last ? (
        <div className="prep-last">
          <div className="prep-label">
            Last spoke {ago(last.started_at)} · {sourceName(last.source)}
          </div>
          <div className="prep-title">{last.title}</div>
          {(last.summary || last.generated_summary) && (
            <p className={`prep-body ${!last.summary && last.generated_summary ? 'machine' : ''}`}>
              {(last.summary || last.generated_summary || '').split('\n\n')[0]}
            </p>
          )}
        </div>
      ) : (
        <p className="quiet" style={{ marginTop: 10 }}>
          You have not spoken before.
        </p>
      )}

      {(iOwe.length > 0 || theyOwe.length > 0) && (
        <div className="prep-loops">
          {iOwe.length > 0 && (
            <div>
              <div className="prep-label warn">You owe {person.name.split(' ')[0]}</div>
              <ul>
                {iOwe.map(l => (
                  <li key={l.text}>{l.text}</li>
                ))}
              </ul>
            </div>
          )}
          {theyOwe.length > 0 && (
            <div>
              <div className="prep-label">They owe you</div>
              <ul>
                {theyOwe.map(l => (
                  <li key={l.text}>{l.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MeetingCard({ m, next }: { m: Meeting; next: boolean }) {
  return (
    <article className={`meeting ${next ? 'next' : ''}`}>
      <div className="meeting-head">
        <div className="meeting-when">
          <b>{clockTime(m.at)}</b>
          <span>{until(m.at)}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{m.title}</h3>
          {m.where && <div className="meeting-where">{m.where}</div>}
        </div>
      </div>
      {m.person_ids.map(id => (
        <Prep key={id} personId={id} />
      ))}
    </article>
  )
}

export default function Today() {
  const { people } = load()
  const meetings = upcoming()
  const loops = allLoops().filter(l => !l.done)
  const owed = loops.filter(l => l.owner === 'me')
  const late = owed.filter(l => l.late)

  const days: { label: string; items: Meeting[] }[] = []
  for (const m of meetings) {
    const label = dayLabel(m.at)
    const tail = days[days.length - 1]
    if (tail && tail.label === label) tail.items.push(m)
    else days.push({ label, items: [m] })
  }

  // Nothing in the library at all. Say what happens next rather than showing
  // an empty day, which tells a new user nothing except that they are alone.
  if (people.length === 0) {
    return (
      <div className="record">
        <div className="record-inner wide">
          <Stage />
          <Connect />
        </div>
      </div>
    )
  }

  return (
    <div className="record">
      <div className="record-inner wide">
        <Stage />

        <div className="today-head">
          <h1>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
          <p>
            {meetings.length === 0
              ? 'Nothing in the calendar.'
              : `${meetings.length} conversation${meetings.length === 1 ? '' : 's'} ahead.`}
            {owed.length > 0 && (
              <>
                {' '}
                <Link to="/loops" className="today-owe">
                  You owe {owed.length} thing{owed.length === 1 ? '' : 's'}
                  {late.length > 0 && `, ${late.length} past due`}
                </Link>
              </>
            )}
          </p>
        </div>

        {days.length === 0 ? (
          <p className="quiet">Nothing scheduled. A good day to close some loops.</p>
        ) : (
          days.map(d => (
            <section key={d.label} className="day">
              <div className="day-label">{d.label}</div>
              {d.items.map((m, i) => (
                <MeetingCard key={m.id} m={m} next={d.label === 'Today' && i === 0} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}

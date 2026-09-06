/**
 * Recent — the whole record, unfiltered by person.
 *
 * Deliberately not a dashboard. No counters, no charts, no streaks: those
 * measure the app rather than the work. The only question here is what you have
 * been talking about lately.
 */

import Entry from '../components/Entry'
import { load } from '../lib/data'

export default function Recent() {
  const { conversations, sample } = load()

  return (
    <div className="main">
      {sample && (
        <div className="banner">
          <span className="pulse" />
          Sample record — connect a source to replace it with your own
        </div>
      )}

      <p className="eyebrow">The record</p>
      <h1 className="display">
        Everything you&nbsp;said,
        <br />
        <em>and who you said it to.</em>
      </h1>
      <p className="lede">
        Every conversation, filed against the people who were in it — whichever tool happened to
        record it.
      </p>

      {conversations.length === 0 ? (
        <div className="empty">
          <p>Nothing recorded yet.</p>
          <p style={{ fontSize: 13 }}>Point Nexus at your notetaker and the record fills itself.</p>
        </div>
      ) : (
        <div className="record">
          {conversations.map((c, i) => (
            <Entry key={c.id} c={c} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

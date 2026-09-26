/**
 * The reckoning: the screen docs/ROADMAP.md says should eventually lead.
 *
 * Email records messages, calendars record time, git records code; nothing
 * records what people said they would do. This is that record, for one
 * person, over a window: what was promised, what is still open, what has
 * gone quiet, and the sentence it was said in.
 *
 * Counts only, per CLAUDE.md rule 3. No percentage, no reliability rate.
 * "You owe" leads, same as everywhere else in this product, because the
 * first list is the one that decides whether people find you reliable.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import Draft from '../components/Draft'
import Stage from '../components/Stage'
import { allLoops, ago, draftLoop, initials, longDate, reckoning, type OpenLoop } from '../lib/data'

/**
 * One honest sentence. Plurals matter and a zero is not an achievement: on a
 * quiet record this says so plainly rather than reading like a perfect year.
 */
function headline(promised: number, open: number, over90: number): string {
  if (promised === 0) return 'Nothing recorded yet, in either direction.'

  const made = `You made ${promised} promise${promised === 1 ? '' : 's'} this year.`
  const openPart = open === 0 ? 'None are still open.' : `${open} ${open === 1 ? 'is' : 'are'} still open.`
  const overPart =
    over90 === 0 ? 'None are over 90 days old.' : `${over90} ${over90 === 1 ? 'is' : 'are'} over 90 days old.`

  return `${made} ${openPart} ${overPart}`
}

function Quote({ l }: { l: OpenLoop }) {
  if (l.quote) return <blockquote>&ldquo;{l.quote}&rdquo;</blockquote>
  return (
    <blockquote className="no-quote">
      &ldquo;{l.text}&rdquo;
      <span className="no-quote-mark">no quote: sample data</span>
    </blockquote>
  )
}

function Evidence({ l }: { l: OpenLoop }) {
  const state = l.evidence?.state ?? 'none'

  if (state === 'closed') {
    return (
      <div className="reck-evidence closed">
        <span className="reck-evidence-label">Closed, found in the record</span>
        {l.evidence?.quote && <blockquote>&ldquo;{l.evidence.quote}&rdquo;</blockquote>}
        {l.evidence?.at && <span className="reck-evidence-when">{longDate(l.evidence.at)}</span>}
      </div>
    )
  }

  if (state === 'candidate') {
    return (
      <div className="reck-evidence candidate">
        <span className="reck-evidence-label">Possible closure, check</span>
        {l.evidence?.quote && <blockquote>&ldquo;{l.evidence.quote}&rdquo;</blockquote>}
      </div>
    )
  }

  return (
    <div className="reck-evidence none">
      <span className="reck-evidence-label">No evidence in the record</span>
    </div>
  )
}

function Row({ l, onDraft }: { l: OpenLoop; onDraft: () => void }) {
  return (
    <div className="reck-row">
      <Quote l={l} />
      <p className="reck-para">{l.text}</p>
      <div className="reck-meta">
        <Link to={`/people/${l.personId}`}>
          <span className="av">{initials(l.personName)}</span>
          {l.personName}
        </Link>
        <span>·</span>
        <span>agreed {longDate(l.agreedAt)} ({ago(l.agreedAt)})</span>
        {l.due_phrase && (
          <>
            <span>·</span>
            <span>due {l.due_phrase}</span>
          </>
        )}
      </div>
      <Evidence l={l} />
      {l.owner === 'me' && (
        <button className="act tiny" onClick={onDraft}>
          Draft
        </button>
      )}
    </div>
  )
}

export default function Reckoning() {
  const [drafting, setDrafting] = useState<OpenLoop | null>(null)
  const r = reckoning(allLoops(), new Date())

  return (
    <div className="record">
      <div className="record-inner wide">
        <Stage />

        <div className="crumb">
          <span>The reckoning</span>
        </div>

        <h1 className="reck-headline">{headline(r.mine.promised, r.mine.open, r.mine.over90)}</h1>

        <div className="loop-head">
          <h2>You owe</h2>
          <span>{r.iOweOldestFirst.length}</span>
        </div>
        {r.iOweOldestFirst.length === 0 ? (
          <p className="quiet">Nothing outstanding on your side.</p>
        ) : (
          r.iOweOldestFirst.map(l => (
            <Row key={`${l.conversationId}:${l.text}`} l={l} onDraft={() => setDrafting(l)} />
          ))
        )}

        <div className="reck-secondary">
          <div className="loop-head" style={{ marginTop: 30 }}>
            <h2>Owed to you</h2>
            <span>{r.owedToMe.length}</span>
          </div>
          {r.owedToMe.length === 0 ? (
            <p className="quiet">Nothing outstanding on their side.</p>
          ) : (
            r.owedToMe.map(l => (
              <Row key={`${l.conversationId}:${l.text}`} l={l} onDraft={() => setDrafting(l)} />
            ))
          )}
        </div>
      </div>

      {drafting && (
        <Draft
          title="Follow through"
          context={`${drafting.personName} · ${drafting.conversationTitle}`}
          initial={draftLoop(drafting)}
          onClose={() => setDrafting(null)}
        />
      )}
    </div>
  )
}

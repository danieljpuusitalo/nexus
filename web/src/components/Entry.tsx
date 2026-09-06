/**
 * One conversation on the spine.
 *
 * The date hangs in the left margin like a marginal note; the hairline and its
 * node carry the eye down the record. Everything the source wrote is bone.
 * Anything a model wrote is set in sage behind its own rule, so the difference
 * is legible before a single word is read — that distinction is the product's
 * whole claim to being a record rather than a summary.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type Conversation,
  ago,
  marginDate,
  sourceColour,
  sourceName,
} from '../lib/data'

const COLLAPSE_AT = 400

export default function Entry({
  c,
  index = 0,
  linkPeople = true,
}: {
  c: Conversation
  index?: number
  linkPeople?: boolean
}) {
  const [open, setOpen] = useState(false)

  const verbatim = c.summary?.trim() ?? ''
  const machine = c.generated_summary?.trim() ?? ''
  const isMachine = !verbatim && !!machine
  const text = verbatim || machine
  const items = verbatim ? c.action_items : c.generated_action_items ?? c.action_items

  const long = text.length > COLLAPSE_AT
  const shown = open || !long ? text : `${text.slice(0, COLLAPSE_AT).trimEnd()}…`

  const when = marginDate(c.started_at)

  return (
    <article className="entry" style={{ animationDelay: `${Math.min(index, 9) * 55}ms` }}>
      <div className="when">
        <b>{when.top}</b>
        {when.sub}
      </div>

      <h3>{c.title || 'Untitled conversation'}</h3>

      <div className="meta">
        <span className="src">
          <i style={{ background: sourceColour(c.source) }} />
          {sourceName(c.source)}
        </span>
        {c.duration_minutes ? (
          <>
            <span className="dot" />
            <span>{c.duration_minutes} min</span>
          </>
        ) : null}
        <span className="dot" />
        <span>{ago(c.started_at)}</span>
        {linkPeople && c.people.length > 0 && (
          <>
            <span className="dot" />
            <span>
              {c.people.map((name, i) => (
                <span key={name}>
                  {i > 0 && ', '}
                  {c.person_ids[i] !== undefined ? (
                    <Link
                      to={`/people/${c.person_ids[i]}`}
                      style={{ borderBottom: '1px solid var(--hairline-bright)' }}
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </span>
              ))}
            </span>
          </>
        )}
      </div>

      {text ? (
        <div className={isMachine ? 'generated' : undefined}>
          {isMachine && (
            <div className="stamp" title={`Written by ${c.generated_model ?? 'a model'}`}>
              Written from the transcript
            </div>
          )}
          <p className="body">{shown}</p>
          {long && (
            <button className="expand" onClick={() => setOpen(v => !v)}>
              {open ? '— less' : '+ more'}
            </button>
          )}
        </div>
      ) : (
        /* No fallback to the raw transcript. A wall of speech-recognition noise
           where a summary belongs reads as something the product wrote. */
        <p className="silent">
          {c.has_transcript
            ? `${sourceName(c.source)} captured a transcript but no summary.`
            : 'No summary in this capture.'}
        </p>
      )}

      {items && items.length > 0 && (
        <>
          <div className="actions-head">Action items</div>
          <ul className="actions">
            {items.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

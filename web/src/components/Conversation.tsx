/**
 * One conversation.
 *
 * A gutter carries the date and which tool captured it, so the body text keeps
 * one clean left edge the whole way down the page and the eye never hunts for
 * where the next block starts.
 *
 * What the source wrote is bone. What a model wrote sits behind a sage rule.
 * That difference is the product's only real claim, so it is carried by colour
 * rather than by a label you have to notice.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type Conversation as Rec, ago, gutterDate, sourceColour, sourceName } from '../lib/data'

const CLAMP = 340

export default function Conversation({
  c,
  i = 0,
  showPeople = true,
}: {
  c: Rec
  i?: number
  showPeople?: boolean
}) {
  const [open, setOpen] = useState(false)

  const written = c.summary?.trim() ?? ''
  const inferred = c.generated_summary?.trim() ?? ''
  const isMachine = !written && !!inferred
  const text = written || inferred
  const todos = written ? c.action_items : c.generated_action_items ?? c.action_items

  const long = text.length > CLAMP
  const body = open || !long ? text : `${text.slice(0, CLAMP).trimEnd()}…`
  const when = gutterDate(c.started_at)

  return (
    <article className="conv" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
      <div className="gutter">
        <b>{when.day}</b>
        {when.year}
        <span className="src" title={`Captured by ${sourceName(c.source)}`}>
          <i style={{ background: sourceColour(c.source) }} />
          {sourceName(c.source)}
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <h3>{c.title || 'Untitled conversation'}</h3>

        <div className="with">
          {ago(c.started_at)}
          {c.duration_minutes ? ` · ${c.duration_minutes} min` : ''}
          {showPeople && c.people.length > 0 && (
            <>
              {' · '}
              {c.people.map((name, n) => (
                <span key={name}>
                  {n > 0 && ', '}
                  {c.person_ids[n] !== undefined ? (
                    <Link to={`/people/${c.person_ids[n]}`}>{name}</Link>
                  ) : (
                    name
                  )}
                </span>
              ))}
            </>
          )}
        </div>

        {text ? (
          <div className={isMachine ? 'machine' : undefined}>
            {isMachine && (
              <div className="machine-mark" title={`Written by ${c.generated_model ?? 'a model'}`}>
                read from the transcript
              </div>
            )}
            <p className="prose">{body}</p>
            {long && (
              <button className="more" onClick={() => setOpen(v => !v)}>
                {open ? 'less' : 'more'}
              </button>
            )}
          </div>
        ) : (
          /* No falling back to the raw transcript. Speech recognition noise
             printed where a summary belongs reads as something we wrote. */
          <p className="quiet">
            {c.has_transcript
              ? `${sourceName(c.source)} kept a transcript but wrote no summary.`
              : 'No summary in this capture.'}
          </p>
        )}

        {todos && todos.length > 0 && (
          <>
            <div className="todo-label">Action items</div>
            <ul className="todo">
              {todos.map(t => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  )
}

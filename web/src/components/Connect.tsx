/**
 * The only setup step there is.
 *
 * Point Nexus at one place conversations already end up, and everything else in
 * the product assembles itself. No fields, no imports, no tagging. If this
 * screen ever grows a second required step, something has gone wrong upstream.
 */

const SOURCES = [
  { name: 'Fathom', how: 'Connect once. Summaries, action items and who was on the call.', best: true },
  { name: 'Granola', how: 'Connect once. Your notes and the transcript.' },
  { name: 'Fireflies', how: 'Connect once. Transcripts and attendee emails.' },
  { name: 'Tactiq', how: 'Forward the email it sends you after each call.' },
  { name: 'Google Meet', how: 'Transcripts arrive through your calendar.' },
  { name: 'A folder', how: 'Anything you export, dropped in one place.' },
]

export default function Connect({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`connect ${compact ? 'compact' : ''}`}>
      {!compact && (
        <>
          <h2>Point it at one thing</h2>
          <p>
            Nexus reads what your notetaker already writes. Connect a single source and the people
            you talk to, what you agreed, and what everyone is looking for assemble themselves.
            There is nothing to fill in, now or later.
          </p>
        </>
      )}
      <div className="sources">
        {SOURCES.map(s => (
          <button key={s.name} className="source">
            <b>
              {s.name}
              {s.best && <em>richest</em>}
            </b>
            <span>{s.how}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

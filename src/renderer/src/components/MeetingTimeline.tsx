/**
 * The person view: every conversation with one person, whichever tool recorded
 * it, in one consistent format.
 *
 * This is the product. Notetakers each keep a flat chronological list trapped in
 * their own silo; to find what you discussed with someone you scroll and search
 * inside Tactiq. This inverts that.
 *
 * Rule: what the tool gave us is shown verbatim. Nothing here paraphrases,
 * summarises or generates. A summary that reads well but says something the
 * meeting did not is worse than no summary.
 */

import { useEffect, useState } from 'react'

export interface LedgerMeeting {
  id: number
  source: string
  source_url: string
  title: string
  started_at: string
  ended_at: string
  duration_minutes: number | null
  summary: string
  action_items_json: string
  has_summary: number
  has_transcript: number
  /** Comma-separated display names of the other attendees. */
  others: string | null
}

/** Notetaker provenance. Colours are per-source so a tool is recognisable. */
const SOURCE_STYLE: Record<string, string> = {
  Fathom: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  Fireflies: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  Granola: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  Tactiq: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  Otter: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  file: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function sourceStyle(source: string): string {
  return SOURCE_STYLE[source] || SOURCE_STYLE.file
}

function sourceLabel(source: string): string {
  return source === 'file' ? 'Imported file' : source
}

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 weeks ago" — the thing you actually want to know on a person's page. */
function relativeDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 0) return 'upcoming'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  if (months < 18) return `${months} month${months === 1 ? '' : 's'} ago`
  return `${Math.round(days / 365)} years ago`
}

function parseActionItems(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.trim()) : []
  } catch {
    return []
  }
}

/** Long summaries collapse; the first few lines are almost always the point. */
const COLLAPSE_AFTER_CHARS = 420

function MeetingCard({ meeting }: { meeting: LedgerMeeting }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const actionItems = parseActionItems(meeting.action_items_json)
  const summary = meeting.summary || ''
  const isLong = summary.length > COLLAPSE_AFTER_CHARS
  const shown = expanded || !isLong ? summary : `${summary.slice(0, COLLAPSE_AFTER_CHARS)}…`

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {meeting.title || 'Untitled meeting'}
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            {formatDate(meeting.started_at)}
            <span className="text-zinc-400 dark:text-zinc-600"> · {relativeDate(meeting.started_at)}</span>
            {meeting.duration_minutes ? ` · ${meeting.duration_minutes} min` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceStyle(meeting.source)}`}
          title={`Captured by ${sourceLabel(meeting.source)}`}
        >
          {sourceLabel(meeting.source)}
        </span>
      </div>

      {meeting.others && (
        <p className="text-xs text-zinc-500 mt-2">
          <span className="text-zinc-400 dark:text-zinc-600">with </span>
          {meeting.others}
        </p>
      )}

      {summary ? (
        <div className="mt-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {shown}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        // Deliberately not falling back to the transcript: raw transcripts are
        // frequently speech-recognition noise, and showing one here would look
        // like a summary the tool never wrote.
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-600 italic">
          {meeting.has_transcript
            ? 'No summary in this capture — transcript only.'
            : 'No summary in this capture.'}
        </p>
      )}

      {actionItems.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            Action items
          </p>
          <ul className="space-y-1">
            {actionItems.map((item, i) => (
              <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-600 shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meeting.source_url && (
        <a
          href={meeting.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-xs text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
        >
          Open in {sourceLabel(meeting.source)} ↗
        </a>
      )}
    </div>
  )
}

export default function MeetingTimeline({
  contactId,
  contactName,
}: {
  contactId: number
  contactName: string
}): React.JSX.Element | null {
  const [meetings, setMeetings] = useState<LedgerMeeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.ledger
      .getForContact(contactId)
      .then((rows: unknown) => {
        if (!cancelled) setMeetings(rows as LedgerMeeting[])
      })
      .catch(() => {
        if (!cancelled) setMeetings([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contactId])

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map(i => (
          <div
            key={i}
            className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse"
          />
        ))}
      </div>
    )
  }

  // An empty ledger is the normal state until a notetaker is connected, so this
  // stays quiet rather than shouting about a missing feature.
  if (meetings.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
        Conversations ({meetings.length})
        <span className="ml-2 font-normal text-xs text-zinc-500">
          every meeting with {contactName}, whichever tool recorded it
        </span>
      </h3>
      <div className="space-y-2">
        {meetings.map(m => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
    </div>
  )
}

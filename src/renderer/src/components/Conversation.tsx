/**
 * One conversation, rendered.
 *
 * Shared by the person page and the home feed so a conversation looks the same
 * everywhere — the record is the product, and a record that reformats itself
 * depending on where you found it is not one record.
 *
 * Rule: whatever the source gave us is shown verbatim. Generated text is always
 * labelled and always keeps the original one click away. We never paraphrase
 * silently, and we never fall back to the raw transcript where a summary
 * belongs — a wall of speech-recognition noise reads as something the product
 * wrote, and it is worse than an honest blank.
 */

import { useState } from 'react'

export interface LedgerMeeting {
  id: number
  source: string
  source_url?: string
  title: string
  started_at: string
  ended_at?: string
  duration_minutes: number | null
  summary: string
  action_items_json?: string
  has_summary: number
  has_transcript: number
  /** Comma-separated display names of the other attendees. */
  others?: string | null
  people?: string | null
  /** Generated from the transcript when the source gave nothing usable. */
  enhanced_summary?: string | null
  enhanced_action_items_json?: string | null
  enhanced_model?: string | null
}

/** Notetaker provenance. Per-source colour so a tool is recognisable at a glance. */
const SOURCE_STYLE: Record<string, string> = {
  Fathom: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  Fireflies: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  Granola: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  Tactiq: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  Otter: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  file: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

export function sourceStyle(source: string): string {
  return SOURCE_STYLE[source] || SOURCE_STYLE.file
}

export function sourceLabel(source: string): string {
  return source === 'file' ? 'Imported file' : source
}

export function formatDate(iso: string): string {
  const d = new Date(iso && iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso || ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 weeks ago" — usually the thing you actually want to know. */
export function relativeDate(iso: string): string {
  const d = new Date(iso && iso.length <= 10 ? `${iso}T00:00:00` : iso)
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

function parseActionItems(json?: string): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.trim()) : []
  } catch {
    return []
  }
}

/** Long records collapse; the first few lines are almost always the point. */
const COLLAPSE_AFTER_CHARS = 420

export default function Conversation({
  meeting,
  showPeople = true,
}: {
  meeting: LedgerMeeting
  showPeople?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  // The verbatim record always wins. Generated text only fills a gap the source
  // left, and is never allowed to stand in front of something the tool actually
  // wrote — that is the difference between a record and a paraphrase.
  const verbatim = meeting.summary || ''
  const generated = meeting.enhanced_summary || ''
  const isGenerated = !verbatim && !!generated
  const summary = verbatim || generated

  const actionItems = parseActionItems(
    verbatim ? meeting.action_items_json : meeting.enhanced_action_items_json || meeting.action_items_json
  )
  const isLong = summary.length > COLLAPSE_AFTER_CHARS
  const shown = expanded || !isLong ? summary : `${summary.slice(0, COLLAPSE_AFTER_CHARS)}…`
  const people = meeting.others ?? meeting.people ?? null

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {meeting.title || 'Untitled conversation'}
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            {formatDate(meeting.started_at)}
            <span className="text-zinc-400 dark:text-zinc-600">
              {' '}· {relativeDate(meeting.started_at)}
            </span>
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

      {showPeople && people && (
        <p className="text-xs text-zinc-500 mt-2">
          <span className="text-zinc-400 dark:text-zinc-600">with </span>
          {people}
        </p>
      )}

      {summary ? (
        <div className="mt-3">
          {/* Labelled every time. A generated summary that looks like the
              source's own words is the one thing that would make the record
              untrustworthy, and trust is the entire value of a record. */}
          {isGenerated && (
            <p
              className="text-[10px] font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"
              title={meeting.enhanced_model ? `Written by ${meeting.enhanced_model}` : undefined}
            >
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                Generated
              </span>
              <span className="text-zinc-400 dark:text-zinc-600">
                {sourceLabel(meeting.source)} gave no summary — written from the transcript
              </span>
            </p>
          )}
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

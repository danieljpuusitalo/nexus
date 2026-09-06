/**
 * Meeting Note Parser
 *
 * Parses meeting notes and transcripts exported by third-party notetakers
 * (Granola, Tactiq, Plaud, Fathom, Fireflies, Otter, Read.ai, ...).
 *
 * Nexus does not transcribe anything — it is the *recipient* of whatever
 * those tools already produce. Rather than maintaining an integration per
 * vendor, this parser is deliberately format-agnostic: it recognises the
 * shapes those exports share (a title, a date, an attendee list, a body)
 * across Markdown, plain text, WebVTT and JSON.
 *
 * Everything here is pure — no filesystem, no database, no Electron — so the
 * matching rules stay unit-testable. See note-ingest.ts for the side effects.
 */

export interface ParsedNote {
  title: string
  /** ISO date (YYYY-MM-DD). Falls back to file mtime, then today. */
  date: string
  /** Lowercased, deduped. The strongest signal for matching contacts. */
  attendeeEmails: string[]
  /** Display names, deduped. Used when no email is present. */
  attendeeNames: string[]
  /**
   * The curated part — the notetaker's own Highlights/Summary section.
   * Empty when the export contains only a raw transcript.
   *
   * This is deliberately NOT a fallback to the transcript: real transcripts are
   * frequently speech-recognition noise, and pasting one onto a contact card is
   * worse than showing nothing.
   */
  summary: string
  /** Commitments the tool identified. Each becomes a reminder downstream. */
  actionItems: string[]
  /** Raw transcript, kept as a secondary artefact — never the headline. */
  transcript: string
  /** Meeting length in minutes, when stated. */
  durationMinutes: number | null
  /** Link back to the note in the tool that produced it. */
  sourceUrl: string
  /** Detected notetaker, or '' when unrecognised. Shown as provenance. */
  source: string
}

/** Headings that introduce the curated summary. */
const SUMMARY_HEADINGS = /^(highlights?|summary|meeting summary|key points?|overview|recap|takeaways?|key takeaways?|notes?)$/i

/** Headings that introduce commitments. */
const ACTION_HEADINGS = /^(action items?|actions?|next steps?|to ?dos?|tasks?|follow[- ]ups?|commitments?)$/i

/** Headings that introduce the raw transcript. */
const TRANSCRIPT_HEADINGS = /^(transcript|full transcript|raw transcript|conversation)$/i

/** Noise the notetakers inject into their own output. */
const PROMO_LINE = /tactiq\.io\/r\/transcribing|I'm transcribing this call|otter\.ai\/join|recorded with .* notetaker/i

/**
 * Header metadata that must never be mistaken for the summary. Without this a
 * note with no Highlights section ends up "summarised" as its own timestamp.
 */
const METADATA_LINE = /^\s*(?:\[?view original|meeting (?:started|ended)|duration|participants?|attendees?|date|time|host|organi[sz]er)\b/i

/** Returns the heading text if the line is a heading, else null. */
function headingOf(line: string): string | null {
  const md = line.match(/^\s*#{1,4}\s+(.+?)\s*$/)
  if (md) return md[1].replace(/[*:#]/g, '').trim()

  const bold = line.match(/^\s*\*\*(.+?)\*\*\s*:?\s*$/)
  if (bold) return bold[1].trim()

  // A short "Label:" on a line of its own, e.g. "Action Items:"
  const bare = line.match(/^\s*([A-Za-z][A-Za-z ]{2,25}):\s*$/)
  if (bare) return bare[1].trim()

  return null
}

/** Strips blockquote markers and timestamps from a highlight line. */
function cleanHighlight(line: string): string {
  return line
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*[-*•]\s+/, '')
    .trimEnd()
}

/** Splits a block into list items, tolerating -, *, •, and "1." prefixes. */
function toListItems(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(l => l.length > 2 && !PROMO_LINE.test(l))
}

/** True when most lines look like "00:12 Name: ..." — i.e. a transcript. */
function looksLikeTranscript(block: string): boolean {
  const lines = block.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 4) return false
  const timestamped = lines.filter(l => /^\s*>?\s*\[?\d{1,2}:\d{2}/.test(l)).length
  return timestamped / lines.length > 0.5
}

/**
 * Splits a note body into its named sections.
 *
 * Notetakers converge on the same handful of headings (Highlights, Summary,
 * Action Items, Transcript), so one segmenter covers all of them without
 * vendor-specific parsing.
 */
export function segmentNote(body: string): {
  summary: string
  actionItems: string[]
  transcript: string
} {
  const lines = body.split(/\r?\n/)
  const buckets: Record<string, string[]> = { summary: [], actions: [], transcript: [], other: [] }
  let current = 'other'

  for (const line of lines) {
    const heading = headingOf(line)
    if (heading) {
      if (SUMMARY_HEADINGS.test(heading)) current = 'summary'
      else if (ACTION_HEADINGS.test(heading)) current = 'actions'
      else if (TRANSCRIPT_HEADINGS.test(heading)) current = 'transcript'
      else current = 'other'
      continue
    }
    if (PROMO_LINE.test(line)) continue
    if (current === 'other' && METADATA_LINE.test(line)) continue
    buckets[current].push(line)
  }

  const join = (ls: string[]): string => ls.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  let summary = join(buckets.summary.map(cleanHighlight))
  let transcript = join(buckets.transcript)
  const actionItems = toListItems(join(buckets.actions))

  // No headings at all: decide whether the body is a transcript or a summary,
  // rather than assuming either.
  const other = join(buckets.other)
  if (!summary && !transcript && other) {
    if (looksLikeTranscript(other)) transcript = other
    else summary = other
  } else if (!summary && other && !looksLikeTranscript(other)) {
    summary = other
  }

  // A heading saying "Highlights" does not make the text underneath a summary.
  // Tactiq files its Highlights under exactly that heading, but they are
  // timestamped verbatim speech-recognition fragments — real captured output
  // reads "the consumerator is away. We take the fun money to produce a new
  // one". Showing that where a summary belongs is worse than showing nothing:
  // it is unreadable, and it looks like the product wrote it.
  //
  // So the same test used on headingless text is applied to the summary
  // section. Excerpts pulled from the transcript are dropped rather than
  // promoted, because the transcript itself is already captured in full.
  if (summary && looksLikeTranscript(summary)) {
    if (!transcript) transcript = summary
    summary = ''
  }

  return { summary, actionItems, transcript }
}

/** Labels that introduce an attendee list. */
const ATTENDEE_LABELS = /^\s*(?:\*\*)?(attendees?|participants?|present|invitees?|with|people)(?:\*\*)?\s*:\s*(.+)$/i

/** Labels that introduce the meeting title. */
const TITLE_LABELS = /^\s*(?:\*\*)?(title|meeting|subject|event)(?:\*\*)?\s*:\s*(.+)$/i

/** Labels that introduce the date. */
const DATE_LABELS = /^\s*(?:\*\*)?(date|when|recorded(?:\s+on)?|meeting date)(?:\*\*)?\s*:\s*(.+)$/i

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

/**
 * Words that appear in "Label: value" position but are never a person's name.
 * Without this, transcript section headers get imported as attendees.
 */
const NON_NAME_LABELS = new Set([
  'summary', 'notes', 'note', 'action items', 'action', 'actions', 'next steps',
  'agenda', 'attendees', 'attendee', 'participants', 'participant', 'present',
  'date', 'time', 'title', 'meeting', 'transcript', 'overview', 'key points',
  'decisions', 'decision', 'todo', 'to do', 'follow up', 'follow-up', 'recap',
  'topics', 'topic', 'apologies', 'location', 'duration', 'host', 'organizer',
  'organiser', 'subject', 'event', 'when', 'where', 'who', 'context', 'purpose',
  'background', 'outcome', 'outcomes', 'risks', 'questions', 'summary of call',
  'highlights', 'takeaways', 'key takeaways', 'discussion', 'chapters',
  'recording', 'link', 'url', 'source', 'tags', 'summary points', 'speaker',
])

/** Notetaker fingerprints, checked against the raw text. */
const SOURCE_MARKERS: [RegExp, string][] = [
  [/granola/i, 'Granola'],
  [/tactiq/i, 'Tactiq'],
  [/plaud/i, 'Plaud'],
  [/fathom(?:\.video)?/i, 'Fathom'],
  [/fireflies(?:\.ai)?/i, 'Fireflies'],
  [/otter(?:\.ai)?/i, 'Otter'],
  [/read\.ai|read ai/i, 'Read.ai'],
  [/grain(?:\.com)?/i, 'Grain'],
  [/supernormal/i, 'Supernormal'],
]

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Extracts a date from free text.
 *
 * Deliberately conservative: ISO and textual-month formats are unambiguous and
 * always accepted, but a slash date (01/02/2026) is only used when one part is
 * >12 and therefore provably the day. Guessing DD/MM vs MM/DD would silently
 * file notes under the wrong date, which is worse than falling back to mtime.
 */
export function extractDate(text: string): string | null {
  // No trailing \b — it would fail on timestamps like 2026-05-11T14:00:00Z,
  // since "1" and "T" are both word characters.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?![\d-])/)
  if (iso) {
    const d = toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    if (d) return d
  }

  // "6 September 2026" / "6 Sep 2026"
  const dmy = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/)
  if (dmy) {
    const m = MONTHS[dmy[2].slice(0, 3).toLowerCase()]
    if (m) {
      const d = toIso(Number(dmy[3]), m, Number(dmy[1]))
      if (d) return d
    }
  }

  // "September 6, 2026" / "Sep 6 2026"
  const mdy = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/)
  if (mdy) {
    const m = MONTHS[mdy[1].slice(0, 3).toLowerCase()]
    if (m) {
      const d = toIso(Number(mdy[3]), m, Number(mdy[2]))
      if (d) return d
    }
  }

  // Slash dates — only when unambiguous.
  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    const y = Number(slash[3])
    if (a > 12 && b <= 12) return toIso(y, b, a)
    if (b > 12 && a <= 12) return toIso(y, a, b)
  }

  return null
}

/** True if a "Label:" prefix looks like a person rather than a section header. */
export function looksLikeName(raw: string): boolean {
  const name = raw.trim().replace(/^\*+|\*+$/g, '').trim()
  if (name.length < 2 || name.length > 40) return false
  if (NON_NAME_LABELS.has(name.toLowerCase())) return false
  if (/\d/.test(name)) return false
  if (/[<>@#|/\\{}[\]]/.test(name)) return false

  const words = name.split(/\s+/)
  if (words.length > 4) return false

  // Every word should read as a name: capitalised, or a lowercase particle.
  const particles = new Set(['van', 'de', 'der', 'den', 'von', 'da', 'di', 'du', 'la', 'le', 'el', 'bin', 'al'])
  return words.every(w => {
    const clean = w.replace(/[.,'’-]/g, '')
    if (!clean) return false
    if (particles.has(clean.toLowerCase())) return true
    return /^[A-ZÀ-Þ]/.test(clean)
  })
}

/** Splits an attendee list value: "Alice Smith, Bob Jones; Carol <c@x.com>" */
function splitAttendeeList(value: string): { emails: string[]; names: string[] } {
  const emails: string[] = []
  const names: string[] = []

  for (const rawPart of value.split(/[,;|]|\sand\s/i)) {
    const part = rawPart.trim()
    if (!part) continue

    const found = part.match(EMAIL_RE)
    if (found) {
      emails.push(...found.map(e => e.toLowerCase()))
    }

    // Strip any email/bracketed address to leave the display name.
    const nameOnly = part
      .replace(EMAIL_RE, '')
      .replace(/[<>()]/g, '')
      .replace(/\s*[-–]\s*$/, '')
      .trim()

    if (nameOnly && looksLikeName(nameOnly)) names.push(nameOnly)
  }

  return { emails, names }
}

/** Parses WebVTT/SRT speaker tags: "<v Alice Smith>" and "Alice Smith: ..." */
function parseVttSpeakers(text: string): string[] {
  const names: string[] = []
  const vTags = text.matchAll(/<v\s+([^>]+)>/g)
  for (const m of vTags) {
    const n = m[1].trim()
    if (looksLikeName(n)) names.push(n)
  }
  return names
}

/**
 * Speaker labels at the start of a line, as used by transcript exporters:
 *   "Alice Smith: ..." / "[00:12:04] Alice: ..." / "**Alice**: ..."
 */
function parseSpeakerLabels(lines: string[]): string[] {
  const names: string[] = []
  for (const line of lines) {
    const stripped = line.replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '')
    const m = stripped.match(/^\s*(?:\*\*)?([^:]{2,40}?)(?:\*\*)?\s*:\s+\S/)
    if (m && looksLikeName(m[1])) names.push(m[1].trim().replace(/^\*+|\*+$/g, ''))
  }
  return names
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const key = v.toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(v.trim())
  }
  return out
}

/** Turns "2026-09-06 Weekly sync with Acme.md" into "Weekly sync with Acme". */
function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\b\d{1,2}[-_.]\d{1,2}[-_.]\d{2,4}\b/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fireflies/Otter-style JSON exports. Returns null when not JSON. */
function parseJsonNote(text: string): Partial<ParsedNote> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(trimmed)
    data = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown>) : parsed
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null

  const str = (...keys: string[]): string => {
    for (const k of keys) {
      const v = data[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }

  const emails: string[] = []
  const names: string[] = []
  for (const key of ['participants', 'attendees', 'speakers', 'people']) {
    const list = data[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (typeof entry === 'string') {
        const found = entry.match(EMAIL_RE)
        if (found) emails.push(...found.map(e => e.toLowerCase()))
        else if (looksLikeName(entry)) names.push(entry.trim())
      } else if (entry && typeof entry === 'object') {
        const e = entry as Record<string, unknown>
        const email = e.email ?? e.address
        const name = e.name ?? e.displayName ?? e.display_name
        if (typeof email === 'string' && email.includes('@')) emails.push(email.toLowerCase())
        if (typeof name === 'string' && looksLikeName(name)) names.push(name.trim())
      }
    }
  }

  const summary = str('summary', 'overview', 'notes', 'transcript', 'text', 'body')
  const title = str('title', 'meeting_title', 'name', 'subject')
  const rawDate = str('date', 'meeting_date', 'created_at', 'started_at', 'time')

  return {
    title,
    date: rawDate ? extractDate(rawDate) || '' : '',
    attendeeEmails: dedupe(emails),
    attendeeNames: dedupe(names),
    summary,
  }
}

/**
 * Parses a meeting note into the fields Nexus needs to file it against people.
 *
 * @param text     Raw file contents.
 * @param fileName Used for title/date fallbacks.
 * @param mtime    File modified time, used when the note carries no date.
 */
export function parseMeetingNote(text: string, fileName = '', mtime?: Date): ParsedNote {
  const source = SOURCE_MARKERS.find(([re]) => re.test(text))?.[1] ?? ''

  const durationMatch = text.match(/\bDuration:\s*(\d+)\s*min/i)
  const durationMinutes = durationMatch ? Number(durationMatch[1]) : null
  const urlMatch = text.match(/\[View original[^\]]*\]\((https?:\/\/[^)]+)\)/i)
  const sourceUrl = urlMatch ? urlMatch[1] : ''

  const json = parseJsonNote(text)
  if (json) {
    const seg = segmentNote(json.summary ?? '')
    return {
      title: json.title || titleFromFileName(fileName) || 'Meeting',
      date: json.date || extractDate(fileName) || isoFromDate(mtime) || today(),
      attendeeEmails: json.attendeeEmails ?? [],
      attendeeNames: json.attendeeNames ?? [],
      summary: seg.summary,
      actionItems: seg.actionItems,
      transcript: seg.transcript,
      durationMinutes,
      sourceUrl,
      source,
    }
  }

  // Drop YAML frontmatter fences but keep the keys — they parse as "Label: value".
  const body = text.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, '$1\n')
  const lines = body.split(/\r?\n/)

  let title = ''
  let date = ''
  const emails: string[] = []
  const names: string[] = []
  const headerLineIndices = new Set<number>()

  lines.forEach((line, i) => {
    const attendeeMatch = line.match(ATTENDEE_LABELS)
    if (attendeeMatch) {
      const { emails: e, names: n } = splitAttendeeList(attendeeMatch[2])
      emails.push(...e)
      names.push(...n)
      headerLineIndices.add(i)
      return
    }

    const titleMatch = line.match(TITLE_LABELS)
    if (titleMatch && !title) {
      title = titleMatch[2].trim()
      headerLineIndices.add(i)
      return
    }

    const dateMatch = line.match(DATE_LABELS)
    if (dateMatch && !date) {
      const found = extractDate(dateMatch[2])
      if (found) {
        date = found
        headerLineIndices.add(i)
      }
      return
    }

    // First markdown heading doubles as the title.
    if (!title) {
      const heading = line.match(/^#{1,3}\s+(.+)$/)
      if (heading) {
        title = heading[1].trim()
        headerLineIndices.add(i)
      }
    }
  })

  // Any email anywhere is a usable matching signal.
  emails.push(...(body.match(EMAIL_RE) ?? []).map(e => e.toLowerCase()))

  // Speaker labels catch transcripts that have no explicit attendee list.
  names.push(...parseVttSpeakers(body))
  if (names.length === 0) names.push(...parseSpeakerLabels(lines))

  const remainder = lines
    .filter((_, i) => !headerLineIndices.has(i))
    .join('\n')
    .replace(/^WEBVTT.*$/im, '')

  const seg = segmentNote(remainder)

  return {
    title: title || titleFromFileName(fileName) || 'Meeting',
    date: date || extractDate(body.slice(0, 2000)) || extractDate(fileName) || isoFromDate(mtime) || today(),
    attendeeEmails: dedupe(emails),
    attendeeNames: dedupe(names),
    summary: seg.summary,
    actionItems: seg.actionItems,
    transcript: seg.transcript,
    durationMinutes,
    sourceUrl,
    source,
  }
}

function isoFromDate(d?: Date): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function today(): string {
  return isoFromDate(new Date()) as string
}

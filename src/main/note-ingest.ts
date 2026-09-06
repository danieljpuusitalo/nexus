/**
 * Meeting Note Ingestion
 *
 * Watches one folder and files whatever meeting notes land in it against the
 * right people. The user keeps using Granola / Tactiq / Plaud / Fathom / etc.
 * exactly as before and points those exports (or a sync folder) at this
 * directory — Nexus never records or transcribes anything itself.
 *
 * Design notes:
 * - One folder, not one integration per vendor. Parsing is format-agnostic
 *   (see meeting-note-parser.ts), so a tool that doesn't exist yet still works.
 * - Notes become rows in `interactions`, which means the activity feed,
 *   last-contacted dates, relationship health and the reconnection scorer all
 *   light up for free rather than needing their own plumbing.
 * - Dedupe is by content hash, so re-scanning, re-syncing or renaming a file
 *   never produces a duplicate.
 * - A note that matches nobody is still recorded, so it surfaces for manual
 *   assignment instead of disappearing silently.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import { parseMeetingNote, type ParsedNote } from './meeting-note-parser'
import {
  recordMeeting,
  resolveParticipants,
  type NormalizedMeeting,
  type RawParticipant,
} from './meeting-ledger'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.vtt', '.srt', '.json', '.markdown'])

/** Skip anything larger than this — a sane guard against stray files. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Stored per-interaction; long enough for real recall, capped for sanity. */
const MAX_SUMMARY_CHARS = 20000

/** Filesystem events arrive in bursts; wait for quiet before scanning. */
const DEBOUNCE_MS = 2000

let watcher: fs.FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export interface IngestResult {
  imported: number
  skipped: number
  matched: number
  unmatched: number
  /** Names several contacts fit, which we refused to guess between. */
  ambiguous: number
}

interface MatchedContact {
  id: number
  name: string
}

function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function getNotesFolder(db: Database.Database): string | null {
  const folder = getSetting(db, 'notes_folder')
  return folder && folder.trim() ? folder : null
}

export function setNotesFolder(db: Database.Database, folder: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'notes_folder',
    folder
  )
}

/**
 * Who "you" are, so you aren't filed as an attendee of your own meetings.
 *
 * Matching on email alone is not enough: transcript exporters like Tactiq list
 * participants by display name only ("Participants: Daniel Uusitalo, Davide
 * Mazzanti"), so without a name check every meeting gets logged against the
 * user's own contact card.
 */
export function getSelfIdentifiers(db: Database.Database): {
  emails: Set<string>
  names: Set<string>
} {
  const emails = new Set<string>()
  const names = new Set<string>()

  const ownEmail = (getSetting(db, 'google_email') || '').toLowerCase().trim()
  if (ownEmail) emails.add(ownEmail)

  const ownName = (getSetting(db, 'notes_own_name') || '').toLowerCase().trim()
  if (ownName) names.add(ownName)

  // Not set explicitly? Infer it from the contact card matching the connected
  // Google account.
  if (!ownName && ownEmail) {
    const row = db
      .prepare(
        'SELECT first_name, last_name FROM contacts WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1'
      )
      .get(ownEmail) as { first_name: string; last_name: string } | undefined
    if (row) names.add(`${row.first_name} ${row.last_name}`.trim().toLowerCase())
  }

  return { emails, names }
}

/**
 * Finds the contacts a note belongs to.
 *
 * Email is the strong signal and is tried first; display names are a fallback
 * for transcripts that only carry speaker labels. The user themselves is
 * excluded by both email and name.
 *
 * All name matching goes through `resolvePerson`, which refuses to choose when
 * several contacts fit. A name we decline to guess at is reported separately
 * from one nothing matched: both need a human, but for opposite reasons, and
 * a silent wrong link is the one failure a per-person ledger cannot absorb.
 */
export function matchNoteToContacts(
  db: Database.Database,
  note: ParsedNote
): { matched: MatchedContact[]; unmatched: string[]; ambiguous: string[] } {
  const resolved = resolveParticipants(db, participantsOf(note), getSelfIdentifiers(db))

  const matched = new Map<number, string>()
  const unmatched: string[] = []
  const ambiguous: string[] = []

  for (const p of resolved) {
    if (p.isSelf) continue
    if (p.contactId !== null) {
      matched.set(p.contactId, p.contactName)
      continue
    }
    // A name that resolved via someone's email is already covered; only report
    // a participant as needing attention when nothing in this note matched it.
    const label = p.raw.email || p.raw.name || ''
    if (!label || unmatched.includes(label) || ambiguous.includes(label)) continue
    if (p.resolution === 'ambiguous') ambiguous.push(label)
    else unmatched.push(label)
  }

  return {
    matched: [...matched].map(([id, name]) => ({ id, name })),
    unmatched,
    ambiguous,
  }
}

/**
 * A parsed note's attendees as ledger participants.
 *
 * Prefers the paired list, where the parser saw a name and an address together
 * in one attendee entry ("Sarah Chen <sarah@acme.com>") and kept them joined.
 * That pairing matters now that unmatched people are created rather than
 * queued: without it, one human arrives as a nameless address and an
 * address-less name, and becomes two people.
 *
 * Anything the pairing missed is added on its own. Names and addresses are
 * never paired by position — that would be a guess, and the resolver's contract
 * is that it does not guess.
 */
function participantsOf(note: ParsedNote): RawParticipant[] {
  const pairs = note.attendees ?? []
  const paired = pairs.filter(p => p.name || p.email)

  const claimedEmails = new Set(paired.map(p => (p.email || '').toLowerCase()).filter(Boolean))
  const claimedNames = new Set(paired.map(p => p.name || '').filter(Boolean))

  return [
    ...paired,
    ...note.attendeeEmails.filter(e => !claimedEmails.has(e.toLowerCase())).map(email => ({ email })),
    ...note.attendeeNames.filter(n => !claimedNames.has(n)).map(name => ({ name })),
  ]
}

function buildDescription(note: ParsedNote): string {
  const header = note.source ? `${note.title} (via ${note.source})` : note.title
  const body = note.summary.slice(0, MAX_SUMMARY_CHARS)
  return body ? `${header}\n\n${body}` : header
}

/**
 * Imports a single note file. Returns null when the file was skipped
 * (unsupported, too large, unreadable, or already imported).
 */
export function ingestFile(db: Database.Database, filePath: string): IngestResult | null {
  const ext = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null

  let content: string
  let mtime: Date | undefined
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) return null
    mtime = stat.mtime
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null // Locked, deleted mid-scan, or not valid UTF-8.
  }

  const hash = crypto.createHash('sha256').update(content).digest('hex')
  const already = db.prepare('SELECT 1 FROM note_imports WHERE file_hash = ?').get(hash)
  if (already) return null

  const fileName = path.basename(filePath)
  const note = parseMeetingNote(content, fileName, mtime)
  const description = buildDescription(note)

  // The ledger is the source of truth: one row for the meeting, one link per
  // person. `source_id` is the content hash, so the ledger dedupes on exactly
  // the same key the file-level check above uses.
  const normalized: NormalizedMeeting = {
    source: note.source || 'file',
    sourceId: hash,
    sourceUrl: note.sourceUrl,
    title: note.title,
    startedAt: note.date,
    durationMinutes: note.durationMinutes,
    participants: participantsOf(note),
    summaryMarkdown: note.summary.slice(0, MAX_SUMMARY_CHARS),
    actionItems: note.actionItems,
    transcript: note.transcript,
    rawFileName: fileName,
  }

  const ledger = recordMeeting(db, normalized, getSelfIdentifiers(db))

  // Distinct contacts to file against — the same person can appear twice in one
  // note (once by email, once by display name) and must not get two rows.
  const matched = new Map<number, string>()
  const unmatched: string[] = []
  const ambiguous: string[] = []
  for (const p of ledger.participants) {
    if (p.isSelf) continue
    if (p.contactId !== null) {
      matched.set(p.contactId, p.contactName)
      continue
    }
    const label = p.raw.email || p.raw.name || ''
    if (!label || unmatched.includes(label) || ambiguous.includes(label)) continue
    if (p.resolution === 'ambiguous') ambiguous.push(label)
    else unmatched.push(label)
  }

  // Both kinds land in the same queue: someone has to look at them either way.
  const needsAttention = [...unmatched, ...ambiguous]

  // Dual-write. The CRM's activity feed, last-contacted dates and relationship
  // health all read `interactions`, so the ledger does not get to replace it
  // yet — but every row now carries the meeting it came from, which is what
  // makes deriving these later a deletion rather than a rewrite.
  const insertInteraction = db.prepare(
    "INSERT INTO interactions (contact_id, type, description, date, meeting_id) VALUES (?, 'meeting', ?, ?, ?)"
  )
  const insertImport = db.prepare(
    `INSERT INTO note_imports (file_hash, file_name, title, note_date, source, matched_count, unmatched_json, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  // One transaction: either the note is fully filed or not recorded at all,
  // so a crash mid-import can't leave the hash marking it as done.
  db.transaction(() => {
    for (const [contactId] of matched) {
      insertInteraction.run(contactId, description, note.date, ledger.meetingId)
    }
    insertImport.run(
      hash,
      fileName,
      note.title,
      note.date,
      note.source,
      matched.size,
      JSON.stringify(needsAttention),
      note.summary.slice(0, MAX_SUMMARY_CHARS)
    )
  })()

  return {
    imported: 1,
    skipped: 0,
    matched: matched.size,
    unmatched: matched.size === 0 ? 1 : 0,
    ambiguous: ambiguous.length,
  }
}

/** Scans the configured folder once. Safe to call repeatedly. */
export function scanNoteFolder(db: Database.Database): IngestResult {
  const result: IngestResult = {
    imported: 0,
    skipped: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
  }
  const folder = getNotesFolder(db)
  if (!folder) return result

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true })
  } catch {
    return result // Folder removed, renamed, or on an unmounted drive.
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const outcome = ingestFile(db, path.join(folder, entry.name))
    if (!outcome) {
      result.skipped++
      continue
    }
    result.imported += outcome.imported
    result.matched += outcome.matched
    result.unmatched += outcome.unmatched
    result.ambiguous += outcome.ambiguous
  }

  return result
}

/** Recent imports, for the Settings panel and the unmatched queue. */
export function getRecentImports(db: Database.Database, limit = 20): unknown[] {
  return db
    .prepare(
      `SELECT id, file_name, title, note_date, source, matched_count, unmatched_json, created_at
       FROM note_imports ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(limit)
}

/**
 * Starts watching the notes folder. Re-entrant: calling this again (after the
 * user picks a different folder) tears down the previous watcher first.
 */
export function startNoteWatcher(db: Database.Database): void {
  stopNoteWatcher()

  const folder = getNotesFolder(db)
  if (!folder || !fs.existsSync(folder)) return

  // Catch anything that landed while the app was closed.
  scanNoteFolder(db)

  try {
    watcher = fs.watch(folder, { persistent: false }, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        try {
          scanNoteFolder(db)
        } catch {
          // Never let a bad file take down the main process.
        }
      }, DEBOUNCE_MS)
    })
  } catch {
    // Watching can fail on network drives — the startup scan still ran, and
    // the user can trigger a manual scan from Settings.
  }
}

export function stopNoteWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

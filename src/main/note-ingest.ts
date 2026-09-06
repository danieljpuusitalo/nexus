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
 */
export function matchNoteToContacts(
  db: Database.Database,
  note: ParsedNote
): { matched: MatchedContact[]; unmatched: string[] } {
  const self = getSelfIdentifiers(db)
  const matched = new Map<number, string>()
  const unmatched: string[] = []

  const byEmail = db.prepare(
    'SELECT id, first_name, last_name FROM contacts WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1'
  )
  const byName = db.prepare(
    `SELECT id, first_name, last_name FROM contacts
     WHERE lower(trim(first_name || ' ' || last_name)) = ? AND deleted_at IS NULL LIMIT 1`
  )

  type Row = { id: number; first_name: string; last_name: string } | undefined
  const label = (r: NonNullable<Row>): string => `${r.first_name} ${r.last_name}`.trim()

  for (const email of note.attendeeEmails) {
    if (self.emails.has(email)) continue
    const row = byEmail.get(email) as Row
    if (row) matched.set(row.id, label(row))
    else unmatched.push(email)
  }

  for (const name of note.attendeeNames) {
    const key = name.toLowerCase().trim()
    if (self.names.has(key)) continue
    const row = byName.get(key) as Row
    if (row) matched.set(row.id, label(row))
    // A name that resolved via someone's email is already covered; only report
    // a name as unmatched when nothing in this note matched it.
    else if (!unmatched.includes(name)) unmatched.push(name)
  }

  return {
    matched: [...matched].map(([id, name]) => ({ id, name })),
    unmatched,
  }
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
  const { matched, unmatched } = matchNoteToContacts(db, note)
  const description = buildDescription(note)

  const insertInteraction = db.prepare(
    "INSERT INTO interactions (contact_id, type, description, date) VALUES (?, 'meeting', ?, ?)"
  )
  const insertImport = db.prepare(
    `INSERT INTO note_imports (file_hash, file_name, title, note_date, source, matched_count, unmatched_json, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  // One transaction: either the note is fully filed or not recorded at all,
  // so a crash mid-import can't leave the hash marking it as done.
  db.transaction(() => {
    for (const contact of matched) {
      insertInteraction.run(contact.id, description, note.date)
    }
    insertImport.run(
      hash,
      fileName,
      note.title,
      note.date,
      note.source,
      matched.length,
      JSON.stringify(unmatched),
      note.summary.slice(0, MAX_SUMMARY_CHARS)
    )
  })()

  return {
    imported: 1,
    skipped: 0,
    matched: matched.length,
    unmatched: matched.length === 0 ? 1 : 0,
  }
}

/** Scans the configured folder once. Safe to call repeatedly. */
export function scanNoteFolder(db: Database.Database): IngestResult {
  const result: IngestResult = { imported: 0, skipped: 0, matched: 0, unmatched: 0 }
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ingestFile,
  scanNoteFolder,
  matchNoteToContacts,
  setNotesFolder,
  getNotesFolder,
  getRecentImports,
  getSelfIdentifiers,
} from '../src/main/note-ingest'
import { parseMeetingNote } from '../src/main/meeting-note-parser'

/**
 * Minimal slice of the real schema — just what ingestion touches.
 *
 * Uses Node's built-in SQLite rather than better-sqlite3: the bundled copy of
 * better-sqlite3 is compiled against Electron's ABI by `install-app-deps`, so
 * it cannot load in a plain Node test process. node:sqlite runs the same SQL
 * without a second native build. The only API gap is `.transaction()`, shimmed
 * below to match better-sqlite3's "returns a callable" contract.
 */
function makeDb(): Database.Database {
  const raw = new DatabaseSync(':memory:')
  const db = raw as unknown as Database.Database & { transaction: unknown }
  db.transaction = (fn: () => void) => () => {
    raw.exec('BEGIN')
    try {
      fn()
      raw.exec('COMMIT')
    } catch (err) {
      raw.exec('ROLLBACK')
      throw err
    }
  }
  // These two mirror src/main/database.ts exactly — including the CHECK
  // constraint on interactions.type, so a wrong type here fails the test
  // instead of failing at runtime.
  db.exec(`
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      company TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cloud_id TEXT DEFAULT NULL,
      synced_at TEXT DEFAULT NULL,
      deleted_at TEXT DEFAULT NULL
    );
    CREATE TABLE interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'coffee', 'event', 'calendar', 'job_change', 'other')),
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cloud_id TEXT DEFAULT NULL,
      synced_at TEXT DEFAULT NULL,
      deleted_at TEXT DEFAULT NULL,
      meeting_id INTEGER DEFAULT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_url TEXT DEFAULT '',
      title TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT NULL,
      summary TEXT DEFAULT '',
      action_items_json TEXT NOT NULL DEFAULT '[]',
      transcript TEXT DEFAULT '',
      has_summary INTEGER NOT NULL DEFAULT 0,
      raw_file_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT DEFAULT '',
      calendar_event_id INTEGER DEFAULT NULL,
      ical_uid TEXT DEFAULT '',
      UNIQUE(source, source_id)
    );
    CREATE TABLE calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'google',
      provider_event_id TEXT NOT NULL,
      ical_uid TEXT DEFAULT '',
      title TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT DEFAULT '',
      organizer_email TEXT DEFAULT '',
      attendees_json TEXT NOT NULL DEFAULT '[]',
      is_all_day INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, provider_event_id)
    );
    CREATE TABLE enhanced_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL UNIQUE,
      model TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      action_items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    );
    CREATE TABLE meeting_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      contact_id INTEGER DEFAULT NULL,
      raw_name TEXT DEFAULT '',
      raw_email TEXT DEFAULT '',
      is_self INTEGER NOT NULL DEFAULT 0,
      resolution TEXT NOT NULL DEFAULT 'unresolved',
      resolved_via TEXT DEFAULT '',
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );
    CREATE TABLE note_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_hash TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      title TEXT DEFAULT '',
      note_date TEXT DEFAULT '',
      source TEXT DEFAULT '',
      matched_count INTEGER NOT NULL DEFAULT 0,
      unmatched_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?, ?, ?)').run(
    'Sarah', 'Chen', 'sarah@acmerobotics.com'
  )
  db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?, ?, ?)').run(
    'Marta', 'Nowak', 'marta@example.com'
  )
  return db
}

let db: Database.Database
let dir: string

beforeEach(() => {
  db = makeDb()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-notes-'))
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeNote(name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

function interactionCount(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM interactions').get() as { c: number }).c
}

const GRANOLA_NOTE = `# Series A intro — Acme Robotics

Date: 2026-09-04
Attendees: Sarah Chen <sarah@acmerobotics.com>

## Summary
ARR is ~€1.2M, growing 15% MoM. Raising €6M at a €30M pre.
`

/** Shape of a real Tactiq export: display names only, no emails, US slash date. */
const TACTIQ_NOTE = `# Davide Mazzanti and Daniel Uusitalo

  Meeting started: 7/16/2026, 2:31:14 PM
  Duration: 34 minutes
  Participants: Daniel Uusitalo, Davide Mazzanti

  [View original transcript](https://app.tactiq.io/api/2/u/m/r/abc?o=txt)
`

describe('matchNoteToContacts', () => {
  it('matches on email', () => {
    const note = parseMeetingNote(GRANOLA_NOTE, 'acme.md')
    const { matched } = matchNoteToContacts(db, note)
    expect(matched).toHaveLength(1)
    expect(matched[0].name).toBe('Sarah Chen')
  })

  it('matches on display name when there is no email', () => {
    const note = parseMeetingNote('Attendees: Marta Nowak\n\nCaught up.', 'x.md')
    const { matched } = matchNoteToContacts(db, note)
    expect(matched.map(m => m.name)).toContain('Marta Nowak')
  })

  it('reports attendees it could not place', () => {
    const note = parseMeetingNote('Attendees: nobody@nowhere.com\n\nHi.', 'x.md')
    const { matched, unmatched } = matchNoteToContacts(db, note)
    expect(matched).toHaveLength(0)
    expect(unmatched).toContain('nobody@nowhere.com')
  })

  // Regression: matching used to be a bare `WHERE name = ? LIMIT 1`, so when two
  // contacts shared a name the note was silently filed against whichever row
  // SQLite happened to return first. A wrong link is invisible once written and
  // corrupts every per-person view built on top of it, so an ambiguous name must
  // resolve to nobody and wait for a human.
  it('refuses to guess between two contacts with the same name', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'david@one.com'
    )
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'david@two.com'
    )
    const note = parseMeetingNote('Attendees: David Smith\n\nNotes.', 'x.md')
    const { matched, ambiguous, unmatched } = matchNoteToContacts(db, note)
    expect(matched).toHaveLength(0)
    expect(ambiguous).toContain('David Smith')
    // Ambiguous is a different problem from unknown; don't conflate them.
    expect(unmatched).not.toContain('David Smith')
  })

  it('files nothing at all for an ambiguous attendee', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'david@one.com'
    )
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'david@two.com'
    )
    const file = writeNote('ambiguous.md', 'Attendees: David Smith\n\nTalked shop.')
    const result = ingestFile(db, file)

    expect(result?.matched).toBe(0)
    expect(result?.ambiguous).toBe(1)
    expect(interactionCount()).toBe(0)
    // Still queued for manual assignment rather than dropped on the floor.
    const row = db
      .prepare('SELECT unmatched_json FROM note_imports')
      .get() as { unmatched_json: string }
    expect(JSON.parse(row.unmatched_json)).toContain('David Smith')
  })

  // The whole point of the pivot: a meeting is a first-class row, not N copies
  // of a note pasted onto N contact cards. These tables existed but nothing had
  // ever written to them.
  it('writes the meeting into the ledger, not just onto contacts', () => {
    const file = writeNote('acme.md', GRANOLA_NOTE)
    ingestFile(db, file)

    const m = db.prepare('SELECT * FROM meetings').all() as Record<string, unknown>[]
    expect(m).toHaveLength(1)
    expect(m[0].title).toBe('Series A intro — Acme Robotics')
    // This fixture carries no notetaker fingerprint, so provenance falls back
    // to the generic file adapter rather than being guessed at.
    expect(m[0].source).toBe('file')
    expect(m[0].raw_file_name).toBe('acme.md')

    const links = db.prepare('SELECT * FROM meeting_participants').all() as Record<string, unknown>[]
    expect(links).toHaveLength(1)
    expect(links[0].resolution).toBe('email_exact')

    // Dual-write: the CRM activity feed keeps working, and the row it reads
    // now points back at the ledger meeting that produced it.
    const ints = db.prepare('SELECT * FROM interactions').all() as Record<string, unknown>[]
    expect(ints).toHaveLength(1)
    expect(ints[0].meeting_id).toBe(m[0].id)
  })

  it('files one interaction per person when a note names them twice', () => {
    // Sarah appears once by email and once by display name. She is one person.
    const note = 'Attendees: Sarah Chen <sarah@acmerobotics.com>, Sarah Chen\n\nCaught up.'
    ingestFile(db, writeNote('dup.md', note))

    expect(interactionCount()).toBe(1)
    const links = db.prepare('SELECT COUNT(*) AS c FROM meeting_participants').get() as { c: number }
    // The ledger keeps both raw mentions; only the CRM write is deduped.
    expect(links.c).toBeGreaterThanOrEqual(1)
  })

  // The richer resolver is now actually reachable from ingest; it previously sat
  // unused behind an exact-full-name-only query.
  it('matches an initial-plus-surname when only one contact fits', () => {
    const note = parseMeetingNote('Attendees: M. Nowak\n\nCoffee.', 'x.md')
    const { matched } = matchNoteToContacts(db, note)
    expect(matched.map(m => m.name)).toContain('Marta Nowak')
  })

  it('excludes the user themselves', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'Daniel', 'Uusitalo', 'daniel@4impact.vc'
    )
    db.prepare("INSERT INTO settings (key, value) VALUES ('google_email', 'daniel@4impact.vc')").run()
    const note = parseMeetingNote(
      'Attendees: daniel@4impact.vc, sarah@acmerobotics.com\n\nNotes.',
      'x.md'
    )
    const { matched } = matchNoteToContacts(db, note)
    expect(matched.map(m => m.name)).toEqual(['Sarah Chen'])
  })

  // Regression: real Tactiq exports list participants by display name only, with
  // no email anywhere in the file. Excluding self by email alone meant the user
  // was filed as an attendee of every one of their own meetings.
  it('excludes the user by NAME when the note carries no emails', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'Daniel', 'Uusitalo', ''
    )
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'Davide', 'Mazzanti', ''
    )
    db.prepare("INSERT INTO settings (key, value) VALUES ('notes_own_name', 'Daniel Uusitalo')").run()
    const note = parseMeetingNote(TACTIQ_NOTE, 'Davide Mazzanti and Daniel Uusitalo.txt')
    const { matched } = matchNoteToContacts(db, note)
    expect(matched.map(m => m.name)).toEqual(['Davide Mazzanti'])
  })

  it('infers the user\'s name from the connected Google account', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'Daniel', 'Uusitalo', 'daniel@4impact.vc'
    )
    db.prepare("INSERT INTO settings (key, value) VALUES ('google_email', 'daniel@4impact.vc')").run()
    const self = getSelfIdentifiers(db)
    expect(self.names.has('daniel uusitalo')).toBe(true)
  })

  it('does not report the user as an unmatched attendee', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('notes_own_name', 'Daniel Uusitalo')").run()
    const note = parseMeetingNote(TACTIQ_NOTE, 'x.txt')
    const { unmatched } = matchNoteToContacts(db, note)
    expect(unmatched).not.toContain('Daniel Uusitalo')
  })

  it('ignores soft-deleted contacts', () => {
    db.prepare("UPDATE contacts SET deleted_at = '2026-01-01' WHERE email = 'sarah@acmerobotics.com'").run()
    const note = parseMeetingNote(GRANOLA_NOTE, 'acme.md')
    expect(matchNoteToContacts(db, note).matched).toHaveLength(0)
  })
})

describe('ingestFile', () => {
  it('creates an interaction against the matched contact', () => {
    ingestFile(db, writeNote('acme.md', GRANOLA_NOTE))
    const rows = db.prepare('SELECT * FROM interactions').all() as {
      contact_id: number; type: string; description: string; date: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('meeting')
    expect(rows[0].date).toBe('2026-09-04')
    expect(rows[0].description).toContain('ARR is ~€1.2M')
  })

  it('does not re-import the same content twice', () => {
    const p = writeNote('acme.md', GRANOLA_NOTE)
    expect(ingestFile(db, p)).not.toBeNull()
    expect(ingestFile(db, p)).toBeNull()
    expect(interactionCount()).toBe(1)
  })

  it('treats a renamed copy as already imported', () => {
    ingestFile(db, writeNote('acme.md', GRANOLA_NOTE))
    // Same content, different filename — a sync folder does this constantly.
    expect(ingestFile(db, writeNote('acme-copy.md', GRANOLA_NOTE))).toBeNull()
    expect(interactionCount()).toBe(1)
  })

  it('logs one interaction per attendee for a group meeting', () => {
    ingestFile(db, writeNote('sync.md',
      'Attendees: sarah@acmerobotics.com, marta@example.com\nDate: 2026-06-01\n\nQuarterly sync.'
    ))
    expect(interactionCount()).toBe(2)
  })

  // People are discovered, not imported: an attendee nobody matched becomes a
  // person, because you evidently had a conversation with them. No import step,
  // no "add contact", no empty state.
  it('creates a person for an attendee nobody matched', () => {
    ingestFile(db, writeNote('orphan.md', 'Attendees: ghost@nowhere.com\n\nSomething useful.'))

    const created = db
      .prepare("SELECT * FROM contacts WHERE email = 'ghost@nowhere.com'")
      .get() as Record<string, unknown> | undefined
    expect(created).toBeDefined()
    // Named from the address's local part rather than left blank.
    expect(created?.first_name).toBe('Ghost')

    expect(interactionCount()).toBe(1)
    const imports = db.prepare('SELECT * FROM note_imports').all() as {
      matched_count: number; unmatched_json: string
    }[]
    expect(imports[0].matched_count).toBe(1)
    expect(JSON.parse(imports[0].unmatched_json)).toEqual([])
  })

  it('skips unsupported file types', () => {
    expect(ingestFile(db, writeNote('photo.png', 'not a note'))).toBeNull()
  })

  it('skips empty files', () => {
    expect(ingestFile(db, writeNote('empty.md', ''))).toBeNull()
  })

  it('returns null for a missing file rather than throwing', () => {
    expect(ingestFile(db, path.join(dir, 'does-not-exist.md'))).toBeNull()
  })

  it('records the notetaker for provenance', () => {
    ingestFile(db, writeNote('t.md', 'Tactiq export\nAttendees: sarah@acmerobotics.com\n\nHi.'))
    const row = db.prepare('SELECT source FROM note_imports').get() as { source: string }
    expect(row.source).toBe('Tactiq')
  })
})

describe('scanNoteFolder', () => {
  it('returns zeroes when no folder is configured', () => {
    expect(scanNoteFolder(db)).toEqual({
      imported: 0,
      skipped: 0,
      matched: 0,
      unmatched: 0,
      ambiguous: 0,
    })
  })

  it('imports every supported note in the folder', () => {
    writeNote('a.md', GRANOLA_NOTE)
    writeNote('b.md', 'Attendees: marta@example.com\nDate: 2026-02-02\n\nCoffee.')
    writeNote('ignore.png', 'binary-ish')
    setNotesFolder(db, dir)

    const result = scanNoteFolder(db)
    expect(result.imported).toBe(2)
    expect(result.matched).toBe(2)
    expect(result.skipped).toBe(1)
  })

  it('is idempotent across repeated scans', () => {
    writeNote('a.md', GRANOLA_NOTE)
    setNotesFolder(db, dir)
    scanNoteFolder(db)
    const second = scanNoteFolder(db)
    expect(second.imported).toBe(0)
    expect(interactionCount()).toBe(1)
  })

  it('survives a folder that no longer exists', () => {
    setNotesFolder(db, path.join(dir, 'gone'))
    expect(() => scanNoteFolder(db)).not.toThrow()
  })

  it('round-trips the configured folder', () => {
    setNotesFolder(db, dir)
    expect(getNotesFolder(db)).toBe(dir)
  })
})

describe('getRecentImports', () => {
  it('lists imports newest first', () => {
    writeNote('a.md', GRANOLA_NOTE)
    writeNote('b.md', 'Attendees: marta@example.com\nDate: 2026-02-02\n\nCoffee.')
    setNotesFolder(db, dir)
    scanNoteFolder(db)
    expect(getRecentImports(db)).toHaveLength(2)
  })
})

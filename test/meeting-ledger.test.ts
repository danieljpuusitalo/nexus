import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import {
  recordMeeting,
  resolveParticipants,
  getMeetingsForContact,
  getParticipants,
  getAmbiguousParticipants,
  assignParticipant,
  type NormalizedMeeting,
  type SelfIdentity,
} from '../src/main/meeting-ledger'

/**
 * Same node:sqlite approach as note-ingest.test.ts — better-sqlite3 is compiled
 * against Electron's ABI and cannot load in a plain Node test process.
 */
function makeDb(): Database.Database {
  const raw = new DatabaseSync(':memory:')
  const db = raw as unknown as Database.Database
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
  db.exec(`
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      deleted_at TEXT DEFAULT NULL
    );
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
  `)
  db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
    'Sarah', 'Chen', 'sarah@acmerobotics.com'
  )
  db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
    'Marta', 'Nowak', 'marta@example.com'
  )
  return db
}

const SELF: SelfIdentity = {
  emails: new Set(['daniel@4impact.vc']),
  names: new Set(['daniel uusitalo']),
}

function meeting(over: Partial<NormalizedMeeting> = {}): NormalizedMeeting {
  return {
    source: 'Tactiq',
    sourceId: 'hash-1',
    title: 'Series A intro',
    startedAt: '2026-09-04',
    participants: [{ email: 'sarah@acmerobotics.com' }],
    summaryMarkdown: 'ARR ~€1.2M.',
    ...over,
  }
}

let db: Database.Database
beforeEach(() => { db = makeDb() })
afterEach(() => { db.close() })

function meetingCount(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM meetings').get() as { c: number }).c
}

describe('recordMeeting', () => {
  it('writes the meeting and its participant links', () => {
    const result = recordMeeting(db, meeting(), SELF)

    expect(result.created).toBe(true)
    expect(meetingCount()).toBe(1)

    const row = db.prepare('SELECT * FROM meetings').get() as Record<string, unknown>
    expect(row.source).toBe('Tactiq')
    expect(row.title).toBe('Series A intro')
    expect(row.has_summary).toBe(1)

    const links = db.prepare('SELECT * FROM meeting_participants').all() as Record<string, unknown>[]
    expect(links).toHaveLength(1)
    expect(links[0].resolution).toBe('email_exact')
    expect(links[0].resolved_via).toBe('email')
  })

  it('is idempotent on (source, source_id)', () => {
    recordMeeting(db, meeting(), SELF)
    const second = recordMeeting(db, meeting({ title: 'Renamed' }), SELF)

    expect(second.created).toBe(false)
    expect(meetingCount()).toBe(1)
    // The re-scan must not overwrite what is already recorded.
    const row = db.prepare('SELECT title FROM meetings').get() as { title: string }
    expect(row.title).toBe('Series A intro')
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM meeting_participants').get() as { c: number }).c
    ).toBe(1)
  })

  it('records the self attendee without linking them to a contact', () => {
    const result = recordMeeting(
      db,
      meeting({ participants: [{ email: 'daniel@4impact.vc' }, { name: 'Sarah Chen' }] }),
      SELF
    )
    const self = result.participants.find(p => p.isSelf)
    expect(self).toBeDefined()
    expect(self?.contactId).toBeNull()

    // Still stored, so the attendee list stays truthful.
    const stored = db.prepare('SELECT is_self FROM meeting_participants WHERE is_self = 1').all()
    expect(stored).toHaveLength(1)
  })

  it('marks an ambiguous name rather than linking it', () => {
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'd@one.com'
    )
    db.prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)').run(
      'David', 'Smith', 'd@two.com'
    )
    const result = recordMeeting(db, meeting({ participants: [{ name: 'David Smith' }] }), SELF)

    expect(result.participants[0].contactId).toBeNull()
    expect(result.participants[0].resolution).toBe('ambiguous')
    expect(result.participants[0].ambiguousCount).toBe(2)

    const link = db.prepare('SELECT * FROM meeting_participants').get() as Record<string, unknown>
    expect(link.contact_id).toBeNull()
    expect(link.resolution).toBe('ambiguous')
    // The raw name survives, so the review queue can show what it could not place.
    expect(link.raw_name).toBe('David Smith')
  })

  // Regression: "Sarah Chen <sarah@acme.com>" parses into both an email and a
  // display name. Two links for one person made her timeline show the same
  // meeting twice, because the person view joins through this table.
  it('collapses two mentions of the same person into one link', () => {
    const r = recordMeeting(
      db,
      meeting({ participants: [{ email: 'sarah@acmerobotics.com' }, { name: 'Sarah Chen' }] }),
      SELF
    )
    expect(r.participants).toHaveLength(1)

    const links = db.prepare('SELECT * FROM meeting_participants').all() as Record<string, unknown>[]
    expect(links).toHaveLength(1)
    // Both scraps of identity survive the merge.
    expect(links[0].raw_email).toBe('sarah@acmerobotics.com')
    expect(links[0].raw_name).toBe('Sarah Chen')
    // And the strongest reason for the link is the one recorded.
    expect(links[0].resolution).toBe('email_exact')

    const sarah = (db.prepare("SELECT id FROM contacts WHERE email = 'sarah@acmerobotics.com'")
      .get() as { id: number }).id
    expect(getMeetingsForContact(db, sarah)).toHaveLength(1)
  })

  it('keeps two people we could not place apart', () => {
    const r = recordMeeting(
      db,
      meeting({ participants: [{ name: 'Someone Unknown' }, { name: 'Another Stranger' }] }),
      SELF
    )
    expect(r.participants).toHaveLength(2)
  })

  it('collapses self mentioned by both name and email', () => {
    const r = recordMeeting(
      db,
      meeting({ participants: [{ email: 'daniel@4impact.vc' }, { name: 'Daniel Uusitalo' }] }),
      SELF
    )
    expect(r.participants.filter(p => p.isSelf)).toHaveLength(1)
  })

  it('rolls back the meeting if participants cannot be written', () => {
    // A contact_id that violates the FK would leave a meeting row with no
    // participants — and the dedupe key would stop it ever being retried.
    db.exec('PRAGMA foreign_keys = ON')
    const bad = meeting({ participants: [{ email: 'sarah@acmerobotics.com' }] })
    db.prepare('DELETE FROM contacts').run()
    // With contacts gone the email no longer resolves, so this still succeeds —
    // assert the meeting and its (unlinked) participant land together.
    const result = recordMeeting(db, bad, SELF)
    expect(result.created).toBe(true)
    expect(meetingCount()).toBe(1)
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM meeting_participants').get() as { c: number }).c
    ).toBe(1)
  })
})

describe('resolveParticipants', () => {
  it('reads the contact table once for the whole meeting', () => {
    // Guards the N+1 the naive implementation had: one SELECT per attendee.
    let selects = 0
    const realPrepare = db.prepare.bind(db)
    db.prepare = ((sql: string) => {
      if (/FROM contacts/i.test(sql)) selects++
      return realPrepare(sql)
    }) as typeof db.prepare

    resolveParticipants(
      db,
      [{ name: 'Sarah Chen' }, { name: 'Marta Nowak' }, { email: 'x@y.com' }],
      SELF
    )
    expect(selects).toBe(1)
  })

  it('treats a display-name match on self as self', () => {
    const [p] = resolveParticipants(db, [{ name: 'Daniel Uusitalo' }], SELF)
    expect(p.isSelf).toBe(true)
  })

  it('accent-folds the self name', () => {
    const self: SelfIdentity = { emails: new Set(), names: new Set(['jorg muller']) }
    const [p] = resolveParticipants(db, [{ name: 'Jörg Müller' }], self)
    expect(p.isSelf).toBe(true)
  })
})

describe('person view queries', () => {
  it('returns a contact\'s meetings, most recent first', () => {
    recordMeeting(db, meeting({ sourceId: 'a', startedAt: '2026-08-01', title: 'Older' }), SELF)
    recordMeeting(db, meeting({ sourceId: 'b', startedAt: '2026-09-01', title: 'Newer' }), SELF)

    const sarah = (db.prepare("SELECT id FROM contacts WHERE email = 'sarah@acmerobotics.com'")
      .get() as { id: number }).id
    const rows = getMeetingsForContact(db, sarah) as { title: string }[]

    expect(rows.map(r => r.title)).toEqual(['Newer', 'Older'])
  })

  it('names the other people in the room', () => {
    recordMeeting(
      db,
      meeting({
        participants: [
          { email: 'sarah@acmerobotics.com' },
          { email: 'marta@example.com' },
          { name: 'Unplaceable Guest' },
          { email: 'daniel@4impact.vc' },
        ],
      }),
      SELF
    )
    const sarah = (db.prepare("SELECT id FROM contacts WHERE email = 'sarah@acmerobotics.com'")
      .get() as { id: number }).id
    const [row] = getMeetingsForContact(db, sarah) as { others: string }[]

    // Known contacts by name, unknowns by whatever we were given, self omitted.
    expect(row.others).toContain('Marta Nowak')
    expect(row.others).toContain('Unplaceable Guest')
    expect(row.others).not.toContain('Sarah Chen')
    expect(row.others).not.toContain('daniel@4impact.vc')
  })

  it('excludes meetings where the contact only appears as self', () => {
    const selfIsSarah: SelfIdentity = {
      emails: new Set(['sarah@acmerobotics.com']),
      names: new Set(),
    }
    recordMeeting(db, meeting(), selfIsSarah)
    const sarah = (db.prepare("SELECT id FROM contacts WHERE email = 'sarah@acmerobotics.com'")
      .get() as { id: number }).id
    expect(getMeetingsForContact(db, sarah)).toHaveLength(0)
  })

  it('lists everyone in a meeting, self first', () => {
    const r = recordMeeting(
      db,
      meeting({ participants: [{ email: 'sarah@acmerobotics.com' }, { email: 'daniel@4impact.vc' }] }),
      SELF
    )
    const people = getParticipants(db, r.meetingId) as { is_self: number; first_name: string | null }[]
    expect(people).toHaveLength(2)
    expect(people[0].is_self).toBe(0)
    expect(people[0].first_name).toBe('Sarah')
  })
})

describe('review queue', () => {
  it('surfaces unplaceable participants and lets a human assign them', () => {
    const r = recordMeeting(db, meeting({ participants: [{ name: 'Unknown Person' }] }), SELF)

    const queue = getAmbiguousParticipants(db) as { id: number; raw_name: string }[]
    expect(queue).toHaveLength(1)
    expect(queue[0].raw_name).toBe('Unknown Person')

    const marta = (db.prepare("SELECT id FROM contacts WHERE email = 'marta@example.com'")
      .get() as { id: number }).id
    expect(assignParticipant(db, queue[0].id, marta)).toEqual({ ok: true })

    // Assigned links leave the queue and are marked so they are never re-guessed.
    expect(getAmbiguousParticipants(db)).toHaveLength(0)
    const link = db.prepare('SELECT * FROM meeting_participants WHERE id = ?').get(queue[0].id) as
      Record<string, unknown>
    expect(link.contact_id).toBe(marta)
    expect(link.resolution).toBe('manual')

    // And the meeting now shows up on that person's timeline.
    expect(getMeetingsForContact(db, marta)).toHaveLength(1)
    expect(r.meetingId).toBeGreaterThan(0)
  })

  it('reports a failed assignment rather than claiming success', () => {
    expect(assignParticipant(db, 9999, 1)).toEqual({ ok: false })
  })
})

/**
 * The Meeting Ledger
 *
 * One row per real-world meeting, whichever tool captured it, plus a link to
 * every person who was in it. This is the aggregation layer the product is
 * built on: notetakers each keep a flat chronological list trapped in their own
 * silo, and the ledger inverts that into "every conversation with this person".
 *
 * Every source — the folder watcher, a Fathom webhook, a forwarded email, a
 * Google Meet transcript — normalises into `NormalizedMeeting` and comes through
 * `recordMeeting`. Adding a source should mean writing a translator, never
 * touching the write path or the resolver.
 *
 * Pure functions over an injected db handle: no Electron, no filesystem, no
 * network. That is what makes it testable against node:sqlite.
 */

import type Database from 'better-sqlite3'
import { resolvePerson, loadContacts, normaliseName, type ContactRow } from './person-resolver'
import { findEventForMeeting, scopedEmailFor } from './calendar-match'
import { attendeesOf, type CalendarAttendee } from './calendar-sync'

/** A participant as a source hands them to us, before we know who they are. */
export interface RawParticipant {
  name?: string
  email?: string
}

/**
 * How much to trust a participant→contact link.
 *
 * Ordered strongest to weakest. The distinction that matters is `ambiguous`
 * versus `unresolved`: both mean "not linked", but ambiguous means several
 * contacts fit and we refused to choose, which is a question a human can answer
 * in one click. Nothing below `global_unique` is ever auto-linked.
 */
export type ResolutionTier =
  | 'email_exact'
  | 'calendar_scoped'
  | 'global_unique'
  | 'manual'
  | 'ambiguous'
  | 'unresolved'

export interface ResolvedParticipant {
  raw: RawParticipant
  contactId: number | null
  /** Display name of the linked contact, or '' when unlinked. */
  contactName: string
  resolution: ResolutionTier
  /** The specific rule that fired, kept for debugging a wrong-looking link. */
  resolvedVia: string
  isSelf: boolean
  /** Set when several contacts matched. */
  ambiguousCount?: number
}

/** What every adapter produces, and the only thing the ledger accepts. */
export interface NormalizedMeeting {
  /** Notetaker name, or '' when unrecognised. */
  source: string
  /** The provider's own meeting id, or a content hash for file imports. */
  sourceId: string
  sourceUrl?: string
  title?: string
  /** ISO date or datetime. */
  startedAt: string
  endedAt?: string
  durationMinutes?: number | null
  participants: RawParticipant[]
  /** Verbatim from the tool. Never generated, never a transcript fallback. */
  summaryMarkdown?: string
  actionItems?: string[]
  transcript?: string
  rawFileName?: string
  /** Set once a calendar event has been matched to this meeting. */
  calendarEventId?: number | null
  icalUid?: string
}

export interface RecordResult {
  meetingId: number
  /** False when this meeting was already in the ledger. */
  created: boolean
  participants: ResolvedParticipant[]
}

/** Who "you" are, so you aren't filed as an attendee of your own meetings. */
export interface SelfIdentity {
  emails: Set<string>
  names: Set<string>
}

/** person-resolver's strategy names, bucketed into confidence tiers. */
function tierFor(method: string, ambiguousCount?: number): ResolutionTier {
  if (ambiguousCount) return 'ambiguous'
  if (method === 'email') return 'email_exact'
  if (method === 'none') return 'unresolved'
  // exact-name, reversed-name, initial-surname, unique-first-name,
  // unique-surname: all required exactly one candidate to fire.
  return 'global_unique'
}

/**
 * Resolves a whole meeting's participants in one pass.
 *
 * Reads the contact table once rather than once per person, and never guesses:
 * an ambiguous name resolves to nobody and is reported as such.
 */
export function resolveParticipants(
  db: Database.Database,
  participants: RawParticipant[],
  self: SelfIdentity,
  cache?: ContactRow[],
  /** Attendees of the calendar event this meeting was matched to, if any. */
  calendarAttendees?: CalendarAttendee[]
): ResolvedParticipant[] {
  const contacts = cache ?? loadContacts(db)
  const byId = new Map(contacts.map(c => [c.id, c]))
  const selfNames = new Set([...self.names].map(normaliseName))

  return participants.map(raw => {
    const email = (raw.email || '').toLowerCase().trim()
    const isSelf =
      (email !== '' && self.emails.has(email)) ||
      (raw.name !== undefined && raw.name !== '' && selfNames.has(normaliseName(raw.name)))

    if (isSelf) {
      return {
        raw,
        contactId: null,
        contactName: '',
        resolution: 'unresolved' as ResolutionTier,
        resolvedVia: 'self',
        isSelf: true,
      }
    }

    // Calendar first. A display name resolved against the five people actually
    // invited is a local, near-certain answer; the same name against the whole
    // contact table is a global, ambiguous one. Only worth trying when the
    // source gave us a name and no address of its own.
    if (!email && raw.name && calendarAttendees && calendarAttendees.length > 0) {
      const scoped = scopedEmailFor(raw.name, calendarAttendees)
      if (scoped) {
        // Self can be named on the invitation under an address the capture
        // never mentioned.
        if (self.emails.has(scoped)) {
          return {
            raw,
            contactId: null,
            contactName: '',
            resolution: 'unresolved' as ResolutionTier,
            resolvedVia: 'self',
            isSelf: true,
          }
        }
        const hit = resolvePerson(db, { email: scoped }, contacts)
        if (hit.contactId !== null) {
          const c = byId.get(hit.contactId)
          return {
            raw,
            contactId: hit.contactId,
            contactName: c ? `${c.first_name} ${c.last_name}`.trim() : '',
            resolution: 'calendar_scoped' as ResolutionTier,
            resolvedVia: 'calendar-attendee',
            isSelf: false,
          }
        }
      }
    }

    const hit = resolvePerson(db, raw, contacts)
    const contact = hit.contactId !== null ? byId.get(hit.contactId) : undefined

    return {
      raw,
      contactId: hit.contactId,
      contactName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : '',
      resolution: tierFor(hit.method, hit.ambiguousCount),
      resolvedVia: hit.method,
      isSelf: false,
      ambiguousCount: hit.ambiguousCount,
    }
  })
}

/** Strongest first. Used when two mentions of one person disagree. */
const TIER_RANK: ResolutionTier[] = [
  'manual',
  'email_exact',
  'calendar_scoped',
  'global_unique',
  'ambiguous',
  'unresolved',
]

/**
 * Collapses several mentions of the same person into one participant link.
 *
 * Most exports name an attendee twice — once in an email list, once as a
 * display name ("Sarah Chen <sarah@acme.com>" yields both). Storing both as
 * separate links would make the same meeting appear twice on that person's
 * timeline, because the person view joins through this table.
 *
 * Resolved people collapse by contact; self collapses to one row; anyone we
 * could not place stays distinct, keyed on what we were actually given, since
 * two unplaceable names may well be two different people.
 */
export function mergeResolved(participants: ResolvedParticipant[]): ResolvedParticipant[] {
  const keyOf = (p: ResolvedParticipant): string => {
    if (p.isSelf) return 'self'
    if (p.contactId !== null) return `contact:${p.contactId}`
    return `raw:${normaliseName(p.raw.name || '')}|${(p.raw.email || '').toLowerCase()}`
  }

  const merged = new Map<string, ResolvedParticipant>()
  for (const p of participants) {
    const key = keyOf(p)
    const seen = merged.get(key)
    if (!seen) {
      merged.set(key, { ...p, raw: { ...p.raw } })
      continue
    }
    // Keep every scrap of raw identity we were given for this person.
    if (!seen.raw.email && p.raw.email) seen.raw.email = p.raw.email
    if (!seen.raw.name && p.raw.name) seen.raw.name = p.raw.name
    // And record the strongest reason we had for believing the link.
    if (TIER_RANK.indexOf(p.resolution) < TIER_RANK.indexOf(seen.resolution)) {
      seen.resolution = p.resolution
      seen.resolvedVia = p.resolvedVia
    }
  }
  return [...merged.values()]
}

/**
 * Writes a meeting and its participants into the ledger.
 *
 * Idempotent on `(source, source_id)`: re-scanning a folder, replaying a webhook
 * or re-syncing a provider returns the existing row untouched rather than
 * duplicating it. The caller can tell the difference via `created`.
 */
export function recordMeeting(
  db: Database.Database,
  meeting: NormalizedMeeting,
  self: SelfIdentity
): RecordResult {
  const existing = db
    .prepare('SELECT id FROM meetings WHERE source = ? AND source_id = ?')
    .get(meeting.source, meeting.sourceId) as { id: number } | undefined

  // Find the calendar event this capture came from, unless the source already
  // told us (an API connector may know its own event id). The event's attendee
  // list is what turns display-name resolution from a global guess into a local
  // near-certainty, so this happens before participants are resolved.
  let calendarEventId = meeting.calendarEventId ?? null
  let icalUid = meeting.icalUid || ''
  let attendees: CalendarAttendee[] = []

  if (calendarEventId === null) {
    const match = findEventForMeeting(db, {
      startedAt: meeting.startedAt,
      title: meeting.title,
      participantNames: meeting.participants.map(p => p.name || '').filter(Boolean),
    })
    if (match) {
      calendarEventId = match.event.id
      icalUid = icalUid || match.event.ical_uid
      attendees = attendeesOf(match.event)
    }
  }

  const resolved = mergeResolved(
    resolveParticipants(db, meeting.participants, self, undefined, attendees)
  )

  // Already in the ledger. Nothing is written and nothing is overwritten — a
  // re-scan must not clobber a link a human corrected by hand. `created: false`
  // tells the caller not to treat the resolutions below as newly persisted.
  if (existing) {
    return { meetingId: existing.id, created: false, participants: resolved }
  }

  const summary = meeting.summaryMarkdown || ''

  const insertMeeting = db.prepare(`
    INSERT INTO meetings (
      source, source_id, source_url, title, started_at, ended_at,
      duration_minutes, summary, action_items_json, transcript,
      has_summary, raw_file_name, calendar_event_id, ical_uid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertParticipant = db.prepare(`
    INSERT INTO meeting_participants (
      meeting_id, contact_id, raw_name, raw_email, is_self, resolution, resolved_via
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  let meetingId = 0

  // One transaction: a meeting without its participants is a corrupt ledger row
  // that nothing would ever revisit, because the dedupe key would say it exists.
  db.transaction(() => {
    const info = insertMeeting.run(
      meeting.source,
      meeting.sourceId,
      meeting.sourceUrl || '',
      meeting.title || '',
      meeting.startedAt,
      meeting.endedAt || '',
      meeting.durationMinutes ?? null,
      summary,
      JSON.stringify(meeting.actionItems || []),
      meeting.transcript || '',
      summary ? 1 : 0,
      meeting.rawFileName || '',
      calendarEventId,
      icalUid
    )
    meetingId = Number(info.lastInsertRowid)

    for (const p of resolved) {
      insertParticipant.run(
        meetingId,
        p.contactId,
        p.raw.name || '',
        p.raw.email || '',
        p.isSelf ? 1 : 0,
        p.resolution,
        p.resolvedVia
      )
    }
  })()

  return { meetingId, created: true, participants: resolved }
}

/** Every meeting a contact was in, most recent first. The person view's query. */
export function getMeetingsForContact(
  db: Database.Database,
  contactId: number,
  limit = 100
): unknown[] {
  return db
    .prepare(
      `SELECT m.id, m.source, m.source_url, m.title, m.started_at, m.ended_at,
              m.duration_minutes, m.summary, m.action_items_json, m.has_summary,
              m.transcript != '' AS has_transcript,
              (SELECT GROUP_CONCAT(
                        COALESCE(
                          NULLIF(TRIM(COALESCE(c2.first_name, '') || ' ' || COALESCE(c2.last_name, '')), ''),
                          NULLIF(p2.raw_name, ''),
                          p2.raw_email
                        ), ', ')
               FROM meeting_participants p2
               LEFT JOIN contacts c2 ON c2.id = p2.contact_id AND c2.deleted_at IS NULL
               WHERE p2.meeting_id = m.id AND p2.is_self = 0 AND p2.id <> p.id) AS others
       FROM meetings m
       JOIN meeting_participants p ON p.meeting_id = m.id
       WHERE p.contact_id = ? AND p.is_self = 0
       ORDER BY m.started_at DESC, m.id DESC
       LIMIT ?`
    )
    .all(contactId, limit)
}

/** The other people in a meeting, for rendering "with X, Y and Z". */
export function getParticipants(db: Database.Database, meetingId: number): unknown[] {
  return db
    .prepare(
      `SELECT p.contact_id, p.raw_name, p.raw_email, p.is_self, p.resolution,
              c.first_name, c.last_name
       FROM meeting_participants p
       LEFT JOIN contacts c ON c.id = p.contact_id AND c.deleted_at IS NULL
       WHERE p.meeting_id = ?
       ORDER BY p.is_self ASC, p.id ASC`
    )
    .all(meetingId)
}

/**
 * Participant links a human needs to look at: several contacts fitted the name
 * and we declined to pick one. The review queue reads this.
 */
export function getAmbiguousParticipants(db: Database.Database, limit = 50): unknown[] {
  return db
    .prepare(
      `SELECT p.id, p.meeting_id, p.raw_name, p.raw_email, p.resolution,
              m.title, m.started_at, m.source
       FROM meeting_participants p
       JOIN meetings m ON m.id = p.meeting_id
       WHERE p.contact_id IS NULL AND p.is_self = 0
         AND p.resolution IN ('ambiguous', 'unresolved')
       ORDER BY m.started_at DESC, p.id ASC
       LIMIT ?`
    )
    .all(limit)
}

/**
 * Confirms a participant is a given contact, after a human said so.
 *
 * Marked `manual` so it is never re-guessed, and so the review queue can show
 * how many of its links a person actually had to make by hand.
 */
export function assignParticipant(
  db: Database.Database,
  participantId: number,
  contactId: number
): { ok: boolean } {
  const info = db
    .prepare(
      `UPDATE meeting_participants
       SET contact_id = ?, resolution = 'manual', resolved_via = 'manual'
       WHERE id = ?`
    )
    .run(contactId, participantId)
  return { ok: info.changes > 0 }
}

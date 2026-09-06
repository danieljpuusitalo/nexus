/**
 * Person Resolution
 *
 * The core of the aggregation layer. Every notetaker names people differently:
 * Fathom gives "davide@acme.com", Tactiq gives "Davide Mazzanti", Granola might
 * give "D. Mazzanti", Zoom gives "Davide Mazzanti (Acme)". Turning all of those
 * into one person is what makes a unified per-person ledger possible, and it is
 * the thing the notetakers themselves never do.
 *
 * Guiding rule: never guess. An ambiguous name resolves to null and surfaces as
 * a fixable gap. Silently merging two different people corrupts the ledger, and
 * a corrupted source of truth is worse than an incomplete one.
 *
 * Pure functions over an injected db handle — no Electron, no filesystem.
 */

import type Database from 'better-sqlite3'

export type MatchMethod =
  | 'email'
  | 'exact-name'
  | 'reversed-name'
  | 'initial-surname'
  | 'unique-first-name'
  | 'unique-surname'
  | 'none'

export interface Resolution {
  contactId: number | null
  method: MatchMethod
  /** Populated when several contacts matched and we refused to choose. */
  ambiguousCount?: number
}

interface ContactRow {
  id: number
  first_name: string
  last_name: string
  email: string
}

/**
 * Lowercase, strip accents and punctuation, collapse whitespace.
 * "Müller, Jörg-Peter " -> "muller jorg peter"
 */
export function normaliseName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')       // drop "(Acme Corp)" suffixes
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits a display name into parts, handling "Surname, Given" ordering. */
export function nameParts(raw: string): string[] {
  const cleaned = raw.replace(/\([^)]*\)/g, '').trim()
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',', 2)
    return normaliseName(`${first} ${last}`).split(' ').filter(Boolean)
  }
  return normaliseName(cleaned).split(' ').filter(Boolean)
}

function loadContacts(db: Database.Database): ContactRow[] {
  return db
    .prepare(
      'SELECT id, first_name, last_name, email FROM contacts WHERE deleted_at IS NULL'
    )
    .all() as ContactRow[]
}

/** Unique match helper: one hit resolves, several are reported as ambiguous. */
function decide(hits: ContactRow[], method: MatchMethod): Resolution | null {
  if (hits.length === 1) return { contactId: hits[0].id, method }
  if (hits.length > 1) return { contactId: null, method: 'none', ambiguousCount: hits.length }
  return null
}

/**
 * Resolves a participant to a contact.
 *
 * Strategies run strongest-first and stop at the first that yields exactly one
 * candidate. Email is authoritative; everything after it is a heuristic that
 * must be unambiguous to count.
 */
export function resolvePerson(
  db: Database.Database,
  participant: { name?: string; email?: string }
): Resolution {
  const email = (participant.email || '').toLowerCase().trim()
  const contacts = loadContacts(db)

  if (email) {
    const hit = contacts.find(c => (c.email || '').toLowerCase().trim() === email)
    if (hit) return { contactId: hit.id, method: 'email' }
  }

  const parts = nameParts(participant.name || '')
  if (parts.length === 0) return { contactId: null, method: 'none' }

  const full = parts.join(' ')
  const fullOf = (c: ContactRow): string => normaliseName(`${c.first_name} ${c.last_name}`)

  // "Davide Mazzanti" === "Davide Mazzanti"
  const exact = decide(contacts.filter(c => fullOf(c) === full), 'exact-name')
  if (exact) return exact

  // "Mazzanti Davide" === "Davide Mazzanti"
  const reversedTarget = [...parts].reverse().join(' ')
  const reversed = decide(contacts.filter(c => fullOf(c) === reversedTarget), 'reversed-name')
  if (reversed) return reversed

  // "D. Mazzanti" === "Davide Mazzanti"
  if (parts.length >= 2 && parts[0].length === 1) {
    const initial = parts[0]
    const surname = parts.slice(1).join(' ')
    const hits = contacts.filter(
      c =>
        normaliseName(c.last_name) === surname &&
        normaliseName(c.first_name).startsWith(initial)
    )
    const byInitial = decide(hits, 'initial-surname')
    if (byInitial) return byInitial
  }

  // A bare "Davide" only resolves when exactly one contact has that first name.
  if (parts.length === 1) {
    const byFirst = decide(
      contacts.filter(c => normaliseName(c.first_name) === full),
      'unique-first-name'
    )
    if (byFirst) return byFirst

    const bySurname = decide(
      contacts.filter(c => normaliseName(c.last_name) === full),
      'unique-surname'
    )
    if (bySurname) return bySurname
  }

  return { contactId: null, method: 'none' }
}

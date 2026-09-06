import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import { resolvePerson, normaliseName, nameParts } from '../src/main/person-resolver'

let db: Database.Database

function add(first: string, last: string, email = ''): number {
  const r = db
    .prepare('INSERT INTO contacts (first_name, last_name, email) VALUES (?,?,?)')
    .run(first, last, email)
  return Number(r.lastInsertRowid)
}

beforeEach(() => {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`CREATE TABLE contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL, last_name TEXT DEFAULT '',
    email TEXT DEFAULT '', deleted_at TEXT DEFAULT NULL
  );`)
  db = raw as unknown as Database.Database
})

describe('normaliseName', () => {
  it('strips accents, case and punctuation', () => {
    expect(normaliseName('Jörg-Peter Müller')).toBe('jorg-peter muller')
  })

  it('drops parenthesised company suffixes Zoom adds', () => {
    expect(normaliseName('Davide Mazzanti (Acme Corp)')).toBe('davide mazzanti')
  })
})

describe('nameParts', () => {
  it('handles "Surname, Given" ordering', () => {
    expect(nameParts('Mazzanti, Davide')).toEqual(['davide', 'mazzanti'])
  })
})

describe('resolvePerson', () => {
  it('matches on email above all else', () => {
    const id = add('Davide', 'Mazzanti', 'davide@acme.com')
    add('Davide', 'Mazzanti', 'other@x.com') // same name, different person
    const r = resolvePerson(db, { name: 'Someone Else', email: 'DAVIDE@acme.com' })
    expect(r).toEqual({ contactId: id, method: 'email' })
  })

  it('matches an exact name when there is no email', () => {
    const id = add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'Davide Mazzanti' })).toEqual({
      contactId: id, method: 'exact-name',
    })
  })

  it('matches across accent and case differences', () => {
    const id = add('Jörg', 'Müller')
    expect(resolvePerson(db, { name: 'JORG MULLER' }).contactId).toBe(id)
  })

  it('matches a Zoom-style name with a company suffix', () => {
    const id = add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'Davide Mazzanti (Acme Corp)' }).contactId).toBe(id)
  })

  it('matches reversed "Surname, Given" ordering', () => {
    const id = add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'Mazzanti, Davide' }).contactId).toBe(id)
  })

  it('matches "D. Mazzanti" to Davide Mazzanti', () => {
    const id = add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'D. Mazzanti' })).toEqual({
      contactId: id, method: 'initial-surname',
    })
  })

  it('resolves a bare first name only when it is unique', () => {
    const id = add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'Davide' })).toEqual({
      contactId: id, method: 'unique-first-name',
    })
  })

  // The safety property: a wrong merge corrupts the ledger permanently.
  it('REFUSES to guess when a first name is ambiguous', () => {
    add('Davide', 'Mazzanti')
    add('Davide', 'Rossi')
    const r = resolvePerson(db, { name: 'Davide' })
    expect(r.contactId).toBeNull()
    expect(r.ambiguousCount).toBe(2)
  })

  it('REFUSES to guess when an initial is ambiguous', () => {
    add('Davide', 'Mazzanti')
    add('Dario', 'Mazzanti')
    expect(resolvePerson(db, { name: 'D. Mazzanti' }).contactId).toBeNull()
  })

  it('returns none for an unknown person', () => {
    add('Davide', 'Mazzanti')
    expect(resolvePerson(db, { name: 'Jonathan Hvid' })).toEqual({
      contactId: null, method: 'none',
    })
  })

  it('ignores soft-deleted contacts', () => {
    const id = add('Davide', 'Mazzanti')
    db.prepare('UPDATE contacts SET deleted_at = ? WHERE id = ?').run('2026-01-01', id)
    expect(resolvePerson(db, { name: 'Davide Mazzanti' }).contactId).toBeNull()
  })

  it('handles empty input without throwing', () => {
    expect(resolvePerson(db, {})).toEqual({ contactId: null, method: 'none' })
  })
})

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
    expect(normaliseName('Dana Marsh (Acme Corp)')).toBe('dana marsh')
  })
})

describe('nameParts', () => {
  it('handles "Surname, Given" ordering', () => {
    expect(nameParts('Marsh, Dana')).toEqual(['dana', 'marsh'])
  })
})

describe('resolvePerson', () => {
  it('matches on email above all else', () => {
    const id = add('Dana', 'Marsh', 'dana@acme.example')
    add('Dana', 'Marsh', 'other@x.example') // same name, different person
    const r = resolvePerson(db, { name: 'Someone Else', email: 'DANA@acme.example' })
    expect(r).toEqual({ contactId: id, method: 'email' })
  })

  it('matches an exact name when there is no email', () => {
    const id = add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'Dana Marsh' })).toEqual({
      contactId: id, method: 'exact-name',
    })
  })

  it('matches across accent and case differences', () => {
    const id = add('Jörg', 'Müller')
    expect(resolvePerson(db, { name: 'JORG MULLER' }).contactId).toBe(id)
  })

  it('matches a Zoom-style name with a company suffix', () => {
    const id = add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'Dana Marsh (Acme Corp)' }).contactId).toBe(id)
  })

  it('matches reversed "Surname, Given" ordering', () => {
    const id = add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'Marsh, Dana' }).contactId).toBe(id)
  })

  it('matches "D. Marsh" to Dana Marsh', () => {
    const id = add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'D. Marsh' })).toEqual({
      contactId: id, method: 'initial-surname',
    })
  })

  it('resolves a bare first name only when it is unique', () => {
    const id = add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'Dana' })).toEqual({
      contactId: id, method: 'unique-first-name',
    })
  })

  // The safety property: a wrong merge corrupts the ledger permanently.
  it('REFUSES to guess when a first name is ambiguous', () => {
    add('Dana', 'Marsh')
    add('Dana', 'Rossi')
    const r = resolvePerson(db, { name: 'Dana' })
    expect(r.contactId).toBeNull()
    expect(r.ambiguousCount).toBe(2)
  })

  it('REFUSES to guess when an initial is ambiguous', () => {
    add('Dana', 'Marsh')
    add('Dario', 'Marsh')
    expect(resolvePerson(db, { name: 'D. Marsh' }).contactId).toBeNull()
  })

  it('returns none for an unknown person', () => {
    add('Dana', 'Marsh')
    expect(resolvePerson(db, { name: 'Jordan Hale' })).toEqual({
      contactId: null, method: 'none',
    })
  })

  it('ignores soft-deleted contacts', () => {
    const id = add('Dana', 'Marsh')
    db.prepare('UPDATE contacts SET deleted_at = ? WHERE id = ?').run('2026-01-01', id)
    expect(resolvePerson(db, { name: 'Dana Marsh' }).contactId).toBeNull()
  })

  it('handles empty input without throwing', () => {
    expect(resolvePerson(db, {})).toEqual({ contactId: null, method: 'none' })
  })
})

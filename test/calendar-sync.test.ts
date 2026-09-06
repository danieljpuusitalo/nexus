import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'

// google-auth.ts pulls in the real `electron` module (BrowserWindow, and
// transitively safeStorage via secure-store.ts) which only behaves outside a
// real Electron process by accident. Mocking it here means calendar-sync's
// own code is what's under test, and the token/no-token branches are driven
// directly rather than through real OAuth state.
vi.mock('../src/main/google-auth', () => ({
  getValidAccessToken: vi.fn(),
}))

import { getValidAccessToken } from '../src/main/google-auth'
import {
  syncCalendar,
  attendeesOf,
  eventsOnDate,
  type StoredCalendarEvent,
} from '../src/main/calendar-sync'

/**
 * Same node:sqlite approach as meeting-ledger.test.ts — better-sqlite3 is
 * compiled against Electron's ABI and cannot load in a plain Node test
 * process.
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
  `)
  return db
}

function insertEvent(db: Database.Database, over: Partial<StoredCalendarEvent> & { provider_event_id: string; started_at: string }): void {
  db.prepare(
    `INSERT INTO calendar_events (provider_event_id, ical_uid, title, started_at, ended_at, organizer_email, attendees_json, is_all_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    over.provider_event_id,
    over.ical_uid ?? '',
    over.title ?? '',
    over.started_at,
    over.ended_at ?? '',
    over.organizer_email ?? '',
    over.attendees_json ?? '[]',
    over.is_all_day ?? 0
  )
}

let db: Database.Database
beforeEach(() => {
  db = makeDb()
  globalThis.fetch = vi.fn()
})
afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('attendeesOf', () => {
  const base: StoredCalendarEvent = {
    id: 1,
    provider_event_id: 'e1',
    ical_uid: 'uid-1',
    title: 'Sync',
    started_at: '2026-09-10T09:00:00Z',
    ended_at: '2026-09-10T10:00:00Z',
    organizer_email: 'sarah@acmerobotics.com',
    attendees_json: '[]',
    is_all_day: 0,
  }

  it('parses a valid attendee list', () => {
    const attendees_json = JSON.stringify([
      { email: 'sarah@acmerobotics.com', displayName: 'Sarah Chen', organizer: true },
      { email: 'daniel@4impact.vc', self: true, responseStatus: 'accepted' },
    ])
    const result = attendeesOf({ ...base, attendees_json })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ email: 'sarah@acmerobotics.com', displayName: 'Sarah Chen', organizer: true })
    expect(result[1]).toMatchObject({ email: 'daniel@4impact.vc', self: true, responseStatus: 'accepted' })
  })

  it('returns an empty array for malformed JSON rather than throwing', () => {
    expect(() => attendeesOf({ ...base, attendees_json: 'not json{' })).not.toThrow()
    expect(attendeesOf({ ...base, attendees_json: 'not json{' })).toEqual([])
  })

  it('returns an empty array for an empty string', () => {
    expect(attendeesOf({ ...base, attendees_json: '' })).toEqual([])
  })

  it('returns an empty array when the JSON is not an array', () => {
    expect(attendeesOf({ ...base, attendees_json: '{"foo":"bar"}' })).toEqual([])
  })

  it('drops entries with no email rather than crashing on them', () => {
    const attendees_json = JSON.stringify(['just a string', { displayName: 'No Email' }, { email: 'ok@x.com' }])
    expect(attendeesOf({ ...base, attendees_json })).toEqual([{ email: 'ok@x.com' }])
  })
})

describe('eventsOnDate', () => {
  it('includes an event starting 23:50 the night before and running past midnight', () => {
    insertEvent(db, { provider_event_id: 'late-night', started_at: '2026-09-09T23:50:00Z', ended_at: '2026-09-10T00:20:00Z' })
    const rows = eventsOnDate(db, '2026-09-10')
    expect(rows.map(r => r.provider_event_id)).toEqual(['late-night'])
  })

  it('includes an all-day event covering the date', () => {
    // Google's all-day end date is exclusive: a single-day event on the 10th
    // is stored with end = the 11th.
    insertEvent(db, { provider_event_id: 'all-day', started_at: '2026-09-10', ended_at: '2026-09-11', is_all_day: 1 })
    const rows = eventsOnDate(db, '2026-09-10')
    expect(rows.map(r => r.provider_event_id)).toEqual(['all-day'])
  })

  it('includes an ordinary event on the exact date', () => {
    insertEvent(db, { provider_event_id: 'same-day', started_at: '2026-09-10T09:00:00Z', ended_at: '2026-09-10T10:00:00Z' })
    const rows = eventsOnDate(db, '2026-09-10')
    expect(rows.map(r => r.provider_event_id)).toEqual(['same-day'])
  })

  it('excludes an event entirely on the next day', () => {
    insertEvent(db, { provider_event_id: 'next-day', started_at: '2026-09-11T09:00:00Z', ended_at: '2026-09-11T10:00:00Z' })
    expect(eventsOnDate(db, '2026-09-10')).toEqual([])
  })

  it('excludes an event entirely on the previous day', () => {
    insertEvent(db, { provider_event_id: 'prev-day', started_at: '2026-09-09T09:00:00Z', ended_at: '2026-09-09T10:00:00Z' })
    expect(eventsOnDate(db, '2026-09-10')).toEqual([])
  })

  it('returns matches sorted by start time regardless of insertion order', () => {
    insertEvent(db, { provider_event_id: 'later', started_at: '2026-09-10T15:00:00Z', ended_at: '2026-09-10T16:00:00Z' })
    insertEvent(db, { provider_event_id: 'earlier', started_at: '2026-09-10T08:00:00Z', ended_at: '2026-09-10T09:00:00Z' })
    const rows = eventsOnDate(db, '2026-09-10')
    expect(rows.map(r => r.provider_event_id)).toEqual(['earlier', 'later'])
  })
})

describe('syncCalendar', () => {
  it('fails soft with no network call when there is no valid token', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null)
    const result = await syncCalendar(db)
    expect(result).toEqual({ fetched: 0, stored: 0, error: 'Google not connected' })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('stores fetched events, capturing iCalUID and marking all-day events', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          {
            id: 'evt-1',
            status: 'confirmed',
            summary: 'Series A intro',
            iCalUID: 'abc123@google.com',
            start: { dateTime: '2026-09-10T09:00:00+02:00' },
            end: { dateTime: '2026-09-10T09:30:00+02:00' },
            organizer: { email: 'sarah@acmerobotics.com' },
            attendees: [
              { email: 'sarah@acmerobotics.com', displayName: 'Sarah Chen', organizer: true },
              { email: 'daniel@4impact.vc', self: true, responseStatus: 'accepted' },
            ],
          },
          {
            id: 'evt-2',
            status: 'confirmed',
            summary: 'Offsite',
            start: { date: '2026-09-12' },
            end: { date: '2026-09-13' },
          },
        ],
      })
    )

    const result = await syncCalendar(db)
    expect(result).toEqual({ fetched: 2, stored: 2 })

    const timed = db.prepare('SELECT * FROM calendar_events WHERE provider_event_id = ?').get('evt-1') as Record<string, unknown>
    expect(timed.ical_uid).toBe('abc123@google.com')
    expect(timed.is_all_day).toBe(0)
    expect(timed.title).toBe('Series A intro')
    expect(JSON.parse(timed.attendees_json as string)).toHaveLength(2)

    const allDay = db.prepare('SELECT * FROM calendar_events WHERE provider_event_id = ?').get('evt-2') as Record<string, unknown>
    expect(allDay.is_all_day).toBe(1)
    expect(allDay.started_at).toBe('2026-09-12')
  })

  it('upserts rather than duplicates on re-sync', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    const page = (title: string) =>
      jsonResponse(200, {
        items: [
          {
            id: 'evt-1',
            status: 'confirmed',
            summary: title,
            start: { dateTime: '2026-09-10T09:00:00Z' },
            end: { dateTime: '2026-09-10T09:30:00Z' },
          },
        ],
      })

    ;(globalThis.fetch as Mock).mockResolvedValueOnce(page('Original title'))
    await syncCalendar(db)
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(page('Renamed'))
    const second = await syncCalendar(db)

    expect(second).toEqual({ fetched: 1, stored: 1 })
    const rows = db.prepare('SELECT * FROM calendar_events WHERE provider_event_id = ?').all('evt-1') as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Renamed')
  })

  it('deletes a previously-stored event once it is cancelled', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          {
            id: 'evt-1',
            status: 'confirmed',
            summary: 'Will be cancelled',
            start: { dateTime: '2026-09-10T09:00:00Z' },
            end: { dateTime: '2026-09-10T09:30:00Z' },
          },
        ],
      })
    )
    await syncCalendar(db)
    expect(db.prepare('SELECT COUNT(*) AS c FROM calendar_events').get()).toEqual({ c: 1 })

    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        items: [{ id: 'evt-1', status: 'cancelled' }],
      })
    )
    const result = await syncCalendar(db)

    expect(result.stored).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM calendar_events').get()).toEqual({ c: 0 })
  })

  it('follows nextPageToken until pagination is exhausted', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          items: [{ id: 'p1', status: 'confirmed', start: { dateTime: '2026-09-10T09:00:00Z' } }],
          nextPageToken: 'page-2',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          items: [{ id: 'p2', status: 'confirmed', start: { dateTime: '2026-09-11T09:00:00Z' } }],
        })
      )

    const result = await syncCalendar(db)
    expect(result).toEqual({ fetched: 2, stored: 2 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    const secondCallUrl = (globalThis.fetch as Mock).mock.calls[1][0] as string
    expect(secondCallUrl).toContain('pageToken=page-2')
  })

  it('fails soft when the API responds with an error status', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(jsonResponse(401, {}))
    const result = await syncCalendar(db)
    expect(result).toEqual({ fetched: 0, stored: 0, error: 'Calendar API error: 401' })
  })

  it('fails soft when the request throws', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock).mockRejectedValueOnce(new Error('network down'))
    const result = await syncCalendar(db)
    expect(result.fetched).toBe(0)
    expect(result.stored).toBe(0)
    expect(result.error).toContain('network down')
  })

  it('skips an item with no usable start time without losing the rest of the page', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token-123')
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          { id: 'no-start', status: 'confirmed' },
          { id: 'evt-1', status: 'confirmed', start: { dateTime: '2026-09-10T09:00:00Z' } },
        ],
      })
    )
    const result = await syncCalendar(db)
    expect(result.fetched).toBe(2)
    expect(result.stored).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS c FROM calendar_events').get()).toEqual({ c: 1 })
  })
})

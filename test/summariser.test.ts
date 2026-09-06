import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'

// secure-store.ts pulls in the real `electron` module (safeStorage), which
// only behaves outside a real Electron process by accident. Mocking it here
// means the summariser's own logic is what's under test, and the
// key/no-key branches are driven directly rather than through real DPAPI.
vi.mock('../src/main/secure-store', () => ({
  getSecret: vi.fn(),
}))

import { getSecret } from '../src/main/secure-store'
import {
  findMeetingsNeedingSummary,
  getEnhancedSummary,
  enhanceMeeting,
  enhanceBacklog,
} from '../src/main/summariser'

/**
 * Same node:sqlite approach as meeting-ledger.test.ts and calendar-sync.test.ts
 * — better-sqlite3 is compiled against Electron's ABI and cannot load in a
 * plain Node test process.
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
    CREATE TABLE meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      summary TEXT DEFAULT '',
      transcript TEXT DEFAULT '',
      has_summary INTEGER NOT NULL DEFAULT 0,
      UNIQUE(source, source_id)
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
  `)
  return db
}

let nextSourceId = 0

function insertMeeting(
  db: Database.Database,
  over: Partial<{
    title: string
    startedAt: string
    summary: string
    transcript: string
    hasSummary: number
  }> = {}
): number {
  const row = {
    title: 'Untitled',
    startedAt: '2026-09-01',
    summary: '',
    transcript: 'Some transcript text.',
    hasSummary: 0,
    ...over,
  }
  const info = db
    .prepare(
      `INSERT INTO meetings (source, source_id, title, started_at, summary, transcript, has_summary)
       VALUES ('Tactiq', ?, ?, ?, ?, ?, ?)`
    )
    .run(`id-${nextSourceId++}`, row.title, row.startedAt, row.summary, row.transcript, row.hasSummary)
  return Number(info.lastInsertRowid)
}

function storeEnhanced(db: Database.Database, meetingId: number, summary: string, actionItems: string[] = []): void {
  db.prepare(
    `INSERT INTO enhanced_summaries (meeting_id, model, summary, action_items_json) VALUES (?, ?, ?, ?)`
  ).run(meetingId, 'claude-sonnet-5', summary, JSON.stringify(actionItems))
}

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function toolUseResponse(summary: string, actionItems: string[]): Partial<Response> {
  return jsonResponse(200, {
    content: [{ type: 'tool_use', name: 'record_summary', input: { summary, action_items: actionItems } }],
  })
}

let db: Database.Database
beforeEach(() => {
  db = makeDb()
  nextSourceId = 0
  globalThis.fetch = vi.fn()
  vi.mocked(getSecret).mockReset()
})
afterEach(() => {
  db.close()
})

describe('findMeetingsNeedingSummary', () => {
  it('selects a meeting with a transcript and no usable summary', () => {
    const id = insertMeeting(db, { transcript: 'garbled fragments' })
    expect(findMeetingsNeedingSummary(db).map(r => r.id)).toEqual([id])
  })

  it('excludes a meeting that already has a real verbatim summary', () => {
    insertMeeting(db, { summary: 'A real summary.', hasSummary: 1 })
    expect(findMeetingsNeedingSummary(db)).toHaveLength(0)
  })

  it('excludes a meeting that already has a generated summary', () => {
    const id = insertMeeting(db)
    storeEnhanced(db, id, 'Already enhanced.')
    expect(findMeetingsNeedingSummary(db)).toHaveLength(0)
  })

  it('excludes a meeting with no transcript to work from', () => {
    insertMeeting(db, { transcript: '' })
    expect(findMeetingsNeedingSummary(db)).toHaveLength(0)
  })

  it('orders oldest first', () => {
    const newer = insertMeeting(db, { startedAt: '2026-09-05' })
    const older = insertMeeting(db, { startedAt: '2026-09-01' })
    expect(findMeetingsNeedingSummary(db).map(r => r.id)).toEqual([older, newer])
  })

  it('respects the limit', () => {
    insertMeeting(db)
    insertMeeting(db)
    expect(findMeetingsNeedingSummary(db, 1)).toHaveLength(1)
  })
})

describe('getEnhancedSummary', () => {
  it('round-trips a stored summary', () => {
    const id = insertMeeting(db)
    storeEnhanced(db, id, 'A summary.', ['Follow up with Sarah'])

    expect(getEnhancedSummary(db, id)).toEqual({
      meetingId: id,
      model: 'claude-sonnet-5',
      summary: 'A summary.',
      actionItems: ['Follow up with Sarah'],
      createdAt: expect.any(String),
    })
  })

  it('returns null when nothing is stored', () => {
    expect(getEnhancedSummary(db, 999)).toBeNull()
  })
})

describe('enhanceMeeting', () => {
  it('returns null with no network call when there is no API key', async () => {
    vi.mocked(getSecret).mockReturnValue(null)
    const id = insertMeeting(db)

    const result = await enhanceMeeting(db, id)

    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('generates and stores a summary from the transcript, separate from the verbatim record', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db, { title: 'Series A intro', transcript: 'We discussed the term sheet.' })
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      toolUseResponse('The team discussed the term sheet.', ['Send the redline by Friday'])
    )

    const result = await enhanceMeeting(db, id)

    expect(result).toEqual({
      meetingId: id,
      model: 'claude-sonnet-5',
      summary: 'The team discussed the term sheet.',
      actionItems: ['Send the redline by Friday'],
      createdAt: expect.any(String),
    })

    // The verbatim record is untouched — the generated text lives only in
    // enhanced_summaries.
    const meetingRow = db.prepare('SELECT summary FROM meetings WHERE id = ?').get(id) as { summary: string }
    expect(meetingRow.summary).toBe('')
  })

  it('never regenerates a meeting that already has a stored summary', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db)
    storeEnhanced(db, id, 'Already there.')

    const result = await enhanceMeeting(db, id)

    expect(result?.summary).toBe('Already there.')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null when the meeting has no transcript', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db, { transcript: '' })

    const result = await enhanceMeeting(db, id)

    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null when the meeting does not exist', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const result = await enhanceMeeting(db, 999)
    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null rather than throwing when the request itself fails', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db)
    ;(globalThis.fetch as Mock).mockRejectedValueOnce(new Error('network down'))

    const result = await enhanceMeeting(db, id)

    expect(result).toBeNull()
  })

  it('returns null when the API responds with an error status', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db)
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'bad key' }))

    const result = await enhanceMeeting(db, id)

    expect(result).toBeNull()
  })

  it('returns null when the model answers without calling the tool', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const id = insertMeeting(db)
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(
      jsonResponse(200, { content: [{ type: 'text', text: 'no tool call here' }] })
    )

    const result = await enhanceMeeting(db, id)

    expect(result).toBeNull()
  })
})

describe('enhanceBacklog', () => {
  it('reports the whole backlog as skipped when there is no API key, without calling the network', async () => {
    vi.mocked(getSecret).mockReturnValue(null)
    insertMeeting(db)
    insertMeeting(db)

    const result = await enhanceBacklog(db)

    expect(result).toEqual({ enhanced: 0, failed: 0, skipped: 2 })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('processes the backlog one at a time and counts successes and failures', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    insertMeeting(db)
    insertMeeting(db)
    ;(globalThis.fetch as Mock)
      .mockResolvedValueOnce(toolUseResponse('Summary one.', []))
      .mockResolvedValueOnce(jsonResponse(500, { error: 'server error' }))

    const result = await enhanceBacklog(db)

    expect(result).toEqual({ enhanced: 1, failed: 1, skipped: 0 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there is no backlog', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    const result = await enhanceBacklog(db)
    expect(result).toEqual({ enhanced: 0, failed: 0, skipped: 0 })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('respects the max option', async () => {
    vi.mocked(getSecret).mockReturnValue('sk-ant-test')
    insertMeeting(db)
    insertMeeting(db)
    ;(globalThis.fetch as Mock).mockResolvedValueOnce(toolUseResponse('Only one processed.', []))

    const result = await enhanceBacklog(db, { max: 1 })

    expect(result).toEqual({ enhanced: 1, failed: 0, skipped: 0 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

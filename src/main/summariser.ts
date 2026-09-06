/**
 * Summary Enhancement
 *
 * Some notetakers hand us a transcript and nothing worth keeping as a summary.
 * Tactiq's "Highlights" are garbled ASR fragments ("the consumerator is away.
 * We take the fun money to produce a new one"), not synthesis, so the ingest
 * path now discards them rather than storing junk as if it were real content.
 * That leaves a meeting in the ledger with a transcript, a linked person, and
 * nothing to actually read on their timeline — a record layer whose records
 * are empty has not shipped. This module closes that gap by generating a
 * summary from the transcript when the source gave none usable.
 *
 * The generated text lives in its own table, `enhanced_summaries`, never in
 * `meetings.summary`. That column is the verbatim record of what the
 * notetaker actually said happened, and mixing a model's reconstruction into
 * it would make the ledger's most basic promise untrue. A caller that wants
 * "the best available text for this meeting" is responsible for falling back
 * to this table itself — that decision belongs to the render layer, not here.
 *
 * Same shape as meeting-ledger.ts and person-resolver.ts: pure functions over
 * an injected db handle, no Electron imports. The one thing that can't be
 * pure is the network call, which is why every function that touches it is
 * async and every failure mode — no key, a bad response, a network error —
 * returns null instead of throwing. A flaky request should never be the
 * reason the rest of the app breaks; it should just mean this meeting stays
 * unenhanced until the next backlog pass.
 */

import type Database from 'better-sqlite3'
import { getSecret } from './secure-store'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
// Sonnet, deliberately. This is a bulk background job that eventually runs over
// every meeting every user has ever had, and the product's economics assume
// roughly a cent per meeting — Opus is an order of magnitude past that and buys
// nothing here, because summarising a transcript is extraction, not reasoning.
// Not the stale sonnet-4 pin that ai-client.ts still carries.
const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024

/**
 * Real transcripts run to roughly 38,000 characters for a typical hour-long
 * meeting — well inside Opus's context window, so this cap isn't about
 * fitting. It's about keeping a backlog run over hundreds of historical
 * meetings bounded in cost and latency, since every one of them is a full
 * network round trip.
 *
 * Truncating from the tail alone would be the obvious move, but it throws
 * away exactly the part of a meeting where decisions and action items get
 * stated ("okay, I'll send that over by Friday"). Keeping a larger head and a
 * smaller tail preserves the framing (what the meeting was about) and the
 * close (what was agreed), and drops the middle — which, in a garbled ASR
 * capture, is usually the least summarizable part anyway.
 */
const MAX_TRANSCRIPT_CHARS = 20000
const HEAD_CHARS = 14000
const TAIL_CHARS = 6000

function truncateTranscript(transcript: string): string {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript
  const head = transcript.slice(0, HEAD_CHARS)
  const tail = transcript.slice(-TAIL_CHARS)
  const omitted = transcript.length - HEAD_CHARS - TAIL_CHARS
  return `${head}\n\n[... ${omitted} characters omitted ...]\n\n${tail}`
}

const SYSTEM_PROMPT = `You are producing a factual record of a meeting from its transcript. The transcript may come from automatic speech recognition and can be garbled: misheard words, merged speaker turns, dropped sentences. Your job is to write down what the transcript actually supports, not what the conversation probably meant.

Rules:
- Write a factual 3-5 sentence summary of what was discussed and any decisions made.
- List explicit action items or commitments as short, separate strings, close to the speaker's own words. Return an empty array if none were stated.
- Prefer omission over speculation. If a detail is unclear, leave it out rather than guessing at the most plausible version.
- If the transcript is too fragmentary or garbled to responsibly summarize, say exactly that in the summary field instead of fabricating content, and return an empty action_items array.

Call the record_summary tool with your result. Do not include anything outside that tool call.`

const SUMMARY_TOOL_NAME = 'record_summary'

const SUMMARY_TOOL = {
  name: SUMMARY_TOOL_NAME,
  description: 'Record the factual summary and action items extracted from a meeting transcript.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A factual 3-5 sentence summary, or a note that the transcript was too poor to summarize.',
      },
      action_items: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit action items or commitments. Empty array if none were stated.',
      },
    },
    required: ['summary', 'action_items'],
  },
}

export interface EnhancedSummary {
  meetingId: number
  model: string
  summary: string
  actionItems: string[]
  createdAt: string
}

function getApiKey(db: Database.Database): string | null {
  return getSecret(db, 'ai_api_key')
}

/**
 * Meetings with a transcript but no usable summary, oldest first.
 *
 * "No usable summary" is `has_summary = 0` — the flag meeting-ledger.ts sets
 * at write time from whether the source handed us anything, so this doesn't
 * re-derive that judgment. The join against `enhanced_summaries` excludes
 * anything already generated, so a repeated backlog pass only ever picks up
 * meetings nobody has touched yet. Pure, no network.
 */
export function findMeetingsNeedingSummary(
  db: Database.Database,
  limit = 50
): { id: number; title: string; transcript: string }[] {
  return db
    .prepare(
      `SELECT m.id, m.title, m.transcript
       FROM meetings m
       LEFT JOIN enhanced_summaries e ON e.meeting_id = m.id
       WHERE m.has_summary = 0
         AND m.transcript != ''
         AND e.id IS NULL
       ORDER BY m.started_at ASC, m.id ASC
       LIMIT ?`
    )
    .all(limit) as { id: number; title: string; transcript: string }[]
}

/** Reads a stored generated summary, or null. Pure, no network. */
export function getEnhancedSummary(db: Database.Database, meetingId: number): EnhancedSummary | null {
  const row = db
    .prepare(
      `SELECT meeting_id, model, summary, action_items_json, created_at
       FROM enhanced_summaries
       WHERE meeting_id = ?`
    )
    .get(meetingId) as
    | { meeting_id: number; model: string; summary: string; action_items_json: string; created_at: string }
    | undefined
  if (!row) return null

  return {
    meetingId: row.meeting_id,
    model: row.model,
    summary: row.summary,
    actionItems: JSON.parse(row.action_items_json || '[]'),
    createdAt: row.created_at,
  }
}

/**
 * Calls Claude with the transcript and pulls the structured result out of the
 * forced tool call, so parsing never depends on the model's prose formatting.
 *
 * No extended thinking here: forcing `tool_choice` to a specific tool is
 * incompatible with thinking enabled (the API only allows `auto` tool_choice
 * once thinking is on), and a forced tool call is worth more here than deeper
 * reasoning — this is a faithful-extraction task, not one that benefits from
 * the model working through alternatives.
 */
async function callClaude(
  apiKey: string,
  title: string,
  transcript: string
): Promise<{ summary: string; action_items: unknown } | null> {
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: 'tool', name: SUMMARY_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content:
            `Meeting title: ${title || '(untitled)'}\n\n` +
            `<transcript>\n${truncateTranscript(transcript)}\n</transcript>`,
        },
      ],
    }),
  })

  if (!response.ok) {
    console.error(`[summariser] Claude API returned ${response.status}: ${await response.text()}`)
    return null
  }

  const data = (await response.json()) as {
    content: { type: string; name?: string; input?: unknown }[]
  }
  const toolUse = data.content.find(block => block.type === 'tool_use' && block.name === SUMMARY_TOOL_NAME)
  if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) return null

  return toolUse.input as { summary: string; action_items: unknown }
}

/**
 * Generates and stores an enhanced summary for one meeting.
 *
 * Idempotent: a meeting that already has one is returned as-is rather than
 * regenerated, so re-running a backlog pass never re-spends API calls on
 * meetings it already handled. Never throws — every failure path (no key
 * configured, meeting not found, no transcript to work from, the API call
 * itself failing) returns null so the app keeps working with no key at all.
 */
export async function enhanceMeeting(db: Database.Database, meetingId: number): Promise<EnhancedSummary | null> {
  const apiKey = getApiKey(db)
  if (!apiKey) return null

  const existing = getEnhancedSummary(db, meetingId)
  if (existing) return existing

  const meeting = db.prepare('SELECT title, transcript FROM meetings WHERE id = ?').get(meetingId) as
    | { title: string; transcript: string }
    | undefined
  if (!meeting || !meeting.transcript) return null

  let result: { summary: string; action_items: unknown } | null
  try {
    result = await callClaude(apiKey, meeting.title, meeting.transcript)
  } catch (err) {
    console.error(`[summariser] failed to enhance meeting ${meetingId}:`, err)
    return null
  }
  if (!result) return null

  const summary = String(result.summary || '').trim()
  if (!summary) return null
  const actionItems = Array.isArray(result.action_items)
    ? result.action_items.filter((item): item is string => typeof item === 'string')
    : []

  // ON CONFLICT DO NOTHING rather than a pre-write existence check race: two
  // concurrent calls for the same meeting should both end up reading back the
  // one row that won, not one of them throwing on the UNIQUE constraint.
  db.prepare(
    `INSERT INTO enhanced_summaries (meeting_id, model, summary, action_items_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(meeting_id) DO NOTHING`
  ).run(meetingId, MODEL, summary, JSON.stringify(actionItems))

  return getEnhancedSummary(db, meetingId)
}

/**
 * Works through the backlog of meetings needing a summary, one at a time.
 *
 * Concurrency of 1 is deliberate: this is a background catch-up job, not a
 * user-facing wait, so there is no reason to race Anthropic's rate limits for
 * a faster finish. If there's no API key at all, every candidate is reported
 * as `skipped` up front instead of making — and failing — one request per
 * meeting; that distinction is what lets a caller tell "nothing is
 * configured" apart from "N requests actually failed".
 */
export async function enhanceBacklog(
  db: Database.Database,
  opts?: { max?: number }
): Promise<{ enhanced: number; failed: number; skipped: number }> {
  const max = opts?.max ?? 25
  const candidates = findMeetingsNeedingSummary(db, max)
  if (candidates.length === 0) return { enhanced: 0, failed: 0, skipped: 0 }

  if (!getApiKey(db)) {
    return { enhanced: 0, failed: 0, skipped: candidates.length }
  }

  let enhanced = 0
  let failed = 0
  for (const meeting of candidates) {
    const result = await enhanceMeeting(db, meeting.id)
    if (result) enhanced++
    else failed++
  }

  console.log(`[summariser] backlog run: ${enhanced} enhanced, ${failed} failed, out of ${candidates.length} candidates`)
  return { enhanced, failed, skipped: 0 }
}

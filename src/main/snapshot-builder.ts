/**
 * Snapshot Builder
 *
 * Phase 3 of the pipeline: takes the engine's own outputs — meetings,
 * per-meeting extractions, optional closure results — and assembles the
 * exact `Snapshot` shape `web/src/lib/data.ts` renders. Nothing here reaches
 * into a db or the network; it is a pure fold over plain objects, so the
 * same function runs equally well over a fixture in a test and over a real
 * backlog dumped to JSON by `scripts/build-snapshot.ts`.
 *
 * Per CLAUDE.md rule 5 ("what a source wrote is bone; what a model wrote is
 * sage, behind its own rule"), extracted commitments are quote-backed bone
 * and go in `commitments`, never `generated_commitments` — that field stays
 * for a future model-written reconstruction of a meeting the source gave
 * nothing usable for, which is a different thing entirely.
 */

import type { Extraction, ExtractedCommitment } from './commitments'
import type { ClosureResult } from './commitment-closure'

export interface SnapshotPersonInput {
  name: string
  email: string
  company?: string
  role?: string
}

export interface SnapshotMeetingInput {
  /** Stable key for this meeting; also the key used in `extractions` and evidence refs. */
  id: string
  title: string
  started_at: string
  duration_minutes: number | null
  source: string
  source_url?: string
  /** Verbatim from the source notetaker. */
  summary: string
  has_transcript: boolean
  people: SnapshotPersonInput[]
}

export interface BuildSnapshotInput {
  self: string
  generatedAt: string
  meetings: SnapshotMeetingInput[]
  extractions: Record<string, Extraction>
  /** Keyed by ExtractedCommitment.id. */
  closures?: Record<string, ClosureResult>
}

// The subset of web/src/lib/data.ts's Snapshot shape this module produces.
// Kept as a local type rather than importing from web/ — this engine must
// never depend on the prototype it eventually feeds (see CLAUDE.md's
// "connecting the engine to the prototype" stop-point: only web/'s own
// load() should ever know both sides exist).

export interface SnapshotCommitment {
  text: string
  owner: 'me' | 'them'
  done: boolean
  due?: string
  closed_by?: number
  quote?: string
  speaker?: string
  counterparty?: string
  due_phrase?: string
  confidence?: 'high' | 'medium'
  evidence?: {
    state: 'closed' | 'candidate' | 'none'
    quote?: string
    at?: string
    source?: 'conversation' | 'email'
    ref?: string
  }
  extraction?: { model: string; prompt_hash: string }
}

export interface SnapshotConversation {
  id: number
  source: string
  source_url?: string
  title: string
  started_at: string
  duration_minutes: number | null
  summary: string
  commitments: SnapshotCommitment[]
  has_transcript: boolean
  people: string[]
  person_ids: number[]
  capture?: 'ok' | 'not_captured'
  capture_note?: string
}

export interface SnapshotPerson {
  id: number
  name: string
  email: string
  company: string | null
  role: string | null
  conversations: number
  first_conversation_at: string
  last_conversation_at: string
  last_title: string
}

export interface Snapshot {
  sample: boolean
  generated_at: string
  self: string
  conversations: SnapshotConversation[]
  people: SnapshotPerson[]
  queries: []
}

/** Same first-name-or-full-name, case-insensitive match used across the pipeline. */
function namesMatch(a: string, b: string): boolean {
  const an = a.trim().toLowerCase()
  const bn = b.trim().toLowerCase()
  if (!an || !bn) return false
  if (an === bn) return true
  const aFirst = an.split(/\s+/)[0]
  const bFirst = bn.split(/\s+/)[0]
  return aFirst === bFirst
}

interface PersonRecord {
  name: string
  email: string
  company: string | null
  role: string | null
  conversations: number
  first_conversation_at: string
  last_conversation_at: string
  last_title: string
}

/**
 * Assembles the full Snapshot. Conversation ids and person ids are both
 * assigned deterministically from sorted input, not from array position, so
 * the same input JSON always produces the same output ids regardless of how
 * the caller happened to order meetings or people.
 */
function personKey(person: SnapshotPersonInput): string {
  const email = person.email.toLowerCase().trim()
  return email || `name:${person.name.toLowerCase().replace(/\s+/g, ' ').trim()}`
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  // Chronological order for the conversations themselves; ties broken on the
  // meeting's own id so ordering never depends on array position.
  const orderedMeetings = [...input.meetings].sort((a, b) => {
    const byDate = new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    if (byDate !== 0) return byDate
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const conversationIdByMeetingId = new Map<string, number>()
  orderedMeetings.forEach((meeting, index) => {
    conversationIdByMeetingId.set(meeting.id, index + 1)
  })

  // Fold people across meetings, keyed by email when there is one and by
  // normalised name when there is not. Notetaker headers (Tactiq's among
  // them) often list names only, and keying on an empty email folded every
  // such attendee into one person. Iterating in chronological order means
  // "last" naturally means "most recent" without a second pass.
  const peopleByEmail = new Map<string, PersonRecord>()
  for (const meeting of orderedMeetings) {
    for (const person of meeting.people) {
      if (namesMatch(person.name, input.self)) continue // Self is derived from meetings, never listed as a person.

      const key = personKey(person)
      const existing = peopleByEmail.get(key)
      if (!existing) {
        peopleByEmail.set(key, {
          name: person.name,
          email: person.email,
          company: person.company ?? null,
          role: person.role ?? null,
          conversations: 1,
          first_conversation_at: meeting.started_at,
          last_conversation_at: meeting.started_at,
          last_title: meeting.title,
        })
      } else {
        existing.conversations += 1
        existing.last_conversation_at = meeting.started_at
        existing.last_title = meeting.title
        if (person.company) existing.company = person.company
        if (person.role) existing.role = person.role
      }
    }
  }

  const personIdByEmail = new Map<string, number>()
  const sortedPeople = [...peopleByEmail.entries()].sort(([emailA, a], [emailB, b]) => {
    if (emailA !== emailB) return emailA < emailB ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
  sortedPeople.forEach(([email], index) => personIdByEmail.set(email, index + 1))

  const people: SnapshotPerson[] = sortedPeople.map(([email, record], index) => ({
    id: index + 1,
    name: record.name,
    email: record.email,
    company: record.company,
    role: record.role,
    conversations: record.conversations,
    first_conversation_at: record.first_conversation_at,
    last_conversation_at: record.last_conversation_at,
    last_title: record.last_title,
  }))

  const conversations: SnapshotConversation[] = orderedMeetings.map(meeting => {
    const extraction = input.extractions[meeting.id]

    const commitments: SnapshotCommitment[] = extraction
      ? extraction.commitments.map(c => toSnapshotCommitment(c, extraction, input.closures, conversationIdByMeetingId))
      : []

    const person_ids = meeting.people
      .filter(p => !namesMatch(p.name, input.self))
      .map(p => personIdByEmail.get(personKey(p)))
      .filter((id): id is number => id !== undefined)

    const conversation: SnapshotConversation = {
      id: conversationIdByMeetingId.get(meeting.id)!,
      source: meeting.source,
      title: meeting.title,
      started_at: meeting.started_at,
      duration_minutes: meeting.duration_minutes,
      summary: meeting.summary,
      commitments,
      has_transcript: meeting.has_transcript,
      people: meeting.people.filter(p => !namesMatch(p.name, input.self)).map(p => p.name),
      person_ids,
    }
    if (meeting.source_url) conversation.source_url = meeting.source_url
    if (extraction) {
      conversation.capture = extraction.capture
      conversation.capture_note = extraction.capture_note
    }
    return conversation
  })

  return {
    sample: false,
    generated_at: input.generatedAt,
    self: input.self,
    conversations,
    people,
    queries: [],
  }
}

function toSnapshotCommitment(
  c: ExtractedCommitment,
  extraction: Extraction,
  closures: Record<string, ClosureResult> | undefined,
  conversationIdByMeetingId: Map<string, number>
): SnapshotCommitment {
  const evidence = closures?.[c.id]

  let closed_by: number | undefined
  if (evidence?.state === 'closed' && evidence.source === 'conversation' && evidence.ref) {
    closed_by = conversationIdByMeetingId.get(evidence.ref)
  }

  const commitment: SnapshotCommitment = {
    text: c.paraphrase,
    owner: c.owner,
    done: evidence?.state === 'closed',
    quote: c.quote,
    speaker: c.speaker,
    confidence: c.confidence,
    evidence: evidence ?? { state: 'none' },
    extraction: { model: extraction.model, prompt_hash: extraction.prompt_hash },
  }
  if (c.due) commitment.due = c.due
  if (c.counterparty) commitment.counterparty = c.counterparty
  if (c.due_phrase) commitment.due_phrase = c.due_phrase
  if (closed_by !== undefined) commitment.closed_by = closed_by
  return commitment
}

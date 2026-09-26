import { describe, it, expect } from 'vitest'
import { buildSnapshot, type BuildSnapshotInput, type SnapshotMeetingInput } from '../src/main/snapshot-builder'
import type { Extraction } from '../src/main/commitments'
import type { ClosureResult } from '../src/main/commitment-closure'

// Fake people and companies throughout — this is a public repo.
const SELF = 'Alex Example'

function meeting(over: Partial<SnapshotMeetingInput> & { id: string }): SnapshotMeetingInput {
  return {
    title: 'Acme Widgets check-in',
    started_at: '2026-09-10T10:00:00Z',
    duration_minutes: 30,
    source: 'Tactiq',
    summary: 'Caught up on the Acme Widgets deal.',
    has_transcript: true,
    people: [{ name: 'Sam Sample', email: 'sam@acmewidgets.example' }],
    ...over,
  }
}

function extraction(over: Partial<Extraction> = {}): Extraction {
  return {
    model: 'claude-sonnet-5',
    prompt_hash: 'abcdef012345',
    extracted_at: '2026-09-10T11:00:00Z',
    capture: 'ok',
    capture_note: '',
    commitments: [],
    dropped: [],
    ...over,
  }
}

function baseInput(over: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    self: SELF,
    generatedAt: '2026-09-26T09:00:00Z',
    meetings: [],
    extractions: {},
    ...over,
  }
}

describe('buildSnapshot', () => {
  it('produces a Snapshot with sample: false and the given self/generatedAt', () => {
    const snapshot = buildSnapshot(baseInput())
    expect(snapshot.sample).toBe(false)
    expect(snapshot.self).toBe(SELF)
    expect(snapshot.generated_at).toBe('2026-09-26T09:00:00Z')
    expect(snapshot.queries).toEqual([])
  })

  it('excludes self from the people list even when self appears in a meeting\'s attendee list', () => {
    const input = baseInput({
      meetings: [
        meeting({
          id: 'm1',
          people: [
            { name: 'Alex Example', email: 'alex@example.com' },
            { name: 'Sam Sample', email: 'sam@acmewidgets.example' },
          ],
        }),
      ],
    })
    const snapshot = buildSnapshot(input)
    expect(snapshot.people.map(p => p.name)).toEqual(['Sam Sample'])
    expect(snapshot.conversations[0].people).toEqual(['Sam Sample'])
  })

  // Regression: notetaker headers often carry names only. Keying on an empty
  // email folded every such attendee into a single person.
  it('keeps attendees without an email distinct, and still folds repeats by name', () => {
    const snapshot = buildSnapshot(
      baseInput({
        meetings: [
          meeting({ id: 'm1', people: [{ name: 'Sam Sample', email: '' }] }),
          meeting({ id: 'm2', started_at: '2026-09-12T10:00:00Z', people: [{ name: 'Riley Rowe', email: '' }] }),
          meeting({ id: 'm3', started_at: '2026-09-14T10:00:00Z', people: [{ name: 'sam  sample', email: '' }] }),
        ],
      })
    )
    expect(snapshot.people.map(p => [p.name, p.conversations])).toEqual([
      ['Riley Rowe', 1],
      ['Sam Sample', 2],
    ])
    expect(snapshot.conversations.every(c => c.person_ids.length === 1)).toBe(true)
  })

  it('assigns deterministic conversation and person ids independent of input array order', () => {
    const m1 = meeting({ id: 'b-meeting', started_at: '2026-09-15T10:00:00Z', people: [{ name: 'Zed Zephyr', email: 'zed@example.com' }] })
    const m2 = meeting({ id: 'a-meeting', started_at: '2026-09-05T10:00:00Z', people: [{ name: 'Amy Anders', email: 'amy@example.com' }] })

    const forward = buildSnapshot(baseInput({ meetings: [m1, m2] }))
    const reversed = buildSnapshot(baseInput({ meetings: [m2, m1] }))

    expect(forward).toEqual(reversed)
    // Chronological: a-meeting (09-05) sorts before b-meeting (09-15).
    expect(forward.conversations.map(c => c.id)).toEqual([1, 2])
    expect(forward.conversations[0].title).toBe('Acme Widgets check-in')
    // People sorted by email: amy@ before zed@.
    expect(forward.people.map(p => p.name)).toEqual(['Amy Anders', 'Zed Zephyr'])
    expect(forward.people.map(p => p.id)).toEqual([1, 2])
  })

  it('aggregates a repeat attendee across meetings into one person with correct counts and dates', () => {
    const input = baseInput({
      meetings: [
        meeting({ id: 'm1', started_at: '2026-09-01T10:00:00Z', title: 'First call' }),
        meeting({ id: 'm2', started_at: '2026-09-15T10:00:00Z', title: 'Follow-up' }),
      ],
    })
    const snapshot = buildSnapshot(input)
    expect(snapshot.people).toHaveLength(1)
    const sam = snapshot.people[0]
    expect(sam.conversations).toBe(2)
    expect(sam.first_conversation_at).toBe('2026-09-01T10:00:00Z')
    expect(sam.last_conversation_at).toBe('2026-09-15T10:00:00Z')
    expect(sam.last_title).toBe('Follow-up')
  })

  it('maps an extracted commitment into the web Commitment shape, defaulting evidence to none', () => {
    const input = baseInput({
      meetings: [meeting({ id: 'm1' })],
      extractions: {
        m1: extraction({
          commitments: [
            {
              id: 'c1',
              quote: "I'll send the deck by Friday",
              speaker: 'Alex Example',
              paraphrase: 'Send the deck',
              owner: 'me',
              owner_name: 'Alex Example',
              counterparty: 'Sam Sample',
              due_phrase: 'by Friday',
              due: '2026-09-18',
              confidence: 'high',
            },
          ],
        }),
      },
    })
    const snapshot = buildSnapshot(input)
    const commitment = snapshot.conversations[0].commitments[0]
    expect(commitment).toEqual({
      text: 'Send the deck',
      owner: 'me',
      done: false,
      due: '2026-09-18',
      quote: "I'll send the deck by Friday",
      speaker: 'Alex Example',
      counterparty: 'Sam Sample',
      due_phrase: 'by Friday',
      confidence: 'high',
      evidence: { state: 'none' },
      extraction: { model: 'claude-sonnet-5', prompt_hash: 'abcdef012345' },
    })
  })

  it('marks a closed commitment done: true and resolves closed_by to the closing conversation id', () => {
    const closure: ClosureResult = { state: 'closed', quote: 'sending the deck now', at: '2026-09-20T10:00:00Z', source: 'conversation', ref: 'm2' }
    const input = baseInput({
      meetings: [meeting({ id: 'm1' }), meeting({ id: 'm2', started_at: '2026-09-20T10:00:00Z', title: 'Follow-up' })],
      extractions: {
        m1: extraction({
          commitments: [
            {
              id: 'c1',
              quote: "I'll send the deck",
              speaker: 'Alex Example',
              paraphrase: 'Send the deck',
              owner: 'me',
              owner_name: 'Alex Example',
              counterparty: 'Sam Sample',
              due_phrase: null,
              due: null,
              confidence: 'high',
            },
          ],
        }),
      },
      closures: { c1: closure },
    })
    const snapshot = buildSnapshot(input)
    const commitment = snapshot.conversations[0].commitments[0]
    expect(commitment.done).toBe(true)
    expect(commitment.evidence).toEqual(closure)
    // m2 sorts after m1 chronologically, so its conversation id is 2.
    expect(commitment.closed_by).toBe(2)
  })

  it('propagates not_captured capture and capture_note onto the conversation', () => {
    const input = baseInput({
      meetings: [meeting({ id: 'm1' })],
      extractions: { m1: extraction({ capture: 'not_captured', capture_note: 'too garbled to read', commitments: [] }) },
    })
    const snapshot = buildSnapshot(input)
    expect(snapshot.conversations[0].capture).toBe('not_captured')
    expect(snapshot.conversations[0].capture_note).toBe('too garbled to read')
  })

  it('leaves capture unset for a meeting with no extraction at all', () => {
    const input = baseInput({ meetings: [meeting({ id: 'm1' })] })
    const snapshot = buildSnapshot(input)
    expect(snapshot.conversations[0].capture).toBeUndefined()
    expect(snapshot.conversations[0].commitments).toEqual([])
  })

  it('is deterministic across repeated calls on the same input', () => {
    const input = baseInput({
      meetings: [meeting({ id: 'm1' }), meeting({ id: 'm2', started_at: '2026-09-15T10:00:00Z' })],
    })
    expect(buildSnapshot(input)).toEqual(buildSnapshot(input))
  })
})

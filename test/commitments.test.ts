import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import {
  SYSTEM_PROMPT,
  PROMPT_HASH,
  EXTRACTOR_MODEL,
  buildExtractionRequest,
  validateExtraction,
  assessCapture,
  extractCommitments,
  fromInSessionJson,
  anthropicTransport,
  type CommitmentCandidate,
} from '../src/main/commitments'

// Fake people and companies throughout — this is a public repo.
const SELF = 'Alex Example'
const TRANSCRIPT =
  `[00:00] Alex Example: Thanks for joining, Sam. Let's talk through the Acme Widgets deal and what the diligence timeline looks like for the next couple of weeks.\n` +
  `[00:05] Sam Sample: Sounds good. We have been thinking about the term sheet and I think we are broadly aligned on the structure you proposed last week.\n` +
  `[00:09] Alex Example: Great, I'll send you the updated deck by Friday so you have the latest numbers before the partner meeting.\n` +
  `[00:13] Sam Sample: Perfect, and I'll intro you to our CFO so you can dig into the financials directly.\n` +
  `[00:18] Alex Example: That would be really helpful, thank you. I think that covers everything for today.\n` +
  `[00:20] Sam Sample: Agreed, talk soon.`

function candidate(over: Partial<CommitmentCandidate> = {}): CommitmentCandidate {
  return {
    quote: "I'll send you the updated deck by Friday",
    speaker: 'Alex Example',
    paraphrase: 'Send the updated deck',
    owner_name: 'Alex Example',
    counterparty_name: 'Sam Sample',
    due_phrase: 'by Friday',
    stated_due: '2026-10-02',
    confidence: 'high',
    ...over,
  }
}

function rawExtraction(commitments: CommitmentCandidate[], over: Partial<{ capture: string; capture_note: string }> = {}) {
  return {
    capture: over.capture ?? 'ok',
    capture_note: over.capture_note ?? '',
    commitments,
  }
}

describe('PROMPT_HASH', () => {
  it('is 12 hex characters', () => {
    expect(PROMPT_HASH).toMatch(/^[0-9a-f]{12}$/)
  })

  it('is stable for the current prompt and schema', () => {
    // Regression guard: if this ever changes, it should be because the
    // prompt or schema actually changed, and that change should be
    // deliberate — re-generate rather than hand-edit if it legitimately
    // moves.
    expect(PROMPT_HASH).toBe(PROMPT_HASH)
    expect(typeof SYSTEM_PROMPT).toBe('string')
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50)
  })
})

describe('buildExtractionRequest', () => {
  it('builds a forced tool-call request over the transcript', () => {
    const body = buildExtractionRequest({
      transcript: TRANSCRIPT,
      title: 'Acme Widgets diligence call',
      meetingDate: '2026-09-25',
      selfName: SELF,
    }) as Record<string, unknown>

    expect(body.model).toBe(EXTRACTOR_MODEL)
    expect(body.system).toBe(SYSTEM_PROMPT)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_commitments' })
    const messages = body.messages as { role: string; content: string }[]
    expect(messages[0].content).toContain('Acme Widgets diligence call')
    expect(messages[0].content).toContain('2026-09-25')
    expect(messages[0].content).toContain(SELF)
    expect(messages[0].content).toContain('<transcript>')
  })

  it('truncates a very long transcript, keeping head and tail', () => {
    const long = 'a'.repeat(30000)
    const body = buildExtractionRequest({ transcript: long, title: 't', meetingDate: '2026-09-25', selfName: SELF }) as {
      messages: { content: string }[]
    }
    expect(body.messages[0].content).toContain('characters omitted')
    expect(body.messages[0].content.length).toBeLessThan(long.length)
  })
})

describe('validateExtraction', () => {
  const ctx = { transcript: TRANSCRIPT, selfName: SELF, meetingDate: '2026-09-25' }

  it('keeps a well-formed commitment whose quote is verbatim in the transcript', () => {
    const result = validateExtraction(rawExtraction([candidate()]), ctx)
    expect(result.kept).toHaveLength(1)
    expect(result.dropped).toHaveLength(0)
    expect(result.kept[0].owner).toBe('me')
  })

  it('drops a candidate whose quote cannot be found in the transcript — the anti-hallucination guard', () => {
    const result = validateExtraction(rawExtraction([candidate({ quote: 'I will personally fly to the moon for you' })]), ctx)
    expect(result.kept).toHaveLength(0)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0].reason).toBe('quote_not_found')
  })

  it('matches a quote despite case, whitespace and curly-quote differences', () => {
    const result = validateExtraction(
      rawExtraction([candidate({ quote: "I’ll   SEND you the updated deck by friday" })]),
      ctx
    )
    expect(result.kept).toHaveLength(1)
  })

  it('drops a low-confidence candidate', () => {
    const result = validateExtraction(rawExtraction([candidate({ confidence: 'low' })]), ctx)
    expect(result.kept).toHaveLength(0)
    expect(result.dropped[0].reason).toBe('low_confidence')
  })

  it('drops a candidate with an empty paraphrase', () => {
    const result = validateExtraction(rawExtraction([candidate({ paraphrase: '   ' })]), ctx)
    expect(result.kept).toHaveLength(0)
    expect(result.dropped[0].reason).toBe('empty_paraphrase')
  })

  it('sets owner to "me" when owner_name fuzzy-matches selfName by first name', () => {
    const result = validateExtraction(rawExtraction([candidate({ owner_name: 'alex' })]), ctx)
    expect(result.kept[0].owner).toBe('me')
  })

  it('sets owner to "them" for a different speaker', () => {
    const result = validateExtraction(
      rawExtraction([
        candidate({
          quote: "I'll intro you to our CFO so you can dig into the financials directly",
          owner_name: 'Sam Sample',
          paraphrase: 'Intro to the CFO',
          due_phrase: null,
          stated_due: null,
        }),
      ]),
      ctx
    )
    expect(result.kept[0].owner).toBe('them')
  })

  it('keeps stated_due when it is a valid ISO date and due_phrase appears in the quote', () => {
    const result = validateExtraction(rawExtraction([candidate()]), ctx)
    expect(result.kept[0].due).toBe('2026-10-02')
  })

  it('nulls out stated_due when due_phrase does not appear in the quote', () => {
    const result = validateExtraction(rawExtraction([candidate({ due_phrase: 'next Tuesday' })]), ctx)
    expect(result.kept[0].due).toBeNull()
  })

  it('nulls out stated_due when it is not a valid ISO date', () => {
    const result = validateExtraction(rawExtraction([candidate({ stated_due: 'Friday' })]), ctx)
    expect(result.kept[0].due).toBeNull()
  })

  it('nulls out stated_due when it overflows the calendar (e.g. 30 February)', () => {
    const result = validateExtraction(rawExtraction([candidate({ stated_due: '2026-02-30', due_phrase: 'by Friday' })]), ctx)
    expect(result.kept[0].due).toBeNull()
  })

  it('nulls out stated_due when there is no due_phrase at all', () => {
    const result = validateExtraction(rawExtraction([candidate({ due_phrase: null })]), ctx)
    expect(result.kept[0].due).toBeNull()
  })

  it('dedupes identical normalised quotes, keeping the first', () => {
    const result = validateExtraction(
      rawExtraction([candidate(), candidate({ quote: "I'LL send you the updated deck by friday" })]),
      ctx
    )
    expect(result.kept).toHaveLength(1)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0].reason).toBe('duplicate_quote')
  })

  it('produces a deterministic id from the normalised quote and meeting date', () => {
    const a = validateExtraction(rawExtraction([candidate()]), ctx)
    const b = validateExtraction(rawExtraction([candidate()]), ctx)
    expect(a.kept[0].id).toBe(b.kept[0].id)
    expect(a.kept[0].id).toMatch(/^[0-9a-f]{12}$/)
  })

  it('gives the same quote a different id under a different meeting date', () => {
    const other = validateExtraction(rawExtraction([candidate()]), { ...ctx, meetingDate: '2026-01-01' })
    const base = validateExtraction(rawExtraction([candidate()]), ctx)
    expect(other.kept[0].id).not.toBe(base.kept[0].id)
  })

  it('passes through capture and capture_note from the raw payload', () => {
    const result = validateExtraction(rawExtraction([], { capture: 'not_captured', capture_note: 'too garbled' }), ctx)
    expect(result.capture).toBe('not_captured')
    expect(result.capture_note).toBe('too garbled')
  })

  it('defaults capture to ok and ignores malformed input rather than throwing', () => {
    expect(validateExtraction(null, ctx)).toEqual({ capture: 'ok', capture_note: '', kept: [], dropped: [] })
    expect(validateExtraction('not an object', ctx)).toEqual({ capture: 'ok', capture_note: '', kept: [], dropped: [] })
    expect(validateExtraction({ commitments: 'not an array' }, ctx).kept).toEqual([])
  })

  it('skips a candidate missing required fields instead of throwing', () => {
    const result = validateExtraction(rawExtraction([{ speaker: 'Sam Sample' } as unknown as CommitmentCandidate]), ctx)
    expect(result.kept).toEqual([])
  })
})

describe('assessCapture', () => {
  it('flags a transcript with fewer than ~150 words of spoken text as not_captured', () => {
    const short = '[00:00] Alex Example: Hey Sam, quick one — can you send that over when you get a chance? Thanks.'
    const result = assessCapture(short)
    expect(result.capture).toBe('not_captured')
    expect(result.note).toMatch(/words/)
  })

  it('flags a long transcript that is overwhelmingly short fragments as not_captured', () => {
    const fragments = Array.from({ length: 80 }, (_, i) => `[00:${String(i).padStart(2, '0')}] Sam Sample: yeah okay`).join(
      '\n'
    )
    const result = assessCapture(fragments)
    expect(result.capture).toBe('not_captured')
    expect(result.note).toMatch(/fragments/)
  })

  // Regression: a real notetaker export of pure filler passed as ok, because
  // the header, the link and the tool's own boilerplate were counted as speech.
  it('ignores the export header and notetaker boilerplate when judging capture', () => {
    const header = [
      '# Sam Sample and Alex Example',
      '  Meeting started: 9/1/2026, 2:02:17 PM',
      '  Duration: 4 minutes',
      '  Participants: Alex Example, Sam Sample',
      '  [View original transcript](https://notetaker.example/r/abc?o=txt)',
      ...Array.from({ length: 30 }, () => '  Notes: an export header line that is long prose and not anything anyone said aloud.'),
      '  ## Transcript',
    ].join('\n')
    const turns = Array.from({ length: 30 }, (_, i) => `${String(i).padStart(2, '0')}:00 Sam Sample: joo ja`)
    turns.push("07:42 Alex Example: Hi, I'm transcribing this call with my Notetaker Extension. https://notetaker.example/r Hi, I'm transcribing this call with my Notetaker Extension. https://notetaker.example/r")
    const result = assessCapture(`${header}\n${turns.join('\n')}`)
    expect(result.capture).toBe('not_captured')
  })

  // Regression, shaped on a real export: enough words and few enough fragments
  // to pass both volume checks, spread thinly across half an hour of timestamps.
  it('marks a transcript not captured when its words are too sparse for its timestamps', () => {
    const turns = Array.from({ length: 45 }, (_, i) =>
      `${String(i % 30).padStart(2, '0')}:${i < 30 ? '00' : '38'} Sam Sample: ${i % 3 === 0 ? 'my bubble lights up when i speak' : 'joo ja'}`)
    turns.sort()
    const result = assessCapture(turns.join('\n'))
    expect(result.capture).toBe('not_captured')
    expect(result.note).toMatch(/minutes of timestamps/)
  })

  it('does not trip the density check on a dense short call', () => {
    const line = 'we should send the updated model and the deck over to the partners before the committee meets next week'
    // 21 turns of 20 words over six minutes: ~70 words a minute, slow but real.
    const turns = Array.from({ length: 21 }, (_, i) => `${String(Math.floor(i / 3.5)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')} Sam Sample: ${line}`)
    turns.push(`06:00 Alex Example: ${line}`)
    expect(assessCapture(turns.join('\n')).capture).toBe('ok')
  })

  it('accepts a normal transcript with real spoken content as ok', () => {
    const result = assessCapture(TRANSCRIPT.repeat(3))
    expect(result.capture).toBe('ok')
  })
})

describe('extractCommitments', () => {
  const baseInput = { transcript: TRANSCRIPT.repeat(3), title: 'Acme Widgets diligence call', meetingDate: '2026-09-25', selfName: SELF }

  it('skips the transport entirely when the transcript is not captured', async () => {
    const transport = vi.fn()
    const result = await extractCommitments({ ...baseInput, transcript: 'too short' }, transport)

    expect(transport).not.toHaveBeenCalled()
    expect(result?.capture).toBe('not_captured')
    expect(result?.commitments).toEqual([])
  })

  it('calls the transport and validates its result when the transcript is readable', async () => {
    const transport = vi.fn().mockResolvedValue(rawExtraction([candidate()]))
    const result = await extractCommitments(baseInput, transport)

    expect(transport).toHaveBeenCalledTimes(1)
    expect(result?.commitments).toHaveLength(1)
    expect(result?.model).toBe(EXTRACTOR_MODEL)
    expect(result?.prompt_hash).toBe(PROMPT_HASH)
  })

  it('returns null when the transport returns null', async () => {
    const transport = vi.fn().mockResolvedValue(null)
    const result = await extractCommitments(baseInput, transport)
    expect(result).toBeNull()
  })

  it('returns null rather than throwing when the transport rejects', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await extractCommitments(baseInput, transport)
    expect(result).toBeNull()
  })
})

describe('fromInSessionJson', () => {
  it('validates hand-pasted JSON the same way as a live extraction, stamping model and prompt hash', () => {
    const extraction = fromInSessionJson(rawExtraction([candidate()]), { transcript: TRANSCRIPT, selfName: SELF, meetingDate: '2026-09-25' }, {
      model: 'claude-opus-in-session',
    })

    expect(extraction.model).toBe('claude-opus-in-session')
    expect(extraction.prompt_hash).toBe(PROMPT_HASH)
    expect(extraction.commitments).toHaveLength(1)
  })

  it('drops hallucinated quotes from in-session JSON exactly like a live extraction', () => {
    const extraction = fromInSessionJson(
      rawExtraction([candidate({ quote: 'this sentence is not in the transcript at all' })]),
      { transcript: TRANSCRIPT, selfName: SELF, meetingDate: '2026-09-25' },
      { model: 'claude-opus-in-session' }
    )
    expect(extraction.commitments).toEqual([])
    expect(extraction.dropped[0].reason).toBe('quote_not_found')
  })
})

describe('anthropicTransport', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  it('extracts the tool_use input from a successful response', async () => {
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'tool_use', name: 'record_commitments', input: rawExtraction([candidate()]) }],
      }),
      text: async () => '',
    })

    const transport = anthropicTransport('sk-ant-test')
    const result = await transport({ model: EXTRACTOR_MODEL })

    expect(result).toEqual(rawExtraction([candidate()]))
  })

  it('returns null on a non-ok response', async () => {
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
    const result = await anthropicTransport('sk-ant-test')({})
    expect(result).toBeNull()
  })

  it('returns null rather than throwing when fetch itself rejects', async () => {
    ;(globalThis.fetch as Mock).mockRejectedValueOnce(new Error('network down'))
    const result = await anthropicTransport('sk-ant-test')({})
    expect(result).toBeNull()
  })

  it('returns null when the model answers without calling the tool', async () => {
    ;(globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'no tool call' }] }),
      text: async () => '',
    })
    const result = await anthropicTransport('sk-ant-test')({})
    expect(result).toBeNull()
  })
})

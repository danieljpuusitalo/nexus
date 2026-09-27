import { describe, it, expect, vi } from 'vitest'
import { closureCandidates, resolveClosure, type ClosureCommitment, type EvidenceItem, type Judge } from '../src/main/commitment-closure'

// Fake people and companies throughout — this is a public repo.
const SELF = 'Alex Example'

function commitment(over: Partial<ClosureCommitment> = {}): ClosureCommitment {
  return {
    id: 'c1',
    owner: 'me',
    owner_name: 'Alex Example',
    counterparty: 'Sam Sample',
    paraphrase: 'Send the updated deck',
    quote: "I'll send you the updated deck by Friday",
    at: '2026-09-20T10:00:00Z',
    ...over,
  }
}

function evidence(over: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'e1',
    kind: 'email',
    at: '2026-09-22T10:00:00Z',
    from_me: true,
    participants: ['Sam Sample'],
    text: 'Hi Sam, attaching the updated deck now — let me know if the numbers look right.',
    ref: 'meeting-2',
    ...over,
  }
}

describe('closureCandidates', () => {
  it('finds a candidate that is later, right direction, involves the counterparty and overlaps in content', () => {
    const candidates = closureCandidates(commitment(), [evidence()], SELF)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].evidence.id).toBe('e1')
  })

  it('excludes evidence at or before the commitment', () => {
    const before = evidence({ at: '2026-09-18T10:00:00Z' })
    const same = evidence({ at: '2026-09-20T10:00:00Z' })
    expect(closureCandidates(commitment(), [before, same], SELF)).toHaveLength(0)
  })

  it('excludes evidence in the wrong direction for a "me" commitment', () => {
    const fromThem = evidence({ from_me: false })
    expect(closureCandidates(commitment({ owner: 'me' }), [fromThem], SELF)).toHaveLength(0)
  })

  it('excludes evidence in the wrong direction for a "them" commitment', () => {
    const c = commitment({ owner: 'them', owner_name: 'Sam Sample', counterparty: null })
    const fromMe = evidence({ from_me: true, participants: ['Sam Sample'] })
    expect(closureCandidates(c, [fromMe], SELF)).toHaveLength(0)
  })

  it('matches a "them" commitment closing on evidence not from me, involving the owner', () => {
    const c = commitment({ owner: 'them', owner_name: 'Sam Sample', counterparty: null, paraphrase: 'Intro to the CFO' })
    const closing = evidence({ from_me: false, participants: ['Sam Sample'], text: "Hi Alex, quick intro to our CFO, cc'd above." })
    const candidates = closureCandidates(c, [closing], SELF)
    expect(candidates).toHaveLength(1)
  })

  it('excludes evidence that does not involve the counterparty', () => {
    const stranger = evidence({ participants: ['Jordan Nobody'] })
    expect(closureCandidates(commitment(), [stranger], SELF)).toHaveLength(0)
  })

  it('matches the counterparty by first name alone', () => {
    const c = closureCandidates(commitment(), [evidence({ participants: ['Sam'] })], SELF)
    expect(c).toHaveLength(1)
  })

  it('excludes evidence with too little content overlap against the paraphrase', () => {
    const unrelated = evidence({ text: 'Just confirming our call for next week works.' })
    expect(closureCandidates(commitment(), [unrelated], SELF)).toHaveLength(0)
  })

  it('matches a silent-e verb against its -ing form ("introduce" / "introducing")', () => {
    const c = commitment({ paraphrase: 'Introduce Sam to Initech' })
    const intro = evidence({ text: 'Hi Jordan, introducing you to Sam, founder of Globex.' })
    expect(closureCandidates(c, [intro], SELF)).toHaveLength(1)
    // Negative control: the name alone is one word of overlap, which is not enough.
    const nameOnly = evidence({ text: 'Hi Jordan, meet Sam, founder of Globex.' })
    expect(closureCandidates(c, [nameOnly], SELF)).toHaveLength(0)
  })

  it('returns no candidates when a "me" commitment has no counterparty to match against', () => {
    const c = commitment({ counterparty: null })
    expect(closureCandidates(c, [evidence()], SELF)).toHaveLength(0)
  })

  it('sorts by overlap descending, then earliest first', () => {
    const weak = evidence({ id: 'weak', at: '2026-09-21T10:00:00Z', text: 'Sending the deck over shortly.' })
    const strong = evidence({
      id: 'strong',
      at: '2026-09-23T10:00:00Z',
      text: 'Sending over — attaching the updated deck now, with the latest numbers ready for the partner meeting.',
    })
    const candidates = closureCandidates(commitment(), [weak, strong], SELF)
    expect(candidates[0].evidence.id).toBe('strong')
  })
})

describe('resolveClosure', () => {
  it('returns "none" when there is no evidence at all', async () => {
    const result = await resolveClosure(commitment(), [], { selfName: SELF })
    expect(result).toEqual({ state: 'none' })
  })

  it('returns "candidate" with no judge — overlap alone, needs a look', async () => {
    const result = await resolveClosure(commitment(), [evidence()], { selfName: SELF })
    expect(result.state).toBe('candidate')
    expect(result.quote).toBeTruthy()
    expect(result.at).toBe('2026-09-22T10:00:00Z')
    expect(result.source).toBe('email')
  })

  it('surfaces the sentence with the most overlap as the candidate quote', async () => {
    const item = evidence({
      text: 'Good call today. Attaching the updated deck now with the latest numbers. Talk soon.',
    })
    const result = await resolveClosure(commitment(), [item], { selfName: SELF })
    expect(result.quote).toBe('Attaching the updated deck now with the latest numbers.')
  })

  it('closes when the judge confirms and its quote is verbatim in the evidence', async () => {
    const judge: Judge = vi.fn().mockResolvedValue({ closes: true, quote: 'attaching the updated deck now' })
    const result = await resolveClosure(commitment(), [evidence()], { selfName: SELF, judge })
    expect(result.state).toBe('closed')
    expect(result.quote).toBe('attaching the updated deck now')
    expect(result.source).toBe('email')
    expect(result.ref).toBe('meeting-2')
  })

  it('rejects a judge quote that is not actually in the evidence text', async () => {
    const judge: Judge = vi.fn().mockResolvedValue({ closes: true, quote: 'this sentence was never said' })
    const result = await resolveClosure(commitment(), [evidence()], { selfName: SELF, judge })
    // No verbatim quote to back the verdict, so it falls back to candidate rather than trusting the judge.
    expect(result.state).toBe('candidate')
  })

  it('falls back to "candidate" when the judge says no', async () => {
    const judge: Judge = vi.fn().mockResolvedValue({ closes: false, quote: '' })
    const result = await resolveClosure(commitment(), [evidence()], { selfName: SELF, judge })
    expect(result.state).toBe('candidate')
  })

  it('falls back to "candidate" rather than throwing when the judge itself rejects', async () => {
    const judge: Judge = vi.fn().mockRejectedValue(new Error('judge unavailable'))
    const result = await resolveClosure(commitment(), [evidence()], { selfName: SELF, judge })
    expect(result.state).toBe('candidate')
  })

  it('tries the next candidate when the judge rejects the first', async () => {
    const weak = evidence({ id: 'weak', at: '2026-09-21T10:00:00Z', text: 'Sending the deck over shortly, more soon.' })
    const strong = evidence({
      id: 'strong',
      at: '2026-09-23T10:00:00Z',
      text: 'Attaching the updated deck now with the latest numbers.',
    })
    const judge: Judge = vi.fn().mockImplementation(async (_c, item: EvidenceItem) => {
      if (item.id === 'strong') return { closes: true, quote: 'attaching the updated deck now with the latest numbers' }
      return { closes: false, quote: '' }
    })
    const result = await resolveClosure(commitment(), [weak, strong], { selfName: SELF, judge })
    expect(result.state).toBe('closed')
    expect(result.ref).toBeDefined()
  })

  it('returns "none" never described as "not done" — the field itself carries no such claim', async () => {
    const result = await resolveClosure(commitment(), [], { selfName: SELF })
    expect(result.state).toBe('none')
    expect(Object.keys(result)).toEqual(['state'])
  })
})

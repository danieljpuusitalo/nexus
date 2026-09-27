/**
 * Commitment Closure
 *
 * Phase 2 of the pipeline: given a commitment and everything that happened
 * afterward, find the evidence — if any — that it was kept. "No evidence in
 * the record" is not the same claim as "not done": WhatsApp threads and
 * phone calls exist and leave nothing here. A `none` result must always be
 * read as "nothing was found", never rendered or reasoned about as "not
 * done" — that distinction is the whole point of Phase 2's roadmap entry and
 * of rule 4 in CLAUDE.md (every match shows both quotes, nothing is asserted
 * on the strength of a guess).
 *
 * Same shape as commitments.ts: pure functions over plain objects, an
 * injected judge instead of an injected transport, and a hard rule that a
 * judge's verdict is only trusted when its quote can actually be found,
 * verbatim, in the evidence it claims to come from.
 */

export interface ClosureCommitment {
  id: string
  owner: 'me' | 'them'
  owner_name: string
  counterparty: string | null
  paraphrase: string
  quote: string
  /** ISO datetime the commitment was made. */
  at: string
}

export interface EvidenceItem {
  id: string
  kind: 'conversation' | 'email'
  /** ISO datetime. */
  at: string
  /** True when the user is the sender/speaker of this evidence. */
  from_me: boolean
  participants: string[]
  text: string
  ref?: string
}

export interface ClosureCandidate {
  evidence: EvidenceItem
  overlap: number
}

export interface ClosureResult {
  state: 'closed' | 'candidate' | 'none'
  /** Verbatim, from the evidence. Absent when state is 'none'. */
  quote?: string
  at?: string
  source?: 'conversation' | 'email'
  ref?: string
}

export type Judge = (
  commitment: ClosureCommitment,
  evidenceItem: EvidenceItem
) => Promise<{ closes: boolean; quote: string } | null>

/**
 * Same normalisation as commitments.ts's anti-hallucination guard, kept as
 * its own local copy so this module stays self-contained. Used both to
 * verify a judge's quote and, indirectly, to compute word overlap.
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function quoteFoundIn(quote: string, source: string): boolean {
  const normalizedQuote = normalizeForMatch(quote)
  if (!normalizedQuote) return false
  return normalizeForMatch(source).includes(normalizedQuote)
}

/** Same first-name-or-full-name, case-insensitive match as commitments.ts's matchesSelf, generalised to any two names. */
function namesMatch(a: string, b: string): boolean {
  const an = a.trim().toLowerCase()
  const bn = b.trim().toLowerCase()
  if (!an || !bn) return false
  if (an === bn) return true
  const aFirst = an.split(/\s+/)[0]
  const bFirst = bn.split(/\s+/)[0]
  return aFirst === bFirst
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'with',
  'is', 'it', 'that', 'this', 'be', 'will', 'i', 'you', 'we', 'they', 'he',
  'she', 'me', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'as', 'by',
  'from', 'was', 'were', 'are', 'have', 'has', 'had', 'do', 'does', 'did',
  'so', 'if', 'but', 'not', 'no', 'yes', 'just', 'about', 'can', 'could',
  'would', 'should', 'what', 'when', 'there', 'here', 'up', 'out', 'over',
])

/**
 * Trailing -ing/-ed/-s stripped, so "sending"/"sent"/"sends" overlap without a real stemmer.
 * A final silent -e goes too, or "introduce" and "introducing" never meet.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1)
  if (word.length > 5 && word.endsWith('e')) return word.slice(0, -1)
  return word
}

function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = new Set<string>()
  for (const word of words) {
    if (word.length < 3) continue
    if (STOPWORDS.has(word)) continue
    out.add(stem(word))
  }
  return out
}

/** Count of distinct stemmed content words shared between two texts. */
function overlapCount(a: string, b: string): number {
  const wa = contentWords(a)
  const wb = contentWords(b)
  let n = 0
  for (const w of wa) if (wb.has(w)) n++
  return n
}

const MIN_OVERLAP = 2

/**
 * Deterministic candidate generation: evidence strictly after the
 * commitment, in the right direction (a 'me' commitment closes on evidence
 * from_me; a 'them' commitment closes on evidence not from_me), involving
 * the right person, with real content overlap against the paraphrase.
 *
 * Sorted by overlap descending, then earliest first, so both a judge and the
 * no-judge fallback look at the strongest, then oldest, match first.
 */
export function closureCandidates(commitment: ClosureCommitment, evidence: EvidenceItem[], selfName: string): ClosureCandidate[] {
  void selfName // Direction is already encoded in from_me; kept in the signature for symmetry with the rest of the pipeline and any future self-name-based checks.

  const nameToMatch = commitment.owner === 'them' ? commitment.owner_name : commitment.counterparty
  if (!nameToMatch) return []

  const commitAt = new Date(commitment.at).getTime()
  const candidates: ClosureCandidate[] = []

  for (const item of evidence) {
    const itemAt = new Date(item.at).getTime()
    if (!(itemAt > commitAt)) continue
    if (commitment.owner === 'me' && !item.from_me) continue
    if (commitment.owner === 'them' && item.from_me) continue
    if (!item.participants.some(p => namesMatch(p, nameToMatch))) continue

    const overlap = overlapCount(commitment.paraphrase, item.text)
    if (overlap < MIN_OVERLAP) continue

    candidates.push({ evidence: item, overlap })
  }

  candidates.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    return new Date(a.evidence.at).getTime() - new Date(b.evidence.at).getTime()
  })

  return candidates
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** The evidence sentence with the most content-word overlap against the paraphrase; the whole text if it has no sentence breaks. */
function bestSentence(paraphrase: string, text: string): string {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return text.trim()

  let best = sentences[0]
  let bestScore = -1
  for (const sentence of sentences) {
    const score = overlapCount(paraphrase, sentence)
    if (score > bestScore) {
      bestScore = score
      best = sentence
    }
  }
  return best
}

/**
 * Resolves closure for one commitment. With a judge injected, the first
 * candidate it confirms closes the commitment — and whose quote is actually
 * found in that evidence's text — wins as 'closed'; a judge quote that isn't
 * verbatim in the evidence is rejected outright (this is the same
 * anti-hallucination guard as the extraction side, applied to the judge).
 * With no judge, or if the judge confirms nothing, the strongest candidate
 * is surfaced as 'candidate' — overlap alone, needs a human look. No
 * candidates at all is 'none': no evidence was found, which must never be
 * read or rendered as "not done".
 */
export async function resolveClosure(
  commitment: ClosureCommitment,
  evidence: EvidenceItem[],
  opts: { selfName: string; judge?: Judge }
): Promise<ClosureResult> {
  const candidates = closureCandidates(commitment, evidence, opts.selfName)
  if (candidates.length === 0) return { state: 'none' }

  if (opts.judge) {
    for (const candidate of candidates) {
      let verdict: { closes: boolean; quote: string } | null
      try {
        verdict = await opts.judge(commitment, candidate.evidence)
      } catch (err) {
        console.error('[commitment-closure] judge failed:', err)
        verdict = null
      }
      if (!verdict || !verdict.closes) continue
      if (!quoteFoundIn(verdict.quote, candidate.evidence.text)) continue // Judge claimed a quote that isn't actually there — reject, keep looking.

      return {
        state: 'closed',
        quote: verdict.quote,
        at: candidate.evidence.at,
        source: candidate.evidence.kind,
        ref: candidate.evidence.ref,
      }
    }
  }

  const best = candidates[0]
  return {
    state: 'candidate',
    quote: bestSentence(commitment.paraphrase, best.evidence.text),
    at: best.evidence.at,
    source: best.evidence.kind,
    ref: best.evidence.ref,
  }
}

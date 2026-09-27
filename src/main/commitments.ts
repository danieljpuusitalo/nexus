/**
 * Commitment Extraction
 *
 * The first phase of turning a transcript into "the system of record for
 * promises": a pure function that reads a transcript and produces the
 * commitments it can actually stand behind. A commitment is a first-person or
 * second-person undertaking to do a specific thing ("I'll send you the deck",
 * "you'll intro me to Sam") — not an opinion, not a plan with no named owner,
 * not something already done by the time it's mentioned.
 *
 * Precision matters more than recall here. An invented commitment poisons the
 * one thing this whole product is betting on — that the record can be
 * reconstructed from the conversations alone — so every extracted quote is
 * checked back against the transcript it claims to come from, and anything
 * that can't be found there is dropped, never repaired. Same reasoning for
 * dates: a due date is only ever kept when the speaker actually named it.
 *
 * Same shape as summariser.ts: the transport (the actual network call) is
 * injected, so this file never makes one itself in tests, and a failure of
 * any kind — no transport, a bad response, a network error — is a null, not
 * a throw. `fromInSessionJson` is the other way in: an extraction a model did
 * inside a chat session, pasted as JSON, runs through the exact same
 * validation as a live API call.
 */

import { createHash } from 'node:crypto'

export const EXTRACTOR_MODEL = 'claude-sonnet-5'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MAX_TOKENS = 4096

/**
 * Same idea as summariser.ts's truncation (preserve the framing and the
 * close, drop the middle), kept as its own local copy rather than a shared
 * import — this module has to stay self-contained enough to run with no
 * Electron, no db, and no other module in `src/main/` loaded.
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

export const SYSTEM_PROMPT = `You are extracting commitments from a meeting transcript. A commitment is a first-person or second-person undertaking to do a specific thing — "I'll send you the deck", "you'll intro me to Sam", "we will get back to you by Friday". It is not an opinion, not a general plan with no named owner, and not something already done by the time it's mentioned in the call.

Rules:
- Precision over recall. If a statement is ambiguous about whether it is really a commitment, omit it rather than guess.
- The quote field must be copied verbatim from the transcript — the exact words, not a cleaned-up version. It is checked against the source afterward and dropped if it cannot be found there.
- Never invent a due date. Only set stated_due when the speaker named an actual date, or an unambiguous day relative to the meeting date given below, and only when due_phrase captures the words they actually said.
- owner_name is who is making the commitment, read from the transcript, not assumed from their role in the meeting.
- counterparty_name is who the commitment is owed to, when the transcript makes that clear; otherwise null.
- confidence is 'low' for anything you are not confident is a real, specific commitment — low-confidence items are dropped downstream, so mark honestly rather than upgrading to get something kept.
- If the transcript itself is too poor to responsibly read — too short, too fragmentary, too garbled — set the top-level capture to 'not_captured', explain why in capture_note, and return no commitments.

Call the record_commitments tool with your result. Do not include anything outside that tool call.`

const TOOL_NAME = 'record_commitments'

const COMMITMENT_TOOL = {
  name: TOOL_NAME,
  description: 'Record the commitments found in a meeting transcript, and whether the transcript was even readable enough to trust.',
  input_schema: {
    type: 'object',
    properties: {
      capture: {
        type: 'string',
        enum: ['ok', 'not_captured'],
        description: "'not_captured' when the transcript is too short or too garbled to responsibly extract commitments from.",
      },
      capture_note: {
        type: 'string',
        description: 'A short explanation, required when capture is not_captured; otherwise may be empty.',
      },
      commitments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string', description: 'Verbatim from the transcript.' },
            speaker: { type: 'string' },
            paraphrase: { type: 'string', description: 'A short plain-language restatement of what was promised.' },
            owner_name: { type: 'string', description: 'Who is making the commitment.' },
            counterparty_name: { type: ['string', 'null'], description: 'Who it is owed to, or null if unclear.' },
            due_phrase: { type: ['string', 'null'], description: 'The due words as spoken, e.g. "by Friday", or null.' },
            stated_due: { type: ['string', 'null'], description: 'ISO yyyy-mm-dd, only if the speaker named an unambiguous date.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['quote', 'speaker', 'paraphrase', 'owner_name', 'counterparty_name', 'due_phrase', 'stated_due', 'confidence'],
        },
      },
    },
    required: ['capture', 'capture_note', 'commitments'],
  },
}

/**
 * First 12 hex characters of sha256(SYSTEM_PROMPT + JSON of the tool
 * schema). Every extraction is stamped with this, per the roadmap's
 * invariant that the whole corpus can be re-read whenever the prompt or the
 * schema changes — the hash is how a re-read run knows what's stale.
 */
export const PROMPT_HASH = createHash('sha256')
  .update(SYSTEM_PROMPT + JSON.stringify(COMMITMENT_TOOL))
  .digest('hex')
  .slice(0, 12)

export interface CommitmentCandidate {
  quote: string
  speaker: string
  paraphrase: string
  owner_name: string
  counterparty_name: string | null
  due_phrase: string | null
  stated_due: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface ExtractedCommitment {
  /** 12-hex sha256 of the normalised quote + the meeting date. */
  id: string
  quote: string
  speaker: string
  paraphrase: string
  owner: 'me' | 'them'
  owner_name: string
  counterparty: string | null
  due_phrase: string | null
  /** ISO yyyy-mm-dd, only when stated_due and due_phrase both check out. */
  due: string | null
  confidence: 'high' | 'medium'
}

export interface DroppedCandidate {
  reason: string
  candidate: CommitmentCandidate
}

export interface Extraction {
  model: string
  prompt_hash: string
  extracted_at: string
  capture: 'ok' | 'not_captured'
  capture_note: string
  commitments: ExtractedCommitment[]
  dropped: DroppedCandidate[]
}

/**
 * Case, whitespace, punctuation and curly-quote insensitive normalisation,
 * used everywhere a quote has to be checked against source text. This is the
 * anti-hallucination guard: a quote the model produced can differ from the
 * transcript in formatting without being a hallucination, but if it differs
 * in substance it will not survive this comparison.
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

/**
 * `owner_name` fuzzy-matches `selfName` — either the full name or just the
 * first name, case-insensitively — when the person making the commitment is
 * the user themself. Transcripts label people inconsistently ("Alex",
 * "Alex Example", "alex"), so an exact-string match would silently
 * misfile most of them as 'them'.
 */
function matchesSelf(name: string, selfName: string): boolean {
  const n = name.trim().toLowerCase()
  const self = selfName.trim().toLowerCase()
  if (!n || !self) return false
  if (n === self) return true
  const nFirst = n.split(/\s+/)[0]
  const selfFirst = self.split(/\s+/)[0]
  return nFirst === selfFirst
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  // Reject overflowed dates like 2026-02-30, which Date would otherwise
  // silently roll into March.
  return d.toISOString().slice(0, 10) === value
}

function coerceCandidate(raw: unknown): CommitmentCandidate | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.quote !== 'string' || !r.quote.trim()) return null
  if (typeof r.owner_name !== 'string' || !r.owner_name.trim()) return null
  const confidence = r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : 'low'
  return {
    quote: r.quote,
    speaker: typeof r.speaker === 'string' ? r.speaker : '',
    paraphrase: typeof r.paraphrase === 'string' ? r.paraphrase : '',
    owner_name: r.owner_name,
    counterparty_name: typeof r.counterparty_name === 'string' && r.counterparty_name.trim() ? r.counterparty_name : null,
    due_phrase: typeof r.due_phrase === 'string' && r.due_phrase.trim() ? r.due_phrase : null,
    stated_due: typeof r.stated_due === 'string' && r.stated_due.trim() ? r.stated_due : null,
    confidence,
  }
}

export interface ValidatedExtraction {
  capture: 'ok' | 'not_captured'
  capture_note: string
  kept: ExtractedCommitment[]
  dropped: DroppedCandidate[]
}

/**
 * Runs raw tool output (or hand-pasted JSON of the same shape) through every
 * anti-hallucination and precision check before anything is trusted. Each
 * rule is independently testable and each drop is recorded with a reason —
 * nothing here is invented, everything is either verified or thrown away.
 */
export function validateExtraction(
  raw: unknown,
  ctx: { transcript: string; selfName: string; meetingDate: string }
): ValidatedExtraction {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const capture: 'ok' | 'not_captured' = obj.capture === 'not_captured' ? 'not_captured' : 'ok'
  const capture_note = typeof obj.capture_note === 'string' ? obj.capture_note : ''
  const rawCandidates = Array.isArray(obj.commitments) ? obj.commitments : []

  const kept: ExtractedCommitment[] = []
  const dropped: DroppedCandidate[] = []
  const seenQuotes = new Set<string>()

  for (const rawCandidate of rawCandidates) {
    const candidate = coerceCandidate(rawCandidate)
    if (!candidate) continue // Not shaped like a candidate at all; nothing to record a drop reason against.

    if (candidate.confidence === 'low') {
      dropped.push({ reason: 'low_confidence', candidate })
      continue
    }
    if (!candidate.paraphrase.trim()) {
      dropped.push({ reason: 'empty_paraphrase', candidate })
      continue
    }
    if (!quoteFoundIn(candidate.quote, ctx.transcript)) {
      dropped.push({ reason: 'quote_not_found', candidate })
      continue
    }
    const normalizedQuote = normalizeForMatch(candidate.quote)
    if (seenQuotes.has(normalizedQuote)) {
      dropped.push({ reason: 'duplicate_quote', candidate })
      continue
    }
    seenQuotes.add(normalizedQuote)

    const owner: 'me' | 'them' = matchesSelf(candidate.owner_name, ctx.selfName) ? 'me' : 'them'

    let due: string | null = null
    if (
      candidate.stated_due &&
      isValidIsoDate(candidate.stated_due) &&
      candidate.due_phrase &&
      quoteFoundIn(candidate.due_phrase, candidate.quote)
    ) {
      due = candidate.stated_due
    }

    const id = createHash('sha256').update(`${normalizedQuote}|${ctx.meetingDate}`).digest('hex').slice(0, 12)

    kept.push({
      id,
      quote: candidate.quote,
      speaker: candidate.speaker,
      paraphrase: candidate.paraphrase,
      owner,
      owner_name: candidate.owner_name,
      counterparty: candidate.counterparty_name,
      due_phrase: candidate.due_phrase,
      due,
      confidence: candidate.confidence as 'high' | 'medium',
    })
  }

  return { capture, capture_note, kept, dropped }
}

/**
 * A deterministic pre-check, run before any network call, that catches the
 * transcripts not worth spending a request on: ones with too little spoken
 * content, and ones that are technically long but overwhelmingly short
 * fragments (the garbled-ASR case summariser.ts also has to handle).
 */
export function assessCapture(transcript: string): { capture: 'ok' | 'not_captured'; note: string } {
  // Only speech counts. A notetaker export wraps the transcript in a header
  // (title, "Meeting started", participants, a link) and injects its own
  // "I'm transcribing this call" line; counting those as words let a real
  // transcript of pure Finnish filler pass as readable. When the export has
  // timestamped turns, only those are speech; otherwise fall back to every line.
  const raw = transcript.split('\n').map(line => line.trim())
  const turns = raw.filter(line => /^\[?\d{1,2}:\d{2}/.test(line))
  const lines = (turns.length > 0 ? turns : raw)
    .map(line => stripLinePrefix(line))
    .map(line => line.replace(/https?:\/\/\S+/g, '').replace(/Hi, I'm transcribing this call with my [^.]*\./gi, ''))
    .map(line => line.trim())
    .filter(Boolean)

  const wordCounts = lines.map(line => line.split(/\s+/).filter(Boolean).length)
  const totalWords = wordCounts.reduce((sum, n) => sum + n, 0)

  if (totalWords < 150) {
    return {
      capture: 'not_captured',
      note: `Only ${totalWords} words of spoken text — too short to responsibly extract commitments from.`,
    }
  }

  const nonEmptyLines = wordCounts.filter(n => n > 0)
  const fragmentLines = nonEmptyLines.filter(n => n <= 3)
  if (nonEmptyLines.length > 0 && fragmentLines.length / nonEmptyLines.length >= 0.7) {
    return {
      capture: 'not_captured',
      note: 'Transcript is overwhelmingly short fragments — too garbled to responsibly extract commitments from.',
    }
  }

  // Density: people talking produce well over a hundred words a minute. A
  // transcript whose timestamps span half an hour but hold a few words a
  // minute is a notetaker that heard the room and not the speech — the
  // length checks above can pass it on raw volume alone.
  const lastStamp = turns.length > 0 ? turns[turns.length - 1].match(/^\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/) : null
  if (lastStamp) {
    const [, h, m, s] = lastStamp
    const minutes = (h ? Number(h) * 60 : 0) + Number(m) + Number(s) / 60
    if (minutes >= 5 && totalWords / minutes < 30) {
      return {
        capture: 'not_captured',
        note: `${totalWords} words across ${Math.round(minutes)} minutes of timestamps — the notetaker did not capture the conversation.`,
      }
    }
  }

  return { capture: 'ok', note: '' }
}

/** Strips a leading timestamp and/or "Speaker:" label so word counts measure what was actually said, not formatting. */
function stripLinePrefix(line: string): string {
  return line
    .replace(/^\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*[-—]?\s*/, '')
    .replace(/^[A-Za-z][A-Za-z .'-]{0,40}\(\d{1,2}:\d{2}(:\d{2})?\)\s*:?\s*/, '')
    .replace(/^[A-Za-z][A-Za-z .'-]{0,40}:\s*/, '')
}

/**
 * Builds the Anthropic messages request body for one meeting's extraction.
 * A pure function — no fetch here — so it can be unit-tested on its own and
 * reused by both the real transport and anything that wants to inspect the
 * exact prompt sent.
 */
export function buildExtractionRequest(input: {
  transcript: string
  title: string
  meetingDate: string
  selfName: string
}): Record<string, unknown> {
  return {
    model: EXTRACTOR_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [COMMITMENT_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content:
          `Meeting title: ${input.title || '(untitled)'}\n` +
          `Meeting date: ${input.meetingDate}\n` +
          `Self (whose commitments are "me"): ${input.selfName}\n\n` +
          `<transcript>\n${truncateTranscript(input.transcript)}\n</transcript>`,
      },
    ],
  }
}

/**
 * The full pipeline for one meeting: skip the network entirely when the
 * deterministic pre-check already knows the transcript isn't worth reading,
 * otherwise call the injected transport and validate whatever comes back.
 * Never throws — a transport failure of any kind is a null, same contract
 * as summariser.ts, so a flaky request never breaks the rest of a backlog
 * run.
 */
export async function extractCommitments(
  input: { transcript: string; title: string; meetingDate: string; selfName: string },
  transport: (body: unknown) => Promise<unknown | null>
): Promise<Extraction | null> {
  const pre = assessCapture(input.transcript)
  if (pre.capture === 'not_captured') {
    return {
      model: EXTRACTOR_MODEL,
      prompt_hash: PROMPT_HASH,
      extracted_at: new Date().toISOString(),
      capture: 'not_captured',
      capture_note: pre.note,
      commitments: [],
      dropped: [],
    }
  }

  const body = buildExtractionRequest(input)
  let raw: unknown | null
  try {
    raw = await transport(body)
  } catch (err) {
    console.error('[commitments] transport failed:', err)
    return null
  }
  if (raw === null || raw === undefined) return null

  const validated = validateExtraction(raw, {
    transcript: input.transcript,
    selfName: input.selfName,
    meetingDate: input.meetingDate,
  })

  return {
    model: EXTRACTOR_MODEL,
    prompt_hash: PROMPT_HASH,
    extracted_at: new Date().toISOString(),
    capture: validated.capture,
    capture_note: validated.capture_note,
    commitments: validated.kept,
    dropped: validated.dropped,
  }
}

/**
 * The other way an extraction enters the pipeline: a model reads a
 * transcript inside a chat session (no API key, no programmatic transport)
 * and its JSON output is pasted in by hand. It goes through the exact same
 * `validateExtraction` as a live API call — the trust boundary is the
 * validator, not the transport.
 */
export function fromInSessionJson(
  raw: unknown,
  ctx: { transcript: string; selfName: string; meetingDate: string },
  opts: { model: string }
): Extraction {
  const validated = validateExtraction(raw, ctx)
  return {
    model: opts.model,
    prompt_hash: PROMPT_HASH,
    extracted_at: new Date().toISOString(),
    capture: validated.capture,
    capture_note: validated.capture_note,
    commitments: validated.kept,
    dropped: validated.dropped,
  }
}

/**
 * The real transport: calls Claude with a forced tool call, same pattern as
 * summariser.ts's callClaude. Not exercised against the network in tests —
 * only against a stubbed global fetch — since this module must never make a
 * real network call from the test suite.
 */
export function anthropicTransport(apiKey: string): (body: unknown) => Promise<unknown | null> {
  return async (body: unknown): Promise<unknown | null> => {
    let response: Response
    try {
      response = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.error('[commitments] request failed:', err)
      return null
    }

    if (!response.ok) {
      console.error(`[commitments] Claude API returned ${response.status}: ${await response.text()}`)
      return null
    }

    const data = (await response.json()) as { content: { type: string; name?: string; input?: unknown }[] }
    const toolUse = data.content.find(block => block.type === 'tool_use' && block.name === TOOL_NAME)
    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) return null
    return toolUse.input
  }
}

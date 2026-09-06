/**
 * The data the interface renders.
 *
 * Shaped to match the ledger's own queries exactly (`getRecentMeetings`,
 * `getPeople`, `getMeetingsForContact`, `getAmbiguousParticipants`), so the day
 * this talks to a real API instead of a bundled snapshot, only `load()` changes
 * and not a single component does.
 */

import snapshot from '../data/snapshot.json'

/**
 * Something someone said they would do.
 *
 * The unit that actually makes a professional relationship work, and the one
 * thing every notetaker records verbatim and then throws away. `owner` is
 * recoverable from the transcript: "I'll send that over" is mine, "you'll send
 * that over" is theirs.
 */
export interface Commitment {
  text: string
  owner: 'me' | 'them'
  done: boolean
  /** ISO date, when one was actually stated. Most are not. */
  due?: string
}

export interface Conversation {
  id: number
  /** Notetaker that captured it. '' or 'file' when unrecognised. */
  source: string
  source_url?: string
  title: string
  started_at: string
  duration_minutes: number | null
  /** Verbatim from the source. Never generated. Always wins. */
  summary: string
  commitments: Commitment[]
  has_transcript: boolean
  /** Written by a model when the source gave nothing usable. */
  generated_summary?: string
  generated_commitments?: Commitment[]
  generated_model?: string
  /** Other attendees, already resolved to display names. */
  people: string[]
  person_ids: number[]
}

export interface Person {
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

export interface Query {
  id: number
  raw_name: string
  raw_email: string
  /** 'ambiguous' = several people fit. 'unresolved' = nobody did. */
  resolution: 'ambiguous' | 'unresolved'
  title: string
  started_at: string
  source: string
  /** Populated for ambiguous rows: the people who all fit the name. */
  candidates: { id: number; name: string; detail: string }[]
}

export interface Snapshot {
  /** True while the app runs on bundled data rather than a live ledger. */
  sample: boolean
  generated_at: string
  self: string
  conversations: Conversation[]
  people: Person[]
  queries: Query[]
}

const data = snapshot as unknown as Snapshot

export function load(): Snapshot {
  return data
}

export function personById(id: number): Person | undefined {
  return data.people.find(p => p.id === id)
}

export function conversationsFor(personId: number): Conversation[] {
  return data.conversations
    .filter(c => c.person_ids.includes(personId))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
}

/* ------------------------------------------------------------ formatting -- */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return (first + last).toUpperCase() || '?'
}

function asDate(iso: string): Date {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
}

/** Split for the gutter: day and month on one line, year beneath. */
export function gutterDate(iso: string): { day: string; year: string } {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return { day: iso, year: '' }
  return {
    day: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    year: String(d.getFullYear()),
  }
}

/** Coarse buckets for the index. How a person thinks about "when". */
export function bucket(iso: string): string {
  const d = asDate(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 7) return 'This week'
  if (days <= 31) return 'This month'
  if (days <= 93) return 'Last three months'
  if (days <= 365) return 'This year'
  return 'Earlier'
}

export function shortDate(iso: string): string {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function longDate(iso: string): string {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "3 weeks ago", on a record, elapsed time is the useful reading. */
export function ago(iso: string): string {
  const d = asDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 0) return 'upcoming'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 31) return `${Math.round(days / 7)}w ago`
  const months = Math.round(days / 30)
  if (months < 18) return `${months}mo ago`
  return `${Math.round(days / 365)}y ago`
}

/** Provenance colour. Each notetaker gets its own so it is recognisable. */
export function sourceColour(source: string): string {
  const map: Record<string, string> = {
    Fathom: '#8b7fd4',
    Fireflies: '#d4a843',
    Granola: '#6fa89b',
    Tactiq: '#5b9dd4',
    Otter: '#5fb3c4',
    Meet: '#d4785b',
  }
  return map[source] || '#6e675e'
}

export function sourceName(source: string): string {
  if (!source || source === 'file') return 'Imported'
  return source
}

/* -------------------------------------------------------------- analysis -- */

/**
 * How a relationship actually behaves over time.
 *
 * Deliberately descriptive rather than a score. "Every 24 days on average, but
 * you have not spoken in 3 months" is something you can act on; "relationship
 * health: 62" is not, and it invents a judgement the record cannot support.
 */
export interface Rhythm {
  /** Mean days between conversations. Null when there is only one. */
  averageGap: number | null
  /** The longest silence between two conversations. */
  longestGap: number | null
  /** Days since the last conversation. */
  sinceLast: number
  /** True when the current silence is well past this person's own normal. */
  overdue: boolean
  busiestMonth: string | null
}

export function rhythm(dates: string[]): Rhythm {
  const times = dates
    .map(d => new Date(d.length <= 10 ? `${d}T00:00:00` : d).getTime())
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b)

  const sinceLast = times.length
    ? Math.floor((Date.now() - times[times.length - 1]) / 86_400_000)
    : 0

  if (times.length < 2) {
    return { averageGap: null, longestGap: null, sinceLast, overdue: false, busiestMonth: null }
  }

  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86_400_000)
  const averageGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  const longestGap = Math.round(Math.max(...gaps))

  const byMonth = new Map<string, number>()
  for (const t of times) {
    const m = new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1)
  }
  const busiestMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    averageGap,
    longestGap,
    sinceLast,
    // Past twice their own normal cadence is a fact about this relationship,
    // not a generic threshold applied to everyone.
    overdue: sinceLast > averageGap * 2,
    busiestMonth,
  }
}

/** Which tools captured a person's conversations, most used first. */
export function sourceMix(convs: Conversation[]): { source: string; n: number }[] {
  const m = new Map<string, number>()
  for (const c of convs) m.set(c.source, (m.get(c.source) ?? 0) + 1)
  return [...m.entries()]
    .map(([source, n]) => ({ source, n }))
    .sort((a, b) => b.n - a.n)
}

/* ----------------------------------------------------------- commitments -- */

export interface OpenLoop extends Commitment {
  conversationId: number
  conversationTitle: string
  agreedAt: string
  personId: number
  personName: string
  /** True when a stated due date has passed. */
  late: boolean
  /** Generated commitments are traceable to a model, not to a quote. */
  inferred: boolean
}

function loopsOf(c: Conversation): { commitment: Commitment; inferred: boolean }[] {
  return [
    ...(c.commitments ?? []).map(x => ({ commitment: x, inferred: false })),
    ...(c.generated_commitments ?? []).map(x => ({ commitment: x, inferred: true })),
  ]
}

/** Every commitment across the whole record, newest agreement first. */
export function allLoops(): OpenLoop[] {
  const byId = new Map(data.people.map(p => [p.id, p.name]))
  const out: OpenLoop[] = []

  for (const c of data.conversations) {
    for (const { commitment, inferred } of loopsOf(c)) {
      // A commitment belongs to the relationship it was made in. With several
      // people in the room the first resolved person carries it, which is a
      // simplification the ledger will need to revisit once meetings routinely
      // have five attendees.
      const personId = c.person_ids[0]
      if (personId === undefined) continue
      out.push({
        ...commitment,
        conversationId: c.id,
        conversationTitle: c.title,
        agreedAt: c.started_at,
        personId,
        personName: byId.get(personId) ?? 'Unknown',
        late: !!commitment.due && !commitment.done && new Date(commitment.due) < new Date(),
        inferred,
      })
    }
  }
  return out.sort((a, b) => b.agreedAt.localeCompare(a.agreedAt))
}

export function loopsFor(personId: number): OpenLoop[] {
  return allLoops().filter(l => l.personId === personId)
}

/**
 * What a relationship owes in each direction.
 *
 * Symmetric on purpose. A tool that only shows what you are owed is an
 * extraction machine; the list that actually builds a reputation is the one
 * where you are the debtor.
 */
export function balance(loops: OpenLoop[]): {
  iOwe: OpenLoop[]
  theyOwe: OpenLoop[]
  iDelivered: number
  iPromised: number
  theyDelivered: number
  theyPromised: number
} {
  const mine = loops.filter(l => l.owner === 'me')
  const theirs = loops.filter(l => l.owner === 'them')
  return {
    iOwe: mine.filter(l => !l.done),
    theyOwe: theirs.filter(l => !l.done),
    iDelivered: mine.filter(l => l.done).length,
    iPromised: mine.length,
    theyDelivered: theirs.filter(l => l.done).length,
    theyPromised: theirs.length,
  }
}

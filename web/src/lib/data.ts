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
  /**
   * The conversation that showed this had happened.
   *
   * Nobody ticked it. A later call referred to the thing as done, and the
   * record closed it. Bookkeeping the user did not have to do is the only
   * bookkeeping that survives contact with a real week.
   */
  closed_by?: number
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

/**
 * Library maturity.
 *
 * Everything in a demo runs on a full library, which hides the experience every
 * real user actually starts in: two conversations, nobody to match, no rhythm
 * to draw. A product that is beautiful at two hundred conversations and bleak
 * at two never reaches two hundred, so the sparse states have to be designed
 * rather than discovered.
 *
 * This lets the prototype be looked at from day one forward.
 */
export type Stage = 'new' | 'first' | 'early' | 'full'

export const STAGES: { id: Stage; label: string; take: number }[] = [
  { id: 'new', label: 'Day one', take: 0 },
  { id: 'first', label: 'First call', take: 1 },
  { id: 'early', label: 'First month', take: 3 },
  { id: 'full', label: 'A year in', take: Infinity },
]

export function currentStage(): Stage {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('nexus.stage') : null
  return (STAGES.find(s => s.id === saved)?.id ?? 'full') as Stage
}

export function setStage(id: Stage): void {
  localStorage.setItem('nexus.stage', id)
  location.reload()
}

const full = snapshot as unknown as Snapshot

/**
 * Trims the record to a point in its own history and rebuilds everything
 * derived from it, exactly as the real ledger would: people exist because
 * conversations mention them, not the other way round.
 */
function project(stage: Stage): Snapshot {
  const take = STAGES.find(s => s.id === stage)?.take ?? Infinity
  if (take === Infinity) return full

  const conversations = [...full.conversations]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, take)

  const seen = new Set(conversations.flatMap(c => c.person_ids))
  const ids = new Set(conversations.map(c => c.id))

  const people = full.people
    .filter(p => seen.has(p.id))
    .map(p => {
      const theirs = conversations.filter(c => c.person_ids.includes(p.id))
      const dates = theirs.map(c => c.started_at).sort()
      return {
        ...p,
        conversations: theirs.length,
        first_conversation_at: dates[0] ?? '',
        last_conversation_at: dates[dates.length - 1] ?? '',
        last_title: theirs[0]?.title ?? '',
      }
    })

  return {
    ...full,
    conversations,
    people,
    queries: full.queries.filter(q => ids.has(q.id) || conversations.some(c => c.title === q.title)),
    ...(({ signals, exchanges, upcoming }) => ({
      signals: (signals ?? []).filter(x => ids.has(x.conversation_id)),
      exchanges: (exchanges ?? []).filter(x => ids.has(x.conversation_id)),
      upcoming: (upcoming ?? []).filter(u => u.person_ids.some(id => seen.has(id))),
    }))(full as unknown as { signals?: Signal[]; exchanges?: Exchange[]; upcoming?: Upcoming[] }),
  } as Snapshot
}

const data = project(currentStage())

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
  /** Title of the conversation that closed it, when one did. */
  closedIn?: string
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
        closedIn: commitment.closed_by
          ? data.conversations.find(x => x.id === commitment.closed_by)?.title
          : undefined,
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

/* -------------------------------------------------------------- upcoming -- */

export interface Upcoming {
  id: number
  title: string
  /** Sample data stores an offset so the demo is always a live day. */
  in_minutes: number
  person_ids: number[]
  where?: string
}

export interface Meeting extends Upcoming {
  at: Date
  people: Person[]
}

export function upcoming(): Meeting[] {
  const raw = (data as unknown as { upcoming?: Upcoming[] }).upcoming ?? []
  return raw
    .map(u => ({
      ...u,
      at: new Date(Date.now() + u.in_minutes * 60_000),
      people: u.person_ids.map(id => personById(id)).filter((p): p is Person => !!p),
    }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

export function clockTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** "in 26 min" while it is close, then the clock. Precision only when useful. */
export function until(d: Date): string {
  const mins = Math.round((d.getTime() - Date.now()) / 60_000)
  if (mins < 0) return 'now'
  if (mins < 90) return `in ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 12) return `in ${hours} hours`
  return clockTime(d)
}

/** Which day a meeting falls on, in the words someone would actually use. */
export function dayLabel(d: Date): string {
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((d0 - t0) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * What you need in front of you before walking into a room with someone.
 *
 * The whole product, delivered at the only moment it reliably matters.
 */
export function brief(personId: number): {
  person: Person | undefined
  last: Conversation | undefined
  iOwe: OpenLoop[]
  theyOwe: OpenLoop[]
} {
  const convs = conversationsFor(personId)
  const b = balance(loopsFor(personId))
  return { person: personById(personId), last: convs[0], iOwe: b.iOwe, theyOwe: b.theyOwe }
}

/* --------------------------------------------------------------- signals -- */

/**
 * Something a person said they need, or said they could give.
 *
 * These sentences are spoken in almost every professional call and thrown away
 * by every notetaker on the market. They are also the only raw material from
 * which a network can actually create value, as opposed to merely record it.
 *
 * The quote is kept because a suggestion the user cannot audit is a suggestion
 * they should not act on. Every match traces back to a sentence someone said.
 */
export interface Signal {
  id: number
  person_id: number
  kind: 'needs' | 'offers'
  text: string
  quote: string
  conversation_id: number
  at: string
  tags: string[]
}

export function signals(): Signal[] {
  return (data as unknown as { signals?: Signal[] }).signals ?? []
}

export function signalsFor(personId: number): { needs: Signal[]; offers: Signal[] } {
  const mine = signals().filter(s => s.person_id === personId)
  return { needs: mine.filter(s => s.kind === 'needs'), offers: mine.filter(s => s.kind === 'offers') }
}

export interface Introduction {
  key: string
  need: Signal
  offer: Signal
  seeker: Person
  helper: Person
  shared: string[]
  /** An open commitment already covering this. You said you would do it. */
  promised?: OpenLoop
}

/**
 * Where one person's need meets another's offer.
 *
 * Tag overlap, deliberately. Not a similarity score, not a ranking model. The
 * user has to be able to see exactly why two people were put in front of them,
 * and "both said climate hardware" is a reason a human can check in a second.
 *
 * The output is a suggestion to make an introduction, never an action taken on
 * anyone's behalf. Nothing here contacts a person.
 */
export function introductions(): Introduction[] {
  const all = signals()
  const loops = allLoops().filter(l => !l.done && l.owner === 'me')
  const out: Introduction[] = []

  for (const need of all.filter(s => s.kind === 'needs')) {
    for (const offer of all.filter(s => s.kind === 'offers')) {
      if (need.person_id === offer.person_id) continue
      const shared = need.tags.filter(t => offer.tags.includes(t))
      if (shared.length === 0) continue

      const seeker = personById(need.person_id)
      const helper = personById(offer.person_id)
      if (!seeker || !helper) continue

      // If you already promised this intro, say so rather than suggesting it
      // as though it were a new idea. BOTH names must appear: matching on
      // either one told the user they had promised things they never said,
      // which is a worse failure than missing a promise entirely.
      const promised = loops.find(l => {
        const t = l.text.toLowerCase()
        if (!t.includes('introduc')) return false
        const a = seeker.name.split(' ')[0].toLowerCase()
        const b = helper.name.split(' ')[0].toLowerCase()
        return t.includes(a) && t.includes(b)
      })

      out.push({
        key: `${need.id}-${offer.id}`,
        need,
        offer,
        seeker,
        helper,
        shared,
        promised,
      })
    }
  }

  // Strongest overlap first, and anything already promised to the top: an
  // unkept promise outranks a fresh idea.
  return out.sort((a, b) => {
    if (!!a.promised !== !!b.promised) return a.promised ? -1 : 1
    return b.shared.length - a.shared.length
  })
}

/** Needs nobody in the library can serve yet. Honest, and worth showing. */
export function unmet(): Signal[] {
  const matched = new Set(introductions().map(i => i.need.id))
  return signals().filter(s => s.kind === 'needs' && !matched.has(s.id))
}

/**
 * A first draft of the introduction, for the user to edit and send themselves.
 *
 * Deliberately a draft in a box, not a send button. The product's job is to
 * remove the blank page, not to put words in someone's mouth or mail on their
 * behalf.
 */
export function draftIntro(i: Introduction): string {
  const a = i.seeker.name.split(' ')[0]
  const b = i.helper.name.split(' ')[0]
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  const at = (p: Person) => [p.role, p.company].filter(Boolean).join(' at ')

  return `${a}, meet ${i.helper.name}. ${b}, meet ${i.seeker.name}.

${a} is ${at(i.seeker)}, and is looking for ${lower(i.need.text)}.

${b} is ${at(i.helper)}, and can offer ${lower(i.offer.text)}.

It seemed worth connecting you. I will leave you both to it.`
}

/** A first draft for closing out something you owe. */
export function draftLoop(l: OpenLoop): string {
  const first = l.personName.split(' ')[0]
  return `${first},

Following up on ${l.conversationTitle.toLowerCase()}. I said I would ${l.text.charAt(0).toLowerCase()}${l.text.slice(1)}, so here it is.

`
}

/* ----------------------------------------------------------- reciprocity -- */

/**
 * An act of value moving in one direction.
 *
 * Two sources. Commitments somebody actually kept, and favours that never
 * became commitments at all: an introduction made, an hour spent on your
 * problem, a straight answer when a vague one would have been easier. The
 * second kind is most of what people actually give each other and none of it
 * appears in a promises ledger, because nobody promised anything.
 */
export interface Exchange {
  id: string
  person_id: number
  direction: 'gave' | 'received'
  kind: 'commitment' | 'introduction' | 'counsel'
  text: string
  at: string
  conversation_id: number
}

function rawExchanges(): Exchange[] {
  const raw = (data as unknown as { exchanges?: Exchange[] }).exchanges ?? []
  return raw.map(e => ({ ...e, id: `x${e.id}` }))
}

/** Everything that has passed between you and one person, both directions. */
export function exchangesWith(personId: number): { gave: Exchange[]; received: Exchange[] } {
  const kept = loopsFor(personId)
    .filter(l => l.done)
    .map<Exchange>(l => ({
      id: `c${l.conversationId}:${l.text}`,
      person_id: personId,
      // A commitment you kept is something you gave them.
      direction: l.owner === 'me' ? 'gave' : 'received',
      kind: 'commitment',
      text: l.text,
      at: l.agreedAt,
      conversation_id: l.conversationId,
    }))

  const all = [...kept, ...rawExchanges().filter(e => e.person_id === personId)].sort((a, b) =>
    b.at.localeCompare(a.at)
  )
  return {
    gave: all.filter(e => e.direction === 'gave'),
    received: all.filter(e => e.direction === 'received'),
  }
}

export interface Standing {
  person: Person
  gave: Exchange[]
  received: Exchange[]
  /** Positive means they have given you more than you have given them. */
  net: number
  /** Things they are looking for that you have not served. */
  couldGive: Signal[]
}

/**
 * Where you stand with everyone, most in-your-debt first.
 *
 * Counts, never a score. "She has given you three things and you have given her
 * one" is a fact you can check and act on. A generosity rating would be neither,
 * and it would invite the exact gamification that would ruin this.
 */
export function standings(): Standing[] {
  return load()
    .people.map(person => {
      const { gave, received } = exchangesWith(person.id)
      return {
        person,
        gave,
        received,
        net: received.length - gave.length,
        couldGive: signalsFor(person.id).needs,
      }
    })
    .sort((a, b) => b.net - a.net)
}

/* ------------------------------------------------------------- companies -- */

export interface Company {
  name: string
  slug: string
  people: Person[]
  conversations: Conversation[]
  lastAt: string
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Companies are derived, never entered.
 *
 * Nobody creates an organisation record or assigns anyone to it. A company
 * exists because two people you spoke to work at the same place, which the
 * record already knows. It matters at scale: past a couple of hundred people,
 * "everything we have with Reo Pack" is the question you actually have, and
 * "Davide, then Ana, then whoever else" is not an answer.
 */
export function companies(): Company[] {
  const byName = new Map<string, Person[]>()
  for (const p of load().people) {
    if (!p.company) continue
    byName.set(p.company, [...(byName.get(p.company) ?? []), p])
  }

  return [...byName.entries()]
    .map(([name, people]) => {
      const ids = new Set(people.map(p => p.id))
      const conversations = load()
        .conversations.filter(c => c.person_ids.some(id => ids.has(id)))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
      return {
        name,
        slug: slugify(name),
        people,
        conversations,
        lastAt: conversations[0]?.started_at ?? '',
      }
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

export function companyBySlug(slug: string): Company | undefined {
  return companies().find(c => c.slug === slug)
}

/** Every open commitment across everyone at one company. */
export function loopsForCompany(c: Company): OpenLoop[] {
  const ids = new Set(c.people.map(p => p.id))
  return allLoops().filter(l => ids.has(l.personId))
}

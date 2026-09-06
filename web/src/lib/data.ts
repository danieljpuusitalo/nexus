/**
 * The data the interface renders.
 *
 * Shaped to match the ledger's own queries exactly (`getRecentMeetings`,
 * `getPeople`, `getMeetingsForContact`, `getAmbiguousParticipants`), so the day
 * this talks to a real API instead of a bundled snapshot, only `load()` changes
 * and not a single component does.
 */

import snapshot from '../data/snapshot.json'

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
  action_items: string[]
  has_transcript: boolean
  /** Written by a model when the source gave nothing usable. */
  generated_summary?: string
  generated_action_items?: string[]
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

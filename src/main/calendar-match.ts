/**
 * Matching a captured meeting to the calendar event it came from.
 *
 * This is the cheapest large win available to the ledger. A notetaker hands us
 * display names — "Davide", "D. Mazzanti", "Davide Mazzanti (Acme)" — and asks
 * us to find them among every contact we know. The calendar event for the same
 * slot hands us the five people who were actually invited, with their email
 * addresses. Resolving a name against five candidates is nearly free; resolving
 * it against two thousand is a guess.
 *
 * Fathom already does this internally (its transcript speakers carry
 * `matched_calendar_invitee_email`). Doing it centrally means every source gets
 * it, including the ones that only ever give display names.
 *
 * The same rule as everywhere else applies: when the evidence is ambiguous this
 * returns nothing rather than picking. A wrong calendar match would poison
 * every participant link derived from it, which is worse than no match at all.
 */

import type Database from 'better-sqlite3'
import { normaliseName, nameParts } from './person-resolver'
import { eventsOnDate, attendeesOf, type StoredCalendarEvent, type CalendarAttendee } from './calendar-sync'

/** What we know about a captured meeting when looking for its calendar event. */
export interface MeetingHint {
  /** ISO date ('2026-07-16') or datetime. Date-only is the common case. */
  startedAt: string
  title?: string
  /** Raw attendee names from the capture, used as corroboration. */
  participantNames?: string[]
}

export interface EventMatch {
  event: StoredCalendarEvent
  /** Why we believe it: overlapping clock time, or corroborating people/title. */
  via: 'time' | 'people' | 'title'
  score: number
}

/** Minutes either side of a stated start time that still count as the same meeting. */
const TIME_WINDOW_MIN = 15

/** A match must clear this, and beat the runner-up by MIN_MARGIN, to be used. */
const MIN_SCORE = 0.5
const MIN_MARGIN = 0.2

function isDateOnly(iso: string): boolean {
  return iso.trim().length <= 10
}

function toDate(iso: string): Date | null {
  const d = new Date(isDateOnly(iso) ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayOf(iso: string): string {
  return iso.trim().slice(0, 10)
}

/** Content words only — "and", "with", "meeting" carry no signal in a title. */
const TITLE_STOPWORDS = new Set([
  'and', 'with', 'the', 'a', 'an', 'meeting', 'call', 'sync', 'catch', 'up',
  'chat', 'intro', 'introduction', 're', 'vs', 'x', 'weekly', 'monthly', 'zoom',
  'google', 'meet', 'teams', 'invite',
])

function titleTokens(title: string): Set<string> {
  return new Set(
    normaliseName(title)
      .split(' ')
      .filter(t => t.length > 1 && !TITLE_STOPWORDS.has(t))
  )
}

/** Jaccard overlap of two titles' content words. */
function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / new Set([...ta, ...tb]).size
}

/**
 * Does this display name plausibly refer to this attendee?
 *
 * Checks the attendee's own display name, and failing that the local part of
 * their address, because calendar invitations frequently carry no display name
 * at all — "davide.mazzanti@acme.com" still identifies Davide Mazzanti.
 */
function nameMatchesAttendee(name: string, attendee: CalendarAttendee): boolean {
  const parts = nameParts(name)
  if (parts.length === 0) return false
  const full = parts.join(' ')

  if (attendee.displayName) {
    const display = normaliseName(attendee.displayName)
    if (display === full) return true
    // "D. Mazzanti" against "Davide Mazzanti"
    if (parts.length >= 2 && parts[0].length === 1) {
      const dp = display.split(' ')
      if (
        dp.length >= 2 &&
        dp[dp.length - 1] === parts[parts.length - 1] &&
        dp[0].startsWith(parts[0])
      ) {
        return true
      }
    }
  }

  const local = normaliseName((attendee.email || '').split('@')[0] || '')
  if (!local) return false
  // "davide.mazzanti" normalises to "davide mazzanti"; also allow a bare
  // surname or given name when it is the whole local part.
  if (local === full) return true
  if (parts.length === 1 && local.split(' ').includes(full)) return true
  return false
}

/** Share of the capture's named attendees that appear on the event. */
function peopleOverlap(names: string[], attendees: CalendarAttendee[]): number {
  if (names.length === 0 || attendees.length === 0) return 0
  const hits = names.filter(n => attendees.some(a => nameMatchesAttendee(n, a))).length
  return hits / names.length
}

/**
 * Finds the calendar event a captured meeting came from.
 *
 * Scores every event on the same day and returns the winner only when it is
 * both good enough and clearly better than the alternative. Two equally
 * plausible events mean we do not know, and saying so is the correct answer.
 */
export function findEventForMeeting(db: Database.Database, hint: MeetingHint): EventMatch | null {
  const day = dayOf(hint.startedAt)
  if (!day) return null

  // The calendar is an enrichment, never a precondition. A meeting must still
  // be recorded if the calendar is unreachable, unsynced, or absent entirely —
  // losing a capture because a lookup failed would be a far worse outcome than
  // losing the attendee emails it would have provided.
  let candidates: StoredCalendarEvent[]
  try {
    candidates = eventsOnDate(db, day).filter(e => !e.is_all_day)
  } catch {
    return null
  }
  if (candidates.length === 0) return null

  const started = toDate(hint.startedAt)
  const haveClockTime = !isDateOnly(hint.startedAt) && started !== null
  const names = hint.participantNames || []

  const scored = candidates.map(event => {
    const attendees = attendeesOf(event)

    // A stated start time within the window is by far the strongest evidence,
    // and is the normal case for API-based sources like Fathom.
    let timeScore = 0
    if (haveClockTime) {
      const eventStart = toDate(event.started_at)
      if (eventStart && started) {
        const deltaMin = Math.abs(eventStart.getTime() - started.getTime()) / 60_000
        if (deltaMin <= TIME_WINDOW_MIN) timeScore = 1 - deltaMin / (TIME_WINDOW_MIN * 2)
      }
    }

    const people = peopleOverlap(names, attendees)
    const title = titleSimilarity(hint.title || '', event.title || '')

    // File-based captures usually carry a date but no clock time, so people and
    // title have to carry the match on their own.
    const score = Math.max(timeScore, people * 0.8 + title * 0.2, title)
    const via: EventMatch['via'] = timeScore >= score ? 'time' : people > title ? 'people' : 'title'

    return { event, score, via }
  })

  scored.sort((a, b) => b.score - a.score)
  const [best, runnerUp] = scored

  if (best.score < MIN_SCORE) return null
  if (runnerUp && best.score - runnerUp.score < MIN_MARGIN) return null

  return best
}

/**
 * The email address a display name belongs to, according to this event.
 *
 * Returns null when no attendee matches, and — importantly — also when several
 * do. Two people called "David" on one invitation is exactly the case where
 * guessing produces a silently wrong link.
 */
export function scopedEmailFor(name: string, attendees: CalendarAttendee[]): string | null {
  const hits = attendees.filter(a => a.email && nameMatchesAttendee(name, a))
  if (hits.length !== 1) return null
  return hits[0].email.toLowerCase()
}

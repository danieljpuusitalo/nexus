/**
 * Calendar Sync
 *
 * Google Calendar is the ground truth for who was actually in a room — a
 * notetaker hands us display names, the calendar event for the same slot
 * hands us the attendee list the notetaker never captured. This module is the
 * one place that talks to the Calendar API and writes `calendar_events`; the
 * three earlier ad-hoc fetches (renderer's google-calendar.ts, the briefing
 * loop, the Dashboard's inline call) each re-solved pagination and shape
 * parsing on their own and are being retired in favour of this cache.
 *
 * `singleEvents=true` matters more than it looks: without it, a recurring
 * weekly 1:1 comes back as one row for the whole series, and nothing here
 * could ever tell "last Tuesday's sync" from "next Tuesday's". With it every
 * occurrence is its own event with its own id.
 *
 * `iCalUID` is captured because it is the one identifier that survives across
 * sources — the same meeting seen by Google Calendar and by a notetaker's own
 * calendar integration carries the same UID, which is what will let the
 * ledger reconcile "the same meeting, two captures" later. `provider_event_id`
 * is only stable within Google.
 *
 * Pure functions over an injected db handle: no Electron, no filesystem. The
 * one exception is the network call itself, which is why `syncCalendar` fails
 * soft — it is called from a background loop that must never crash the app
 * because a token expired or a request timed out.
 */

import type Database from 'better-sqlite3'
import { getValidAccessToken } from './google-auth'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/**
 * Page cap for the sync loop. 50 pages * 250 events/page = 12,500 events,
 * far beyond what a year-plus window of a personal calendar could hold. This
 * exists purely so a bug in Google's `nextPageToken` handling (or a bogus
 * response) turns into a bounded, reported failure instead of an infinite
 * loop in a background timer.
 */
const MAX_PAGES = 50

export interface CalendarAttendee {
  email: string
  displayName?: string
  organizer?: boolean
  self?: boolean
  responseStatus?: string
}

export interface StoredCalendarEvent {
  id: number
  provider_event_id: string
  ical_uid: string
  title: string
  started_at: string // ISO 8601
  ended_at: string
  organizer_email: string
  attendees_json: string
  is_all_day: number
}

/** The shape Google's events.list actually returns, trimmed to what we use. */
interface GoogleCalendarEvent {
  id: string
  status?: string
  summary?: string
  iCalUID?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  organizer?: { email?: string }
  attendees?: {
    email?: string
    displayName?: string
    organizer?: boolean
    self?: boolean
    responseStatus?: string
  }[]
}

/**
 * Writes (or refreshes) one event's cached row. Returns false for an event
 * with no usable start time — Google shouldn't send us one, but a malformed
 * response must not crash a sync over a single bad item.
 */
function upsertEvent(db: Database.Database, item: GoogleCalendarEvent): boolean {
  const startedAt = item.start?.dateTime ?? item.start?.date
  if (!startedAt) return false

  // All-day events carry `date` (a bare YYYY-MM-DD), timed events carry
  // `dateTime`. Presence of `dateTime` is the only reliable signal.
  const isAllDay = item.start?.dateTime ? 0 : 1
  const endedAt = item.end?.dateTime ?? item.end?.date ?? ''

  const attendees: CalendarAttendee[] = (item.attendees ?? [])
    .filter((a): a is { email: string } & typeof a => Boolean(a.email))
    .map(a => ({
      email: a.email,
      displayName: a.displayName,
      organizer: a.organizer,
      self: a.self,
      responseStatus: a.responseStatus,
    }))

  db.prepare(
    `INSERT INTO calendar_events (
       provider, provider_event_id, ical_uid, title, started_at, ended_at,
       organizer_email, attendees_json, is_all_day, synced_at
     ) VALUES ('google', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(provider, provider_event_id) DO UPDATE SET
       ical_uid = excluded.ical_uid,
       title = excluded.title,
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       organizer_email = excluded.organizer_email,
       attendees_json = excluded.attendees_json,
       is_all_day = excluded.is_all_day,
       synced_at = excluded.synced_at`
  ).run(
    item.id,
    item.iCalUID || '',
    item.summary || '',
    startedAt,
    endedAt,
    item.organizer?.email || '',
    JSON.stringify(attendees),
    isAllDay
  )
  return true
}

/**
 * Fetches events from Google and upserts them into `calendar_events`.
 *
 * Idempotent on `(provider, provider_event_id)`: a re-sync updates the cached
 * row (and its `synced_at`) rather than duplicating it. Cancelled events are
 * deleted outright rather than stored with a status flag, since nothing reads
 * cancelled events and a deleted-organizer-side meeting should simply vanish
 * from the cache the same way it vanishes from the calendar.
 *
 * Fails soft: a missing token or a failed request returns a zeroed result
 * with `error` set rather than throwing, because the caller is a background
 * loop that must keep running regardless.
 */
export async function syncCalendar(
  db: Database.Database,
  opts?: { daysBack?: number; daysForward?: number }
): Promise<{ fetched: number; stored: number; error?: string }> {
  const token = await getValidAccessToken(db)
  if (!token) return { fetched: 0, stored: 0, error: 'Google not connected' }

  const daysBack = opts?.daysBack ?? 365
  const daysForward = opts?.daysForward ?? 30
  const now = Date.now()
  const timeMin = new Date(now - daysBack * 86400000).toISOString()
  const timeMax = new Date(now + daysForward * 86400000).toISOString()

  try {
    let fetched = 0
    let stored = 0
    let pageToken: string | undefined
    let pages = 0

    do {
      const url = new URL(`${CALENDAR_API}/calendars/primary/events`)
      url.searchParams.set('timeMin', timeMin)
      url.searchParams.set('timeMax', timeMax)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '250')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        return { fetched: 0, stored: 0, error: `Calendar API error: ${response.status}` }
      }

      const data = (await response.json()) as {
        items?: GoogleCalendarEvent[]
        nextPageToken?: string
      }
      const items = data.items ?? []
      fetched += items.length

      for (const item of items) {
        if (item.status === 'cancelled') {
          db.prepare('DELETE FROM calendar_events WHERE provider = ? AND provider_event_id = ?').run(
            'google',
            item.id
          )
          continue
        }
        if (upsertEvent(db, item)) stored++
      }

      pageToken = data.nextPageToken
      pages++
    } while (pageToken && pages < MAX_PAGES)

    return { fetched, stored }
  } catch (err) {
    return { fetched: 0, stored: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Parses `attendees_json` back into structured attendees. Never throws: a
 * corrupted or unexpected cell should read as "no attendees", not crash
 * whatever view was rendering the person's meeting list.
 */
export function attendeesOf(event: StoredCalendarEvent): CalendarAttendee[] {
  try {
    const parsed: unknown = JSON.parse(event.attendees_json || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is CalendarAttendee => Boolean(a) && typeof a === 'object' && typeof a.email === 'string'
    )
  } catch {
    return []
  }
}

/** A date-only or full ISO timestamp, as an instant. Date-only reads as UTC midnight. */
function toInstant(value: string): number {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value
  return new Date(iso).getTime()
}

/**
 * Every cached event whose interval overlaps the given calendar day.
 *
 * Half-open interval overlap (`start < dayEnd && end > dayStart`), so a
 * meeting that starts at 23:50 the night before and runs past midnight shows
 * up on today, and an all-day event — stored with Google's exclusive end date
 * — still counts as covering the day it's on. Pure and unindexed: this is a
 * personal calendar's cache, not a table anyone needs a query plan for.
 */
export function eventsOnDate(db: Database.Database, isoDate: string): StoredCalendarEvent[] {
  const dayStart = toInstant(isoDate)
  const dayEnd = dayStart + 86400000

  const rows = db
    .prepare(
      `SELECT id, provider_event_id, ical_uid, title, started_at, ended_at,
              organizer_email, attendees_json, is_all_day
       FROM calendar_events`
    )
    .all() as StoredCalendarEvent[]

  return rows
    .filter(e => {
      const start = toInstant(e.started_at)
      const end = e.ended_at ? toInstant(e.ended_at) : start
      return start < dayEnd && end > dayStart
    })
    .sort((a, b) => toInstant(a.started_at) - toInstant(b.started_at))
}

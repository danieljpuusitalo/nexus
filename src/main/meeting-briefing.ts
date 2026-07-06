/**
 * Pre-meeting briefing — checks upcoming calendar events and sends
 * native notifications 15 minutes before meetings with known contacts.
 * Includes last interaction date, notes preview, and key details.
 */

import { Notification, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { getValidAccessToken, isGoogleConnected } from './google-auth'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes
const NOTIFY_BEFORE_MS = 15 * 60 * 1000 // Notify 15 minutes before

let checkTimer: ReturnType<typeof setInterval> | null = null
const notifiedEvents = new Set<string>() // Track notified event IDs to avoid duplicates

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; self?: boolean }[]
}

interface ContactContext {
  name: string
  company: string
  lastInteraction: string | null
  notesPreview: string
}

export function startBriefingLoop(db: Database.Database): void {
  if (checkTimer) return
  checkTimer = setInterval(() => checkUpcomingMeetings(db), CHECK_INTERVAL)
  // Initial check after 30 seconds
  setTimeout(() => checkUpcomingMeetings(db), 30000)
}

export function stopBriefingLoop(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

async function checkUpcomingMeetings(db: Database.Database): Promise<void> {
  if (!isGoogleConnected(db)) return

  const token = await getValidAccessToken(db)
  if (!token) return

  try {
    const now = new Date()
    const checkWindow = new Date(now.getTime() + NOTIFY_BEFORE_MS + CHECK_INTERVAL)

    const url = new URL(`${CALENDAR_API}/calendars/primary/events`)
    url.searchParams.set('timeMin', now.toISOString())
    url.searchParams.set('timeMax', checkWindow.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '10')

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) return

    const data = (await response.json()) as { items: CalendarEvent[] }
    if (!data.items) return

    for (const event of data.items) {
      if (notifiedEvents.has(event.id)) continue
      if (!event.start.dateTime) continue // Skip all-day events
      if (!event.attendees || event.attendees.length <= 1) continue // Solo events

      const eventTime = new Date(event.start.dateTime).getTime()
      const timeUntil = eventTime - now.getTime()

      // Notify if event is 10-20 minutes away
      if (timeUntil > 0 && timeUntil <= NOTIFY_BEFORE_MS + CHECK_INTERVAL) {
        const contacts = matchAttendeesToContacts(db, event.attendees)
        if (contacts.length > 0) {
          sendBriefingNotification(event, contacts)
          notifiedEvents.add(event.id)
        }
      }
    }

    // Clean up old event IDs (older than 1 hour)
    if (notifiedEvents.size > 100) {
      notifiedEvents.clear()
    }
  } catch {
    // Silently fail — don't disrupt the user
  }
}

function matchAttendeesToContacts(
  db: Database.Database,
  attendees: CalendarEvent['attendees']
): ContactContext[] {
  if (!attendees) return []

  const results: ContactContext[] = []

  for (const att of attendees) {
    if (att.self) continue

    const contact = db
      .prepare(
        'SELECT id, first_name, last_name, company, notes FROM contacts WHERE email = ? AND deleted_at IS NULL'
      )
      .get(att.email.toLowerCase()) as
      | { id: number; first_name: string; last_name: string; company: string; notes: string }
      | undefined

    if (!contact) continue

    // Get last interaction
    const lastInteraction = db
      .prepare('SELECT date, description FROM interactions WHERE contact_id = ? ORDER BY date DESC LIMIT 1')
      .get(contact.id) as { date: string; description: string } | undefined

    results.push({
      name: `${contact.first_name} ${contact.last_name}`.trim(),
      company: contact.company || '',
      lastInteraction: lastInteraction
        ? `${lastInteraction.date}: ${lastInteraction.description.substring(0, 80)}`
        : null,
      notesPreview: contact.notes ? contact.notes.substring(0, 120) : '',
    })
  }

  return results
}

function sendBriefingNotification(event: CalendarEvent, contacts: ContactContext[]): void {
  const names = contacts.map((c) => c.name).join(', ')
  const title = `Upcoming: ${event.summary || 'Meeting'}`

  let body = `With ${names}`
  if (contacts[0]?.company) body += ` (${contacts[0].company})`
  if (contacts[0]?.lastInteraction) body += `\nLast: ${contacts[0].lastInteraction}`

  const notification = new Notification({
    title,
    body,
    silent: false,
  })

  notification.on('click', () => {
    // Focus the app window
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  notification.show()
}

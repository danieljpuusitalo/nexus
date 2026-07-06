/**
 * Google Calendar sync — fetch events and match attendees to contacts.
 * Creates interaction records of type 'calendar' for meetings with known contacts.
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; self?: boolean; responseStatus?: string }[]
  status: string
  htmlLink: string
}

interface SyncedEvent {
  eventId: string
  summary: string
  date: string
  attendeeEmails: string[]
  matchedContactIds: number[]
}

export async function syncCalendarEvents(daysBack = 30, daysForward = 7): Promise<{
  synced: number
  matched: number
  errors: string[]
}> {
  const result = { synced: 0, matched: 0, errors: [] as string[] }

  const token = await window.api.google.getAccessToken() as string | null
  if (!token) {
    result.errors.push('Google not connected')
    return result
  }

  try {
    // Fetch events from primary calendar
    const now = new Date()
    const timeMin = new Date(now.getTime() - daysBack * 86400000).toISOString()
    const timeMax = new Date(now.getTime() + daysForward * 86400000).toISOString()

    const events = await fetchEvents(token, timeMin, timeMax)

    // Get all contacts with emails for matching
    const contacts = await window.api.contacts.getAll() as {
      id: number; email: string; first_name: string; last_name: string
    }[]
    const emailToContact = new Map<string, number>()
    for (const c of contacts) {
      if (c.email) emailToContact.set(c.email.toLowerCase(), c.id)
    }

    // Get already-synced event IDs to avoid duplicates
    const lastSync = await window.api.settings.get('google_calendar_last_sync') as string | null

    for (const event of events) {
      if (event.status === 'cancelled') continue
      if (!event.attendees || event.attendees.length === 0) continue

      const date = event.start.dateTime
        ? event.start.dateTime.split('T')[0]
        : event.start.date || ''

      if (!date) continue

      // Find attendees who match existing contacts (exclude self)
      const matchedContactIds: number[] = []
      const attendeeNames: string[] = []

      for (const att of event.attendees) {
        if (att.self) continue
        const contactId = emailToContact.get(att.email.toLowerCase())
        if (contactId) {
          matchedContactIds.push(contactId)
          attendeeNames.push(att.displayName || att.email)
        }
      }

      if (matchedContactIds.length === 0) continue

      // Create interaction records for each matched contact
      for (const contactId of matchedContactIds) {
        const description = `Calendar: ${event.summary || 'Meeting'}` +
          (attendeeNames.length > 1 ? ` (with ${attendeeNames.length} contacts)` : '')

        try {
          await window.api.interactions.create({
            contact_id: contactId,
            type: 'calendar',
            description,
            date,
          })
          result.matched++
        } catch {
          // Likely duplicate — skip silently
        }
      }

      result.synced++
    }

    // Save last sync timestamp
    await window.api.settings.set('google_calendar_last_sync', new Date().toISOString())
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}

export async function fetchUpcomingEvents(hours = 24): Promise<CalendarEvent[]> {
  const token = await window.api.google.getAccessToken() as string | null
  if (!token) return []

  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + hours * 3600000).toISOString()

  return fetchEvents(token, timeMin, timeMax)
}

async function fetchEvents(token: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = []
  let pageToken: string | undefined

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
      if (response.status === 401) throw new Error('Google token expired. Please reconnect.')
      throw new Error(`Calendar API error: ${response.status}`)
    }

    const data = await response.json() as {
      items: CalendarEvent[]
      nextPageToken?: string
    }

    allEvents.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return allEvents
}

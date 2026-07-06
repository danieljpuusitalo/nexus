/**
 * Google Contacts auto-sync for Electron main process.
 *
 * Uses the People API syncToken for incremental sync (only changed contacts).
 * Handles HTTP 410 (expired syncToken) by falling back to full re-sync.
 * Dedup: email (primary), name+company (secondary).
 */

import type Database from 'better-sqlite3'
import { getValidAccessToken, isGoogleConnected } from './google-auth'

const PEOPLE_API = 'https://people.googleapis.com/v1'
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos,birthdays,addresses'

const FREQUENCIES: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

let syncTimer: ReturnType<typeof setInterval> | null = null

// --- Settings helpers ---

function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

// --- Types ---

interface GooglePerson {
  resourceName: string
  names?: { givenName?: string; familyName?: string }[]
  emailAddresses?: { value: string }[]
  phoneNumbers?: { value: string }[]
  organizations?: { name?: string; title?: string }[]
  photos?: { url: string; default?: boolean }[]
  birthdays?: { date?: { year?: number; month?: number; day?: number } }[]
  addresses?: { formattedValue?: string }[]
}

interface SyncResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

// --- Public API ---

export function getAutoSyncStatus(db: Database.Database): {
  enabled: boolean
  frequency: string
  lastSync: string | null
  running: boolean
} {
  return {
    enabled: getSetting(db, 'google_auto_sync_enabled') === 'true',
    frequency: getSetting(db, 'google_sync_frequency') || 'daily',
    lastSync: getSetting(db, 'google_last_auto_sync'),
    running: syncTimer !== null,
  }
}

export function enableAutoSync(db: Database.Database, frequency: string): void {
  setSetting(db, 'google_auto_sync_enabled', 'true')
  setSetting(db, 'google_sync_frequency', frequency)
  restartTimer(db)
}

export function disableAutoSync(db: Database.Database): void {
  setSetting(db, 'google_auto_sync_enabled', 'false')
  stopTimer()
}

export function startGoogleContactsAutoSync(db: Database.Database): void {
  if (!isGoogleConnected(db)) return
  if (getSetting(db, 'google_auto_sync_enabled') !== 'true') return
  restartTimer(db)
}

export function stopGoogleContactsAutoSync(): void {
  stopTimer()
}

export async function runIncrementalSync(db: Database.Database): Promise<SyncResult> {
  const syncToken = getSetting(db, 'google_sync_token')
  if (syncToken) {
    try {
      return await syncWithToken(db, syncToken)
    } catch (err) {
      // 410 = token expired, fall back to full sync
      if (String(err).includes('410')) {
        deleteSetting(db, 'google_sync_token')
        return await runFullSync(db)
      }
      throw err
    }
  }
  return await runFullSync(db)
}

export async function runFullSync(db: Database.Database): Promise<SyncResult> {
  const token = await getValidAccessToken(db)
  if (!token) return { imported: 0, updated: 0, skipped: 0, errors: ['Google connection needs to be reconnected. Go to Settings to reconnect.'] }

  const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: [] }
  let pageToken: string | undefined
  let newSyncToken: string | undefined

  // Build dedup sets from existing contacts
  const existing = db.prepare(
    'SELECT id, email, first_name, last_name, company FROM contacts WHERE deleted_at IS NULL'
  ).all() as { id: number; email: string; first_name: string; last_name: string; company: string }[]

  const emailToId = new Map<string, number>()
  const nameKeyToId = new Map<string, number>()
  for (const c of existing) {
    if (c.email) emailToId.set(c.email.toLowerCase(), c.id)
    const nameKey = `${c.first_name}|${c.last_name}|${c.company}`.toLowerCase()
    if (c.first_name || c.last_name) nameKeyToId.set(nameKey, c.id)
  }

  try {
    do {
      const url = new URL(`${PEOPLE_API}/people/me/connections`)
      url.searchParams.set('personFields', PERSON_FIELDS)
      url.searchParams.set('pageSize', '1000')
      url.searchParams.set('requestSyncToken', 'true')
      url.searchParams.set('sortOrder', 'LAST_MODIFIED_DESCENDING')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error(`People API error: ${response.status}`)
      }

      const data = (await response.json()) as {
        connections?: GooglePerson[]
        nextPageToken?: string
        nextSyncToken?: string
      }

      if (data.connections) {
        for (const person of data.connections) {
          upsertContact(db, person, emailToId, nameKeyToId, result)
        }
      }

      pageToken = data.nextPageToken
      if (data.nextSyncToken) newSyncToken = data.nextSyncToken
    } while (pageToken)

    if (newSyncToken) {
      setSetting(db, 'google_sync_token', newSyncToken)
    }
    setSetting(db, 'google_last_auto_sync', new Date().toISOString())
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}

// --- Internal helpers ---

async function syncWithToken(
  db: Database.Database,
  syncToken: string
): Promise<SyncResult> {
  const token = await getValidAccessToken(db)
  if (!token) return { imported: 0, updated: 0, skipped: 0, errors: ['Google connection needs to be reconnected. Go to Settings to reconnect.'] }

  const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: [] }

  // Build dedup sets
  const existing = db.prepare(
    'SELECT id, email, first_name, last_name, company FROM contacts WHERE deleted_at IS NULL'
  ).all() as { id: number; email: string; first_name: string; last_name: string; company: string }[]

  const emailToId = new Map<string, number>()
  const nameKeyToId = new Map<string, number>()
  for (const c of existing) {
    if (c.email) emailToId.set(c.email.toLowerCase(), c.id)
    const nameKey = `${c.first_name}|${c.last_name}|${c.company}`.toLowerCase()
    if (c.first_name || c.last_name) nameKeyToId.set(nameKey, c.id)
  }

  let pageToken: string | undefined
  let newSyncToken: string | undefined

  try {
    do {
      const url = new URL(`${PEOPLE_API}/people/me/connections`)
      url.searchParams.set('personFields', PERSON_FIELDS)
      url.searchParams.set('pageSize', '1000')
      url.searchParams.set('requestSyncToken', 'true')
      url.searchParams.set('syncToken', syncToken)
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 410) {
        throw new Error('410')
      }

      if (!response.ok) {
        throw new Error(`People API error: ${response.status}`)
      }

      const data = (await response.json()) as {
        connections?: GooglePerson[]
        nextPageToken?: string
        nextSyncToken?: string
      }

      if (data.connections) {
        for (const person of data.connections) {
          upsertContact(db, person, emailToId, nameKeyToId, result)
        }
      }

      pageToken = data.nextPageToken
      if (data.nextSyncToken) newSyncToken = data.nextSyncToken
    } while (pageToken)

    if (newSyncToken) {
      setSetting(db, 'google_sync_token', newSyncToken)
    }
    setSetting(db, 'google_last_auto_sync', new Date().toISOString())
  } catch (err) {
    if (String(err).includes('410')) throw err
    result.errors.push(String(err))
  }

  return result
}

function upsertContact(
  db: Database.Database,
  person: GooglePerson,
  emailToId: Map<string, number>,
  nameKeyToId: Map<string, number>,
  result: SyncResult
): void {
  try {
    const name = person.names?.[0]
    const firstName = name?.givenName || ''
    const lastName = name?.familyName || ''

    if (!firstName && !lastName) return

    const email = person.emailAddresses?.[0]?.value || ''
    const phone = person.phoneNumbers?.[0]?.value || ''
    const org = person.organizations?.[0]
    const company = org?.name || ''
    const jobTitle = org?.title || ''
    const photo = person.photos?.find((p) => !p.default)?.url || ''
    const birthday = formatBirthday(person.birthdays?.[0]?.date)
    const address = person.addresses?.[0]?.formattedValue || ''

    // Check for existing contact by email
    let existingId: number | undefined
    if (email) {
      existingId = emailToId.get(email.toLowerCase())
    }

    // Check by name+company
    if (!existingId) {
      const nameKey = `${firstName}|${lastName}|${company}`.toLowerCase()
      existingId = nameKeyToId.get(nameKey)
    }

    if (existingId) {
      // Upsert — update existing contact with any new data
      db.prepare(`
        UPDATE contacts SET
          phone = CASE WHEN phone = '' OR phone IS NULL THEN @phone ELSE phone END,
          company = CASE WHEN company = '' OR company IS NULL THEN @company ELSE company END,
          job_title = CASE WHEN job_title = '' OR job_title IS NULL THEN @job_title ELSE job_title END,
          photo_url = CASE WHEN photo_url = '' OR photo_url IS NULL THEN @photo_url ELSE photo_url END,
          birthday = CASE WHEN birthday = '' OR birthday IS NULL THEN @birthday ELSE birthday END,
          address = CASE WHEN address = '' OR address IS NULL THEN @address ELSE address END,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({ phone, company, job_title: jobTitle, photo_url: photo, birthday, address, id: existingId })
      result.updated++
    } else {
      // Create new contact
      const info = db.prepare(`
        INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, photo_url, how_we_met, birthday, address)
        VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @photo_url, 'Google Contacts', @birthday, @address)
      `).run({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        company,
        job_title: jobTitle,
        photo_url: photo,
        birthday,
        address,
      })

      // Track for dedup within this batch
      const newId = Number(info.lastInsertRowid)
      if (email) emailToId.set(email.toLowerCase(), newId)
      const nameKey = `${firstName}|${lastName}|${company}`.toLowerCase()
      nameKeyToId.set(nameKey, newId)

      result.imported++
    }
  } catch {
    result.errors.push(`Failed: ${person.names?.[0]?.givenName || 'unknown'}`)
  }
}

function formatBirthday(date?: { year?: number; month?: number; day?: number }): string {
  if (!date || !date.month || !date.day) return ''
  const year = date.year || 1900
  const month = String(date.month).padStart(2, '0')
  const day = String(date.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function restartTimer(db: Database.Database): void {
  stopTimer()
  const freq = getSetting(db, 'google_sync_frequency') || 'daily'
  const interval = FREQUENCIES[freq] || FREQUENCIES.daily
  syncTimer = setInterval(() => {
    runIncrementalSync(db).catch(() => {})
  }, interval)
}

function stopTimer(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

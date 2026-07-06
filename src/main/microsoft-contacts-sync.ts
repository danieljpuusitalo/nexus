/**
 * Microsoft/Outlook Contacts import + auto-sync for Electron main process.
 *
 * Uses Microsoft Graph API to fetch contacts with pagination.
 * Dedup: email (primary), name+company (secondary).
 */

import type Database from 'better-sqlite3'
import { getValidMicrosoftAccessToken, isMicrosoftConnected } from './microsoft-auth'

const GRAPH_CONTACTS_URL = 'https://graph.microsoft.com/v1.0/me/contacts'
const CONTACT_SELECT = 'givenName,surname,emailAddresses,businessPhones,mobilePhone,companyName,jobTitle,personalNotes,birthday'

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

// --- Types ---

interface MsContact {
  givenName?: string
  surname?: string
  emailAddresses?: { address: string; name?: string }[]
  businessPhones?: string[]
  mobilePhone?: string
  companyName?: string
  jobTitle?: string
  personalNotes?: string
  birthday?: string
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
    enabled: getSetting(db, 'microsoft_auto_sync_enabled') === 'true',
    frequency: getSetting(db, 'microsoft_sync_frequency') || 'daily',
    lastSync: getSetting(db, 'microsoft_last_auto_sync'),
    running: syncTimer !== null,
  }
}

export function enableAutoSync(db: Database.Database, frequency: string): void {
  setSetting(db, 'microsoft_auto_sync_enabled', 'true')
  setSetting(db, 'microsoft_sync_frequency', frequency)
  restartTimer(db)
}

export function disableAutoSync(db: Database.Database): void {
  setSetting(db, 'microsoft_auto_sync_enabled', 'false')
  stopTimer()
}

export function startMicrosoftContactsAutoSync(db: Database.Database): void {
  if (!isMicrosoftConnected(db)) return
  if (getSetting(db, 'microsoft_auto_sync_enabled') !== 'true') return
  restartTimer(db)
}

export function stopMicrosoftContactsAutoSync(): void {
  stopTimer()
}

export async function importMicrosoftContacts(db: Database.Database): Promise<SyncResult> {
  const token = await getValidMicrosoftAccessToken(db)
  if (!token) return { imported: 0, updated: 0, skipped: 0, errors: ['Microsoft connection needs to be reconnected. Go to Settings to reconnect.'] }

  const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: [] }

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
    let url: string | null = `${GRAPH_CONTACTS_URL}?$top=100&$select=${CONTACT_SELECT}`

    do {
      const response = await fetch(url!, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        if (response.status === 401) {
          result.errors.push('Microsoft token expired — please reconnect')
          break
        }
        throw new Error(`Graph API error: ${response.status}`)
      }

      const data = (await response.json()) as {
        value?: MsContact[]
        '@odata.nextLink'?: string
      }

      if (data.value) {
        for (const contact of data.value) {
          upsertContact(db, contact, emailToId, nameKeyToId, result)
        }
      }

      url = data['@odata.nextLink'] || null
    } while (url)

    setSetting(db, 'microsoft_last_auto_sync', new Date().toISOString())
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}

// --- Internal helpers ---

function upsertContact(
  db: Database.Database,
  contact: MsContact,
  emailToId: Map<string, number>,
  nameKeyToId: Map<string, number>,
  result: SyncResult
): void {
  try {
    const firstName = contact.givenName || ''
    const lastName = contact.surname || ''

    if (!firstName && !lastName) return

    const email = contact.emailAddresses?.[0]?.address || ''
    const phone = contact.mobilePhone || contact.businessPhones?.[0] || ''
    const company = contact.companyName || ''
    const jobTitle = contact.jobTitle || ''
    const notes = contact.personalNotes || ''
    const birthday = formatBirthday(contact.birthday)

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
      // Upsert — fill empty fields only
      db.prepare(`
        UPDATE contacts SET
          phone = CASE WHEN phone = '' OR phone IS NULL THEN @phone ELSE phone END,
          company = CASE WHEN company = '' OR company IS NULL THEN @company ELSE company END,
          job_title = CASE WHEN job_title = '' OR job_title IS NULL THEN @job_title ELSE job_title END,
          birthday = CASE WHEN birthday = '' OR birthday IS NULL THEN @birthday ELSE birthday END,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({ phone, company, job_title: jobTitle, birthday, id: existingId })
      result.updated++
    } else {
      // Create new contact
      const info = db.prepare(`
        INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, notes, how_we_met, birthday)
        VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @notes, 'Outlook Contacts', @birthday)
      `).run({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        company,
        job_title: jobTitle,
        notes,
        birthday,
      })

      const newId = Number(info.lastInsertRowid)
      if (email) emailToId.set(email.toLowerCase(), newId)
      const nameKey = `${firstName}|${lastName}|${company}`.toLowerCase()
      nameKeyToId.set(nameKey, newId)

      result.imported++
    }
  } catch {
    result.errors.push(`Failed: ${contact.givenName || 'unknown'}`)
  }
}

function formatBirthday(birthday?: string): string {
  if (!birthday) return ''
  // Graph returns ISO 8601: "1990-05-15T00:00:00Z" or similar
  const match = birthday.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function restartTimer(db: Database.Database): void {
  stopTimer()
  const freq = getSetting(db, 'microsoft_sync_frequency') || 'daily'
  const interval = FREQUENCIES[freq] || FREQUENCIES.daily
  syncTimer = setInterval(() => {
    importMicrosoftContacts(db).catch(() => {})
  }, interval)
}

function stopTimer(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

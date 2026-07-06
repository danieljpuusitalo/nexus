/**
 * Telegram Data Export Parser
 *
 * Parses Telegram Desktop data export files.
 * Users export via: Telegram Desktop > Settings > Advanced > Export Telegram data
 *
 * Expected structure (JSON format export):
 *   result.json — contains contacts list and chat metadata
 *   contacts.json — sometimes separate
 *
 * Also supports the HTML format export by parsing contacts list HTML.
 */

import JSZip from 'jszip'
import { normaliseContact, type RawContact } from './contact-normaliser'

export interface TelegramContact {
  first_name: string
  last_name: string
  phone: string
  how_we_met: string
}

interface TelegramExportContact {
  first_name?: string
  last_name?: string
  phone_number?: string
  phone?: string
  user_id?: number
  date?: string
}

interface TelegramExportResult {
  contacts?: { list?: TelegramExportContact[] }
  chats?: { list?: Array<{ name?: string; type?: string; id?: number }> }
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
  }
  return { first_name: parts[0] || fullName, last_name: '' }
}

export function parseTelegramJson(content: string): TelegramContact[] {
  const contacts: TelegramContact[] = []
  const seen = new Set<string>()

  try {
    const data = JSON.parse(content) as TelegramExportResult

    // Parse contacts list
    const contactList = data.contacts?.list || []
    for (const c of contactList) {
      const firstName = c.first_name || ''
      const lastName = c.last_name || ''
      const phone = c.phone_number || c.phone || ''

      if (!firstName && !lastName && !phone) continue
      const key = `${firstName} ${lastName} ${phone}`.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      contacts.push({
        first_name: firstName,
        last_name: lastName,
        phone,
        how_we_met: 'Telegram',
      })
    }

    // Also extract from personal chats if no contacts list
    if (contacts.length === 0 && data.chats?.list) {
      for (const chat of data.chats.list) {
        if (chat.type !== 'personal_chat' || !chat.name) continue
        const key = chat.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        const { first_name, last_name } = splitName(chat.name)
        contacts.push({
          first_name,
          last_name,
          phone: '',
          how_we_met: 'Telegram',
        })
      }
    }
  } catch {
    // Invalid JSON
  }

  return contacts
}

export async function parseTelegramZip(buffer: Buffer): Promise<TelegramContact[]> {
  const zip = await JSZip.loadAsync(buffer)
  const contacts: TelegramContact[] = []
  const seen = new Set<string>()

  // Try result.json first (main export file)
  for (const path of ['result.json', 'contacts.json']) {
    const file = zip.file(path)
    if (file) {
      try {
        const content = await file.async('string')
        const parsed = parseTelegramJson(content)
        for (const c of parsed) {
          const key = `${c.first_name} ${c.last_name} ${c.phone}`.trim().toLowerCase()
          if (!seen.has(key)) {
            seen.add(key)
            contacts.push(c)
          }
        }
      } catch {
        // Skip
      }
    }
  }

  // Fallback: look for any contacts-related JSON
  if (contacts.length === 0) {
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir || !path.endsWith('.json')) continue
      try {
        const content = await file.async('string')
        if (content.includes('phone_number') || content.includes('first_name')) {
          const parsed = parseTelegramJson(content)
          for (const c of parsed) {
            const key = `${c.first_name} ${c.last_name} ${c.phone}`.trim().toLowerCase()
            if (!seen.has(key)) {
              seen.add(key)
              contacts.push(c)
            }
          }
        }
      } catch {
        // Skip
      }
    }
  }

  // Also try parsing contacts from HTML export
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !path.endsWith('.html')) continue
    if (!path.toLowerCase().includes('contact')) continue
    try {
      const html = await file.async('string')
      // Extract names from the HTML contact list
      const nameMatches = html.matchAll(/<div class="name[^"]*"[^>]*>([^<]+)<\/div>/gi)
      for (const match of nameMatches) {
        const name = match[1].trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        const { first_name, last_name } = splitName(name)
        contacts.push({ first_name, last_name, phone: '', how_we_met: 'Telegram' })
      }
    } catch {
      // Skip
    }
  }

  return contacts
}

export function normaliseTelegramContacts(contacts: TelegramContact[]): RawContact[] {
  return contacts.map(c => normaliseContact({
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    how_we_met: c.how_we_met,
  }))
}

/**
 * WhatsApp Export Parser
 *
 * Parses WhatsApp data in two formats:
 *
 * 1. Chat export (.txt) — exported from WhatsApp via "Export Chat"
 *    Format: "DD/MM/YYYY, HH:MM - Contact Name: message"
 *    Extracts unique contact names from message headers.
 *
 * 2. Account data download (.zip) — from Settings > Account > Request Account Info
 *    Contains contacts as JSON or HTML files.
 */

import JSZip from 'jszip'
import { normaliseContact, type RawContact } from './contact-normaliser'

export interface WhatsAppContact {
  first_name: string
  last_name: string
  phone: string
  how_we_met: string
}

// Common WhatsApp date/time patterns across locales
const CHAT_LINE_PATTERNS = [
  // DD/MM/YYYY or MM/DD/YY, HH:MM - Name: message (covers both date formats)
  /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\]?\s*-\s*(.+?):\s/,
  // [DD/MM/YYYY, HH:MM:SS] Name: message (bracket format)
  /^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]\s*(.+?):\s/,
]

// System messages to skip
const SYSTEM_PREFIXES = [
  'messages and calls are end-to-end encrypted',
  'you created group',
  'you changed',
  'you were added',
  'you added',
  'you removed',
  'this message was deleted',
  'missed voice call',
  'missed video call',
  'waiting for this message',
  '<media omitted>',
  'null:',
]

function isSystemMessage(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return SYSTEM_PREFIXES.some(p => lower.includes(p)) || lower === 'you'
}

function isPhoneNumber(name: string): boolean {
  // Check if the "name" is actually a phone number (unsaved contact)
  const digits = name.replace(/[^0-9]/g, '')
  return digits.length >= 7 && /^[+\d\s()-]+$/.test(name.trim())
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
  }
  return { first_name: parts[0] || fullName, last_name: '' }
}

export function parseWhatsAppChat(text: string): WhatsAppContact[] {
  const lines = text.split('\n')
  const contactNames = new Set<string>()
  const phoneContacts = new Map<string, string>() // phone -> phone (dedup)

  for (const line of lines) {
    for (const pattern of CHAT_LINE_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        const name = match[1].trim()
        if (!isSystemMessage(name)) {
          if (isPhoneNumber(name)) {
            // It's an unsaved contact — store the phone number
            const cleaned = name.replace(/[^+\d]/g, '')
            phoneContacts.set(cleaned, name.trim())
          } else {
            contactNames.add(name)
          }
        }
        break
      }
    }
  }

  const contacts: WhatsAppContact[] = []

  // Named contacts
  for (const name of contactNames) {
    const { first_name, last_name } = splitName(name)
    contacts.push({
      first_name,
      last_name,
      phone: '',
      how_we_met: 'WhatsApp',
    })
  }

  // Phone-only contacts
  for (const [cleaned, original] of phoneContacts) {
    contacts.push({
      first_name: original,
      last_name: '',
      phone: cleaned,
      how_we_met: 'WhatsApp',
    })
  }

  return contacts
}

export async function parseWhatsAppZip(buffer: Buffer): Promise<WhatsAppContact[]> {
  const zip = await JSZip.loadAsync(buffer)
  const contacts: WhatsAppContact[] = []
  const seen = new Set<string>()

  // Look for chat export .txt files inside the ZIP
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue

    // WhatsApp chat export TXT files
    if (path.endsWith('.txt')) {
      try {
        const content = await file.async('string')
        // Quick check — does it look like a WhatsApp chat?
        if (content.includes(' - ') && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(content.substring(0, 200))) {
          const parsed = parseWhatsAppChat(content)
          for (const c of parsed) {
            const key = `${c.first_name} ${c.last_name} ${c.phone}`.trim()
            if (!seen.has(key)) {
              seen.add(key)
              contacts.push(c)
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Account data download — contacts JSON
    if (path.toLowerCase().includes('contact') && path.endsWith('.json')) {
      try {
        const content = await file.async('string')
        const data = JSON.parse(content)
        const entries = Array.isArray(data) ? data : data.contacts || []
        for (const entry of entries) {
          const name = entry.name || entry.display_name || entry.pushname || ''
          const phone = entry.phone || entry.number || entry.wa_id || ''
          if (!name && !phone) continue
          const key = `${name} ${phone}`.trim()
          if (seen.has(key)) continue
          seen.add(key)

          const { first_name, last_name } = name ? splitName(name) : { first_name: phone, last_name: '' }
          contacts.push({ first_name, last_name, phone: phone.toString(), how_we_met: 'WhatsApp' })
        }
      } catch {
        // Skip
      }
    }
  }

  return contacts
}

export function normaliseWhatsAppContacts(contacts: WhatsAppContact[]): RawContact[] {
  return contacts.map(c => normaliseContact({
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    how_we_met: c.how_we_met,
  }))
}

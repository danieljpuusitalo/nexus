/**
 * Phone Contacts import via the Contact Picker API (PWA / Android Chrome only).
 *
 * The Contact Picker API is a browser API that lets web apps request
 * contact information from the user's phone. Only works on Android Chrome
 * when served over HTTPS. iOS Safari does not support it.
 */

interface ContactPickerResult {
  name?: string[]
  email?: string[]
  tel?: string[]
}

declare global {
  interface Navigator {
    contacts?: {
      select: (
        properties: string[],
        options?: { multiple?: boolean }
      ) => Promise<ContactPickerResult[]>
      getProperties: () => Promise<string[]>
    }
  }
  interface Window {
    ContactsManager?: unknown
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.process !== 'undefined' &&
    typeof window.api !== 'undefined' &&
    'contacts' in window.api
}

export function isContactPickerAvailable(): boolean {
  return 'contacts' in navigator && 'ContactsManager' in window
}

export async function pickPhoneContacts(): Promise<{
  imported: number
  skipped: number
  errors: string[]
}> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] }

  if (!isContactPickerAvailable()) {
    result.errors.push('Contact Picker API not available on this device')
    return result
  }

  try {
    const contacts = await navigator.contacts!.select(
      ['name', 'email', 'tel'],
      { multiple: true }
    )

    if (!contacts || contacts.length === 0) {
      return result
    }

    // Get existing contacts for dedup
    const existing = (await window.api.contacts.getAll()) as {
      id: number; email: string; first_name: string; last_name: string
    }[]
    const existingEmails = new Set(
      existing.map((c) => c.email?.toLowerCase()).filter(Boolean)
    )
    const existingNames = new Set(
      existing.map((c) => `${c.first_name}|${c.last_name}`.toLowerCase())
    )

    for (const contact of contacts) {
      try {
        const fullName = contact.name?.[0] || ''
        if (!fullName) continue

        const parts = fullName.split(/\s+/)
        const firstName = parts[0] || ''
        const lastName = parts.slice(1).join(' ') || ''
        const email = contact.email?.[0] || ''
        const phone = contact.tel?.[0] || ''

        // Dedup by email
        if (email && existingEmails.has(email.toLowerCase())) {
          result.skipped++
          continue
        }

        // Dedup by name
        const nameKey = `${firstName}|${lastName}`.toLowerCase()
        if (existingNames.has(nameKey)) {
          result.skipped++
          continue
        }

        await window.api.contacts.create({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          how_we_met: 'Phone Contacts',
        })

        if (email) existingEmails.add(email.toLowerCase())
        existingNames.add(nameKey)
        result.imported++
      } catch {
        result.errors.push(`Failed to import: ${contact.name?.[0] || 'unknown'}`)
      }
    }
  } catch (err) {
    if (String(err).includes('cancelled') || String(err).includes('canceled')) {
      // User cancelled the picker — not an error
    } else {
      result.errors.push(String(err))
    }
  }

  return result
}

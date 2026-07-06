/**
 * vCard (.vcf) Parser
 *
 * Parses VCF files (vCard 2.1, 3.0, and 4.0) into contact data.
 * Handles multi-contact VCF files (multiple BEGIN:VCARD blocks).
 * Supports encoded values (quoted-printable, base64).
 */

export interface ParsedVCardContact {
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  website: string
  address: string
  birthday: string
  notes: string
  linkedin_url: string
  how_we_met: string
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function decodeVCardValue(raw: string): string {
  // Handle escaped characters
  return raw
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function extractPropertyValue(line: string): { params: string; value: string } {
  // Properties can have parameters: PROP;PARAM=VALUE:actual value
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { params: '', value: line }

  const beforeColon = line.substring(0, colonIdx)
  const value = line.substring(colonIdx + 1)

  return { params: beforeColon, value }
}

function isQuotedPrintable(params: string): boolean {
  return /ENCODING=QUOTED-PRINTABLE/i.test(params)
}

export function parseVCardFile(content: string): ParsedVCardContact[] {
  const contacts: ParsedVCardContact[] = []

  // Unfold continuation lines (lines starting with space or tab are continuations)
  const unfolded = content.replace(/\r\n[ \t]/g, '').replace(/\r?\n[ \t]/g, '')

  // Split into individual vCards
  const vcardBlocks = unfolded.split(/END:VCARD/i)

  for (const block of vcardBlocks) {
    const startIdx = block.search(/BEGIN:VCARD/i)
    if (startIdx === -1) continue

    const vcardContent = block.substring(startIdx)
    const lines = vcardContent.split(/\r?\n/)

    const contact: ParsedVCardContact = {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      company: '',
      job_title: '',
      website: '',
      address: '',
      birthday: '',
      notes: '',
      linkedin_url: '',
      how_we_met: 'Phone Contacts',
    }

    let hasName = false

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || /^(BEGIN|END|VERSION):/i.test(line)) continue

      const { params, value: rawValue } = extractPropertyValue(line)
      const propName = params.split(';')[0].toUpperCase()
      const value = isQuotedPrintable(params)
        ? decodeQuotedPrintable(rawValue)
        : decodeVCardValue(rawValue)

      switch (propName) {
        case 'FN': {
          // Formatted Name — most reliable
          if (!hasName && value) {
            const parts = value.split(/\s+/)
            contact.first_name = parts[0] || ''
            contact.last_name = parts.slice(1).join(' ') || ''
            hasName = true
          }
          break
        }
        case 'N': {
          // Structured name: LastName;FirstName;MiddleName;Prefix;Suffix
          const nameParts = value.split(';')
          const lastName = (nameParts[0] || '').trim()
          const firstName = (nameParts[1] || '').trim()
          if (firstName || lastName) {
            contact.first_name = firstName
            contact.last_name = lastName
            hasName = true
          }
          break
        }
        case 'EMAIL': {
          if (!contact.email && value) {
            contact.email = value.trim()
          }
          break
        }
        case 'TEL': {
          if (!contact.phone && value) {
            contact.phone = value.replace(/[^\d+\-() ]/g, '').trim()
          }
          break
        }
        case 'ORG': {
          if (!contact.company && value) {
            // ORG can be semicolon-separated: Company;Department
            contact.company = value.split(';')[0].trim()
          }
          break
        }
        case 'TITLE': {
          if (!contact.job_title && value) {
            contact.job_title = value.trim()
          }
          break
        }
        case 'ROLE': {
          // ROLE as fallback for job title
          if (!contact.job_title && value) {
            contact.job_title = value.trim()
          }
          break
        }
        case 'URL': {
          if (value) {
            const url = value.trim()
            if (url.includes('linkedin.com')) {
              contact.linkedin_url = url
            } else if (!contact.website) {
              contact.website = url
            }
          }
          break
        }
        case 'ADR': {
          if (!contact.address && value) {
            // ADR: PO Box;Extended;Street;City;Region;Postal;Country
            const parts = value.split(';').map(p => p.trim()).filter(Boolean)
            contact.address = parts.join(', ')
          }
          break
        }
        case 'BDAY': {
          if (!contact.birthday && value) {
            // Format: YYYYMMDD or YYYY-MM-DD or --MMDD
            let bday = value.trim().replace(/[^0-9-]/g, '')
            if (/^\d{8}$/.test(bday)) {
              bday = `${bday.slice(0, 4)}-${bday.slice(4, 6)}-${bday.slice(6, 8)}`
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(bday)) {
              contact.birthday = bday
            }
          }
          break
        }
        case 'NOTE': {
          if (!contact.notes && value) {
            contact.notes = value.trim()
          }
          break
        }
        case 'X-SOCIALPROFILE':
        case 'X-SOCIAL': {
          if (value && value.includes('linkedin.com') && !contact.linkedin_url) {
            contact.linkedin_url = value.trim()
          }
          break
        }
      }
    }

    // Only add if we have at least a name
    if (contact.first_name || contact.last_name) {
      contacts.push(contact)
    }
  }

  return contacts
}

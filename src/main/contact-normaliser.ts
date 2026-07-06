/**
 * Contact Normaliser
 *
 * Cleans and standardises contact data before import.
 * Applied consistently across all import sources (CSV, VCF, Google, Outlook, etc.)
 */

export interface RawContact {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company?: string
  job_title?: string
  website?: string
  linkedin_url?: string
  twitter_url?: string
  facebook_url?: string
  instagram_url?: string
  address?: string
  birthday?: string
  location?: string
  notes?: string
  how_we_met?: string
  education?: string
}

export function normaliseContact(raw: RawContact): RawContact {
  const contact = { ...raw }

  // Name: capitalise first letter of each word
  if (contact.first_name) contact.first_name = capitaliseName(contact.first_name.trim())
  if (contact.last_name) contact.last_name = capitaliseName(contact.last_name.trim())

  // Email: lowercase, trim
  if (contact.email) contact.email = contact.email.trim().toLowerCase()

  // Phone: normalise format
  if (contact.phone) contact.phone = normalisePhone(contact.phone)

  // URLs: ensure https prefix, clean trailing slashes
  if (contact.website) contact.website = normaliseUrl(contact.website)
  if (contact.linkedin_url) contact.linkedin_url = normaliseUrl(contact.linkedin_url)
  if (contact.twitter_url) contact.twitter_url = normaliseUrl(contact.twitter_url)
  if (contact.facebook_url) contact.facebook_url = normaliseUrl(contact.facebook_url)
  if (contact.instagram_url) contact.instagram_url = normaliseUrl(contact.instagram_url)

  // Company: trim whitespace
  if (contact.company) contact.company = contact.company.trim()

  // Job title: trim whitespace
  if (contact.job_title) contact.job_title = contact.job_title.trim()

  // Address: collapse multiple spaces/newlines
  if (contact.address) contact.address = contact.address.replace(/\s+/g, ' ').trim()

  // Birthday: normalise to YYYY-MM-DD
  if (contact.birthday) contact.birthday = normaliseBirthday(contact.birthday)

  // Location: trim
  if (contact.location) contact.location = contact.location.trim()

  // Notes: trim
  if (contact.notes) contact.notes = contact.notes.trim()

  return contact
}

function capitaliseName(name: string): string {
  return name
    .split(/\s+/)
    .map(word => {
      if (!word) return word
      // Handle hyphenated names (Mary-Jane)
      if (word.includes('-')) {
        return word.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('-')
      }
      // Handle names like McDonald, MacDonald, O'Brien
      if (/^mc/i.test(word) && word.length > 3) {
        return word.charAt(0).toUpperCase() + word.charAt(1).toLowerCase() + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase()
      }
      if (/^mac/i.test(word) && word.length > 4) {
        return word.charAt(0).toUpperCase() + word.slice(1, 3).toLowerCase() + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase()
      }
      if (word.includes("'") && word.length > 2) {
        const parts = word.split("'")
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("'")
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function normalisePhone(phone: string): string {
  let cleaned = phone.trim()
  // Remove leading/trailing non-digit chars except +
  cleaned = cleaned.replace(/^[^+\d]+|[^+\d]+$/g, '')
  // If it's all digits and long enough, it's valid
  if (cleaned.replace(/\D/g, '').length < 7) return phone.trim()
  return cleaned
}

function normaliseUrl(url: string): string {
  let cleaned = url.trim()
  if (!cleaned) return ''
  // Add protocol if missing
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`
  }
  // Remove trailing slash
  cleaned = cleaned.replace(/\/+$/, '')
  return cleaned
}

function normaliseBirthday(birthday: string): string {
  const trimmed = birthday.trim()

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }

  // MM/DD/YYYY or DD/MM/YYYY (assume US format MM/DD/YYYY)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, a, b, year] = slashMatch
    // Heuristic: if first number > 12, it's DD/MM/YYYY
    if (Number(a) > 12) {
      return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    }
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
  }

  // DD-MM-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMatch) {
    const [, day, month, year] = dashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return trimmed
}

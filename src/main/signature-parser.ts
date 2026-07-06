/**
 * Email Signature Parser
 *
 * Extracts contact information from email signatures using regex.
 * No AI needed — pure pattern matching. Zero cost.
 *
 * Used after Gmail/Outlook sync to enrich contacts with phone numbers,
 * job titles, websites, etc. found in email signatures.
 */

import type Database from 'better-sqlite3'

export interface SignatureData {
  phone?: string
  title?: string
  company?: string
  website?: string
  linkedin?: string
  twitter?: string
  address?: string
}

// ── Signature extraction ───────────────────────────

const SIGNATURE_MARKERS = [
  /^--\s*$/m,             // Standard email sig separator
  /^_{3,}$/m,             // Underscores
  /^-{3,}$/m,             // Dashes
  /^Sent from/m,          // Mobile signatures
  /^Best regards?,?\s*$/mi,
  /^Kind regards?,?\s*$/mi,
  /^Thanks?,?[.]?\s*$/mi,
  /^Cheers,?[.]?\s*$/mi,
  /^Regards,?[.]?\s*$/mi,
  /^Warm regards?,?\s*$/mi,
  /^Sincerely,?\s*$/mi,
  /^With regards?,?\s*$/mi,
  /^Thank you,?\s*$/mi,
  /^Many thanks,?\s*$/mi,
]

export function extractSignature(emailBody: string): string | null {
  if (!emailBody) return null

  // Strip HTML tags if present
  let text = emailBody.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  const lines = text.split('\n')

  // Find the first signature marker
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    for (const marker of SIGNATURE_MARKERS) {
      if (marker.test(line)) {
        // Take everything after the marker (up to 15 lines)
        const sigLines = lines.slice(i + 1, i + 16).filter(l => l.trim())
        if (sigLines.length > 0) {
          return sigLines.join('\n')
        }
      }
    }
  }

  // Fallback: if no marker found, take last 10 non-empty lines
  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length > 5) {
    return nonEmpty.slice(-10).join('\n')
  }

  return null
}

// ── Field extraction from signature block ──────────

// Phone: international formats
const PHONE_PATTERNS = [
  /(?:(?:phone|tel|mobile|cell|fax|ph|t|m|p)[.:]*\s*)?(\+?\d[\d\s\-().]{7,20}\d)/gi,
]

// URL patterns
const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?([a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\/[^\s,]*)?)/gi

// LinkedIn
const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-z0-9_-]+)/i

// Twitter/X
const TWITTER_PATTERN = /(?:(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([a-z0-9_]+))|(?:@([a-z0-9_]{2,}))/i

// Address: look for patterns with postal/zip codes
const ADDRESS_PATTERNS = [
  /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl)[.,]?\s*(?:suite|ste|apt|#)?\s*\d*[,.]?\s*[\w\s]+[,.]?\s*[A-Z]{2}\s+\d{5}/i,
  /[\w\s]+\d{4,5}\s+[\w\s]+/i, // European: City 12345 Country
]

export function parseSignatureData(signatureBlock: string): SignatureData {
  const data: SignatureData = {}
  const lines = signatureBlock.split('\n').map(l => l.trim()).filter(Boolean)

  // Extract phone
  for (const pattern of PHONE_PATTERNS) {
    const match = signatureBlock.match(pattern)
    if (match) {
      // Clean the phone number
      let phone = match[0]
        .replace(/^(?:phone|tel|mobile|cell|fax|ph|t|m|p)[.:]*\s*/i, '')
        .trim()
      // Validate: must have at least 7 digits
      if (phone.replace(/\D/g, '').length >= 7) {
        data.phone = phone
        break
      }
    }
  }

  // Extract LinkedIn
  const linkedinMatch = signatureBlock.match(LINKEDIN_PATTERN)
  if (linkedinMatch) {
    data.linkedin = `https://www.linkedin.com/in/${linkedinMatch[1]}`
  }

  // Extract Twitter
  const twitterMatch = signatureBlock.match(TWITTER_PATTERN)
  if (twitterMatch) {
    const handle = twitterMatch[1] || twitterMatch[2]
    if (handle && !['http', 'https', 'www', 'com'].includes(handle.toLowerCase())) {
      data.twitter = `https://twitter.com/${handle}`
    }
  }

  // Extract website (not LinkedIn/Twitter/Facebook)
  const urlMatches = [...signatureBlock.matchAll(URL_PATTERN)]
  for (const m of urlMatches) {
    const url = m[0].toLowerCase()
    if (!url.includes('linkedin.com') && !url.includes('twitter.com') && !url.includes('x.com') &&
        !url.includes('facebook.com') && !url.includes('instagram.com') && !url.includes('mailto:') &&
        !url.includes('google.com') && !url.includes('outlook.com')) {
      data.website = m[0].startsWith('http') ? m[0] : `https://${m[0]}`
      break
    }
  }

  // Extract address
  for (const pattern of ADDRESS_PATTERNS) {
    const match = signatureBlock.match(pattern)
    if (match) {
      data.address = match[0].trim()
      break
    }
  }

  // Extract title and company from non-URL, non-phone lines
  // Heuristic: job title is typically a short line (< 60 chars) near the top of the signature
  // Company name often follows the person's name
  const candidateLines = lines.filter(line => {
    const lower = line.toLowerCase()
    // Skip lines that are just phone, url, email, or address
    if (/^\+?\d[\d\s\-().]+$/.test(line)) return false
    if (URL_PATTERN.test(line)) return false
    if (/@/.test(line) && /\./.test(line)) return false
    if (line.length > 80) return false
    if (/^(?:phone|tel|mobile|cell|fax|email|e-mail|address|web|website)[.:]/i.test(line)) return false
    return lower.length > 1
  })

  // Reset URL pattern lastIndex since we used it with /g flag
  URL_PATTERN.lastIndex = 0

  // The first candidate line after any name line is likely the job title
  // The second is likely the company
  if (candidateLines.length >= 2) {
    // Guess: if a line contains common title keywords, it's a title
    const titleKeywords = /\b(?:manager|director|engineer|developer|designer|analyst|consultant|specialist|coordinator|lead|head|chief|ceo|cto|cfo|coo|vp|president|founder|co-founder|partner|associate|senior|junior|intern|executive|officer|advisor|architect|scientist|researcher)\b/i

    for (let i = 0; i < Math.min(candidateLines.length, 4); i++) {
      if (!data.title && titleKeywords.test(candidateLines[i])) {
        data.title = candidateLines[i]
      } else if (!data.company && data.title && !titleKeywords.test(candidateLines[i]) && candidateLines[i].length < 50) {
        data.company = candidateLines[i]
      }
    }

    // Fallback: if no title keyword found, take first two candidate lines
    if (!data.title && candidateLines.length >= 1) {
      // First candidate might be the name (skip it), second might be title
      if (candidateLines.length >= 2) {
        data.title = candidateLines[0]
        data.company = candidateLines[1]
      }
    }
  }

  return data
}

// ── Enrichment: apply signature data to contacts ───

interface ContactRow {
  id: number
  email: string
  phone: string
  job_title: string
  company: string
  website: string
  linkedin_url: string
  twitter_url: string
  address: string
}

export function enrichContactFromSignature(
  db: Database.Database,
  contactId: number,
  sigData: SignatureData
): boolean {
  const contact = db.prepare(
    'SELECT id, email, phone, job_title, company, website, linkedin_url, twitter_url, address FROM contacts WHERE id = ?'
  ).get(contactId) as ContactRow | undefined

  if (!contact) return false

  const updates: Record<string, string> = {}

  // Only fill empty fields — never overwrite user data
  if (!contact.phone && sigData.phone) updates.phone = sigData.phone
  if (!contact.job_title && sigData.title) updates.job_title = sigData.title
  if (!contact.company && sigData.company) updates.company = sigData.company
  if (!contact.website && sigData.website) updates.website = sigData.website
  if (!contact.linkedin_url && sigData.linkedin) updates.linkedin_url = sigData.linkedin
  if (!contact.twitter_url && sigData.twitter) updates.twitter_url = sigData.twitter
  if (!contact.address && sigData.address) updates.address = sigData.address

  if (Object.keys(updates).length === 0) return false

  // Build dynamic UPDATE query
  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE contacts SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...updates, id: contactId })

  return true
}

// ── Batch enrichment runner ────────────────────────

export interface EnrichmentResult {
  enriched: number
  scanned: number
  fields: { phones: number; titles: number; companies: number; websites: number; linkedins: number }
}

/**
 * Run signature enrichment on all contacts that have an email address.
 * This is a local-only operation — it parses signatures from any stored email bodies.
 * If no email bodies are available (Gmail scope doesn't include body reading),
 * this gracefully returns 0 enriched.
 */
export function runSignatureEnrichment(
  db: Database.Database,
  signatureBodies: Array<{ email: string; body: string }>
): EnrichmentResult {
  const result: EnrichmentResult = {
    enriched: 0,
    scanned: 0,
    fields: { phones: 0, titles: 0, companies: 0, websites: 0, linkedins: 0 }
  }

  // Build email -> contact ID map
  const contacts = db.prepare(
    'SELECT id, email FROM contacts WHERE email != \'\' AND email IS NOT NULL AND deleted_at IS NULL'
  ).all() as { id: number; email: string }[]

  const emailToId = new Map<string, number>()
  for (const c of contacts) {
    emailToId.set(c.email.toLowerCase(), c.id)
  }

  for (const { email, body } of signatureBodies) {
    result.scanned++

    const contactId = emailToId.get(email.toLowerCase())
    if (!contactId) continue

    const signature = extractSignature(body)
    if (!signature) continue

    const sigData = parseSignatureData(signature)

    if (sigData.phone) result.fields.phones++
    if (sigData.title) result.fields.titles++
    if (sigData.company) result.fields.companies++
    if (sigData.website) result.fields.websites++
    if (sigData.linkedin) result.fields.linkedins++

    const enriched = enrichContactFromSignature(db, contactId, sigData)
    if (enriched) result.enriched++
  }

  return result
}

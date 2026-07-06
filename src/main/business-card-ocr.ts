/**
 * Business Card OCR Scanner
 *
 * Extracts contact information from business card images using regex patterns.
 * Works with pre-extracted text (OCR done on renderer side or passed as text).
 *
 * Detects: name, email, phone, company, job title, website, address.
 */

import { normaliseContact, type RawContact } from './contact-normaliser'

export interface BusinessCardData {
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  website: string
  address: string
}

// Common job title keywords
const JOB_TITLE_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'vp', 'president', 'director',
  'manager', 'engineer', 'developer', 'designer', 'analyst', 'consultant',
  'advisor', 'partner', 'founder', 'co-founder', 'associate', 'coordinator',
  'specialist', 'executive', 'officer', 'head of', 'lead', 'senior', 'junior',
  'principal', 'architect', 'scientist', 'researcher', 'professor', 'doctor',
  'attorney', 'lawyer', 'accountant', 'broker', 'agent', 'strategist',
  'marketing', 'sales', 'operations', 'product', 'project', 'program',
]

function extractEmail(text: string): string {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i)
  return match ? match[0].toLowerCase() : ''
}

function extractPhone(text: string): string {
  // Match various phone formats
  const patterns = [
    /(?:tel|phone|ph|mob|cell|fax)?[:\s]*([+]?\d[\d\s()-]{7,}\d)/i,
    /([+]?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})/,
    /([+]?\d{10,15})/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const phone = match[1].trim()
      // Must have at least 7 digits
      if (phone.replace(/\D/g, '').length >= 7) return phone
    }
  }
  return ''
}

function extractWebsite(text: string): string {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/[^\s]*)?)/i)
  if (match) {
    const url = match[0]
    // Skip email domains and social media
    if (url.includes('@')) return ''
    if (/linkedin|twitter|facebook|instagram|youtube/i.test(url)) return ''
    return url
  }
  return ''
}

function extractJobTitle(lines: string[]): string {
  for (const line of lines) {
    const lower = line.toLowerCase().trim()
    if (JOB_TITLE_KEYWORDS.some(kw => lower.includes(kw))) {
      // It's likely a job title line
      if (lower.length < 80 && !lower.includes('@') && !/\d{5,}/.test(lower)) {
        return line.trim()
      }
    }
  }
  return ''
}

function extractAddress(text: string): string {
  // Look for patterns with postal/zip codes
  const patterns = [
    // US zip: "City, ST 12345"
    /\d+\s+[\w\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/,
    // UK postcode
    /\d+\s+[\w\s]+,?\s*[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}/i,
    // Australian postcode
    /\d+\s+[\w\s]+,\s*\w+\s+\d{4}/,
    // General: number + street name + comma-separated
    /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|place|pl|court|ct)\s*[,.]?\s*[\w\s]+/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[0].trim()
  }
  return ''
}

export function parseBusinessCardText(text: string): BusinessCardData {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const email = extractEmail(text)
  const phone = extractPhone(text)
  const website = extractWebsite(text)
  const jobTitle = extractJobTitle(lines)
  const address = extractAddress(text)

  // For name: try the first line that isn't email, phone, title, or website
  let firstName = ''
  let lastName = ''
  let company = ''

  // Filter out lines that are identified as other fields
  const candidateLines = lines.filter(line => {
    const lower = line.toLowerCase()
    if (line.includes('@')) return false
    if (/^[+\d(]/.test(line) && line.replace(/\D/g, '').length >= 7) return false
    if (lower === jobTitle.toLowerCase()) return false
    if (website && lower.includes(website.toLowerCase().replace(/^https?:\/\//, ''))) return false
    if (address && lower === address.toLowerCase()) return false
    if (/^(tel|phone|fax|email|web|www|http)/i.test(lower)) return false
    return true
  })

  // First candidate is likely the name, second is likely the company
  if (candidateLines.length >= 1) {
    const nameParts = candidateLines[0].split(/\s+/)
    firstName = nameParts[0] || ''
    lastName = nameParts.slice(1).join(' ') || ''
  }

  if (candidateLines.length >= 2) {
    // The company is the second candidate line (job title is already filtered out)
    company = candidateLines[1]
  }

  return { first_name: firstName, last_name: lastName, email, phone, company, job_title: jobTitle, website, address }
}

export function normaliseBusinessCard(data: BusinessCardData): RawContact {
  return normaliseContact({
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    job_title: data.job_title,
    website: data.website,
    address: data.address,
    how_we_met: 'Business Card',
  })
}

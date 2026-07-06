/**
 * Instagram Data Export Parser
 *
 * Parses Instagram data download ZIP files to extract followers/following.
 * Instagram data downloads contain JSON files with profile information.
 *
 * Expected ZIP structure:
 *   followers_and_following/followers_1.json
 *   followers_and_following/following.json
 *   personal_information/personal_information.json
 */

import JSZip from 'jszip'
import { normaliseContact, type RawContact } from './contact-normaliser'

export interface InstagramContact {
  first_name: string
  last_name: string
  instagram_url: string
  how_we_met: string
}

interface IGFollowerEntry {
  title?: string
  string_list_data?: Array<{ href?: string; value?: string; timestamp?: number }>
  // Older format
  value?: string
}

function parseUsername(entry: IGFollowerEntry): { username: string; url: string } | null {
  // New JSON format (2023+)
  if (entry.string_list_data?.length) {
    const data = entry.string_list_data[0]
    const href = data.href || ''
    const value = data.value || entry.title || ''
    const username = value || href.replace(/.*instagram\.com\//, '').replace(/\/$/, '')
    if (!username) return null
    return {
      username,
      url: href || `https://www.instagram.com/${username}`
    }
  }

  // Title-only format
  if (entry.title) {
    return {
      username: entry.title,
      url: `https://www.instagram.com/${entry.title}`
    }
  }

  // Legacy format
  if (entry.value) {
    return {
      username: entry.value,
      url: `https://www.instagram.com/${entry.value}`
    }
  }

  return null
}

function usernameToName(username: string): { first_name: string; last_name: string } {
  // Try to split usernames like "john_doe" or "john.doe" into name parts
  const cleaned = username.replace(/[._]/g, ' ').replace(/\d+/g, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
  }
  return { first_name: parts[0] || username, last_name: '' }
}

export async function parseInstagramZip(buffer: Buffer): Promise<InstagramContact[]> {
  const zip = await JSZip.loadAsync(buffer)
  const contacts: InstagramContact[] = []
  const seenUsernames = new Set<string>()

  // Look for follower/following JSON files
  const jsonPaths = [
    'followers_and_following/followers_1.json',
    'followers_and_following/following.json',
    'followers_and_following/followers.json',
    // Some exports nest differently
    'connections/followers_and_following/followers_1.json',
    'connections/followers_and_following/following.json',
  ]

  for (const path of jsonPaths) {
    const file = zip.file(path)
    if (!file) continue

    try {
      const content = await file.async('string')
      const data = JSON.parse(content)

      // Data can be an array directly or wrapped in an object
      const entries: IGFollowerEntry[] = Array.isArray(data)
        ? data
        : data.relationships_followers || data.relationships_following || []

      for (const entry of entries) {
        const parsed = parseUsername(entry)
        if (!parsed || seenUsernames.has(parsed.username)) continue
        seenUsernames.add(parsed.username)

        const name = usernameToName(parsed.username)
        contacts.push({
          first_name: name.first_name,
          last_name: name.last_name,
          instagram_url: parsed.url,
          how_we_met: 'Instagram',
        })
      }
    } catch {
      // Skip malformed files
    }
  }

  // Also try to find any JSON files matching follower patterns
  if (contacts.length === 0) {
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      if (!path.endsWith('.json')) continue
      if (!path.toLowerCase().includes('follow')) continue

      try {
        const content = await file.async('string')
        const data = JSON.parse(content)
        const entries: IGFollowerEntry[] = Array.isArray(data) ? data : []

        for (const entry of entries) {
          const parsed = parseUsername(entry)
          if (!parsed || seenUsernames.has(parsed.username)) continue
          seenUsernames.add(parsed.username)

          const name = usernameToName(parsed.username)
          contacts.push({
            first_name: name.first_name,
            last_name: name.last_name,
            instagram_url: parsed.url,
            how_we_met: 'Instagram',
          })
        }
      } catch {
        // Skip
      }
    }
  }

  return contacts
}

export function normaliseInstagramContacts(contacts: InstagramContact[]): RawContact[] {
  return contacts.map(c => normaliseContact({
    first_name: c.first_name,
    last_name: c.last_name,
    instagram_url: c.instagram_url,
    how_we_met: c.how_we_met,
  }))
}

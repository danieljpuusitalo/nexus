/**
 * Google Contacts import via People API.
 * Deduplicates by email (primary), then name + company combo.
 * Pulls photos when available.
 */

const PEOPLE_API = 'https://people.googleapis.com/v1'

interface GooglePerson {
  resourceName: string
  names?: { displayName: string; givenName?: string; familyName?: string }[]
  emailAddresses?: { value: string }[]
  phoneNumbers?: { value: string }[]
  organizations?: { name?: string; title?: string }[]
  photos?: { url: string; default?: boolean }[]
  birthdays?: { date?: { year?: number; month?: number; day?: number } }[]
  addresses?: { formattedValue?: string }[]
}

export async function importGoogleContacts(): Promise<{
  imported: number
  skipped: number
  errors: string[]
}> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] }

  const token = await window.api.google.getAccessToken() as string | null
  if (!token) {
    result.errors.push('Google not connected')
    return result
  }

  try {
    // Fetch all Google contacts
    const people = await fetchAllContacts(token)

    // Get existing contacts for deduplication
    const existing = await window.api.contacts.getAll() as {
      id: number; email: string; first_name: string; last_name: string; company: string
    }[]

    const existingEmails = new Set(existing.map(c => c.email?.toLowerCase()).filter(Boolean))
    const existingNames = new Set(
      existing.map(c => `${c.first_name}|${c.last_name}|${c.company}`.toLowerCase())
    )

    for (const person of people) {
      try {
        const name = person.names?.[0]
        const email = person.emailAddresses?.[0]?.value || ''
        const phone = person.phoneNumbers?.[0]?.value || ''
        const org = person.organizations?.[0]
        const photo = person.photos?.find(p => !p.default)?.url || ''
        const birthday = formatBirthday(person.birthdays?.[0]?.date)

        const firstName = name?.givenName || ''
        const lastName = name?.familyName || ''

        // Skip contacts with no name
        if (!firstName && !lastName) continue

        // Deduplicate by email
        if (email && existingEmails.has(email.toLowerCase())) {
          result.skipped++
          continue
        }

        // Deduplicate by name + company
        const nameKey = `${firstName}|${lastName}|${org?.name || ''}`.toLowerCase()
        if (existingNames.has(nameKey)) {
          result.skipped++
          continue
        }

        // Import the contact
        await window.api.contacts.create({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          company: org?.name || '',
          job_title: org?.title || '',
          linkedin_url: '',
          photo_url: photo,
          notes: '',
          how_we_met: 'Google Contacts',
          birthday,
          keep_in_touch_days: 0,
        })

        // Track for dedup within this batch
        if (email) existingEmails.add(email.toLowerCase())
        existingNames.add(nameKey)

        result.imported++
      } catch {
        result.errors.push(`Failed to import: ${person.names?.[0]?.displayName || 'unknown'}`)
      }
    }

    await window.api.settings.set('google_contacts_last_import', new Date().toISOString())
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}

async function fetchAllContacts(token: string): Promise<GooglePerson[]> {
  const allPeople: GooglePerson[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${PEOPLE_API}/people/me/connections`)
    url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,organizations,photos,birthdays,addresses')
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('sortOrder', 'LAST_MODIFIED_DESCENDING')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      if (response.status === 401) throw new Error('Google token expired')
      throw new Error(`People API error: ${response.status}`)
    }

    const data = await response.json() as {
      connections?: GooglePerson[]
      nextPageToken?: string
    }

    if (data.connections) {
      allPeople.push(...data.connections)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return allPeople
}

function formatBirthday(date?: { year?: number; month?: number; day?: number }): string {
  if (!date || !date.month || !date.day) return ''
  const year = date.year || 1900
  const month = String(date.month).padStart(2, '0')
  const day = String(date.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

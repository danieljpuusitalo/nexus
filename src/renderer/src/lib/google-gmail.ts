/**
 * Gmail metadata sync — fetch email headers (From/To/Date) and match
 * sender/recipient to existing contacts. Log as interactions with type "email".
 * Never reads email body content.
 */

const GMAIL_API = 'https://www.googleapis.com/gmail/v1'

interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  payload: {
    headers: { name: string; value: string }[]
  }
  internalDate: string
}

export async function syncGmailMetadata(daysBack = 30): Promise<{
  synced: number
  matched: number
  errors: string[]
}> {
  const result = { synced: 0, matched: 0, errors: [] as string[] }

  const token = await window.api.google.getAccessToken() as string | null
  if (!token) {
    result.errors.push('Google not connected')
    return result
  }

  try {
    // Get all contacts with emails for matching
    const contacts = await window.api.contacts.getAll() as {
      id: number; email: string; first_name: string; last_name: string
    }[]
    const emailToContact = new Map<string, number>()
    for (const c of contacts) {
      if (c.email) emailToContact.set(c.email.toLowerCase(), c.id)
    }

    if (emailToContact.size === 0) return result

    // Fetch recent messages
    const afterDate = new Date(Date.now() - daysBack * 86400000)
    const query = `after:${formatGmailDate(afterDate)}`

    const messageIds = await listMessageIds(token, query, 200)
    if (messageIds.length === 0) return result

    // Fetch metadata for each message (in batches)
    const batchSize = 20
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize)

      for (const msgId of batch) {
        try {
          const msg = await fetchMessageMetadata(token, msgId)
          if (!msg) continue

          const from = getHeader(msg, 'From')
          const to = getHeader(msg, 'To')
          const subject = getHeader(msg, 'Subject')
          const dateStr = getHeader(msg, 'Date')

          // Extract email addresses
          const fromEmail = extractEmail(from)
          const toEmails = to.split(',').map(extractEmail).filter(Boolean)

          // Determine date
          const date = dateStr
            ? new Date(dateStr).toISOString().split('T')[0]
            : new Date(Number(msg.internalDate)).toISOString().split('T')[0]

          // Check if sender or any recipient is a known contact
          const isSent = msg.labelIds.includes('SENT')
          const matchedEmails = isSent ? toEmails : [fromEmail]

          for (const email of matchedEmails) {
            if (!email) continue
            const contactId = emailToContact.get(email.toLowerCase())
            if (!contactId) continue

            const direction = isSent ? 'Sent' : 'Received'
            const description = `Email ${direction.toLowerCase()}: ${subject || '(no subject)'}`

            try {
              await window.api.interactions.create({
                contact_id: contactId,
                type: 'email',
                description,
                date,
              })
              result.matched++
            } catch {
              // Likely duplicate — skip
            }
          }

          result.synced++
        } catch {
          // Skip individual message errors
        }
      }
    }

    await window.api.settings.set('google_gmail_last_sync', new Date().toISOString())
  } catch (err) {
    result.errors.push(String(err))
  }

  return result
}

async function listMessageIds(token: string, query: string, maxResults: number): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${GMAIL_API}/users/me/messages`)
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', String(Math.min(maxResults - ids.length, 100)))
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      if (response.status === 401) throw new Error('Google token expired')
      throw new Error(`Gmail API error: ${response.status}`)
    }

    const data = await response.json() as {
      messages?: { id: string }[]
      nextPageToken?: string
    }

    if (data.messages) {
      ids.push(...data.messages.map(m => m.id))
    }
    pageToken = data.nextPageToken
  } while (pageToken && ids.length < maxResults)

  return ids
}

async function fetchMessageMetadata(token: string, messageId: string): Promise<GmailMessage | null> {
  const url = new URL(`${GMAIL_API}/users/me/messages/${messageId}`)
  url.searchParams.set('format', 'metadata')
  url.searchParams.set('metadataHeaders', 'From')
  url.searchParams.append('metadataHeaders', 'To')
  url.searchParams.append('metadataHeaders', 'Subject')
  url.searchParams.append('metadataHeaders', 'Date')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return null
  return response.json() as Promise<GmailMessage>
}

function getHeader(msg: GmailMessage, name: string): string {
  const header = msg.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )
  return header?.value || ''
}

function extractEmail(str: string): string {
  if (!str) return ''
  const match = str.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase()
  // Plain email without angle brackets
  const trimmed = str.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : ''
}

function formatGmailDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/**
 * AI Client — Claude API integration using native fetch.
 * No SDK dependency. Handles streaming, rate limiting, and context building.
 */

import type Database from 'better-sqlite3'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiResponse {
  content: string
  usage: { input_tokens: number; output_tokens: number }
}

function getApiKey(db: Database.Database): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_api_key') as { value: string } | undefined
  return row?.value || null
}

export function isAiConfigured(db: Database.Database): boolean {
  return !!getApiKey(db)
}

export async function sendMessage(
  db: Database.Database,
  messages: AiMessage[],
  systemPrompt: string
): Promise<AiResponse> {
  const apiKey = getApiKey(db)
  if (!apiKey) throw new Error('AI API key not configured. Go to Settings to add your Anthropic API key.')

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages
    })
  })

  if (!response.ok) {
    const body = await response.text()
    if (response.status === 401) throw new Error('Invalid API key. Check your Anthropic API key in Settings.')
    if (response.status === 429) throw new Error('Rate limited. Please wait a moment and try again.')
    throw new Error(`AI request failed (${response.status}): ${body}`)
  }

  const data = await response.json() as {
    content: { type: string; text: string }[]
    usage: { input_tokens: number; output_tokens: number }
  }

  const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  return { content: text, usage: data.usage }
}

// --- Context Builders ---

export function buildContactContext(db: Database.Database, contactId: number): string {
  const contact = db.prepare(`
    SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tag_names, GROUP_CONCAT(DISTINCT g.name) as group_names
    FROM contacts c
    LEFT JOIN contact_tags ct ON c.id = ct.contact_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    LEFT JOIN contact_groups cg ON c.id = cg.contact_id
    LEFT JOIN groups g ON cg.group_id = g.id
    WHERE c.id = ? AND c.deleted_at IS NULL
    GROUP BY c.id
  `).get(contactId) as Record<string, unknown> | undefined
  if (!contact) return 'Contact not found.'

  const interactions = db.prepare(`
    SELECT type, description, date FROM interactions
    WHERE contact_id = ? ORDER BY date DESC LIMIT 10
  `).all(contactId) as { type: string; description: string; date: string }[]

  const customFields = db.prepare(
    'SELECT field_name, field_value FROM custom_fields WHERE contact_id = ?'
  ).all(contactId) as { field_name: string; field_value: string }[]

  let ctx = `## Contact Profile\n`
  ctx += `Name: ${contact.first_name} ${contact.last_name}\n`
  if (contact.job_title) ctx += `Title: ${contact.job_title}\n`
  if (contact.company) ctx += `Company: ${contact.company}\n`
  if (contact.location) ctx += `Location: ${contact.location}\n`
  if (contact.email) ctx += `Email: ${contact.email}\n`
  if (contact.how_we_met) ctx += `How we met: ${contact.how_we_met}\n`
  if (contact.birthday) ctx += `Birthday: ${contact.birthday}\n`
  if (contact.tag_names) ctx += `Tags: ${contact.tag_names}\n`
  if (contact.group_names) ctx += `Groups: ${contact.group_names}\n`
  if (contact.notes) ctx += `Notes: ${contact.notes}\n`

  if (customFields.length > 0) {
    ctx += `\nCustom Fields:\n`
    for (const cf of customFields) ctx += `- ${cf.field_name}: ${cf.field_value}\n`
  }

  if (interactions.length > 0) {
    ctx += `\n## Recent Interactions (newest first)\n`
    for (const int of interactions) {
      ctx += `- [${int.date}] ${int.type}: ${int.description}\n`
    }
  }

  return ctx
}

export function buildNetworkContext(db: Database.Database): string {
  const stats = {
    totalContacts: (db.prepare('SELECT COUNT(*) as n FROM contacts WHERE deleted_at IS NULL').get() as { n: number }).n,
    totalInteractions: (db.prepare('SELECT COUNT(*) as n FROM interactions').get() as { n: number }).n,
    totalTags: (db.prepare('SELECT COUNT(*) as n FROM tags').get() as { n: number }).n,
    totalGroups: (db.prepare('SELECT COUNT(*) as n FROM groups').get() as { n: number }).n
  }

  const tags = db.prepare('SELECT name FROM tags ORDER BY name').all() as { name: string }[]
  const groups = db.prepare('SELECT name FROM groups ORDER BY name').all() as { name: string }[]
  const companies = db.prepare(`
    SELECT company, COUNT(*) as n FROM contacts
    WHERE company != '' AND deleted_at IS NULL
    GROUP BY company ORDER BY n DESC LIMIT 20
  `).all() as { company: string; n: number }[]
  const locations = db.prepare(`
    SELECT location, COUNT(*) as n FROM contacts
    WHERE location != '' AND deleted_at IS NULL
    GROUP BY location ORDER BY n DESC LIMIT 20
  `).all() as { location: string; n: number }[]

  let ctx = `## Network Overview\n`
  ctx += `Total contacts: ${stats.totalContacts}\n`
  ctx += `Total interactions: ${stats.totalInteractions}\n`
  ctx += `Tags: ${tags.map(t => t.name).join(', ') || 'none'}\n`
  ctx += `Groups: ${groups.map(g => g.name).join(', ') || 'none'}\n`
  if (companies.length > 0) {
    ctx += `\nTop companies: ${companies.map(c => `${c.company} (${c.n})`).join(', ')}\n`
  }
  if (locations.length > 0) {
    ctx += `Top locations: ${locations.map(l => `${l.location} (${l.n})`).join(', ')}\n`
  }

  return ctx
}

// --- Specialized AI Functions ---

export async function generateReconnectionMessages(
  db: Database.Database,
  contactId: number
): Promise<string> {
  const context = buildContactContext(db, contactId)
  const { content } = await sendMessage(db, [
    { role: 'user', content: `Based on this contact's profile and interaction history, generate 3 reconnection message drafts:\n1. Casual / friendly\n2. Professional\n3. Congratulatory (if there's a recent job change or milestone, otherwise use a thoughtful check-in)\n\nEach message should be 2-3 sentences, natural, and personalized based on the available context. Format with clear headers.\n\n${context}` }
  ], 'You are a personal relationship manager assistant. Generate natural, authentic reconnection messages. Never be generic — always reference specific details from the contact profile. Keep messages concise and genuine.')

  return content
}

export async function generateMeetingBriefing(
  db: Database.Database,
  contactId: number,
  meetingTopic?: string
): Promise<string> {
  const context = buildContactContext(db, contactId)
  const topicLine = meetingTopic ? `\nUpcoming meeting topic: ${meetingTopic}` : ''
  const { content } = await sendMessage(db, [
    { role: 'user', content: `Generate a meeting preparation briefing for this contact. Include:\n1. A brief paragraph summarizing who they are and your relationship\n2. 3 specific talking points or conversation starters based on your history\n3. Any follow-ups from previous interactions\n${topicLine}\n\n${context}` }
  ], 'You are a personal relationship manager assistant helping prepare for meetings. Be concise and actionable. Reference specific details from interaction history.')

  return content
}

export async function summarizeInteractionNotes(
  db: Database.Database,
  text: string
): Promise<string> {
  const { content } = await sendMessage(db, [
    { role: 'user', content: `Summarize these interaction notes into:\n1. **Key Takeaways** (2-4 bullet points)\n2. **Action Items** (any follow-ups or commitments mentioned)\n3. **One-line summary**\n\nNotes:\n${text}` }
  ], 'You are a personal relationship manager assistant. Summarize interaction notes concisely. Extract actionable items.')

  return content
}

export async function suggestTags(
  db: Database.Database,
  contactId: number
): Promise<string[]> {
  const context = buildContactContext(db, contactId)
  const existingTags = db.prepare('SELECT name FROM tags ORDER BY name').all() as { name: string }[]
  const tagList = existingTags.map(t => t.name).join(', ')

  const { content } = await sendMessage(db, [
    { role: 'user', content: `Based on this contact's profile, suggest up to 5 relevant tags. Prefer existing tags when they fit.\n\nExisting tags in the system: ${tagList || 'none yet'}\n\n${context}\n\nRespond with ONLY a JSON array of tag name strings, e.g. ["tag1", "tag2"]. No explanation.` }
  ], 'You are a contact tagging assistant. Suggest relevant tags based on the contact profile. Return only a JSON array.')

  try {
    const match = content.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
  } catch { /* fall through */ }
  return []
}

export async function networkQuery(
  db: Database.Database,
  question: string,
  conversationHistory: AiMessage[]
): Promise<{ answer: string; contacts: number[] }> {
  const networkCtx = buildNetworkContext(db)

  // Build tools for the AI to query the database
  const allContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.email, c.company, c.job_title, c.location,
           c.notes, c.keep_in_touch_days,
           GROUP_CONCAT(DISTINCT t.name) as tags,
           GROUP_CONCAT(DISTINCT g.name) as groups,
           MAX(i.date) as last_interaction_date
    FROM contacts c
    LEFT JOIN contact_tags ct ON c.id = ct.contact_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    LEFT JOIN contact_groups cg ON c.id = cg.contact_id
    LEFT JOIN groups g ON cg.group_id = g.id
    LEFT JOIN interactions i ON c.id = i.contact_id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
  `).all() as Record<string, unknown>[]

  // Summarize contacts for the AI (keep it compact)
  const contactSummaries = allContacts.map(c => {
    const parts: string[] = [`#${c.id} ${c.first_name} ${c.last_name}`]
    if (c.company) parts.push(`@ ${c.company}`)
    if (c.job_title) parts.push(`(${c.job_title})`)
    if (c.location) parts.push(`in ${c.location}`)
    if (c.tags) parts.push(`[${c.tags}]`)
    if (c.last_interaction_date) parts.push(`last: ${c.last_interaction_date}`)
    else parts.push('never contacted')
    return parts.join(' ')
  }).join('\n')

  const messages: AiMessage[] = [
    ...conversationHistory,
    { role: 'user', content: question }
  ]

  const { content } = await sendMessage(db, messages,
    `You are Nexus Copilot, a personal relationship manager AI assistant. You help the user understand and manage their professional network.

${networkCtx}

## All Contacts
${contactSummaries}

When answering questions about the user's network:
- Reference specific contacts by name
- Include contact IDs in your response using the format [contact:ID] so the app can make them clickable
- Be specific and actionable
- If asked to find contacts matching criteria, list the matching ones
- If asked for advice, base it on the actual data
- Keep responses concise and helpful`)

  // Extract contact IDs mentioned in the response
  const contactIds: number[] = []
  const idMatches = content.matchAll(/\[contact:(\d+)\]/g)
  for (const m of idMatches) contactIds.push(Number(m[1]))

  return { answer: content, contacts: contactIds }
}

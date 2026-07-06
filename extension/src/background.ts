import { getSupabase, isConfigured, configureSupabase } from './lib/supabase'
import type { LinkedInProfile } from './lib/types'

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse)
  return true // Keep channel open for async response
})

async function handleMessage(message: Record<string, unknown>): Promise<unknown> {
  switch (message.type) {
    case 'CHECK_AUTH':
      return checkAuth()
    case 'LOGIN':
      return login(message.email as string, message.password as string)
    case 'LOGOUT':
      return logout()
    case 'CONFIGURE':
      return configure(message.url as string, message.anonKey as string)
    case 'CHECK_CONFIGURED':
      return { configured: await isConfigured() }
    case 'SAVE_CONTACT':
      return saveContact(message.data as LinkedInProfile)
    case 'GET_CONTACT_BY_LINKEDIN_URL':
      return getContactByLinkedInUrl(message.url as string)
    case 'CREATE_INTERACTION':
      return createInteraction(message.contactId as string, message.description as string)
    case 'CREATE_REMINDER':
      return createReminder(message.contactId as string, message.message as string, message.dueDate as string)
    case 'JOB_CHANGE_DETECTED':
      return handleJobChange(
        message.contactId as string,
        message.contactName as string,
        message.changes as string[],
        message.newCompany as string,
        message.newJobTitle as string
      )
    default:
      return { error: 'Unknown message type' }
  }
}

async function checkAuth() {
  const supabase = await getSupabase()
  if (!supabase) return { isAuthenticated: false, email: null }

  const { data: { user } } = await supabase.auth.getUser()
  return {
    isAuthenticated: Boolean(user),
    email: user?.email ?? null,
  }
}

async function login(email: string, password: string) {
  const supabase = await getSupabase()
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

async function logout() {
  const supabase = await getSupabase()
  if (!supabase) return { success: true }
  await supabase.auth.signOut()
  return { success: true }
}

async function configure(url: string, anonKey: string) {
  await configureSupabase(url, anonKey)
  return { success: true }
}

async function saveContact(profile: LinkedInProfile) {
  const supabase = await getSupabase()
  if (!supabase) return { success: false, error: 'Not configured' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Check if contact already exists by LinkedIn URL
  if (profile.linkedinUrl) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', user.id)
      .eq('linkedin_url', profile.linkedinUrl)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('contacts')
        .update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          company: profile.company,
          job_title: profile.jobTitle,
          photo_url: profile.photoUrl,
        })
        .eq('id', existing.id)

      if (error) return { success: false, error: error.message }
      return { success: true, contactId: existing.id, updated: true }
    }
  }

  // Insert new contact
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      first_name: profile.firstName,
      last_name: profile.lastName,
      company: profile.company,
      job_title: profile.jobTitle,
      linkedin_url: profile.linkedinUrl,
      photo_url: profile.photoUrl,
      how_we_met: profile.linkedinUrl ? 'LinkedIn' : '',
      email: '',
      phone: '',
      notes: profile.headline ? `LinkedIn: ${profile.headline}` : '',
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, contactId: data.id, created: true }
}

async function getContactByLinkedInUrl(url: string) {
  const supabase = await getSupabase()
  if (!supabase) return { contact: null }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { contact: null }

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('linkedin_url', url)
    .maybeSingle()

  return { contact: data }
}

async function createInteraction(contactId: string, description: string) {
  const supabase = await getSupabase()
  if (!supabase) return { success: false, error: 'Not configured' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('interactions')
    .insert({
      user_id: user.id,
      contact_id: contactId,
      type: 'note',
      description,
      date: new Date().toISOString().split('T')[0],
    })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

async function createReminder(contactId: string, message: string, dueDate: string) {
  const supabase = await getSupabase()
  if (!supabase) return { success: false, error: 'Not configured' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('reminders')
    .insert({
      user_id: user.id,
      contact_id: contactId,
      message,
      due_date: dueDate,
      completed: false,
    })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// Job Change Detection (Task 3.7)
// When the content script detects a stored contact's company/title has changed,
// log an interaction and update the contact record.

async function handleJobChange(
  contactId: string,
  contactName: string,
  changes: string[],
  newCompany: string,
  newJobTitle: string,
) {
  const supabase = await getSupabase()
  if (!supabase) return { success: false }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  // Deduplicate: skip if we already logged this change within 24h
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
  const { data: recentLogs } = await supabase
    .from('interactions')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_id', contactId)
    .eq('type', 'job_change')
    .gte('date', oneDayAgo.split('T')[0])
    .limit(1)

  if (recentLogs && recentLogs.length > 0) {
    return { success: true, skipped: true }
  }

  // Log the change as an interaction
  const description = `Job change detected: ${changes.join('. ')}`
  await supabase.from('interactions').insert({
    user_id: user.id,
    contact_id: contactId,
    type: 'job_change',
    description,
    date: new Date().toISOString().split('T')[0],
  })

  // Update the contact record
  const updates: Record<string, string> = {}
  if (newCompany) updates.company = newCompany
  if (newJobTitle) updates.job_title = newJobTitle

  if (Object.keys(updates).length > 0) {
    await supabase.from('contacts').update(updates).eq('id', contactId)
  }

  return { success: true, contactName, changes }
}

// Supabase Edge Function: check-reminders
// CRON job that checks for due reminders and sends push notifications
// Schedule: every 15 minutes via Supabase CRON or external scheduler
// POST /functions/v1/check-reminders (no auth needed — uses service role)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Verify this is a CRON call or internal call (check for service key)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.includes(supabaseServiceKey)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const today = new Date().toISOString().split('T')[0]

  // Find reminders due today that haven't been notified
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*, contacts(first_name, last_name)')
    .eq('completed', false)
    .lte('due_date', today)

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Group reminders by user
  const byUser = new Map<string, typeof reminders>()
  for (const r of reminders) {
    const uid = r.user_id
    if (!byUser.has(uid)) byUser.set(uid, [])
    byUser.get(uid)!.push(r)
  }

  let notified = 0

  for (const [userId, userReminders] of byUser) {
    const count = userReminders.length
    const first = userReminders[0]
    const contactName = first.contacts
      ? `${first.contacts.first_name} ${first.contacts.last_name}`.trim()
      : 'someone'

    const title = count === 1
      ? `Reminder: ${first.message}`
      : `${count} reminders due`

    const body = count === 1
      ? `About ${contactName}`
      : `Including: ${first.message} (${contactName})`

    // Call send-push Edge Function
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          userId,
          title,
          body,
          tag: 'nexus-reminder',
          url: '/reminders',
        }),
      })
      notified++
    } catch (err) {
      console.error(`Failed to notify user ${userId}:`, err)
    }
  }

  // Also check keep-in-touch overdue contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, user_id, first_name, last_name, keep_in_touch_days')
    .is('deleted_at', null)
    .gt('keep_in_touch_days', 0)

  if (contacts && contacts.length > 0) {
    const { data: interactions } = await supabase
      .from('interactions')
      .select('contact_id, date')
      .order('date', { ascending: false })

    const lastMap: Record<string, string> = {}
    for (const i of interactions || []) {
      if (!lastMap[i.contact_id]) lastMap[i.contact_id] = i.date
    }

    const overdueByUser = new Map<string, string[]>()
    const now = Date.now()

    for (const c of contacts) {
      const last = lastMap[c.id]
      const elapsed = last
        ? (now - new Date(last).getTime()) / (1000 * 60 * 60 * 24)
        : 999

      if (elapsed > c.keep_in_touch_days) {
        const name = `${c.first_name} ${c.last_name}`.trim()
        if (!overdueByUser.has(c.user_id)) overdueByUser.set(c.user_id, [])
        overdueByUser.get(c.user_id)!.push(name)
      }
    }

    for (const [userId, names] of overdueByUser) {
      if (names.length === 0) continue

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId,
            title: `${names.length} contact${names.length > 1 ? 's' : ''} overdue`,
            body: `Time to reach out to ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`,
            tag: 'nexus-keep-in-touch',
            url: '/keep-in-touch',
          }),
        })
      } catch (err) {
        console.error(`Failed to send KIT notification to ${userId}:`, err)
      }
    }
  }

  return new Response(JSON.stringify({ checked: reminders.length, notified }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

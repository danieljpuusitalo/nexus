// Supabase Edge Function: send-push
// Sends Web Push notifications to a user's registered devices
// Can be called by a CRON job or other Edge Functions for:
// - Reminder due notifications
// - Keep-in-touch nudges
// - Birthday alerts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@nexuscrm.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Web Push crypto utilities using Web Crypto API
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<boolean> {
  // For Deno Edge Functions, use the web-push-compatible fetch approach
  // This requires the VAPID keys for JWT signing
  try {
    const vapidToken = await createVapidJwt(subscription.endpoint)

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}`,
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body: new TextEncoder().encode(payload),
    })

    if (response.status === 410 || response.status === 404) {
      // Subscription expired — should be removed
      return false
    }

    return response.ok
  } catch (err) {
    console.error('Push send failed:', err)
    return false
  }
}

async function createVapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin
  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const now = Math.floor(Date.now() / 1000)
  const payload = btoa(JSON.stringify({
    aud: audience,
    exp: now + 43200,
    sub: VAPID_SUBJECT,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  // Import VAPID private key and sign
  const keyData = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const data = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    data
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `${header}.${payload}.${sig}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userId, title, body, tag, url } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Get all push subscriptions for this user
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No push subscriptions' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({
      title: title || 'Nexus',
      body: body || 'You have a notification',
      tag: tag || 'nexus-notification',
      url: url || '/',
    })

    let sent = 0
    const expired: string[] = []

    for (const sub of subs) {
      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      )
      if (success) {
        sent++
      } else {
        expired.push(sub.id)
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expired)
    }

    return new Response(JSON.stringify({ sent, expired: expired.length }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

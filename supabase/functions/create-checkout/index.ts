// Supabase Edge Function: create-checkout
// Creates a Stripe Checkout Session for Pro or Lifetime plans
// Called from the Electron app or landing page

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Stripe Price IDs — set these in Supabase Edge Function secrets
const PRICE_IDS: Record<string, string> = {
  pro_monthly: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || '',
  pro_annual: Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || '',
  lifetime: Deno.env.get('STRIPE_PRICE_LIFETIME') || '',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Verify user auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const { plan, billing } = await req.json()
    // plan: 'pro' | 'lifetime'
    // billing: 'monthly' | 'annual' (only for pro)

    // Determine price ID
    let priceId: string
    let mode: 'subscription' | 'payment'

    if (plan === 'lifetime') {
      priceId = PRICE_IDS.lifetime
      mode = 'payment'
    } else if (plan === 'pro') {
      priceId = billing === 'annual' ? PRICE_IDS.pro_annual : PRICE_IDS.pro_monthly
      mode = 'subscription'
    } else {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price not configured' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Find or create Stripe customer
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    let customerId = existingSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
    }

    // Create checkout session
    const successUrl = Deno.env.get('CHECKOUT_SUCCESS_URL') || 'https://nexuscrm.app/success'
    const cancelUrl = Deno.env.get('CHECKOUT_CANCEL_URL') || 'https://nexuscrm.app/pricing'

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        supabase_user_id: user.id,
        plan_type: plan,
      },
    }

    // Add trial for Pro subscriptions (14 days)
    if (mode === 'subscription') {
      sessionParams.subscription_data = {
        trial_period_days: 14,
        metadata: {
          supabase_user_id: user.id,
          plan_type: plan,
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('create-checkout error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

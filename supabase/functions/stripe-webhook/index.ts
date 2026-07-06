// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events to update subscription status
// Endpoint: POST /functions/v1/stripe-webhook

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscriptionId: string,
  planType: string,
  status: string,
  periodStart?: string,
  periodEnd?: string,
  cancelAtPeriodEnd = false
) {
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan_type: planType,
      status,
      current_period_start: periodStart || null,
      current_period_end: periodEnd || null,
      cancel_at_period_end: cancelAtPeriodEnd,
    }, { onConflict: 'user_id' })

  if (error) console.error('upsert subscription error:', error)
}

function getUserIdFromMetadata(metadata: Record<string, string>): string | null {
  return metadata?.supabase_user_id || null
}

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  console.log(`Processing event: ${event.type}`)

  switch (event.type) {
    // Checkout completed — initial purchase
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = getUserIdFromMetadata(session.metadata as Record<string, string>)
      if (!userId) break

      const customerId = session.customer as string
      const planType = session.metadata?.plan_type || 'pro'

      if (session.mode === 'payment') {
        // Lifetime — one-time payment
        await upsertSubscription(userId, customerId, '', 'lifetime', 'active')
      } else if (session.mode === 'subscription') {
        // Pro subscription
        const subscriptionId = session.subscription as string
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await upsertSubscription(
          userId,
          customerId,
          subscriptionId,
          planType,
          subscription.status === 'trialing' ? 'trialing' : 'active',
          new Date(subscription.current_period_start * 1000).toISOString(),
          new Date(subscription.current_period_end * 1000).toISOString()
        )
      }
      break
    }

    // Subscription updated (renewal, plan change, trial end)
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = getUserIdFromMetadata(subscription.metadata as Record<string, string>)
      if (!userId) break

      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'expired',
        incomplete_expired: 'expired',
      }

      await upsertSubscription(
        userId,
        subscription.customer as string,
        subscription.id,
        subscription.metadata?.plan_type || 'pro',
        statusMap[subscription.status] || 'active',
        new Date(subscription.current_period_start * 1000).toISOString(),
        new Date(subscription.current_period_end * 1000).toISOString(),
        subscription.cancel_at_period_end
      )
      break
    }

    // Subscription deleted (canceled and period ended)
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const userId = getUserIdFromMetadata(subscription.metadata as Record<string, string>)
      if (!userId) break

      await upsertSubscription(
        userId,
        subscription.customer as string,
        subscription.id,
        'free',
        'canceled'
      )
      break
    }

    // Invoice payment failed
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = getUserIdFromMetadata(subscription.metadata as Record<string, string>)
      if (!userId) break

      await upsertSubscription(
        userId,
        subscription.customer as string,
        subscription.id,
        subscription.metadata?.plan_type || 'pro',
        'past_due',
        new Date(subscription.current_period_start * 1000).toISOString(),
        new Date(subscription.current_period_end * 1000).toISOString()
      )
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

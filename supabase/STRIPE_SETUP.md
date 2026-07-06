# Stripe Integration Setup Guide

## 1. Create Stripe Account

Go to https://dashboard.stripe.com and create an account.

## 2. Create Products & Prices

In Stripe Dashboard → Products, create:

### Product: Nexus Pro
- **Price 1**: $10/month (monthly billing) → note the `price_xxx` ID
- **Price 2**: $72/year ($6/month billed annually) → note the `price_xxx` ID

### Product: Nexus Lifetime
- **Price**: $99 one-time → note the `price_xxx` ID

## 3. Configure Stripe Webhook

In Stripe Dashboard → Developers → Webhooks:

1. Add endpoint: `https://<your-supabase-project>.supabase.co/functions/v1/stripe-webhook`
2. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
3. Copy the webhook signing secret (`whsec_xxx`)

## 4. Set Supabase Edge Function Secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_xxx
supabase secrets set STRIPE_PRICE_PRO_ANNUAL=price_xxx
supabase secrets set STRIPE_PRICE_LIFETIME=price_xxx
supabase secrets set CHECKOUT_SUCCESS_URL=https://nexuscrm.app/success
supabase secrets set CHECKOUT_CANCEL_URL=https://nexuscrm.app/#pricing
```

## 5. Deploy Edge Functions

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy check-subscription
```

## 6. Run Subscription Migration

In Supabase SQL Editor, run `supabase/migrations/002_subscriptions.sql`.

## 7. Test

1. Set Stripe to test mode
2. Use test card `4242 4242 4242 4242` with any future expiry
3. Click "Select Plan" → Pro in the Nexus app
4. Verify checkout opens in browser
5. Complete payment → verify subscription appears in Supabase `subscriptions` table
6. Verify app detects Pro status on next refresh

## Architecture

```
User clicks "Upgrade to Pro" in Nexus app
    ↓
IPC: stripe:createCheckout(plan, billing)
    ↓
Main process calls Supabase Edge Function: create-checkout
    ↓
Edge Function creates Stripe Checkout Session
    ↓
Opens Stripe checkout in default browser
    ↓
User completes payment on Stripe
    ↓
Stripe sends webhook → stripe-webhook Edge Function
    ↓
Edge Function upserts row in subscriptions table
    ↓
App polls check-subscription to detect plan change
    ↓
PlanProvider syncs cloud plan → local settings
```

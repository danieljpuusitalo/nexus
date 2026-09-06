# Google OAuth — setup now, verification later

Nexus reads Google Calendar to work out who was actually in each meeting, which
is what turns a transcript's display names ("Davide", "D. Mazzanti") into people.
Without it, name resolution falls back to guessing against the whole contact
table — which the resolver deliberately refuses to do, so unmatched attendees
just pile up in the review queue instead.

There is currently **no `.env` and no OAuth client**, so `getGoogleCredentials()`
returns null and Google connect has never worked in this build. This document is
the from-scratch setup.

## Two phases, and why

| | Phase 1 — now | Phase 2 — when you host |
|---|---|---|
| User type | **Internal** | External |
| Who can connect | @4impact.vc accounts only | anyone |
| Google review | none | full verification |
| Homepage + privacy policy | not needed | required, on a domain you own |
| Search Console domain verification | not needed | required |
| Refresh tokens | long-lived | 7-day expiry until verification passes |

Verification exists so that *strangers* can grant your app access. Until there
are strangers, it is pure overhead — and it cannot be started at all without a
live public domain, which is a hosting decision that does not need making yet.

Internal defers all of it. Google's configuration guide is explicit that for
internal-only apps "use of restricted or sensitive scopes doesn't require
further review by Google", and the 7-day refresh-token expiry is documented as
applying to "an external user type **and** a publishing status of Testing" —
Internal is outside that clause.

## Phase 1 — the setup

**Step 0 is the one that matters.** Internal is only offered when the Cloud
project belongs to a Google Workspace organisation. Sign in to
<https://console.cloud.google.com> as **daniel@4impact.vc** — not a personal
Gmail. If you create the project under a personal account, Internal is greyed
out and you have to migrate the project into the org afterwards
(`gcloud beta projects move`), which needs Project Mover on the org.

Confirm before continuing: the account chip, top right, must read
`daniel@4impact.vc`.

1. **Create the project.** Project picker → New Project → name it `nexus`.
   Under "Location" it should show `4impact.vc` as the organisation, not "No
   organisation". If it says No organisation, stop — you are in the wrong
   account.

2. **Enable the two APIs.** APIs & Services → Library → enable:
   - Google Calendar API
   - People API (this is what `contacts.readonly` talks to)

3. **Configure the auth platform.** APIs & Services → **Google Auth Platform**.
   (Searching "OAuth consent screen" redirects here — the old standalone page is
   gone. The tabs are Overview, Branding, Audience, Clients, Data Access,
   Verification Center.)
   - Get Started → app name `Nexus`, support email your own.
   - On the **Audience** step choose **Internal**.

4. **Add the scopes.** Data Access → Add or remove scopes → add:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/contacts.readonly`

   Both are *sensitive*, not restricted. Keep it that way — a restricted scope
   (anything touching Gmail content, or `drive.meet.readonly`) drags in a paid
   CASA security assessment the moment you go External.

5. **Create the client.** Clients → Create client → Application type
   **Desktop app** → name it `Nexus desktop`. Desktop clients get loopback
   redirects allowed automatically, which is what `google-auth.ts` uses
   (`REDIRECT_URI = 'http://localhost'`). Do not pick "Web application" — you
   would then have to register the redirect URI by hand.

6. **Wire it up.** Copy the client ID and secret into a new `.env` in the repo
   root (it is gitignored; `.env.example` shows the shape):

   ```
   GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-<secret>
   ```

   These are injected at build time, so restart `npm run dev` — a running dev
   server will not pick them up.

7. **Connect and check.** In the app, connect Google, then confirm the calendar
   actually cached something:

   ```
   SELECT COUNT(*) FROM calendar_events;
   ```

   Zero rows with a connected account means the sync failed silently — it fails
   soft by design, so check the main-process log rather than assuming no events.

## Phase 2 — what triggers it

Switch to External when someone who is not on @4impact.vc needs to connect.
That is the same moment you need hosting, so do them together:

- a real domain (**not** `nexuscrm.app` — that is a Brazilian CRM company's
  site, and it is currently hardcoded across `landing/`, `Refer.tsx`, the Stripe
  checkout URLs and the VAPID subject)
- the landing page actually deployed on it
- a privacy policy at a stable URL on that domain, which **must** carry the
  Limited Use disclosure — the explicit statement that the app's use of Google
  user data follows the Google API Services User Data Policy including Limited
  Use. Its absence is one of the most common rejection reasons.
- that domain verified in Search Console and added as an Authorised domain
- a demo video showing the consent screen with the scopes legible, the grant
  completing, and the granted data visibly in use

Expect several rounds and weeks of latency, so start it the week hosting is
decided, not the week you want to launch.

One documented gap: Google does not say what happens to **existing grants** when
an app switches Internal → External. Assume you may have to reconnect once, and
do not schedule anything tight around it.

## Housekeeping

OAuth clients unused for 6 months are auto-deleted (30-day restore window). That
applies to Internal apps too, so a client created now and left alone until next
spring may not survive.

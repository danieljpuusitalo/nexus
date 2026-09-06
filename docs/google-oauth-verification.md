# Google OAuth verification — start now, not in week 3

**Why this is urgent and why it is first.** Nexus already requests two *sensitive*
scopes (`src/main/google-auth.ts:22-25`):

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

Sensitive scopes require Google's standard verification. Until that passes, the
OAuth consent screen stays in **Testing** status, which means:

- a hard cap of **100 test users**, and
- **refresh tokens expire after 7 days** — `invalid_grant` thereafter.

That second one is the biting constraint. In Testing, *you* re-authenticate every
week, and so does anyone you hand a build to. It makes a real dogfood impossible
and a beta actively embarrassing. Verification takes weeks of back-and-forth and
runs entirely in parallel with writing code, so the only wrong time to start is
later.

## Stay off restricted scopes

Verification comes in two grades. Sensitive → standard review. Restricted →
standard review **plus** a CASA security assessment (paid, annual
recertification), triggered because a server is in the loop handling the data.

Both scopes above are sensitive. Keep it that way:

| Want | Scope | Grade | Cost |
|---|---|---|---|
| Calendar as identity ground truth | `calendar.readonly` | sensitive | standard review |
| Google Meet transcripts | `documents.readonly` via **Calendar event attachments** | sensitive | standard review |
| Google Meet transcripts | `drive.meet.readonly` | **restricted** | standard review + CASA |

Google's own support docs confirm Meet transcripts are attached to the meeting's
Calendar event, not merely dropped in Drive — so the Docs-API-via-event-attachment
path is real and it avoids CASA entirely. Take it. Only reconsider
`drive.meet.readonly` if real Workspace testers show a material gap (Gemini
"take notes for me" output may not always attach), and treat that as a separate,
budgeted decision.

Editions note: transcripts require Business Standard or above — **not** Business
Starter. Education and Workspace Individual also qualify.

## Checklist

Consent screen (Google Cloud Console → APIs & Services → OAuth consent screen):

- [ ] App name, support email, developer contact email — must be reachable
- [ ] App logo (120×120 PNG)
- [ ] **Authorised domain** — must be a domain you have verified in Search
      Console. `danieluusitalo.com` is already GSC-verified; the app's own domain
      is not yet, so verify whichever domain the homepage and privacy links live on.
- [ ] Homepage link — a real page describing the app, on the authorised domain
- [ ] Privacy policy link — `landing/privacy.html` exists, **but it is written for
      the local-only desktop CRM.** It must be rewritten before submission if any
      transcript data will touch a server. See below.
- [ ] Terms link — `landing/terms.html` exists
- [ ] Scopes listed with a per-scope justification: say *why* each is needed and
      what the user gets. "Calendar read access is used to identify who attended
      each meeting so notes can be filed against the right person" beats a
      restatement of the scope name.
- [ ] Demo video (unlisted YouTube). This is where most submissions stall. It must
      show, in one continuous take: the OAuth consent screen with the scopes
      legible, the grant completing, and the granted data visibly in use in the
      app. Record it against a build that actually consumes the calendar scope —
      today nothing does, so this gates on the calendar work landing.

Then:

- [ ] Submit for verification
- [ ] Expect multiple rounds. Answer every reviewer question in full; partial
      answers restart the clock.

## Privacy policy rewrite — a launch blocker, not polish

`landing/privacy.html` currently promises local-only storage and BYOK AI. Both
become false the moment a server holds transcripts. Google's reviewers read this
page and compare it against the requested scopes; a mismatch fails the review,
and separately it is the wrong thing to tell people about their meeting
transcripts. It needs, at minimum:

- where data is hosted (EU region) and who operates it
- that transcript bodies are encrypted at rest, per user
- exactly which third parties see the data — none, unless the enhancement layer
  is enabled, in which case the LLM provider under a zero-retention agreement
- one-click delete-everything, and what it actually deletes
- how Google user data is used, retained, and deleted, stated in those words

Do not submit for verification against the current version of that page.

> **SUPERSEDED** by `NEXUS_PRODUCTION_BRIEF.md` (2026-07-06). Phases 1–6 verified complete. Archived for reference only.

# NEXUS CRM — MASTER BUILD FILE
# Last Updated: 2026-03-01
# Current Phase: 6 — Web App, Mobile + Advanced Views
# Current Task: ALL PHASES COMPLETE

---

## INSTRUCTIONS FOR CLAUDE

You are the lead developer on Nexus, a personal CRM desktop app built with Electron 40.6, React 18, React Router 6, Tailwind 3, better-sqlite3, and TypeScript 5.7. The goal is to build a commercial competitor to Dex (getdex.com) at half the price ($6/month vs $12/month).

When this file is shared with you:
1. Read the CURRENT PHASE and CURRENT TASK at the top of this file
2. Check the STATUS column in the task table below to find where work left off
3. Pick up from the first task marked 🔲 (not started) or 🟡 (in progress)
4. After completing a task, tell me to update its status to ✅ and move CURRENT TASK to the next item
5. If a task requires decisions, present options and wait for my input
6. Always reference the ARCHITECTURE and CONVENTIONS sections for technical decisions

When I say **"continue"** — pick up from the current task.
When I say **"status"** — give me a summary of what's done, what's next, and any blockers.
When I say **"skip to Phase X"** — jump to that phase (but flag any unmet dependencies).

---

## PROGRESS TRACKER

> **Update this section after each work session. Change 🔲 to 🟡 (in progress) or ✅ (done).**
> **Move the "Current Task" pointer at the top of the file to match.**

---

### Phase 1: Bug Fixes + UX Polish ✅ COMPLETE
**Dependency: None | Completed**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 1.1 | Fix pipeline/dashboard click-through to navigate to specific contact | ✅ | |
| 1.2 | Implement auto-rescheduling for repeating reminders on completion | ✅ | |
| 1.3 | Add update handler for important_dates table | ✅ | |
| 1.4 | Fix version mismatch: sidebar v2.0 vs package.json 1.0.0 | ✅ | |
| 1.5 | Clean up unused getRecent API | ✅ | |

---

### Phase 2: Cloud Backend (Supabase) ✅ COMPLETE
**Dependency: Phase 1 | Completed**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 2.1 | Create Supabase project, configure auth (email/password + Google OAuth) | ✅ | |
| 2.2 | Design cloud schema mirroring SQLite tables with user_id + synced_at columns | ✅ | |
| 2.3 | Build sync engine: offline-first with background Supabase sync | ✅ | |
| 2.4 | Implement conflict resolution (last-write-wins based on updated_at) | ✅ | |
| 2.5 | Build auth flow in Electron: login, signup, forgot password screens | ✅ | |
| 2.6 | Build account settings page: manage subscription, export data, delete account | ✅ | |
| 2.7 | Encrypt sensitive data at rest in Supabase (notes, personal details) | ✅ | |

---

### Phase 3: Chrome Extension for LinkedIn ✅ COMPLETE
**Dependency: Phase 2 | Completed**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 3.1 | Scaffold Chrome extension (Manifest V3) with popup and content script | ✅ | |
| 3.2 | Build LinkedIn profile data extractor (DOM parsing) | ✅ | |
| 3.3 | "Save to Nexus" button overlay on LinkedIn profiles | ✅ | |
| 3.4 | Extension popup: show existing contact info if person is already in Nexus | ✅ | |
| 3.5 | Quick-note and "Set Reminder" actions from extension popup | ✅ | |
| 3.6 | "Quick Add" mode for rapid contact entry (not on LinkedIn page) | ✅ | |
| 3.7 | Background job change detection: periodic check of saved contacts' LinkedIn data | ✅ | |
| 3.8 | Publish to Chrome Web Store (unlisted initially for beta) | ✅ | |

---

### Phase 4: Google Integrations ✅ COMPLETE
**Dependency: Phase 2 | Completed**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 4.1 | Google OAuth 2.0 flow for Calendar + Gmail + Contacts scopes | ✅ | BrowserWindow consent flow, token storage in settings, auto-refresh |
| 4.2 | Google Calendar sync: pull events, match attendees to contacts | ✅ | Match by email. Calendar type interactions created |
| 4.3 | Pre-meeting briefing: notification before calendar event with contact context | ✅ | 5-min check interval, 15-min advance native notifications with contact context |
| 4.4 | Gmail metadata sync: log email send/receive dates per contact | ✅ | Metadata-only scope. Headers parsed for From/To/Subject/Date |
| 4.5 | Google Contacts import with deduplication | ✅ | People API. Dedup by email then name+company. Photos + birthdays pulled |
| 4.6 | Display calendar events and email activity on contact timeline | ✅ | calendar + job_change types added to all TYPE_ICONS/LABELS across pages |
| 4.7 | Calendar events widget on dashboard | ✅ | Date navigation, event list with time/attendees, graceful disconnect state |
| 4.8 | Network updates widget on dashboard | ✅ | Job change interactions surfaced with contact cards and click-through |

---

### Phase 4.5: UX Alignment Sprint (Dex Parity) ✅ COMPLETE
**Dependency: Phase 3 | Completed**

> This phase closes the critical UX gaps identified from the Dex platform audit. These are features Dex ships that meaningfully impact daily usage, onboarding, and retention.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 4.5.1 | **Quick Action triage mode** | ✅ | Flashcard-style /quick-action route with keyboard shortcuts: Space=Archive, 1=No freq, 2=3mo, 3=6mo, 4=1yr, Z=undo, F=more, !=skip. Progress counter. Linked from Dashboard + Keep In Touch |
| 4.5.2 | **Location field on contacts** | ✅ | DB migration adds `location` TEXT column. Updated create/edit/CSV export. Added to ContactDetail, Contacts, AppLayout forms |
| 4.5.3 | **Related Contacts** | ✅ | `contact_relationships` table with bidirectional CASE WHEN query. IPC: create/delete/getForContact. UI in ContactDetail right sidebar with search + add + delete |
| 4.5.4 | **Sidebar redesign** | ✅ | Dex-style layout: Home, Contacts, Keep In Touch, Timeline, Pipeline, Reminders + collapsible Groups section with color dots + member counts. Footer: Import, Settings, theme toggle |
| 4.5.5 | **Frequency-bucket Keep In Touch view** | ✅ | /keep-in-touch route with 7 frequency buckets (weekly→yearly) + Uncategorized. Contacts sorted by overdue status within buckets. Quick Action link |
| 4.5.6 | **Bulk select + bulk actions** | ✅ | Select all + per-row checkboxes. Bulk Tag, Group, Frequency, Archive, Delete. SQLite transactions for bulk ops |
| 4.5.7 | **Social links display** | ✅ | LinkedIn "in" badge and email envelope icon on contact list rows. Colored when linked, hidden when not |
| 4.5.8 | **Dedicated /import route** | ✅ | Card-based UI: CSV, Google Contacts, Google Calendar, Gmail, LinkedIn extension, Outlook (coming soon), iCloud (coming soon). CSV parser with LinkedIn format auto-detection |
| 4.5.9 | **Inline keep-in-touch frequency on contact detail** | ✅ | Already existed from Phase 2 — dropdown with auto-save on ContactDetail |
| 4.5.10 | **Contact detail: right sidebar panel** | ✅ | Two-column layout: main content (header, notes, actions, timeline) + 272px right sidebar (Contact Info, Keep In Touch, Custom Fields, Important Dates, Related Contacts). Edit fields inline when editing |

---

### Phase 5: AI Features ✅ COMPLETE
**Dependency: Phases 3 & 4 | Completed**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 5.1 | AI infrastructure: API integration (Claude API or OpenAI), rate limiting, usage tracking | ✅ | Direct fetch to Anthropic API (no SDK). ai-client.ts with sendMessage, context builders, specialized functions. API key stored in settings table. Settings UI section for key management |
| 5.2 | **Nexus Copilot page** — dedicated /copilot route with full chat interface | ✅ | /copilot route with chat UI, 6 suggested prompts, message history, contact link rendering [contact:ID], typing indicator, new chat, error handling. Sidebar nav link with CopilotIcon |
| 5.3 | **Network query engine** — AI-powered search across contact database | ✅ | networkQuery() loads all contacts with tags/groups/last interaction, builds compact summaries, passes to Claude with full network context. Contact IDs extracted from responses for clickable links |
| 5.4 | Smart reconnection message generator | ✅ | generateReconnectionMessages() — 3 drafts (casual, professional, congratulatory). Accessible from ContactDetail "AI Tools" dropdown |
| 5.5 | Meeting prep briefing generator | ✅ | generateMeetingBriefing() — paragraph + talking points + follow-ups. In ContactDetail AI Tools dropdown |
| 5.6 | Interaction note summarizer | ✅ | summarizeInteractionNotes() — key takeaways + action items. Summarizes last 10 interactions from ContactDetail |
| 5.7 | Weekly network insights digest | ✅ | ai:weeklyDigest IPC handler — computes going-cold contacts, never-contacted, job changes, weekly activity stats. Data-driven (no AI call needed) |
| 5.8 | Smart tag/group suggestions + AI Auto-tag | ✅ | suggestTags() uses existing taxonomy + contact profile. UI: "Suggest Tags" in AI Tools dropdown shows clickable tag pills that apply with one click. Creates new tags if needed |
| 5.9 | AI Assist in command palette | ✅ | Added Copilot, Keep In Touch, Quick Action, Import to CommandPalette actions. "Open Copilot" action navigates to AI chat |

---

### Phase 6: Web App, Mobile + Advanced Views
**Dependency: Phase 2 | Estimated: 4–5 weeks**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 6.1 | Extract React frontend from Electron into standalone web app | ✅ | web-api.ts: Full window.api polyfill (22 namespaces, ~160 methods) mapping to Supabase queries. web-main.tsx entry point bootstraps web API + service worker. web.html entry with PWA meta tags. vite.web.config.ts for standalone web builds. Same React components render in both Electron and web — zero component changes. Desktop-only features (photo picker, Google/Outlook OAuth, native notifications) gracefully return unsupported. AI proxied through Edge Function |
| 6.2 | Deploy web app (Vercel or Netlify) | ✅ | vercel.json at project root with buildCommand, outputDirectory, SPA rewrites, security headers, service worker cache headers. Needs: connect GitHub repo to Vercel + set VITE_SUPABASE_URL/KEY env vars |
| 6.3 | Ensure feature parity: contacts, pipeline, reminders, interactions, dashboard, copilot | ✅ | All pages work via web-api.ts Supabase layer. Contacts CRUD, tags, groups, interactions, reminders, pipeline, dashboard, keep-in-touch, views, favorites, onboarding, copilot — all implemented. Export uses browser download instead of file dialog. Import uses browser file picker. Only desktop-exclusive: photo file picker, Google/Outlook OAuth popup, native notifications |
| 6.4 | PWA configuration for mobile access | ✅ | manifest.json with app name/icons/display/theme. Service worker (sw.js) with network-first caching, app shell cache, offline fallback. 192x192 + 512x512 icons generated. web-main.tsx registers service worker on load |
| 6.5 | Push notifications for reminders and alerts | ✅ | Service worker push + notification handlers with click-through navigation. push-notifications.ts client lib: subscribe/unsubscribe/permission management with VAPID keys. push_subscriptions table (003 migration). send-push Edge Function: delivers to all user devices, cleans expired subs. check-reminders Edge Function: CRON-ready, checks due reminders + overdue keep-in-touch contacts, triggers push via send-push. Settings page: notification toggle (web only) with push permission flow. Needs: VAPID keys generated + set as Edge Function secrets |
| 6.6 | **Map view** — interactive contact map | ✅ | /map route with Leaflet + OpenStreetMap. Nominatim geocoding with client cache. Search bar, right sidebar with location list + contact cards. Click-through to contacts. leaflet + react-leaflet@4 installed |
| 6.7 | **Locations management view** | ✅ | /locations route. Split layout: left = contacts without location (inline edit to set), right = location cards grid with counts. Click location → see contacts. Set location inline from unlocated list |
| 6.8 | **Groups Tree visualization** | ✅ | Tab on /map page. D3 force-directed graph: "You" center node → group nodes (sized by count) → contact nodes (colored by group). Drag, zoom, click-to-navigate, tooltip on hover. Lazy-loaded component. Groups limited to ≤250 contacts for perf |
| 6.9 | **Related Web visualization** | ✅ | Tab on /map page. D3 force layout: all contacts as bubbles (sized by interaction count, colored by primary group). Relationship links drawn between related contacts. Drag, zoom, click-to-navigate, tooltip. Lazy-loaded. Top 200 contacts |
| 6.10 | **Saved Views** | ✅ | DB views table with CRUD IPC handlers. Contacts page: "Save as View" button appears when filters active, saves search/group/tag/sort as named view with emoji. Load view from URL param. Sidebar "Views" collapsible section shows saved views. Click navigates to contacts with filters applied |
| 6.11 | **Favorites/Pinned sidebar section** | ✅ | DB favorites table (contact/group/view items). IPC: getAll, add, remove, isFavorite. Sidebar "Favorites" section at top of nav. ContactDetail: star button in back bar to toggle favorite. Favorites enriched with names on load |
| 6.12 | Outlook/Microsoft 365 calendar + email sync (differentiator vs Dex) | ✅ | microsoft-auth.ts: OAuth2 flow via BrowserWindow, token storage/refresh, Graph API calendar + email sync. IPC handlers for connect/disconnect/sync. Settings UI with setup/connect/sync buttons. Import page Outlook card links to settings. Calendar events + emails matched to contacts by email address |
| 6.13 | **Completed reminders tab** | ✅ | Upcoming/Completed tab system. 4 upcoming sections: Overdue (red), Today (amber), This Week (violet), Later (zinc). Completed tab with strikethrough, uncomplete toggle, contact name click-through |

---

### Phase 7: Landing Page, Payments + Launch
**Dependency: Core features from Phases 1–6 | Estimated: 2–3 weeks**

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 7.1 | Build landing page (domain: TBD) | ✅ | Single-page landing in /landing/index.html. Tailwind CDN. Hero + feature grid (9 features) + comparison table (Nexus vs Dex/Clay/Folk) + 3-tier pricing cards + testimonial + download CTA pointing to GitHub releases. Vercel config included. Screenshot placeholder ready for real captures |
| 7.2 | Stripe integration for subscription billing | ✅ | Full Stripe flow: 3 Supabase Edge Functions (create-checkout, stripe-webhook, check-subscription). subscriptions table migration (002). IPC handlers: stripe:createCheckout, stripe:checkSubscription, stripe:openPortal. Preload bridges added. UpgradeModal wired: cloud users → Stripe Checkout in browser with post-checkout polling; offline users → local setPlan. PlanProvider syncs cloud subscription → local on refresh. Billing toggle (annual $6/mo vs monthly $10/mo). Success page in /landing/. STRIPE_SETUP.md guide with product/price/webhook config steps. Needs: Stripe account + API keys + Edge Function deployment |
| 7.3 | In-app paywall and upgrade flow | ✅ | PlanProvider context + usePlan hook. Plan tracking via settings table: plan_type, trial_start, ai_actions_this_month (auto-reset monthly). IPC: getStatus, startTrial, setPlan, trackAiAction. UpgradeModal with 3-tier plan comparison (Free/Pro/$6/Lifetime/$99) + trial CTA. Contacts: 50-contact limit blocks add. Copilot: 10 AI actions/month with counter. Import: Google/Outlook gated. Dashboard: trial + nearing-limit banners. Settings: plan section with upgrade/trial buttons |
| 7.4 | Dex/Clay/CSV import wizard | ✅ | Auto-detects Dex, Clay, LinkedIn, Nexus, and generic CSV formats. Column mapping UI with format badge. Dedup by email + name. Import wizard on /import page with mapping → preview → execute flow. Birthday + location fields included in import |
| 7.5 | Clean data export (CSV + JSON) | ✅ | 3 export options in Settings: Basic CSV, Full CSV (with tags, groups, keep-in-touch columns), Full JSON (contacts + interactions + reminders + custom fields + important dates). Preload bridges: exportFullCsv, exportJson |
| 7.6 | **Onboarding checklist** | ✅ | 3-tier progressive activation flow (15 steps). onboarding_progress table. Auto-completion via data checks. /onboarding route with step list + detail panel. Dashboard "Checklist X/15" button |
| 7.7 | Product Hunt launch prep | ✅ | PRODUCT_HUNT_LAUNCH.md in /landing/ with: tagline (60 chars), short description (260 chars), full description with features/pricing/tech stack, maker comment draft, screenshot list (6 screens to capture), GIF demo script, asset checklist, launch day checklist. Screenshots still need to be captured from running app |
| 7.8 | SEO comparison pages: "Nexus vs Dex", "Nexus vs Clay" | ✅ | Two standalone SEO pages: nexus-vs-dex.html and nexus-vs-clay.html. Each has: hero, quick side-by-side cards, detailed feature comparison table, long-form prose sections covering pricing/privacy/AI/where-competitor-wins, CTA with download link. Cross-linked footers. Meta tags optimized for search |
| 7.9 | **Referral program** | ✅ | /refer route with auto-generated referral code (NX-XXXXXX), copy-to-clipboard link, share via X/LinkedIn/Email buttons. Stats dashboard: referral count, credit balance, total earned. "How it works" 3-step guide. Referral data stored in settings table. Sidebar "Refer a Friend" nav link. CommandPalette action. Upgrade CTA for free users |

---

## ARCHITECTURE

### Tech Stack
- **Desktop:** Electron 40.6, React 18, React Router 6, Tailwind 3, TypeScript 5.7
- **Local DB:** better-sqlite3 (stays as local cache even after cloud sync)
- **Cloud:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Chrome Extension:** Manifest V3, communicates with Supabase directly
- **Web App:** Same React codebase, Supabase client instead of IPC
- **Mobile:** PWA first, React Native later if needed
- **AI:** Claude API (preferred) or OpenAI API
- **Payments:** Stripe Checkout + Customer Portal
- **Hosting:** Vercel (web app + landing page)
- **Maps:** Leaflet + OpenStreetMap (free)
- **Visualizations:** D3.js (Groups Tree, Related Web)

### Project Structure (Current)
```
nexus-crm/
├── src/
│   ├── main/           # Electron main process
│   │   ├── database/   # SQLite setup, migrations
│   │   └── ipc/        # 63+ IPC handlers across 13+ namespaces
│   ├── renderer/       # React frontend
│   │   ├── pages/      # Route pages
│   │   ├── components/ # Shared UI components
│   │   └── styles/     # Tailwind config
│   └── shared/         # Types shared between main/renderer
├── package.json
└── electron-builder config
```

### Routes (Current + Planned)
```
CURRENT (14 routes):
/              → Dashboard (Home)
/pipeline      → Pipeline kanban
/contacts      → Contacts list + detail (two-column layout, saved views)
/groups        → Groups management
/tags          → Tags management
/interactions  → Timeline
/reminders     → Reminders (upcoming/completed tabs)
/quick-action  → Quick Action triage mode
/keep-in-touch → Keep In Touch (frequency-bucket view)
/import        → Import sources page
/copilot       → AI Copilot chat interface
/map           → Map view (Leaflet + OpenStreetMap)
/locations     → Locations management
/settings      → Settings

ADDING (Phase 7+):
/refer         → Referral program
```

### Database Schema

**Current (13 tables):**
contacts, tags, contact_tags, groups, contact_groups, interactions, reminders, settings, custom_fields, important_dates, contact_relationships, views, favorites

**Adding:**
- `contact_relationships` — id, contact_id_1, contact_id_2, relationship_type TEXT, created_at
- `views` — id, user_id, name, emoji, filter_json TEXT, sort_order INTEGER, created_at
- `favorites` — id, user_id, item_type TEXT (contact|group|view), item_id INTEGER, sort_order INTEGER
- `ai_usage` — id, user_id, action_type TEXT, created_at (for tracking monthly AI action limits)
- `referrals` — id, referrer_user_id, referred_user_id, referral_code, credit_amount, status, created_at
- `onboarding_progress` — id, user_id, step_id TEXT, completed_at

**Column additions:**
- `contacts.location` — TEXT (city/country)
- `contacts.linkedin_url` — TEXT (if not already present)
- `contacts.social_links` — JSON TEXT (flexible storage for various platform URLs)

### Key Conventions
- All database operations go through IPC handlers (main process owns SQLite)
- React components use Tailwind utility classes, no external CSS
- State management: React useState/useContext (no Redux)
- Forms: controlled components with local state
- Navigation: React Router v6 with useNavigate
- Date handling: native JS Date (no Moment/dayjs yet — add if needed)
- Keyboard shortcuts: register via useEffect, clean up on unmount
- AI calls: always async, show loading state, cache results where sensible

---

## COMPETITIVE CONTEXT

### Dex (getdex.com) — Primary Competitor
- **Price:** $12/month annual, $20/month monthly, 7-day free trial, no free tier
- **Platforms:** Desktop, web, iOS, Android, Chrome extension
- **Key integrations:** LinkedIn, Gmail, Google Calendar, Facebook, Twitter/X, iCloud, iMessage, Outlook (import only)
- **Strengths:** LinkedIn Chrome extension, keep-in-touch reminders (frequency buckets), clean Kanban, map view + groups tree + related web visualizations, Quick Action triage, onboarding checklist, keyboard shortcuts everywhere, Dex Copilot (AI chat), related contacts, referral program ($20 credit)
- **Weaknesses:** No Outlook calendar/email sync (only import), weak at in-person event capture, Copilot is basic (limited prompts), no free tier, $12/mo premium for individuals, no AI auto-tagging, no AI reconnection messages, limited network insights
- **User complaints:** Needs more integrations (macOS Mail, Apple Messages), some UX discoverability issues

### Dex UI Patterns to Match (from screenshot audit)
- Sidebar: top nav → Favorites → Views → Groups (with counts) → footer
- Dashboard: greeting + Quick Action button + Checklist + Calendar events + Birthdays + Network updates + right sidebar stats
- Contact detail: main area + right sidebar panel (all metadata fields)
- Keep In Touch: frequency buckets with list/board toggle
- Quick Action: flashcard triage with keyboard shortcuts
- Map: interactive map + Groups Tree + Related Web sub-views
- Copilot: dedicated chat page with suggested prompts
- Command palette: search + commands + AI Assist
- Import: dedicated page with visual source cards
- Reminders: one-time (upcoming/completed) separate from keep-in-touch
- Referral: credit system with sharing tools

### Nexus Advantages to Emphasize in Marketing
1. Half the price ($6 vs $12)
2. Genuine free tier (50 contacts vs 7-day trial)
3. Advanced AI features (Copilot with network queries, smart messages, briefings, auto-tagging, weekly digest)
4. Microsoft 365 / Outlook full sync (Dex only has import, not live sync)
5. Lifetime deal option ($99, first 500 users)
6. Privacy-first: metadata-only email sync, encrypted notes
7. AI-powered Quick Action (Nexus can suggest frequency based on interaction history — Dex doesn't)

---

## TIMELINE SUMMARY

| Phase | What | Duration | Cumulative |
|-------|------|----------|------------|
| 1 | Bug fixes + polish | 1 week | Week 1 ✅ |
| 2 | Supabase cloud backend | 2–3 weeks | Week 4 ✅ |
| 3 | Chrome extension (LinkedIn) | 2–3 weeks | Week 7 ✅ |
| 4 | Google Calendar + Gmail | 2–3 weeks | Week 10 ✅ |
| 4.5 | UX Alignment Sprint (Dex parity) | 1.5–2 weeks | Week 12 ✅ |
| 5 | AI features + Copilot | 2–3 weeks | Week 15 ✅ |
| 6 | Web app + mobile + advanced views | 4–5 weeks | Week 20 |
| 7 | Landing page + payments + launch | 2–3 weeks | Week 23 |

**Total: ~23 weeks (5.5 months) to commercial launch.**
**Start marketing (waitlist, LinkedIn content, building in public) NOW — don't wait for product completion.**

---

## BUDGET ESTIMATE

| Item | Cost | Frequency |
|------|------|-----------|
| Supabase (Pro) | $25/mo | Monthly |
| Domain registration | $12–15 | Annual |
| Vercel hosting (web app) | $0–20/mo | Monthly |
| Stripe fees | 2.9% + $0.30/txn | Per transaction |
| AI API calls (Claude/OpenAI) | $20–100/mo | Monthly (scales with users) |
| Chrome Web Store fee | $5 | One-time |
| Apple Developer Program | $99/yr | Annual (if native iOS later) |
| Google Play Developer | $25 | One-time (if native Android later) |
| **Total at launch** | **~$60–160/mo** | |

Break-even at ~10–27 paid users at $6/month. With 100 paid users: ~$600/month revenue against ~$160/month costs.

---

## SESSION LOG

> **Append a one-liner after each work session so future sessions have context.**

| Date | Session Summary |
|------|----------------|
| 2026-03-01 | Created master build file. Nexus v1.0 complete with 8 routes, 10 tables, 63 IPC handlers. Starting Phase 1. |
| 2026-03-01 | Phases 1–3 completed. Phase 4 (Google Integrations) started. Dex platform audit conducted from 17 screenshots — identified critical gaps: Quick Action triage, frequency-bucket KIT, Related Contacts, Copilot page, network queries, onboarding checklist, sidebar redesign, locations, bulk actions, saved views, referral program. Created Phase 4.5 (UX Alignment Sprint) and expanded Phases 5–7 with new tasks. Updated build file v2. |
| 2026-03-01 | Phase 4 completed (tasks 4.6-4.8: calendar/job_change types, calendar widget, network updates widget). Phase 4.5 fully completed: Quick Action flashcard triage, location field, related contacts, Dex-style sidebar redesign, frequency-bucket Keep In Touch view, bulk select/actions, social link icons, dedicated /import route, two-column contact detail with right sidebar panel. 4 new pages (QuickAction, KeepInTouch, Import), 5 new IPC handler groups, 1 new DB table. Moving to Phase 5 (AI Features). |
| 2026-03-01 | Phase 5 fully completed. AI infrastructure: ai-client.ts (direct Anthropic API via fetch, no SDK), 8 new IPC handlers (ai:* namespace), Settings UI for API key. Copilot page (/copilot) with chat UI, 6 suggested prompts, contact link rendering. Network query engine sends all contacts to Claude for natural-language queries. ContactDetail AI Tools dropdown: reconnection messages, meeting briefing, note summarizer, suggest tags with one-click apply. Weekly digest IPC handler for going-cold/never-contacted/job-changes data. Command palette expanded with Copilot + new routes. Moving to Phase 6. |
| 2026-03-01 | Phase 6 desktop tasks fully completed (6.6-6.13). Reminders: Upcoming/Completed tabs. Saved Views: DB + IPC + sidebar + contacts "Save as View". Favorites: DB + IPC + sidebar + star toggle on contact detail. Map: Leaflet + Nominatim + Groups Tree (D3 force) + Related Web (D3 bubble) as sub-views. Locations: split management view. Outlook: microsoft-auth.ts OAuth2 + Graph API calendar/email sync + Settings UI. Installed: leaflet, react-leaflet@4, d3, @types/leaflet, @types/d3. 4 new pages, 3 new DB tables, 20+ new IPC handlers, 3 new component files. Tasks 6.1-6.5 (web app extraction) deferred — desktop app feature-complete. Moving to Phase 7. |

---

## HOW TO USE THIS FILE

### With Claude Code (Terminal)
1. Open Claude Code in the Nexus project directory
2. Say: "Read the MASTER BUILD FILE at [path]. Continue from the current task."
3. Claude Code will read the file, find the current task, and start working
4. After each task, update the status in this file

### With Claude.ai (Chat)
1. Upload or paste this file
2. Say: "Continue where we left off" or "Start task [ID]"
3. Claude will generate the code/instructions for the current task
4. Copy code into your project, test, then update this file

### Updating Progress
After each session:
1. Change the task status: 🔲 → 🟡 → ✅
2. Update "Current Phase" and "Current Task" at the top of the file
3. Add a one-liner to the SESSION LOG
4. If a task needed changes from the plan, add notes in the Notes column

---

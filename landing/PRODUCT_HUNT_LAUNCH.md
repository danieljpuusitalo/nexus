# Nexus — Product Hunt Launch Kit

## Tagline (60 chars max)
**The personal CRM that's private, offline, and half the price**

## Short Description (260 chars max)
Nexus is a desktop personal CRM for professionals who want to build stronger relationships. Track contacts, interactions, and stay in touch — with AI copilot, pipeline board, map view, and network graph. Free tier. $6/mo Pro. $99 lifetime.

## Full Description

### The problem
Your network is your most valuable professional asset, but the tools to manage it are either enterprise CRMs that are overkill, spreadsheets that are chaotic, or personal CRMs that charge $12/month and store your contacts on someone else's servers.

### What is Nexus?
Nexus is a personal relationship manager built for professionals who are intentional about their network. It's a desktop app that keeps your data on your device, works offline, and costs half what competitors charge.

### Key features
- **Contact Management** — Photos, birthdays, custom fields, social links, notes, and important dates for every contact
- **Keep In Touch** — Set frequencies (weekly, monthly, quarterly) and get nudged when relationships go cold
- **Pipeline Board** — Kanban view of your network sorted by recency of interaction
- **AI Copilot** — Ask your network questions in plain English, generate reconnection messages, meeting prep briefings, and smart tag suggestions
- **Map View** — See your contacts on an interactive map, find nearby connections when traveling
- **Network Graph** — D3-powered visualizations of your groups and relationship web
- **Calendar & Email Sync** — Connect Google or Outlook to auto-log meetings and emails
- **Smart Import** — Auto-detects Dex, Clay, LinkedIn, and generic CSV formats
- **Command Palette** — Ctrl+K to search contacts, groups, tags, and actions instantly
- **Light & Dark Theme** — Clean design that adapts to your preference

### What makes Nexus different?
1. **Privacy first** — Your data lives on your computer in a local SQLite database. Cloud sync is optional.
2. **Offline always** — Works without internet. No loading spinners, no downtime.
3. **Half the price** — Pro is $6/mo vs Dex at $12/mo. Or grab a lifetime license for $99.
4. **AI built in** — Network queries, reconnection messages, meeting prep — all from the AI Copilot.
5. **Views competitors lack** — Map view, network graph, pipeline board, and keep-in-touch frequency buckets.

### Pricing
- **Free** — 50 contacts, all core features, 10 AI actions/month
- **Pro** — $6/month — Unlimited contacts, unlimited AI, Google/Outlook sync, cloud backup
- **Lifetime** — $99 one-time — Everything in Pro, forever. Limited to first 500 users.

### Tech stack
Electron, React, TypeScript, Tailwind CSS, SQLite (better-sqlite3), Supabase (optional cloud), Claude API (AI)

---

## Maker Comment (first comment on the PH post)

Hey Product Hunt! 👋

I built Nexus because I was tired of paying $12/month for Dex to manage ~200 professional contacts, and I didn't love the idea of all my relationship data sitting on someone else's servers.

So I built the personal CRM I actually wanted:
- **Private** — your data stays on your device
- **Fast** — desktop app, no loading spinners
- **Smart** — AI copilot that actually knows your network
- **Affordable** — $6/mo or $99 forever

The AI Copilot is my favorite feature — you can ask it things like "Who do I know at Google?" or "Generate a message to reconnect with Sarah" and it has full context of your contacts, interactions, and notes.

If you're switching from Dex or Clay, the import wizard auto-detects their CSV format and maps every field automatically.

I'd love to hear your feedback. What features would make you switch from your current system?

---

## Assets Needed

### Logo
- [x] App icon (violet-indigo gradient with "N") — exists in app
- [ ] 240x240 Product Hunt logo (PNG, no transparency)
- [ ] Square logo with padding for social sharing

### Screenshots (1270x760 recommended)
Capture these from the running app in light theme:
1. **Dashboard** — Full dashboard with stats, keep-in-touch, activity feed, birthdays
2. **Contacts** — Contact list with detail panel open showing photo, info, timeline
3. **Pipeline** — Kanban board showing contacts in time-based columns
4. **AI Copilot** — Chat interface with a network query and response
5. **Map View** — Interactive map with contact pins and sidebar
6. **Keep In Touch** — Frequency buckets view with overdue contacts highlighted

### GIF/Video Demo (optional but high impact)
30-second GIF or 1-minute video showing:
1. Open app → dashboard overview
2. Ctrl+K → search a contact → navigate to detail
3. Show AI Copilot query
4. Toggle light/dark theme
5. Pipeline board scroll

---

## Launch Checklist

- [ ] Upload logo + screenshots to Product Hunt
- [ ] Write tagline + descriptions
- [ ] Post maker comment
- [ ] Share on X/Twitter with launch link
- [ ] Share on LinkedIn
- [ ] Post in relevant communities (r/productivity, r/networking, Indie Hackers)
- [ ] Email friends/beta users asking for upvotes
- [ ] Respond to all comments on launch day
- [ ] Follow up 24h post-launch with thank-you + stats

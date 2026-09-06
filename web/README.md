# Nexus — web

The interface. Web-first; the Electron app is paused.

```
cd web
npm install
npm run dev      # http://localhost:5180
npm run build    # static output in web/dist — hostable anywhere
```

## What this is

A clean-slate UI. Nothing is imported from the old Electron renderer — different
type, different palette, different structure. The old app was a personal CRM with
a meetings panel bolted on; this is the record itself.

## Design

Editorial-archival rather than dashboard. The product is a document that
accumulates, so it is typeset like one: warm ink ground, bone text, generous
measure, metadata set in mono the way a marginal note would be.

The structural idea is the **spine** — one hairline down every list of
conversations with dates hanging in the left margin, so a relationship reads as
a continuous record you scroll rather than a grid of cards.

The palette encodes the product's most important distinction. Everything a
source actually wrote is **bone**. Anything a model wrote is **sage** — a
different temperature entirely, behind its own rule, so you can tell before
reading a word whether you are looking at the record or an interpretation of it.

Fraunces (display) · Instrument Sans (body) · JetBrains Mono (metadata).

## Data

`src/data/snapshot.json` is a **sample record** so the interface can be judged
with real-shaped content. The app says so, in the banner, on every screen.

Its shape matches the ledger's own queries (`getRecentMeetings`, `getPeople`,
`getMeetingsForContact`, `getAmbiguousParticipants`) exactly, so pointing this at
a live API means changing `load()` in `src/lib/data.ts` and nothing else. No
component knows where the data came from.

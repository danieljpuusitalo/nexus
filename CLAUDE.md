# nexus: standing instructions

Personal conversation record layer — an aggregation over meeting notetakers that
reorganises conversations by person, and acts as the system of record for promises.
Public repo, nothing deployed, no users. A side project: 100 customers would be
success. Nothing here sends anything to anyone.

## Verify

Two halves, both required:

- Root: `npm test` (vitest over `src/main/`, the engine) and
  `npx tsc --noEmit -p tsconfig.node.json`.
- Prototype: `cd web && npm run typecheck && npm test && npm run build`.

CI (`.github/workflows/verify.yml`) runs both halves on every branch and PR.
A green root run proves the engine only; it says nothing about `web/`.

## Where state lives

`web/CHECKPOINT.md` is the authority on status; `web/ETHOS.md` carries the argument
the design rests on. Read both before proposing anything. Do not reconstruct status
from this file or from prose.

If the checkpoint's date is old relative to the last commit, say so and confirm
before executing its "Next" list — a stale next-step read as current is the failure
mode this project has already had once.

## Hard rules

1. **The record must be reconstructible from the conversations alone.** Anything
   that cannot be rebuilt from source is state a human has to maintain, which rots,
   which means an agent eventually acts on rotten context. This is the property the
   whole bet rests on. Nothing that violates it ships, however convenient.
2. **Nothing is ever sent.** Drafts leave through Daniel's own hands. There is no
   send path and none gets added.
3. **Counts, never scores.** Overdue compares against a person's own cadence, never
   a global threshold. No health score, no ranking number.
4. **Every match shows both quotes.** A suggestion that cannot be audited is one
   that should not be acted on.
5. **What a source wrote is bone; what a model wrote is sage, behind its own rule.**
   Never blur generated content into recorded content.
6. **Deliberately not built:** network graph, pipeline, scoring engine, manual
   enrichment. Each is easy and each pulls the product back toward being a CRM.
   Proposing one is not a contribution.

## Stop-points

- **Spend.** Extraction calls a paid API. Ask before any corpus or batch run, and
  before anything that would process the full library rather than a fixture.
- **Adding surfaces.** The checkpoint's own first instruction is that more screens
  will now hide problems rather than reveal them. New surface needs Daniel first.
- **Connecting the engine to the prototype.** When that happens, only `load()` in
  `web/src/lib/data.ts` changes — no component learns where its data came from. If
  a plan requires touching components, the plan is wrong.

## Traps

- `web/` needs its own `npm install`. Root install does not cover it.
- **One dev server, left running:** `cd web && npx vite --port 5180 --strictPort`.
  Hot reload handles edits; do not start a second server per change. `server.open`
  is deliberately false.
- **Two different apps, two ports.** `web/` is 5180. Root `npm run dev:web` is 5174
  and serves the *Electron renderer* built for web — a different application that
  shares nothing with `web/`. Confusing them wastes a session.
- **The AI key is not an env var.** It lives in SQLite, read via
  `getSecret(db, 'ai_api_key')` (`src/main/secure-store.ts`). `.env.example` covers
  Supabase and Google OAuth only.
- **Commitments in the prototype are fixture data unless `web/src/data/snapshot.local.json`
  exists** (gitignored, built by `scripts/build-snapshot.ts` from real
  extraction). The committed `snapshot.json` is hand-written; never describe it
  as extraction results. A local build bundles the local file into `dist/`.
- The web app uses a hash router: routes are `/#/reckoning`, not `/reckoning`.
- Known and open, do not rediscover: a commitment attaches to the first resolved
  person in the room (wrong at fifteen attendees); dismissals are session state only;
  companies match on exact string, so "Globex Pack" and "Globex Pack B.V." are two
  organisations.
- `better-sqlite3` is native; root `postinstall` runs `electron-builder
  install-app-deps`.
- Use the stage control (Day one / First call / First month / A year in) when
  judging any design change. The full library flatters every decision.

# NEXUS — PRODUCTION READINESS BRIEF (v1.1)

**Status: CANONICAL.** This brief supersedes `NEXUS_MASTER_BUILD_FILE.md` (Phases 1–6 verified complete) and `NEXUS_AUDIT_PERFORMANCE_BRIEF.md` (never executed; its still-relevant items are folded in here). Phase 0 archives both.

**How to run this:** Work through phases in order. Each phase ends with acceptance criteria and a git commit. Do not start a phase until the previous phase's criteria pass. If a criterion cannot be met, stop and report — do not silently skip.

**Date prepared:** 2026-07-06. Evidence base: full repo audit (main process, renderer, extension, landing, CI, Supabase), typecheck run, dependency-vs-import verification, and a June-2026 competitive crawl of getdex.com.

---

## PART A — EVALUATION (context; read, don't execute)

### A1. The opportunity

The personal-CRM category is validated and moving:

- **Dex** (YC S19, 30k+ users) charges $12–20/mo with **no free tier** — 7-day trial only. It spent 2026 pivoting hard to AI (MCP server, Claude/ChatGPT integration, "Dex Shuffle" AI outreach drafts) and shipped Outlook + a $20 Professional tier.
- **Clay (clay.earth)** rebranded to **Mesh** in 2026, freemium with contact caps on free.
- **folk** went team-CRM; **Monica** owns the open-source/self-host privacy niche but is dated.
- Dex's public roadmap is a free demand signal: call logging (207 votes), better dedup/merge (recurring, 3 separate items incl. a LinkedIn re-sync bug), mail merge, dark mode, custom keep-in-touch cadences.

**Nexus's wedge — three claims no major competitor makes together:**
1. **Free forever, unlimited contacts** (Dex: $144–240/yr; Mesh free tier is capped).
2. **Local-first** — data in SQLite on the user's machine, not a US cloud. Categorically stronger privacy claim than Dex's "SOC 2 hosting", and it lands with European audiences.
3. **BYOK AI** — Copilot at zero marginal cost, outside any paywall (Dex gates AI behind subscription).

**Honest risks:** (a) one-shot file imports vs. Dex's continuous sync — data staleness is the product's structural weakness (accepted; deferred to v2); (b) no mobile (accepted; PWA build exists as a partial hedge); (c) distribution cold start vs. Dex's 7 years + ambassador program; (d) unsigned Windows binaries → SmartScreen friction at the exact moment of first trust; (e) solo founder — reliability and support burden must be engineered down, not staffed.

**Verdict:** the wedge is real and the product is close. The job is not more features — it is trust (security, claims accuracy, data safety) and friction removal (x64 installer, working downloads, clean first run).

### A2. Product state (evidence-based)

**Strong:** Feature-complete v1 desktop CRM (19 pages, 7 working import flows, Copilot with safe markdown rendering, dark mode, ⌘K palette, lazy-loaded heavy pages). Renderer is clean: no `dangerouslySetInnerHTML`, no eval, no committed secrets, good empty/loading/error states. DB layer is solid: WAL, FKs, indexes, parameterized queries. Extension and landing exist. CI workflow (tag → win x64 + mac build → GitHub release) is written and correct. Typecheck is near-clean (2 real errors + 1 config error). No missing dependencies.

**Broken / blocking:**
1. **~80 files uncommitted** — months of work exists only on one laptop. The GitHub repo has one commit from Feb 26. CI, extension, landing, all import parsers: none of it is pushed.
2. **Hardcoded Google OAuth client secret** in dev seed data (`src/main/database.ts:367`).
3. **Plaintext secrets at rest** — OAuth tokens, the user's Anthropic key, Supabase creds all sit unencrypted in SQLite.
4. **IPC/Electron hardening gaps** — unvalidated `shell.openExternal` URLs, renderer-supplied fs paths, no CSP, no sender validation, permissive `window.open`.
5. **Installer is win-arm64 only** (built locally on an ARM laptop) — most Windows users cannot run it. CI on `windows-latest` will produce x64; it has simply never run.
6. **Extension `dist/` is stale** — `src/content.ts` was modified after the last build.
7. **Landing claims are wrong** — "Dex has no AI" is now false; Clay is now Mesh; download links point at a GitHub release that doesn't exist yet.
8. **Supabase RLS unverified** — cloud-sync tables may be readable cross-user. Must be proven before sync ships on.
9. **Workspace.tsx N+1** — per-contact IPC call in a loop; 500 contacts = 500 round trips.
10. **Zero tests** — parsers, normaliser, and dedup (the highest-regression-risk code) are unverified.

---

## PART B — EXECUTION BRIEF

### Global rules (apply to every phase)

- **Scope discipline:** harden and ship what exists. Do NOT add features or refactor beyond what a phase requires — **with one exception: Phase 5.5 defines the complete sanctioned front-end enhancement scope.** Nothing outside it. v2 ideas (continuous sync, mobile) remain out of scope.
- **Product invariants — never violate:** free forever, no contact limits, local-first (cloud sync strictly opt-in), BYOK AI, **no telemetry or analytics of any kind in the desktop app** (this is a marketable feature — keep it true).
- **Language invariant:** every user-facing string must pass the "non-technical elderly user, unaided" test. Plain English, no jargon, no raw error codes surfaced.
- **Windows x64 is the release target.** macOS builds may compile in CI but are not gated on. Hide macOS-only features (iMessage) on Windows.
- **One commit per phase minimum**, message format: `phase N: <summary>`. Push after every phase.
- **Never commit:** `.env`, real OAuth secrets, API keys, `release/`, `node_modules`, `dist-web/`, `extension/dist/` (verify `.gitignore` covers all — it currently does not cover `dist-web/`).

---

### PHASE 0 — Baseline: get the work off this laptop

**Goal:** everything committed, pushed, CI-ready. This is disaster insurance and must be first.

1. Audit `.gitignore`: ensure `node_modules/`, `release/`, `out/`, `dist-web/`, `extension/node_modules/`, `extension/dist/`, `.env`, `*.local` are ignored. Add what's missing.
2. **Secret scan before committing:** grep the full tree (excluding node_modules) for `client_secret`, `sk-ant`, `sk-`, `AIza`, `eyJ` (JWT/base64), Supabase service keys. The known hit is `src/main/database.ts:367` (hardcoded Google OAuth client secret in seed data) — remove it NOW, replace with empty-string placeholder + comment. Report any other hits before committing.
3. Move `NEXUS_MASTER_BUILD_FILE.md` and `NEXUS_AUDIT_PERFORMANCE_BRIEF.md` to `docs/archive/` with a superseded-by note prepended to each.
4. Add npm scripts: `"typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"`, `"test": "vitest run"` (vitest wired in Phase 8).
5. Commit everything in logical groups (main-process parsers; renderer pages; import UI; extension; landing; CI; supabase; docs). Push to `origin/main`.
6. **Prove the build in CI immediately:** add `workflow_dispatch` to `build.yml` (or a `verify.yml` on push running `npm ci && npm run typecheck && npm run build` on `windows-latest`) and trigger it. Local builds on the ARM laptop prove nothing about the x64 release path, and the dev sandbox cannot compile the native deps at all — CI is the only trustworthy build oracle. Do not proceed past Phase 0 until a green x64 build exists.

**Accept when:** `git status` is clean; secret scan is clean; repo on GitHub contains extension, landing, CI workflow, and all src; **a green `windows-latest` build run exists on GitHub Actions.**

---

### PHASE 1 — Secrets: encrypt everything at rest

**Goal:** no credential readable by opening a file.

1. Introduce a secrets module in main (`src/main/secure-store.ts`) using Electron `safeStorage` (DPAPI on Windows). API: `setSecret(key, value)`, `getSecret(key)`, `deleteSecret(key)`. Store encrypted blobs in a dedicated `secrets` table (or file) — NOT alongside plaintext.
2. Migrate to it: Google OAuth tokens (`google-auth.ts`), Microsoft tokens (`microsoft-auth.ts`), Anthropic BYOK key (`ai-client.ts`), Supabase session/refresh tokens. Write a one-time migration that moves any existing plaintext tokens into safeStorage and nulls the old columns.
3. Handle `safeStorage.isEncryptionAvailable() === false` gracefully: warn once in Settings ("your system doesn't support encrypted storage; keys stored locally with reduced protection"), don't crash.
4. OAuth client IDs/secrets for Google/Microsooft app registration: load from build-time env (electron-vite `import.meta.env` / define), never from the DB. Document required env vars in `.env.example`. Note: a desktop OAuth client secret is not truly confidential — that's acceptable and standard — but it must not live in seed data or the DB.
5. Full DB encryption (SQLCipher) is explicitly OUT of scope for v1 — document the decision in `docs/SECURITY.md`: local DB is plaintext by design (local-first, user-owned); secrets are encrypted; full-DB encryption is a v2 option.

**Accept when:** grep shows no token/key written to SQLite in plaintext; app runs a clean migration on an existing DB; new `docs/SECURITY.md` states the model honestly.

---

### PHASE 2 — Electron hardening

**Goal:** close the audit's high-severity perimeter findings.

1. `BrowserWindow` webPreferences: assert `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (test that preload still works; if sandbox breaks better-sqlite3-adjacent preload assumptions, document and set the strictest workable config).
2. `shell.openExternal`: route every call through one validator — allow only `https:` and `mailto:`; reject everything else. Grep all call sites.
3. `setWindowOpenHandler`: deny by default; allow only validated https URLs via the same validator.
4. CSP: inject a strict Content-Security-Policy on the renderer (`default-src 'self'`; explicitly allow what Leaflet tiles and local assets need; no `unsafe-eval`). Verify map view and Copilot still work.
5. IPC hardening in `src/main/ipc.ts`:
   - Add a sender check: ignore messages from webContents that aren't the main window.
   - Any handler that accepts a file path from the renderer must either (a) only accept paths obtained from a main-process `dialog.showOpenDialog` (pass a handle/token, not a raw path), or (b) validate the path resolves inside an allowed directory. No renderer-controlled arbitrary reads/writes.
   - Validate shapes of all handler inputs (ids are numbers, strings length-capped). A tiny hand-rolled validator is fine; don't add a dependency.
6. Navigation lockdown: `will-navigate` → prevent all navigation away from the app origin.
7. **AI input hygiene (prompt injection):** `buildContactContext` (`ai-client.ts:94–104`) concatenates imported, untrusted text (notes, job titles, custom fields — which arrive from CSVs, LinkedIn captures, email signatures) raw into prompts. An adversarial imported bio can steer Copilot output. Bounded fix, not a rearchitecture:
   - Wrap all contact-derived text in explicit delimiters (`<contact_data>…</contact_data>`) and add one system-prompt line: treat delimited content as data, never as instructions.
   - Length-cap each injected field (notes are unbounded today).
   - Treat every model output as a *suggestion requiring user confirmation* — verify the tag-suggestion flow (`ai-client.ts:205`) never writes tags without an explicit user accept, and strictly validate its JSON (array of ≤5 strings, each ≤40 chars, no control chars). No model output may ever trigger a DB write, IPC call, or link-open directly.
   - Drafted messages render as plain text (no markdown link auto-render in draft previews — injected URLs shouldn't become clickable).

**Accept when:** a checklist in `docs/SECURITY.md` maps each audit finding → fix commit; app fully functional after hardening (manual pass over: contacts CRUD, import CSV, map, Copilot, open-link-in-browser).

---

### PHASE 3 — Data safety: backups & export

**Goal:** a user can never lose their network. This is the trust feature for a local-first product.

1. Automatic backups: on app start (max once/day), copy the SQLite file to `<userData>/backups/nexus-YYYY-MM-DD.db` using the SQLite backup API (safe under WAL — do not naive-copy a live DB). Keep last 14, prune older. Setting to change retention; cannot be fully disabled (minimum 3).
2. Manual "Back up now" + "Restore from backup" in Settings, with elderly-proof copy ("This makes a safety copy of all your contacts").
3. Full export: one click → a folder (or zip) containing contacts as CSV **and** vCard, interactions/notes/reminders as CSV, photos. This is also the anti-lock-in marketing claim — make it match the landing's promise exactly.
4. Migration safety: wrap schema migrations in a transaction; snapshot a backup before any migration runs.

**Accept when:** kill the app mid-write and restart — DB intact; restore from backup works; export opens correctly in Excel and imports into Google Contacts (vCard).

---

### PHASE 4 — Reliability & performance

**Goal:** solo-founder-proof: the app fails loudly to a log, never silently corrupts, and stays fast at 5,000 contacts.

1. Logging: add `electron-log` (main + renderer via IPC). Global handlers: `process.on('uncaughtException'/'unhandledRejection')` in main, `window.onerror`/`onunhandledrejection` in renderer → log file at `<userData>/logs/`. Settings gets a "Show logs folder" button ("If something goes wrong, this file helps us fix it"). NO remote crash reporting — logs stay local; user chooses to share.
2. Fix the **Workspace.tsx N+1**: replace the per-contact `interactions.getForContact(id)` loop with one batched IPC call (`interactions.getForContacts(ids)` backed by a single `WHERE contact_id IN (...)` query).
3. Contacts list: add virtualization (windowing) for lists > ~300 rows. Prefer a small hand-rolled windowing hook or `react-window` — nothing heavier.
4. Sidebar badge polling (60s interval): replace with event-driven updates — main emits on data change, renderer subscribes. Keep a slow fallback poll (5 min).
5. Fix the 3 typecheck errors: `tsconfig.node.json` rootDir (exclude `electron.vite.config.ts` or widen rootDir); `AppLayout.tsx:178` `File.path` (use the Electron-exposed path via preload, typed properly); `push-notifications.ts:38` Uint8Array→BufferSource cast.
6. Seed a synthetic 5,000-contact DB (dev script) and verify: contacts list scroll, search, dashboard, Workspace all render < 1s interactions.

**Accept when:** `npm run typecheck` exits 0; 5k-contact profile passes; killing renderer mid-session leaves a useful log.

---

### PHASE 5 — Import truthing & first-run polish

**Goal:** every advertised import works or is honestly absent; first run is flawless.

1. iMessage: macOS-only — remove the stub card entirely on Windows builds (platform check), keep behind the scenes for a future mac release. No "coming soon" cards anywhere.
2. For each remaining source (Gmail, Outlook, LinkedIn CSV, WhatsApp, Telegram, Instagram, vCard, CSV, phone/QR, business-card OCR): run the flow with a real or fixture file. Fix what breaks. Every flow must have: plain-language step guide (where to get the export file, with the exact menu path in the source app), progress state, a results screen with counts, and a graceful error state ("We couldn't read that file. It should end in .zip and come from WhatsApp's 'Export chat' — here's how" + link to guide).
3. Dedup on import: every import path must funnel through the normaliser + duplicate detection before insert (Dex's #1 recurring complaint is import-created duplicates — this is a differentiator; make Merge & Fix run automatically post-import with a review screen).
4. First-run: fresh-profile walkthrough — Welcome → NetworkSetup → first import → dashboard. Time it; kill any step that asks for cloud/auth before showing value. Cloud sign-in must be skippable with one obvious click.
5. Copilot empty state: if no API key, show the elderly-proof BYOK guide (what a key is, where to get it, what it costs, that it's theirs).

**Accept when:** a fresh install on a clean Windows profile reaches "10+ contacts imported and visible" through at least 3 different sources using only on-screen guidance.

---

### PHASE 5.5 — FRONT-END ELEVATION (the sanctioned enhancement scope)

**Goal:** close the perceived-quality gap with a 7-year-old paid product, and build the one engagement loop v1 needs. These five items are chosen for maximum leverage against the audit and the Dex intel; they are the ONLY new front-end work permitted. Elevate — do not rearrange existing layouts or add routes beyond what's specified.

**1. "Today" — rebuild the Dashboard as a daily briefing (flagship item).**
This is the local-first answer to Dex Shuffle (their AI engagement loop) and their #1 use pattern. The dashboard becomes the reason to open Nexus every morning:
   - **Follow-ups due:** overdue keep-in-touch contacts, ranked by relationship health × dormancy, each with a one-click "log a catch-up" and "snooze 1 week".
   - **Today's meetings:** if calendar sync is on, a prep card per meeting — attendee context, last interaction, open notes (the meeting-briefing main-process code already exists; give it a home on screen, not just notifications).
   - **Coming up:** birthdays/anniversaries/important dates in the next 7 days with "send a note" quick action.
   - **One reconnection a day:** a single suggested dormant strong tie. Heuristic, precisely: `score = dormancy_ratio × strength`, where `dormancy_ratio = days_since_last_interaction / median_gap_between_past_interactions` (min 3 past interactions to qualify) and `strength = log(1 + interaction_count)`. Suggest the top-scoring contact not suggested in the last 30 days and not snoozed. Pure local computation — no AI, no network. If a BYOK key exists, offer "Draft a message" via Copilot, editable, never auto-sent. If not, show a plain prompt ("It's been 8 months since you spoke with Anna — you used to talk monthly").
   - Every section has an elderly-proof empty state. Zero telemetry; all computation local.

**2. Contact detail page as the hero surface.**
   - A 12-month interaction **recency strip** (tiny heat/sparkline above the timeline — one glance answers "how alive is this relationship?").
   - **Quick-log bar:** one-click chips (Call · Coffee · Message · Met) that log an interaction with today's date, editable inline after. Logging friction is THE reason personal CRMs die; make it two seconds.
   - Health indicator becomes explainable: tooltip states why ("No contact in 4 months; you averaged monthly before") and the fix ("Log a catch-up or adjust the cadence").

**3. Post-import "Network Reveal".**
After a first successful import, one full-screen moment: "You know **412 people** across **8 cities** and **73 companies**" with an animated mini network graph (D3 is already in the bundle) and top groups. Include "Save as image" (canvas export) — this screenshot is the organic-growth loop for a $0-marketing product. One screen, skippable, never shown again.

**4. Design-system consistency pass.**
   - Extract spacing/typography/radius into Tailwind theme tokens; sweep pages for one-off values.
   - Consistent motion: 150–200ms ease transitions on hover/expand/route changes; respect `prefers-reduced-motion`.
   - Skeleton loaders on every data-loading view (some exist — make it universal); `focus-visible` rings app-wide.
   - **Command palette upgrade:** ⌘K currently navigates — add actions: "Add contact", "Log interaction with…", "Start an import", "Toggle dark mode", "Back up now". Fuzzy match on contact names jumps to the contact.
   - Fix the audit's polish gaps: ARIA labels on all interactive elements in core flows (contacts list, import wizard, dashboard), full keyboard operability of the quick-log bar and palette.

**5. Density & delight, bounded.**
   - Contacts list: compact/comfortable density toggle (persisted), and inline hover actions (log, remind, open) so the list is a workspace, not a directory.
   - No confetti, no gamification, no streaks — the brand is calm competence.

**Constraints:** no new dependencies except `react-window` (already sanctioned in Phase 4); no new routes except the Network Reveal screen; Copilot drafting reuses the existing ai-client — no new AI surface area. All new strings pass the elderly-proof test.

**Accept when:** (a) a 30-second screen recording of Today → contact → quick-log → palette feels indistinguishable from a polished paid product; (b) the reconnection heuristic suggests sensible contacts on the 5k synthetic DB; (c) Network Reveal renders in <2s on 5k contacts; (d) keyboard-only pass of the core flows succeeds.

---

### PHASE 6 — Cloud sync & Supabase: prove it or gate it

**Goal:** opt-in sync that cannot leak between users.

1. Audit `supabase/` migrations: every synced table MUST have RLS enabled with `user_id = auth.uid()` policies for select/insert/update/delete. If policies are missing, write the migration now. **If RLS cannot be verified end-to-end, feature-flag cloud sync OFF for the v1.1 release** — local-first is the brand; shipping without sync is acceptable, shipping leaky sync is fatal.
2. Test cross-account isolation: two test accounts, verify neither can read the other's rows (write a small script or manual REST probes with each anon token).
3. Verify the extension's data path: extension → Supabase → desktop. Confirm the extension operates only on user click (no background scraping — LinkedIn ToS posture), and that its Supabase usage is anon-key + user session (no service key anywhere client-side).
4. Sync conflict sanity: last-write-wins is fine for v1 — but verify deletes propagate and a device offline for a month doesn't resurrect deleted contacts.

**Accept when:** documented RLS test evidence in `docs/SECURITY.md`, or sync is flagged off with a clean UI (no dead buttons).

---

### PHASE 7 — Extension release readiness

**Goal:** submittable to Chrome Web Store without rejection or ToS exposure.

1. Rebuild `extension/dist` from current `src` (it is stale — `content.ts` newer than dist). Add a freshness check to the extension build script.
2. LinkedIn selectors in `content.ts`: wrap all DOM queries in defensive fallbacks; on selector miss, fail visibly in the popup ("LinkedIn changed their page — update the extension") rather than silently capturing nothing. Centralize selectors in one file for fast patching.
3. Confirm capture is strictly user-initiated (button click on a profile page) — no auto-scraping, no bulk crawl. This is both ToS posture and Web Store review posture.
4. Web Store package: version-align with the app (1.1.0), write the privacy disclosure (what's read: the profile page you're viewing, when you click; where it goes: your own Nexus account), prepare 128px icon + screenshots checklist in `extension/STORE_LISTING.md`.

**Accept when:** `dist` reproducibly builds from src; manual capture works on 3 different LinkedIn profiles; STORE_LISTING.md complete.

---

### PHASE 8 — Tests where regressions actually happen

**Goal:** not coverage theater — a safety net under the highest-risk code.

1. Wire vitest (node environment) for `src/main` pure logic.
2. Unit tests with fixture files for: contact-normaliser (name/phone/email normalization edge cases), duplicate detection (the merge-decision logic), vCard parser, CSV parser, WhatsApp export parser, signature parser. Commit small anonymized fixtures under `test/fixtures/`.
3. One integration test: fresh DB → run migrations → CRUD a contact → backup → restore.
4. CI: add a `test.yml` workflow on every push/PR: `npm ci && npm run typecheck && npm test`. The existing tag-triggered `build.yml` stays for releases; add typecheck+test as a job dependency there too.

**Accept when:** CI green on GitHub for a real push; parsers have ≥1 happy-path + ≥2 malformed-input tests each.

---

### PHASE 9 — Landing page truthing & deploy readiness

**Goal:** every public claim survivable under scrutiny from someone who read Dex's changelog.

1. `nexus-vs-dex.html` — correct to June-2026 reality: Dex HAS AI (MCP server, Claude/ChatGPT, Dex Shuffle), Outlook integration, a $20 Professional tier. Nexus's honest wins: free forever/unlimited, local-first (data never leaves your machine), BYOK AI, no account required. Do not claim feature superiority where Dex is ahead (mobile, continuous LinkedIn sync) — omit or concede gracefully; found-out claims cost more than concessions.
2. `nexus-vs-clay.html` — Clay is now **Mesh** (2026 rebrand) with a capped free tier. Update name, pricing, and framing.
3. `index.html`: download buttons → real `releases/latest` URL only after Phase 10 publishes; until then keep GitHub link but verify no 404 paths. Keep the SmartScreen honesty note. Verify every feature named on the landing exists in the shipped build (the export claim must match Phase 3's actual export).
4. `privacy.html`: rewrite to reflect the real architecture: local SQLite; optional Supabase sync (what syncs, where hosted); Google/Microsoft OAuth scopes actually requested and why; BYOK key goes only to Anthropic, encrypted at rest locally; no telemetry. Short, plain-language, honest.
   - **GDPR posture (EU founder, EU audience — make it an asset):** with sync OFF, Nexus processes nothing — all data is on the user's device; say so explicitly, it is the strongest GDPR story in the category. With sync ON, the operator becomes a processor: name the hosting region, enumerate synced data, and honor Art. 15/17 by design — verify "delete my cloud data" in-app actually purges Supabase rows (test in Phase 6) and that full export (Phase 3) doubles as data portability (Art. 20). One paragraph each, no legalese. Note users importing contacts are themselves data controllers of their address books — the household exemption usually applies for personal use; don't over-lawyer it, but don't ignore it.
5. `vercel.json`: add security headers (CSP, X-Frame-Options, Referrer-Policy).

**Accept when:** a claims table in `docs/LAUNCH.md` lists every landing claim → where in the product it's true.

---

### PHASE 10 — Release engineering (Windows x64)

**Goal:** a stranger on a normal Windows laptop installs and updates Nexus.

1. Bump to `1.1.0` everywhere (app, extension, latest.yml regenerates).
2. Release path is CI, not the laptop: push tag `v1.1.0` → GitHub Actions (`windows-latest` = x64) builds NSIS installer and publishes the release with `latest.yml`. Local arm64 artifacts in `release/` are dev-only; add a README note.
3. Auto-update: verify `electron-updater` flow against the GitHub release (install 1.1.0, publish a 1.1.1-beta, confirm in-app update). Document the unsigned-binary implication: updates work, SmartScreen warns on first install only.
4. Code signing decision (document in `docs/LAUNCH.md`, human decision, ~not code): Azure Trusted Signing is the cheap current path for indie Windows signing; unsigned + honest SmartScreen note is acceptable for launch. Flag: unsigned will suppress some downloads.
5. Smoke-test checklist in `docs/RELEASE_CHECKLIST.md`: clean-VM install → first-run → import → backup → update → uninstall (data survives uninstall by default; document where).

**Accept when:** a real GitHub release exists with an x64 installer built by CI, installed successfully on a machine that isn't the dev laptop.

---

### PHASE 11 — Final QA gate

**Goal:** structured pass before anything public.

Run and record in `docs/RELEASE_CHECKLIST.md`:
1. Full manual pass of the 17 routed pages — every button does something or doesn't exist.
2. The Phase 5 fresh-profile first-run test, repeated on the release build (not dev).
3. All Copilot flows with a real Anthropic key (chat, persistence across restart, no-key state).
4. 5k-contact performance profile on the release build.
5. Data round-trip: export → wipe → re-import → counts match.
6. Landing deployed to Vercel; all links resolve; Lighthouse sanity check.

**Accept when:** checklist committed with every box checked and dated.

---

## PART C — HUMAN LAUNCH CHECKLIST (Daniel, not Claude Code)

These block launch but are not code:

1. **Google OAuth verification** — Gmail scopes require app verification; restricted scopes can trigger a security assessment (CASA), and unverified apps are capped at 100 users. Check exactly which scopes Gmail sync requests; if restricted, either start verification now (weeks of lead time) or ship v1.1 with Gmail import de-scoped to avoid the wall. Same review for Microsoft (Azure AD app consent).
2. **Code signing** — decide unsigned vs. Azure Trusted Signing before Product Hunt (SmartScreen friction on launch day is expensive).
3. **Chrome Web Store** — developer account, submit extension (review takes days–weeks; start early).
4. **Supabase production project** — confirm plan limits, backups, and that the anon key in builds points at prod with RLS verified (Phase 6 evidence). **Choose an EU region** (e.g. Frankfurt) — cheap now, a migration later, and it upgrades the GDPR story from compliant to native.
5. **GitHub repo visibility** — decide public (open-source trust halo, fits the positioning) vs. private (keep IP). If public: add LICENSE intent check and scrub git history (it's 1 commit — easy now, hard later).
6. **Launch sequence** — GitHub release → landing live → extension approved → then the existing `PRODUCT_HUNT_LAUNCH.md` plan. Comparison pages go live only after Phase 9 truthing.

---

## SEQUENCE SUMMARY

| Phase | Theme | Blocks launch? |
|---|---|---|
| 0 | Commit & push everything | YES — disaster risk |
| 1 | Encrypt secrets | YES |
| 2 | Electron hardening | YES |
| 3 | Backups & export | YES |
| 4 | Reliability & perf | YES |
| 5 | Import truthing, first-run | YES |
| 5.5 | Front-end elevation (Today, contact hero, reveal, design pass) | YES — it's the differentiation |
| 6 | Supabase RLS or gate sync | YES |
| 7 | Extension readiness | No (parallel track) |
| 8 | Tests + CI gates | YES |
| 9 | Landing truthing | YES (before landing goes live) |
| 10 | x64 release via CI | YES |
| 11 | Final QA | YES |

Estimated Claude Code effort: Phases 0–4 are mechanical and well-specified (fast). Phases 5, 5.5 and 6 involve judgment and testing loops (slower); Phase 5.5 is the largest single phase and worth two or three dedicated sessions (Today dashboard first, then contact hero + reveal, then design pass). Run phases in separate focused sessions; do not attempt the whole brief in one context window.

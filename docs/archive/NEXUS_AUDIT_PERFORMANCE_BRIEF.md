> **SUPERSEDED** by `NEXUS_PRODUCTION_BRIEF.md` (2026-07-06). Never executed; still-relevant items folded into the production brief. Archived for reference only.

# NEXUS CRM — AUDIT & PERFORMANCE IMPROVEMENT BRIEF
# Purpose: Deep audit of codebase for stability, cleanliness, and performance
# Run with: claude --dangerously-skip-permissions "Read NEXUS_AUDIT_PERFORMANCE_BRIEF.md and begin Phase 1"
# Do NOT skip steps. Work sequentially. Log findings as you go.

---

## INSTRUCTIONS FOR CLAUDE CODE

You are auditing and hardening the Nexus CRM codebase. The app is built with:
- Electron 40.6, React 18, React Router 6, Tailwind 3, TypeScript 5.7
- better-sqlite3 (local SQLite), Supabase (cloud sync), D3, Leaflet
- Chrome extension (Manifest V3), AI Copilot (Anthropic API BYOK)

**Rules for this session:**
1. Do not add new features. This is strictly audit, fix, and clean.
2. For every file you touch, log what you changed and why.
3. If you find something broken that would require a major rewrite, flag it clearly
   with a comment `// AUDIT FLAG: [description]` and move on — do not silently skip it.
4. When removing dead code, confirm it is truly unreferenced before deleting.
   Use grep/search to verify no other file imports or calls the code being removed.
5. After completing each phase, output a short summary of what was found and fixed.

---

## PHASE 1 — DEPENDENCY AUDIT

### 1.1 — Scan package.json for Unused Dependencies

Run the following and act on results:

```bash
npx depcheck
```

- List every dependency flagged as unused.
- For each unused dependency, verify with a codebase-wide search that it is truly
  not imported anywhere (including in config files and build scripts).
- Remove confirmed unused dependencies with `npm uninstall [package]`.
- Do NOT remove: devDependencies used only in build/config files (electron-builder,
  electron-vite, typescript, tailwind, postcss, eslint).
- Do NOT remove: packages that may be loaded dynamically or required by electron-builder.
- Document every package removed and why.

### 1.2 — Outdated Dependency Check

Run:
```bash
npm outdated
```

- List all outdated packages.
- For PATCH updates (x.x.1 → x.x.2): update all automatically.
  ```bash
  npm update
  ```
- For MINOR updates: review each one. Update if the changelog shows no breaking
  changes and the package is not: Electron, React, React Router, better-sqlite3,
  or Tailwind (these need manual major version consideration).
- For MAJOR updates: flag them in a comment block at the top of this section — do
  NOT update major versions automatically. List them for the developer to review.
- After any updates, run `npm run dev` and verify the app still launches.

### 1.3 — Security Audit

Run:
```bash
npm audit
```

- Fix all CRITICAL and HIGH vulnerabilities automatically where safe:
  ```bash
  npm audit fix
  ```
- For vulnerabilities that require `--force` (breaking changes): list them and flag
  them — do NOT force-fix automatically.
- Document the before/after vulnerability count.

### 1.4 — Lockfile Consistency

- Verify `package-lock.json` is consistent with `package.json`.
- If there are conflicts or the lockfile is out of date:
  ```bash
  rm package-lock.json
  npm install
  ```
- Verify the app still builds after lockfile regeneration.

---

## PHASE 2 — TYPESCRIPT STRICT AUDIT

### 2.1 — Enable Strict Mode Gradually

Check `tsconfig.json`:
- If `"strict": true` is already set, proceed to 2.2.
- If not, add it temporarily and run:
  ```bash
  npx tsc --noEmit
  ```
- Count the number of TypeScript errors produced.
- If under 50 errors: fix them all, then permanently enable strict mode.
- If over 50 errors: fix only these high-priority categories:
  - `any` types on IPC handler parameters and return types
  - Null/undefined dereferences on database query results
  - Missing return types on exported functions
  - Log the remaining errors as `// AUDIT FLAG: TS strict error — [type]`

### 2.2 — Eliminate Explicit `any` Types

Search the codebase:
```bash
grep -rn ": any" src/
grep -rn "as any" src/
```

- For each `any` found, replace with the correct specific type.
- Priority: IPC handler interfaces in `preload/index.ts`, database row types in
  `database.ts`, and API response types in `ai-client.ts`.
- If a type is genuinely complex/dynamic, use `unknown` and add a type guard
  rather than `any`.
- Target: zero `any` types in the preload bridge and database layer.

### 2.3 — Dead Type Definitions

- Search `src/shared/` and `src/renderer/src/types/` for type interfaces that are
  defined but never imported anywhere.
- Remove unused type definitions after confirming they are unreferenced.

### 2.4 — Compile Check (Final)

After all TypeScript fixes:
```bash
npx tsc --noEmit
```
Must complete with zero errors. Fix any remaining errors before proceeding.

---

## PHASE 3 — DEAD CODE ELIMINATION

### 3.1 — Unused React Components

Search for component files that are defined but never imported:
```bash
# For each .tsx file in src/renderer/src/components/, check if it's imported anywhere
find src/renderer/src/components -name "*.tsx" | while read f; do
  name=$(basename "$f" .tsx)
  count=$(grep -r "import.*$name" src/ --include="*.tsx" --include="*.ts" | wc -l)
  echo "$count $name"
done
```

- List all components with import count of 0.
- Verify manually (the script may miss dynamic imports or re-exports).
- Delete confirmed unused components.

### 3.2 — Unused Page Routes

- Open the React Router config (likely in `App.tsx` or a `routes.tsx` file).
- List all registered routes.
- Verify every route has a corresponding page component that is complete and functional.
- Identify any routes that were scaffolded but left as empty/stub pages.
- Either complete stub pages (if needed) or remove their route registrations and files.

### 3.3 — Unused IPC Handlers

- Open `src/main/ipc/` (all IPC handler files).
- For each IPC handler registered with `ipcMain.handle('namespace:action', ...)`:
  - Search the renderer codebase for `window.api.namespace.action` or the equivalent
    invocation.
  - If the handler is never called from the renderer, mark it as dead code.
- List all dead IPC handlers.
- Remove dead handlers AND their corresponding preload bridge entries AND their
  TypeScript interface definitions.
- Document removed handlers.

### 3.4 — Unused Utility Functions

Search `src/` for utility files (helpers, utils, lib folders):
```bash
find src/ -name "*.ts" -path "*/utils/*" -o -name "*.ts" -path "*/helpers/*" -o -name "*.ts" -path "*/lib/*"
```

- For each utility function exported from these files, verify it is imported and called
  somewhere in the codebase.
- Remove unused utility functions.
- If an entire utility file is unused, remove the file.

### 3.5 — Commented-Out Code

Search for large blocks of commented-out code:
```bash
grep -rn "// " src/renderer/src/ --include="*.tsx" | grep -v "TODO\|FIXME\|NOTE\|HACK\|AUDIT FLAG" | wc -l
```

- Manually scan for commented-out JSX blocks, old function implementations, or
  entire commented component trees.
- Remove all commented-out code blocks that are clearly old/replaced.
- Keep: TODO comments, FIXME comments, architectural notes, and AUDIT FLAG markers.

### 3.6 — Console.log Cleanup

```bash
grep -rn "console.log" src/renderer/ --include="*.tsx" --include="*.ts"
grep -rn "console.log" src/main/ --include="*.ts"
```

- Remove all `console.log` statements from renderer code.
- In main process code, replace debug `console.log` statements with structured
  logging or remove them. Keep `console.error` and `console.warn` for genuine errors.
- Replace any remaining intentional debug logs with a conditional:
  ```typescript
  if (process.env.NODE_ENV === 'development') {
    console.log('[Nexus Debug]', ...)
  }
  ```

### 3.7 — TODO/FIXME Audit

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx"
```

- List all TODOs and FIXMEs found.
- For each one:
  - If it's a known feature gap that's intentionally deferred: leave it with a clearer
    comment referencing the phase/feature.
  - If it represents a bug or broken state that should be fixed now: fix it.
  - If it's no longer relevant (feature was completed): remove the comment.
- Output the full list in the session summary so the developer can review.

---

## PHASE 4 — DATABASE LAYER AUDIT

### 4.1 — Migration Integrity Check

- Open `database.ts` and read through all migration blocks.
- Verify the migration versioning is sequential with no gaps.
- Verify each migration block uses `IF NOT EXISTS` or equivalent guards so it's
  safe to run on an existing database without errors.
- Verify the initial schema creation and all subsequent migrations are idempotent
  (can run multiple times without side effects).
- Test: delete the local database file, launch the app, verify a fresh database is
  created correctly with all tables and indexes.

### 4.2 — Index Verification

Run this query against the SQLite database to list all existing indexes:
```sql
SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index';
```

Verify indexes exist for these columns (add any missing in a new migration):
```sql
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(last_contacted);
CREATE INDEX IF NOT EXISTS idx_contacts_keep_in_touch_frequency ON contacts(keep_in_touch_frequency);
CREATE INDEX IF NOT EXISTS idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date);
CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_contact_id ON reminders(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON contact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_contact_id ON contact_groups(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_group_id ON contact_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id_1 ON contact_relationships(contact_id_1);
CREATE INDEX IF NOT EXISTS idx_contact_relationships_contact_id_2 ON contact_relationships(contact_id_2);
CREATE INDEX IF NOT EXISTS idx_favorites_item_type ON favorites(item_type);
```

### 4.3 — Query Audit: N+1 Patterns

Scan IPC handlers for N+1 query patterns — the most common SQLite performance killer:

Common pattern to find:
```typescript
// BAD: fetches contacts, then queries for each contact's tags in a loop
const contacts = db.prepare('SELECT * FROM contacts').all()
for (const contact of contacts) {
  contact.tags = db.prepare('SELECT * FROM tags WHERE contact_id = ?').all(contact.id)
}
```

- Audit the contacts list query, the dashboard stats query, and the Keep In Touch
  query specifically — these are the most data-heavy operations.
- Replace N+1 patterns with JOIN queries or batch queries where possible.
- For tag/group fetching on the contacts list: use a single query with GROUP_CONCAT
  to fetch all tags in one pass, then parse in JavaScript.

Example optimized pattern:
```sql
SELECT c.*,
  GROUP_CONCAT(DISTINCT t.name) as tag_names,
  GROUP_CONCAT(DISTINCT g.name) as group_names
FROM contacts c
LEFT JOIN contact_tags ct ON ct.contact_id = c.id
LEFT JOIN tags t ON t.id = ct.tag_id
LEFT JOIN contact_groups cg ON cg.contact_id = c.id
LEFT JOIN groups g ON g.id = cg.group_id
WHERE c.archived = 0
GROUP BY c.id
```

### 4.4 — Cascade Delete Verification

Test and verify that deleting a contact properly cascades:
- Verify `ON DELETE CASCADE` is set on: `contact_tags.contact_id`,
  `contact_groups.contact_id`, `interactions.contact_id`, `reminders.contact_id`,
  `custom_fields.contact_id`, `important_dates.contact_id`,
  `contact_relationships.contact_id_1`, `contact_relationships.contact_id_2`,
  `favorites` where item_type = 'contact'.
- If any of these are missing CASCADE, add them via migration.
- Verify `PRAGMA foreign_keys = ON` is set when the database connection is opened.
  Without this pragma, SQLite ignores foreign key constraints entirely.
- Test: add a contact with tags, interactions, and reminders. Delete the contact.
  Verify no orphan rows remain in any related table.

### 4.5 — Database Connection Handling

- Verify the SQLite database connection is opened once at app startup and reused —
  not opened and closed on each IPC call.
- Verify WAL mode is enabled: `PRAGMA journal_mode = WAL` — this dramatically
  improves concurrent read/write performance.
- Verify the database is closed cleanly on app quit via `app.on('before-quit', ...)`.

---

## PHASE 5 — IPC LAYER AUDIT

### 5.1 — IPC Handler Error Wrapping

Every single IPC handler must be wrapped in try/catch. Scan for handlers that are not:

```bash
grep -n "ipcMain.handle" src/main/ipc/*.ts
```

For each handler found, verify the pattern is:
```typescript
ipcMain.handle('namespace:action', async (event, args) => {
  try {
    // ... logic
    return { success: true, data: result }
  } catch (error) {
    console.error('[IPC namespace:action]', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
})
```

Any handler that throws instead of returning `{ error: ... }` must be fixed.
A thrown exception from an IPC handler crashes the main process in production.

### 5.2 — Preload Bridge Completeness

- Open `src/preload/index.ts`.
- Verify every IPC handler registered in `src/main/ipc/` has a corresponding entry
  in the preload bridge's `contextBridge.exposeInMainWorld('api', { ... })` object.
- Verify the TypeScript interface for `window.api` (likely in `src/shared/types/` or
  a `global.d.ts` file) matches the actual preload bridge — no phantom methods,
  no missing methods.
- Any mismatch between the TypeScript interface and the actual preload bridge is a
  runtime bug: the renderer will think a method exists but calling it will throw.

### 5.3 — IPC Input Validation

For IPC handlers that receive user-supplied data (especially from forms):
- Verify contact create/update handlers validate required fields (name must not be
  empty string) before hitting the database.
- Verify import handlers validate CSV row structure before attempting inserts.
- Verify AI handlers validate that the API key is set before attempting Anthropic calls.
- Add basic input sanitization: trim whitespace from string inputs, parse integers
  for numeric fields, validate date strings before inserting.

### 5.4 — Async IPC Consistency

- Scan for IPC handlers that mix sync and async patterns inconsistently.
- All handlers should be `async` even if they only do synchronous SQLite operations —
  this keeps the pattern consistent and avoids subtle bugs.
- better-sqlite3 is synchronous by design — this is fine. But ensure it's called
  from within an async handler, not from a sync `ipcMain.on` listener.

---

## PHASE 6 — REACT COMPONENT AUDIT

### 6.1 — useEffect Dependency Array Audit

Search for useEffect hooks with missing or incorrect dependency arrays:
```bash
grep -n "useEffect" src/renderer/src --include="*.tsx" -r
```

For each useEffect found:
- If it has an empty `[]` dependency array, verify it truly only needs to run once.
- If it references state or props values inside but doesn't list them in dependencies,
  this is a stale closure bug — add the missing dependencies.
- If the ESLint react-hooks plugin is configured, run it and fix all warnings:
  ```bash
  npx eslint src/renderer/src --ext .tsx --rule '{"react-hooks/exhaustive-deps": "warn"}'
  ```

### 6.2 — Memory Leak Audit

The following patterns cause memory leaks — audit for each:

**Event listeners not removed:**
```typescript
// BAD
useEffect(() => {
  window.addEventListener('keydown', handler)
}, [])

// GOOD
useEffect(() => {
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

**Intervals not cleared:**
```typescript
// BAD
useEffect(() => {
  setInterval(checkReminders, 60000)
}, [])

// GOOD
useEffect(() => {
  const id = setInterval(checkReminders, 60000)
  return () => clearInterval(id)
}, [])
```

**D3 simulations not stopped:**
```typescript
// In GroupsTree and RelatedWeb components
useEffect(() => {
  const simulation = d3.forceSimulation(nodes)...
  return () => simulation.stop()  // Must exist
}, [data])
```

**Leaflet map not destroyed:**
```typescript
useEffect(() => {
  const map = L.map('map-container')
  return () => map.remove()  // Must exist
}, [])
```

Scan all component files for these patterns and add cleanup where missing.

### 6.3 — Component Re-render Audit

Identify components that re-render unnecessarily on every parent update:

- Scan for large list-rendering components (ContactList rows, InteractionList items,
  ReminderList items) that don't use `React.memo`.
- Wrap these in `React.memo()` to prevent re-renders when their props haven't changed.
- Scan for callback functions passed as props that are recreated on every render —
  wrap with `useCallback` where the callback is passed to a memoized child.
- Scan for computed values derived from state that are recalculated on every render —
  wrap with `useMemo` where the computation is non-trivial (sorting/filtering large arrays).

Priority targets for memoization:
- Contact list row component (renders once per contact — could be 500+ rows)
- Interaction timeline item
- Keep In Touch list item
- Sidebar navigation (re-renders on every route change — memoize the component)

### 6.4 — Large Component Splitting

Identify components over 300 lines:
```bash
find src/renderer/src -name "*.tsx" | xargs wc -l | sort -rn | head -20
```

For any component over 400 lines:
- Split it into smaller sub-components.
- Extract repeated UI patterns into reusable components.
- Extract data-fetching logic into custom hooks (`useFetchContacts`,
  `useContactDetail`, etc.).
- The goal: no single component file over 300 lines. Logic and UI should be separated.

### 6.5 — Key Prop Audit

Search for list renders missing `key` props:
```bash
grep -n "\.map(" src/renderer/src --include="*.tsx" -r
```

For every `.map()` that renders JSX, verify the outer element has a stable `key` prop.
- Use `contact.id`, `tag.id`, etc. — never use array index as key unless the list
  is static and never reordered.
- Fix any list renders using index as key that render dynamic/reorderable data.

---

## PHASE 7 — ELECTRON MAIN PROCESS AUDIT

### 7.1 — Window Creation Audit

Open `src/main/index.ts` and audit the BrowserWindow creation:

Verify these security settings are set:
```typescript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // Must be true
    nodeIntegration: false,      // Must be false
    sandbox: true,               // Recommended
    preload: path.join(__dirname, '../preload/index.js'),
    webSecurity: true,           // Must be true in production
  }
})
```

- `contextIsolation: true` + `nodeIntegration: false` is the critical security pair.
- If `nodeIntegration: true` exists anywhere, change it immediately — this is a
  serious security vulnerability in production Electron apps.

### 7.2 — IPC Channel Whitelist

Verify the preload only exposes specific, named IPC channels — not a generic
`ipcRenderer.invoke(channel, args)` passthrough that would allow the renderer to
call any arbitrary channel.

If a generic passthrough exists, replace it with explicit method mappings:
```typescript
// BAD — allows renderer to invoke any IPC channel
invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)

// GOOD — only exposes specific channels
contacts: {
  getAll: () => ipcRenderer.invoke('contacts:getAll'),
  create: (data) => ipcRenderer.invoke('contacts:create', data),
  // ...
}
```

### 7.3 — External URL Handling

Verify that any external links (landing page links, GitHub links, Anthropic links)
open in the user's default browser, not in an Electron window:
```typescript
// In main process
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url)
  return { action: 'deny' }
})
```

If this handler isn't set, external links may open in a new Electron window without
the security restrictions of a real browser — a security and UX issue.

### 7.4 — App Lifecycle Handling

Verify these lifecycle events are handled correctly:
- `app.on('window-all-closed')`: On macOS, don't quit when last window closes
  (standard macOS behavior: app stays in dock).
- `app.on('activate')`: On macOS, re-create the window if dock icon clicked and
  no windows are open.
- `app.on('before-quit')`: Close the SQLite database cleanly.
- `app.on('second-instance')`: If the app is already running and the user tries to
  open it again, focus the existing window instead of creating a duplicate.
  (Requires `app.requestSingleInstanceLock()` at startup.)

### 7.5 — Renderer Process Crash Handling

Add crash handling:
```typescript
mainWindow.webContents.on('render-process-gone', (event, details) => {
  console.error('[Nexus] Renderer process crashed:', details.reason)
  // Optionally: reload the window or show an error dialog
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Nexus encountered an error',
    message: 'The application ran into a problem. Would you like to reload?',
    buttons: ['Reload', 'Close']
  }).then(({ response }) => {
    if (response === 0) mainWindow.reload()
    else mainWindow.close()
  })
})
```

---

## PHASE 8 — STARTUP SEQUENCE AUDIT

### 8.1 — Measure & Document Startup Time

Add timing markers to the main process startup sequence:
```typescript
const t0 = Date.now()
console.log('[Nexus] App starting...')

app.whenReady().then(() => {
  console.log(`[Nexus] App ready: ${Date.now() - t0}ms`)
  createWindow()
  console.log(`[Nexus] Window created: ${Date.now() - t0}ms`)
})
```

Run the app in dev mode and record:
- Time to `app.whenReady()`
- Time to window shown (`ready-to-show` event)
- Time to first meaningful paint (first IPC data load complete)

Document the baseline numbers.

### 8.2 — Parallelize Main Process Startup

Audit the startup sequence in `main/index.ts` for serial awaits that could run in parallel:

```typescript
// BAD — serial startup
await initDatabase()
await loadSettings()
await checkForUpdates()
createWindow()

// GOOD — parallel where possible
await initDatabase()  // Database must be ready first
const [settings] = await Promise.all([
  loadSettings(),
  // Other non-DB-dependent startup tasks
])
createWindow()  // Don't await non-critical tasks like update checks
checkForUpdates()  // Fire and forget
```

### 8.3 — Defer Non-Critical Startup Tasks

These tasks should NOT block the window from appearing:
- Auto-updater check
- Google Calendar sync
- Outlook sync
- Pre-meeting briefing check
- Any network requests

Move these to fire after the window is shown with a delay:
```typescript
mainWindow.once('ready-to-show', () => {
  mainWindow.show()
  // Defer non-critical background tasks
  setTimeout(() => {
    startBackgroundSync()
    scheduleReminderChecks()
    checkForUpdates()
  }, 3000)  // 3 second delay after window shows
})
```

### 8.4 — Renderer Initial Data Load

Audit the Dashboard component's data loading:
- All dashboard data fetches must run in parallel, not sequentially:
```typescript
// In Dashboard useEffect
const [stats, reminders, recent, calendar] = await Promise.all([
  window.api.contacts.getStats(),
  window.api.reminders.getDueToday(),
  window.api.contacts.getRecent(5),
  window.api.google.getUpcomingEvents()
])
```
- Show skeleton loading state immediately, populate when data arrives.
- If any individual fetch fails, show that section's error state — don't block
  the whole dashboard.

---

## PHASE 9 — CHROME EXTENSION AUDIT

### 9.1 — Manifest V3 Compliance Check

Open `extension/manifest.json` and verify:
- `"manifest_version": 3` is set.
- Permissions are minimal — only what's actually used:
  - `"activeTab"` — for reading the current tab's LinkedIn URL
  - `"storage"` — for storing auth tokens and settings
  - `"notifications"` — only if used
  - Host permissions: `"https://www.linkedin.com/*"` — not `"<all_urls>"`
- Remove any permissions that are declared but not used.
- `"background"` uses `"service_worker"` not `"scripts"` (MV3 requirement).
- Verify `"content_scripts"` `matches` pattern is limited to LinkedIn URLs only.

### 9.2 — Extension Content Script Audit

Open the LinkedIn content script:
- Verify the DOM selectors used to extract profile data are wrapped in null checks.
  LinkedIn changes its DOM structure regularly — every selector access must be
  optional chained:
  ```typescript
  const name = document.querySelector('.text-heading-xlarge')?.textContent?.trim() ?? ''
  ```
- If any selector fails, the extension must fail gracefully (return empty string or skip
  the field) — not throw an uncaught error that breaks the whole content script.
- Verify the "Save to Nexus" button injection only happens once per page load — check
  for duplicate button injection if the LinkedIn SPA navigates between profiles.

### 9.3 — Extension Background Service Worker

- Verify the background service worker is properly handling the `chrome.alarms` API
  for the job change detection periodic checks (MV3 doesn't support persistent
  background pages — alarms are the correct approach).
- Verify the service worker terminates correctly between alarm events — MV3 service
  workers are not persistent and will be terminated by Chrome.
- Verify there's rate limiting: no more than 10 LinkedIn profile checks per 24-hour
  period across all monitored contacts. Store the last-checked timestamp per contact
  in `chrome.storage.local`.

### 9.4 — Extension Storage Audit

```bash
grep -rn "chrome.storage" extension/
```

- Verify nothing sensitive (API keys, passwords) is stored in `chrome.storage.local`
  without encryption — this storage is readable by Chrome extensions with the right
  permissions.
- The Supabase session token stored in the extension should be the minimum needed —
  store only the access token and user ID, not the full session object.
- Verify storage keys are namespaced to avoid collisions: `nexus_auth_token`,
  `nexus_user_id`, etc.

---

## PHASE 10 — WEB APP / PWA AUDIT

### 10.1 — Supabase Client Audit

Open `src/renderer/src/lib/supabase.ts` (or equivalent):
- Verify the Supabase client is created once and exported as a singleton — not
  re-created on every call.
- Verify environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
  used — no hardcoded credentials anywhere in the codebase:
  ```bash
  grep -rn "supabase.co" src/ extension/ landing/
  ```
  Any hardcoded Supabase URLs outside of `.env` files must be replaced with
  environment variable references.

### 10.2 — Environment Variable Security

```bash
grep -rn "ANTHROPIC\|SUPABASE\|STRIPE\|SECRET\|API_KEY" src/ extension/ landing/
```

- No secret keys, API keys, or credentials should appear in the source code.
- All secrets must be in `.env` (local) or set as environment variables in deployment.
- Verify `.env` is in `.gitignore`.
- Verify `.env.example` exists with placeholder values and comments.

### 10.3 — PWA Manifest & Service Worker

- Open `dist-web/manifest.json` (or wherever the web build outputs it):
  - `name` and `short_name` must be set: "Nexus CRM" / "Nexus"
  - `display`: "standalone"
  - `theme_color` and `background_color` must match the app's dark theme
  - Icon sizes: 192x192 and 512x512 PNGs must exist and be valid
  - `start_url`: "/" or the correct app entry point
- Open the service worker (`sw.js`):
  - Verify the cache name is versioned — update it when app content changes
    to bust the cache for returning users:
    ```javascript
    const CACHE_NAME = 'nexus-v1.0.0'  // Update with each release
    ```
  - Verify the install handler caches the app shell correctly.
  - Verify the fetch handler uses network-first for API calls and cache-first for
    static assets.
  - Verify the activate handler cleans up old cache versions.

### 10.4 — Web App API Polyfill Audit

Open `src/renderer/src/lib/web-api.ts` (the Supabase polyfill for `window.api`):
- Verify every method in the polyfill matches the real `window.api` interface.
- Any method that is in the Electron preload bridge but not in the web polyfill will
  silently fail in the web app — this is a common source of web-app-only bugs.
- Test: for each major page (Dashboard, Contacts, ContactDetail, Copilot, Keep In Touch,
  Pipeline, Reminders) — verify the web polyfill has all the methods those pages call.

---

## PHASE 11 — BUILD & OUTPUT AUDIT

### 11.1 — Build Warnings

Run a clean production build:
```bash
npm run build
```

- Capture all warnings output during the build.
- Fix all warnings that relate to: deprecated APIs, missing files, circular imports,
  invalid exports.
- Document warnings that are safe to ignore (e.g., third-party library warnings from
  Leaflet or D3).

### 11.2 — Bundle Size Analysis

```bash
npx vite-bundle-analyzer
```
(Install if needed: `npm install --save-dev rollup-plugin-visualizer`)

Or alternatively, check the build output sizes:
```bash
du -sh dist/  # or out/ depending on config
```

- Identify any single chunk over 500KB.
- For large chunks, check if they can be split via dynamic import.
- Verify Leaflet and D3 are not included in the main bundle (they should be
  lazy-loaded per Phase 8 of the Ship-Ready Brief).
- Verify the Anthropic AI client is not bundled on the main chunk — it should only
  load when the Copilot page is accessed.

### 11.3 — Verify Production Build Runs

After `npm run build`, package the app:
```bash
npm run package
```

- Install the resulting `.exe` (or `.dmg`) and verify the app launches correctly
  from the installed location.
- Verify the SQLite database creates at the correct `userData` path.
- Verify no DevTools or debug UI is visible in the production build.
- Verify no source maps are exposed in the production build (check dist/ for .map files —
  they should not be present unless intentionally included for error reporting).

### 11.4 — Electron DevTools in Production

Verify that Chrome DevTools cannot be opened in production:
```typescript
// In main/index.ts — only open DevTools in development
if (!app.isPackaged) {
  mainWindow.webContents.openDevTools()
}

// Disable keyboard shortcut to open DevTools in production
mainWindow.webContents.on('before-input-event', (event, input) => {
  if (!app.isPackaged && input.key === 'F12') {
    mainWindow.webContents.openDevTools()
  }
})
```

---

## PHASE 12 — FINAL VERIFICATION

### 12.1 — Automated Test Run

If any test files exist:
```bash
npm test
```

- Fix any failing tests.
- If no tests exist, note this in the session summary as a future priority.
  (Test coverage is out of scope for this brief but should be added for the next sprint.)

### 12.2 — ESLint Full Pass

```bash
npx eslint src/ --ext .ts,.tsx --max-warnings 0
```

- Fix all ESLint errors and warnings.
- If no ESLint config exists, create a minimal `.eslintrc.json`:
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```
  Then install required packages: `npm install --save-dev eslint @typescript-eslint/parser
  @typescript-eslint/eslint-plugin eslint-plugin-react-hooks`

### 12.3 — Clean Dev Server Start

```bash
npm run dev
```

Verify:
- [ ] No errors on startup in the terminal
- [ ] No red errors in the Electron DevTools console on initial load
- [ ] No 404 errors for any assets in the Network tab
- [ ] No React key warnings in the console
- [ ] No "Cannot read properties of undefined" errors on any page
- [ ] App navigates cleanly between all 14+ routes with no console errors
- [ ] D3 visualizations render without errors (Map → Groups Tree → Related Web)
- [ ] Leaflet map loads without errors (may show empty if no contacts have locations)
- [ ] Copilot page loads (shows BYOK setup prompt if no API key)
- [ ] Settings page loads all sections without errors

### 12.4 — Production Binary Smoke Test

Install the packaged app and verify:
- [ ] App launches in under 5 seconds on a standard machine
- [ ] No white flash before the app UI appears
- [ ] Window title shows "Nexus — Personal CRM"
- [ ] App icon appears correctly in taskbar/dock
- [ ] Adding a contact and closing the app retains the contact on next launch
- [ ] No Windows Defender / antivirus false positives on the installer
  (Note: may occur without code signing — document the workaround)

---

## SESSION SUMMARY TEMPLATE

After completing all phases, output a structured summary:

```
## NEXUS AUDIT SUMMARY — [Date]

### Dependencies
- Removed X unused packages: [list]
- Updated X packages to latest patch/minor
- X security vulnerabilities resolved (was Y, now Z)

### TypeScript
- Strict mode: [enabled/X errors remaining]
- `any` types eliminated: X
- Unused types removed: X

### Dead Code
- Removed X unused components
- Removed X dead IPC handlers
- Removed X console.log statements
- Resolved X TODO/FIXME items

### Database
- Added X missing indexes
- Fixed X cascade delete issues
- Fixed X N+1 query patterns

### Memory & Performance
- Fixed X missing useEffect cleanups
- Memoized X components
- Parallelized startup: estimated Xms improvement

### Security
- All IPC handlers wrapped in try/catch: ✓
- contextIsolation: true verified: ✓
- nodeIntegration: false verified: ✓
- No hardcoded credentials: ✓

### Build
- Zero TypeScript errors: ✓
- Zero ESLint errors: ✓
- Production build completes cleanly: ✓
- Bundle size: XMB main chunk

### AUDIT FLAGS (needs developer decision)
1. [Description of flagged issue]
2. [Description of flagged issue]

### Next Recommended Sprint
[Brief notes on what the next round of work should focus on]
```

---

*Brief version: 1.0 — Created March 2026*
*Run after: NEXUS_SHIP_READY_BRIEF.md Phase A is complete*
*Estimated session time: 2–4 Claude Code sessions depending on findings*

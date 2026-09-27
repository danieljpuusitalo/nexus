# Checkpoint, 27 September 2026

The development path lives in `docs/ROADMAP.md` (phases 0–6). This file says
where the build stands against it; the roadmap says why the order is what it is.

Where the prototype stands and what to pick up next. Read `ETHOS.md` first if
you are new to this; it carries the argument the whole thing is built on.

## Run it

```
cd ~/nexus/web
npx vite --port 5180 --strictPort     # one server, hot reload, leave it running
```

Then <http://localhost:5180>. Do not start a second server per change; hot
reload handles edits. `server.open` is deliberately false so nothing spawns
browser windows.

## What exists

A standalone web app in `web/`, sharing nothing with the Electron renderer.
Six surfaces, reachable from the rail (hash router: `/#/reckoning`):

| Surface | What it answers |
|---|---|
| **Today** (`/`) | What am I walking into, and what do I owe them |
| **People** (`/people`, `/people/:id`) | Everything ever said with one person |
| **Companies** (`/company/:slug`) | Where are we with this organisation |
| **Open loops** (`/loops`) | What did anyone promise and not do |
| **Ways to help** (`/help`) | Who could I connect, and who have I under-repaid |
| **The reckoning** (`/reckoning`) | What have I promised, oldest first, and is there evidence I did it |
| **Who is this?** (`/review`) | The only thing the product asks of you |

Plus: cmd-K palette, `/` to focus the filter, draft drawer shared by loops and
introductions, contribution grid, cadence strips, stage control.

## The stage control

On the sample banner: **Day one · First call · First month · A year in.**

It projects the record back to a point in its own history and rederives people,
signals, exchanges and upcoming meetings from the conversations that survive.
The sparse states are genuinely sparse, not mocked. It exists because a product
that is beautiful at 200 conversations and bleak at 2 never reaches 200.

Use it when judging anything. The full library flatters every design decision.

## The invariant worth protecting

**The record must be reconstructible from the conversations alone.**

Anything that cannot be rebuilt from source is state somebody has to maintain,
which means it rots, which means an agent eventually acts on rotten context.
The stage projection proved the chain holds end to end today. Keep it that way;
it is the property the whole agent-context bet rests on.

## Where the design stands

Settled and deliberate:

- Commitments carry an owner and a state. "You owe" leads everywhere over "you
  are owed", because the first list is what makes someone reliable.
- Counts, never scores. Overdue compares against a person's own cadence, never
  a global threshold.
- What a source wrote is bone; what a model wrote is sage behind its own rule.
- Every match shows both quotes. A suggestion you cannot audit is one you
  should not act on.
- Nothing is ever sent. Drafts leave through the user's own hands.
- People, companies and signals are all derived. Nothing is entered by hand.

Open and unresolved:

- **Multi-person meetings.** A commitment currently attaches to the first
  resolved person in the room. Fine at five attendees, wrong at fifteen.
- **Dismissals do not persist.** "Not a fit" and "Not a person" are session
  state only. Real behaviour needs a decision about whether dismissing a match
  should suppress the pair forever or resurface it when something changes.
- **Companies are matched on an exact string.** "Globex Pack" and "Globex Pack B.V."
  are two organisations today.

## Built on 26 September (roadmap phases 0–4)

- **Verify covers the prototype.** `web/` has `typecheck` and `test` scripts;
  CI runs a `web` job and triggers on every branch and PR, not `main` only.
- **Extraction exists** (`src/main/commitments.ts`): forced tool call, every
  commitment must quote the transcript verbatim or it is dropped, versioned by
  model + `PROMPT_HASH`. A deterministic `assessCapture` pre-check marks
  unreadable transcripts `not_captured` before any spend (volume, fragment
  ratio, and words-per-minute against the turn timestamps).
- **Closure** (`src/main/commitment-closure.ts`): evidence is `closed`,
  `candidate` or `none`, and `none` means *no evidence found*, never *not done*.
- **Snapshot builder** (`src/main/snapshot-builder.ts`,
  `scripts/build-snapshot.ts`) folds meetings + extractions into the exact shape
  `load()` reads. `load()` prefers a gitignored `src/data/snapshot.local.json`
  when present, so real data never enters the repo; no component changed.
- **The reckoning** (`/reckoning`): headline from counts, "You owe" oldest first,
  every item shows its quote and its evidence state.
- **Proved on two real Tactiq exports**, extracted in-session (no API spend),
  outputs kept outside the repo. Call A (34 min): 4 commitments kept, 1 dropped
  as low confidence. Call B (header says 4 min, timestamps run to 29:38, 150
  words of filler): correctly `not_captured`, and that person's page now says "Not known"
  instead of "Nothing outstanding".

Warning: `npm run build` on a machine with `snapshot.local.json` bundles the real
data into `dist/`. `dist/` is gitignored; never deploy a locally built bundle.

## Done on 27 September

- **The reckoning is the landing screen.** `/` opens it; Today moved to
  `/today`; `/reckoning` stays as an alias. A commitment with no recorded
  quote says "No quote on record" instead of quoting its paraphrase.
- **No real names in the tree.** Fixtures, seeds, tests, comments and docs use
  obvious fakes and `*.example` addresses. LICENSE keeps its holder; GitHub
  URLs keep the account name. Earlier commits still hold the old strings.
- **First real evidence pass.** A read-only Gmail search of sent mail gave
  Call A's four promises closure evidence, kept outside the repo in
  `.nexus-local/`. Two closed with verbatim quotes. The other two stay open,
  and the mail agrees. The pass found a closure bug: "introduce" never matched
  "introducing". Fixed, with a negative control.

## Next

Blocked on Daniel:

1. **Rewrite git history?** Removing the old names from history needs a
   force-push on a public repo, and GitHub may cache the old SHAs anyway.
2. **Phase 5, the backlog run.** The Gmail pass ran in-session at no cost.
   Extraction over the full library is a paid batch run and still needs a yes
   and a key.

Unblocked and next for any session:

- Evidence ingestion as code: turn the manual Gmail step into an adapter that
  emits `EvidenceItem`s, treating mail bodies as untrusted data.

- Past-due marker on reckoning items (Today counts "1 past due"; the reckoning
  card does not show which).
- Persist dismissals and decide the multi-person rule (unchanged from before).

Deliberately not building: a network graph, a pipeline, a scoring engine,
manual enrichment. Each is easy and each pulls back toward being a CRM.

## The engine

`src/main/` holds the parser, person resolver, calendar matching, ledger
writes, summariser, and now extraction, closure and the snapshot builder.
`npm test` at the root runs them all. The prototype reads engine output only
through `load()` in `web/src/lib/data.ts`; no component knows where its data
came from.

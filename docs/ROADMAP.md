# Roadmap: from prototype to system of record for promises

Written 26 September 2026. Aligns `web/ETHOS.md` (the argument), `CLAUDE.md` (the
hard rules) and the direction set on 12 and 23 September, which supersedes the
"Next" list in `web/CHECKPOINT.md` of 6 September.

## Where this is going

Nexus is the system of record for promises. Email records messages, calendar
records time, git records code; nothing records what people said they would do.
The first thing a user sees is **the reckoning**: *you made 47 promises this
year, 11 are still open, 6 are over 90 days old, here they are with the sentence
you said them in.*

The personal ledger is free; the shared team ledger is the business. The moat is
what accumulates (verbatim corpus, resolution decisions, correction history,
commitment state), not extraction quality, which trends to free.

## Invariants every phase must keep

1. Reconstructible from the conversations alone. Every commitment carries the
   verbatim **quote** it came from, and a quote that cannot be found in its
   source transcript is dropped, not repaired.
2. Every extraction is versioned by **model + prompt hash**, so the whole
   corpus can be re-read when either changes.
3. Evidence, not verdicts. "No evidence in the record" is never shown as "not
   done": WhatsApp and phone calls exist. Closure is shown with both quotes.
4. Counts, never scores. Nothing is sent. No manual enrichment.
5. Real conversations never enter this public repo. Real snapshots and
   extractions live in gitignored `*.local.json` files.

## Phases

### Phase 0: a verify signal for the code that matters

The web prototype had no test, no typecheck and no CI. Add `typecheck` and
`test` scripts in `web/`, a web job in `verify.yml`, and run CI on every branch.
**Exit:** CI green on `feat/meeting-ledger` covering both root and `web/`.

### Phase 1: commitment extraction (`src/main/commitments.ts`)

A pure function: transcript in, commitments out. The transport is injected, so
the same code runs against the Anthropic API, a test double, or an in-session
extraction pasted as JSON. High precision bar: drop ambiguous items, never invent
a due date, keep the due phrase verbatim. Detects transcripts too poor to read
(`capture: not_captured`), which the interface must show honestly rather than
render a fluent summary over noise.
**Exit:** tests over synthetic fixtures; first real run on one transcript.

### Phase 2: closure across the record (`src/main/commitment-closure.ts`)

Given a commitment and later evidence (conversations, sent emails), propose
closure. Deterministic candidate generation (same counterparty, later in time,
right direction, content overlap), then an optional injected judge. Judge quotes
must be verbatim in the evidence. States: `closed` (judged, both quotes),
`candidate` (overlap only, needs a look), `none` (no evidence found).
**Exit:** tests; closes the two real promises the 23 September Gmail test
closed by hand.

### Phase 3: real data into the prototype (`src/main/snapshot-builder.ts`)

Engine outputs to the `Snapshot` shape in `web/src/lib/data.ts`. Written to
`web/src/data/snapshot.local.json` (gitignored); `load()` prefers it when
present. No component learns where its data came from.
**Exit:** the prototype renders one real conversation's real commitments.

### Phase 4: the reckoning (`/reckoning`)

The screen that leads. Counts over a window, "You owe" first, each promise with
its quote, its age and its evidence state. Designed sparse-first against the
stage control.
**Exit:** Daniel looks at it on real data and decides whether it becomes the
landing screen.

### Phase 5: corpus (blocked on Daniel)

The reckoning needs dozens of conversations, not two. Options, ranked: notetaker
summary emails from Gmail (also tests the inbound-email bet); Tactiq MCP (Team+);
local exports. Any batch run is a spend stop-point and needs a yes first.

### Phase 6: the reckoning in front of five partners at five funds

Watch their faces. That reaction is the product-market-fit signal and costs
nothing. Then one fund as a design partner on board-meeting promises, which is
where this converges with Team Intelligence: *did they do what they said*,
longitudinally, from primary evidence.

### Later, in order of when they bite

- Multi-person attribution: a commitment names its counterparty from the quote,
  not from the first person in the room.
- Persisted corrections (dismissals, "this was done", "not a promise"). These
  are the correction history, and correction history is part of the moat, so
  they are stored as events against the source, never as edits to it.
- An MCP surface over the ledger: the agent is a first-class reader.
- Company matching beyond exact strings.
- A name. "Nexus" is generic and the domain is not his.

## Deliberately not on this roadmap

A network graph, a pipeline, a scoring engine, manual enrichment, a send button,
training on anyone's speech.

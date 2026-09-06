# Checkpoint, 6 September 2026

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
Five surfaces, reachable from the rail:

| Surface | What it answers |
|---|---|
| **Today** (`/`) | What am I walking into, and what do I owe them |
| **People** (`/people`, `/people/:id`) | Everything ever said with one person |
| **Companies** (`/company/:slug`) | Where are we with this organisation |
| **Open loops** (`/loops`) | What did anyone promise and not do |
| **Ways to help** (`/help`) | Who could I connect, and who have I under-repaid |
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
- **Companies are matched on an exact string.** "Reo Pack" and "Reo Pack B.V."
  are two organisations today.

## Next, in the order that seemed wisest

1. **Nothing.** Sit with the four stages first and decide whether the value
   proposition is convincing before more surface gets added. The prototype is
   at the point where more screens will hide problems rather than reveal them.
2. **Extraction against a real transcript.** The open question is no longer a
   screen: it is whether commitment and signal extraction survives contact with
   a live Tactiq export. Best guess is that it works on Fathom-style summaries
   and struggles on raw ASR, which would make the enhancement layer
   load-bearing rather than optional. Cheap to test.
3. **Persist dismissals and decide the multi-person rule.** Both are small and
   both are currently papering over a real decision.

Deliberately not building: a network graph, a pipeline, a scoring engine,
manual enrichment. Each is easy and each pulls back toward being a CRM.

## The engine, untouched

`src/main/` in the parent repo still holds the real thing: parser, person
resolver, calendar matching, ledger writes, summariser. 154 tests, all passing.
It is not connected to this prototype and does not need to be yet. When it is,
only `load()` in `web/src/lib/data.ts` changes; no component knows where its
data came from.

/**
 * Runs the engine's own outputs (meetings, extractions, closures) through
 * `buildSnapshot` and writes the result as a Snapshot JSON file — the same
 * shape `web/src/lib/data.ts` renders.
 *
 * Run with:
 *   npx tsx scripts/build-snapshot.ts <input.json> <output.json>
 *
 * `node --experimental-strip-types` was the first thing tried, per the
 * brief, but Node's type-stripping mode requires every relative import to
 * carry an explicit `.ts` extension, and `src/main/snapshot-builder.ts`
 * imports `./commitments` and `./commitment-closure` the same
 * extensionless way as every other file in `src/main/` (matching the
 * project's existing style, which this script must not change just to suit
 * itself). `npx tsx` resolves those imports the same way the rest of the
 * build tooling in this repo already does (vitest, electron-vite), so it is
 * the command that actually works without touching unrelated files.
 *
 * Input JSON shape: `{ self, generatedAt, meetings, extractions, closures }`
 * — exactly `BuildSnapshotInput` from `src/main/snapshot-builder.ts`.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { buildSnapshot, type BuildSnapshotInput } from '../src/main/snapshot-builder'

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2)
  if (!inputPath || !outputPath) {
    console.error('Usage: npx tsx scripts/build-snapshot.ts <input.json> <output.json>')
    process.exit(1)
  }

  const raw = readFileSync(inputPath, 'utf-8')
  const input = JSON.parse(raw) as BuildSnapshotInput
  const snapshot = buildSnapshot(input)

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2))
  console.log(`Wrote ${outputPath}: ${snapshot.conversations.length} conversations, ${snapshot.people.length} people.`)
}

main()

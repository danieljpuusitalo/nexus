#!/usr/bin/env node
/**
 * Fathom free-tier API probe.
 *
 * Why this exists: Fathom's own pricing page lists "Public API & MCP" as an
 * Enterprise-only row, while Fathom's own developer docs and quickstart say API
 * access is included on every plan (with tier gating only which *fields* come
 * back). Two of the vendor's own properties disagree, and the connector roadmap
 * assumes the docs are right. Settle it with a real key on a real free account
 * before any adapter work is scheduled against it.
 *
 * Usage:
 *   node scripts/probe-fathom.mjs <api-key>
 *   FATHOM_API_KEY=... node scripts/probe-fathom.mjs
 *
 * Get a key: Fathom → Settings → Integrations → API (per the developer
 * quickstart). If no API section appears on a free account at all, that is
 * itself the answer — record it and stop.
 */

const BASE = 'https://api.fathom.ai/external/v1'
const key = process.argv[2] || process.env.FATHOM_API_KEY

if (!key) {
  console.error('No key. Usage: node scripts/probe-fathom.mjs <api-key>')
  process.exit(2)
}

// The docs have used more than one header name over time; try each rather than
// reporting a false negative because of a header mismatch.
const AUTH_STYLES = [
  { label: 'X-Api-Key', headers: { 'X-Api-Key': key } },
  { label: 'Authorization: Bearer', headers: { Authorization: `Bearer ${key}` } },
]

const verdicts = []

for (const style of AUTH_STYLES) {
  const url = `${BASE}/meetings?limit=1`
  let res
  try {
    res = await fetch(url, { headers: { ...style.headers, Accept: 'application/json' } })
  } catch (err) {
    console.log(`${style.label.padEnd(22)} network error: ${err.message}`)
    verdicts.push({ style: style.label, verdict: 'NETWORK ERROR' })
    continue
  }

  const body = await res.text()
  const snippet = body.slice(0, 300).replace(/\s+/g, ' ')

  let verdict
  if (res.ok) verdict = 'WORKS ON THIS PLAN'
  else if (res.status === 401) verdict = 'REJECTED — bad/unaccepted key'
  else if (res.status === 403) verdict = 'GATED — key valid, plan not entitled'
  else if (res.status === 429) verdict = 'RATE LIMITED — retry later'
  else verdict = `UNEXPECTED ${res.status}`

  console.log(`${style.label.padEnd(22)} ${res.status} → ${verdict}`)
  console.log(`  ${snippet}\n`)
  verdicts.push({ style: style.label, status: res.status, verdict })

  if (res.ok) {
    // The tier question is really about fields, not access. Report which of the
    // ones the connector plan depends on actually came back.
    try {
      const json = JSON.parse(body)
      const first = (json.items || json.data || json.meetings || [])[0]
      if (first) {
        const has = (p) => (p ? 'yes' : 'NO')
        console.log('  Fields the roadmap depends on:')
        console.log(`    calendar_invitees        ${has(first.calendar_invitees)}`)
        console.log(`    invitee emails           ${has(first.calendar_invitees?.[0]?.email)}`)
        console.log(`    transcript               ${has(first.transcript)}`)
        console.log(`    default_summary          ${has(first.default_summary)}`)
        console.log(`    action_items             ${has(first.action_items)}`)
        const speaker = first.transcript?.[0]?.speaker
        console.log(`    matched_calendar_invitee_email ${has(speaker?.matched_calendar_invitee_email)}`)
      } else {
        console.log('  Authorised, but no meetings returned — record a test call and re-run')
        console.log('  so the field-level check above is meaningful.')
      }
    } catch {
      console.log('  (response was not JSON we could introspect)')
    }
    console.log()
  }
}

const worked = verdicts.some((v) => v.verdict === 'WORKS ON THIS PLAN')
console.log('─'.repeat(60))
console.log(
  worked
    ? 'VERDICT: API reachable on this account. Fathom connector stays in the plan.'
    : 'VERDICT: no auth style succeeded. Do NOT schedule the Fathom connector\n' +
      '         against a free tier until this is resolved. Note the plan this key\n' +
      '         came from — a 403 on free is the pricing page being right.'
)
process.exit(worked ? 0 : 1)

# Nexus v1.1.0 — Release Checklist

## Pre-release

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (14 tests)
- [ ] `npm run build` succeeds
- [ ] All Phase 0-11 commits pushed to main
- [ ] CI verify workflow green on latest commit

## Release build

- [ ] Push tag `v1.1.0` to trigger CI build
- [ ] Windows x64 NSIS installer built by GitHub Actions (windows-latest)
- [ ] GitHub Release created with installer + latest.yml
- [ ] Download installer and verify it runs on a non-dev x64 machine

## Smoke test (on clean Windows x64 machine)

- [ ] Install via NSIS installer
- [ ] SmartScreen warning appears (unsigned) — click "More info" → "Run anyway"
- [ ] App launches, Welcome screen appears
- [ ] Import contacts via CSV (at least 3 contacts)
- [ ] Network Reveal screen shows after first import
- [ ] Navigate to Dashboard — greeting, stats, calendar section visible
- [ ] Open a contact — recency strip and quick-log bar visible
- [ ] Quick-log a Call — interaction logged, recency strip updates
- [ ] Open Copilot — BYOK guide shown (no API key configured)
- [ ] Settings → Back up now → backup created
- [ ] Settings → Restore from backup → list shows, restore works (app restarts)
- [ ] Settings → Export everything → folder with CSV + vCard created
- [ ] Ctrl+K → Command palette opens, "Back up now" action works
- [ ] Close app and reopen — data persists
- [ ] Uninstall — data survives (in %APPDATA%/nexus/)

## Auto-update verification

- [ ] Install v1.1.0
- [ ] Publish a v1.1.1-beta tag
- [ ] In-app update notification appears
- [ ] Update installs successfully

## Landing

- [ ] Landing deployed to Vercel
- [ ] All download links resolve (no 404)
- [ ] Lighthouse score check
- [ ] Privacy page reflects current architecture
- [ ] Comparison pages reflect July 2026 competitor state

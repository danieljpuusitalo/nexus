# Nexus — Security Model

## Overview

Nexus is a local-first personal CRM. All contact data is stored in a SQLite database on the user's machine. Cloud sync (via Supabase) is strictly opt-in.

## Secrets at rest

Sensitive credentials are encrypted using Electron's `safeStorage` API, which delegates to the operating system's credential store:

- **Windows:** DPAPI (Data Protection API)
- **macOS:** Keychain
- **Linux:** libsecret / kwallet (when available)

Encrypted secrets are stored as blobs in the `secrets` SQLite table. The encryption key is managed by the OS and tied to the user profile — the blobs are unreadable outside the user's session.

### What is encrypted

| Secret | Storage |
|--------|---------|
| Anthropic API key (BYOK) | `secrets` table (encrypted) |
| Google OAuth access token | `secrets` table (encrypted) |
| Google OAuth refresh token | `secrets` table (encrypted) |
| Microsoft OAuth access token | `secrets` table (encrypted) |
| Microsoft OAuth refresh token | `secrets` table (encrypted) |

### What is NOT encrypted

| Data | Storage | Why |
|------|---------|-----|
| Contact data, interactions, notes | SQLite `contacts`, `interactions`, etc. | Local-first design: the user owns the file on their machine. Full-DB encryption (SQLCipher) is a v2 option. |
| Token expiry timestamps | `settings` table (plaintext) | Not sensitive — only indicates when to refresh. |
| Connected account email | `settings` table (plaintext) | Display-only, not a credential. |
| Google/Microsoft client IDs | Build-time env vars | Compiled into the binary. Desktop OAuth client IDs are not confidential (see OAuth 2.0 for native apps, RFC 8252). |
| Supabase anon key | Build-time env var | Public by design (row-level security enforces access). |

### Graceful fallback

If the OS credential store is unavailable (`safeStorage.isEncryptionAvailable() === false`), secrets are stored as plaintext in the `secrets` table. The app warns once in Settings. This can occur on headless Linux or minimal desktop environments.

## OAuth client credentials

Google and Microsoft OAuth client IDs and secrets are injected at build time via environment variables (see `.env.example`). They are **not** stored in the database.

A desktop OAuth client secret is not truly confidential — this is standard for native/desktop apps per RFC 8252. The secret is compiled into the binary but does not grant standalone access to user data; it only enables the OAuth consent flow.

## Full-database encryption

SQLCipher (full SQLite encryption) is explicitly **out of scope for v1**. The threat model for a local-first app is physical device access — at which point OS-level disk encryption (BitLocker, FileVault) is the appropriate layer. Full-DB encryption adds complexity, performance overhead, and key-management UX burden without materially improving security for the target user.

This remains a v2 option if demand or use-case warrants it.

## Telemetry

Nexus contains **no telemetry, analytics, or crash reporting** in the desktop app. Logs are written to a local file only. The user chooses whether to share them.

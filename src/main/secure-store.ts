/**
 * Secure credential storage using Electron safeStorage (DPAPI on Windows).
 *
 * Secrets are stored as encrypted blobs in the `secrets` SQLite table.
 * On systems where safeStorage is unavailable, values fall back to plaintext
 * storage with a one-time console warning.
 */

import { safeStorage } from 'electron'
import type Database from 'better-sqlite3'

let encryptionAvailable: boolean | null = null
let warnedOnce = false

function isEncryptionAvailable(): boolean {
  if (encryptionAvailable === null) {
    encryptionAvailable = safeStorage.isEncryptionAvailable()
    if (!encryptionAvailable && !warnedOnce) {
      warnedOnce = true
      console.warn(
        '[secure-store] System encryption (safeStorage) is not available. ' +
        'Secrets will be stored with reduced protection.'
      )
    }
  }
  return encryptionAvailable
}

/** Ensure the secrets table exists. Call once after DB init. */
export function initSecretStore(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL
    );
  `)
}

/** Store an encrypted secret. Overwrites any existing value for this key. */
export function setSecret(db: Database.Database, key: string, value: string): void {
  const blob = isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value, 'utf-8')

  db.prepare('INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, blob)
}

/** Retrieve and decrypt a secret. Returns null if the key doesn't exist. */
export function getSecret(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM secrets WHERE key = ?').get(key) as { value: Buffer } | undefined
  if (!row) return null

  try {
    return isEncryptionAvailable()
      ? safeStorage.decryptString(row.value)
      : row.value.toString('utf-8')
  } catch {
    // Decryption can fail if the OS keychain changed (e.g. user profile migration).
    // Return null rather than crashing — the user will need to re-enter credentials.
    console.error(`[secure-store] Failed to decrypt secret "${key}". The credential may need to be re-entered.`)
    return null
  }
}

/** Delete a secret. */
export function deleteSecret(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM secrets WHERE key = ?').run(key)
}

/** Check whether safeStorage encryption is active (for UI warnings). */
export function isEncryptionEnabled(): boolean {
  return isEncryptionAvailable()
}

// ---------------------------------------------------------------------------
// Migration: move plaintext secrets from the settings table to secure store
// ---------------------------------------------------------------------------

const MIGRATED_KEYS = [
  'ai_api_key',
  'google_access_token',
  'google_refresh_token',
  'microsoft_access_token',
  'microsoft_refresh_token',
  'supabase_access_token',
] as const

/**
 * One-time migration: move sensitive values from the plaintext `settings` table
 * into the encrypted `secrets` table, then delete the plaintext copies.
 *
 * Safe to call multiple times — skips keys already migrated or absent.
 */
export function migrateSecretsFromSettings(db: Database.Database): void {
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?')
  const deleteSetting = db.prepare('DELETE FROM settings WHERE key = ?')

  const migrate = db.transaction(() => {
    for (const key of MIGRATED_KEYS) {
      // Skip if already in secrets table
      const existing = db.prepare('SELECT 1 FROM secrets WHERE key = ?').get(key)
      if (existing) continue

      const row = getSetting.get(key) as { value: string } | undefined
      if (row && row.value) {
        setSecret(db, key, row.value)
        deleteSetting.run(key)
      }
    }
  })

  migrate()
}

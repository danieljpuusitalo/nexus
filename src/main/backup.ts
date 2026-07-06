/**
 * Backup & restore module.
 *
 * - Automatic daily backup on app start (SQLite backup API, safe under WAL)
 * - Manual "Back up now" / "Restore from backup"
 * - Retention: keep last N backups, prune older (default 14, minimum 3)
 * - Pre-migration snapshot
 */

import type Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const BACKUP_DIR_NAME = 'backups'
const BACKUP_PREFIX = 'nexus-'
const BACKUP_EXT = '.db'
const DEFAULT_RETENTION = 14
const MIN_RETENTION = 3

function getBackupDir(): string {
  return path.join(app.getPath('userData'), BACKUP_DIR_NAME)
}

function ensureBackupDir(): string {
  const dir = getBackupDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** List existing backups, newest first. */
export function listBackups(): { name: string; path: string; date: string; sizeBytes: number }[] {
  const dir = getBackupDir()
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
    .map(f => {
      const fullPath = path.join(dir, f)
      const stats = fs.statSync(fullPath)
      // Extract date from filename: nexus-YYYY-MM-DD.db or nexus-YYYY-MM-DD-HHmmss.db
      const dateMatch = f.match(/nexus-(\d{4}-\d{2}-\d{2})/)
      return {
        name: f,
        path: fullPath,
        date: dateMatch ? dateMatch[1] : stats.mtime.toISOString().split('T')[0],
        sizeBytes: stats.size,
      }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Prune old backups beyond the retention limit. */
function pruneBackups(retention: number): void {
  const keep = Math.max(retention, MIN_RETENTION)
  const backups = listBackups()
  if (backups.length <= keep) return

  for (const old of backups.slice(keep)) {
    try {
      fs.unlinkSync(old.path)
    } catch {
      // Ignore — file may be locked or already deleted
    }
  }
}

/**
 * Create a backup using the SQLite backup API (safe under WAL).
 * Returns the backup file path, or null on failure.
 */
export function createBackup(db: Database.Database, label?: string): string | null {
  const dir = ensureBackupDir()
  const date = new Date().toISOString().split('T')[0]
  const suffix = label ? `-${label}` : ''
  const fileName = `${BACKUP_PREFIX}${date}${suffix}${BACKUP_EXT}`
  const destPath = path.join(dir, fileName)

  try {
    db.backup(destPath)
    return destPath
  } catch (err) {
    console.error('[Backup] Failed to create backup:', err)
    return null
  }
}

/**
 * Automatic backup on app start — at most once per day.
 * Prunes old backups according to retention setting.
 */
export function autoBackupOnStart(db: Database.Database): void {
  const today = new Date().toISOString().split('T')[0]
  const existing = listBackups()
  const alreadyBackedUpToday = existing.some(b => b.date === today)

  if (!alreadyBackedUpToday) {
    const result = createBackup(db)
    if (result) {
      console.log('[Backup] Auto backup created:', result)
    }
  }

  // Read retention setting (default 14)
  const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_retention_days'").get() as { value: string } | undefined
  const retention = row ? Math.max(Number(row.value) || DEFAULT_RETENTION, MIN_RETENTION) : DEFAULT_RETENTION
  pruneBackups(retention)
}

/**
 * Restore from a backup file. Replaces the current database.
 * IMPORTANT: The app should be restarted after restore.
 * Returns { success: true } or { success: false, error: string }.
 */
export function restoreFromBackup(
  currentDb: Database.Database,
  backupPath: string
): { success: boolean; error?: string } {
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found.' }
  }

  // Validate it's a SQLite database
  try {
    const header = Buffer.alloc(16)
    const fd = fs.openSync(backupPath, 'r')
    fs.readSync(fd, header, 0, 16, 0)
    fs.closeSync(fd)
    if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
      return { success: false, error: 'Not a valid database file.' }
    }
  } catch {
    return { success: false, error: 'Could not read backup file.' }
  }

  // Create a safety backup of the current DB before restoring
  createBackup(currentDb, 'pre-restore')

  // Close current DB, overwrite with backup, reopen
  const dbPath = currentDb.name
  try {
    currentDb.close()
    fs.copyFileSync(backupPath, dbPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: `Restore failed: ${(err as Error).message}` }
  }
}

/**
 * Pre-migration safety backup. Call before running schema migrations.
 */
export function preMigrationBackup(db: Database.Database): void {
  const result = createBackup(db, 'pre-migration')
  if (result) {
    console.log('[Backup] Pre-migration backup created:', result)
  }
}

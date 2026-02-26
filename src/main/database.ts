import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'nexus.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema()
    migrateSchema()
  }
  return db
}

function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      company TEXT DEFAULT '',
      job_title TEXT DEFAULT '',
      linkedin_url TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      how_we_met TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#8B5CF6'
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (contact_id, tag_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#6366F1'
    );

    CREATE TABLE IF NOT EXISTS contact_groups (
      contact_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      PRIMARY KEY (contact_id, group_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'coffee', 'event', 'other')),
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      repeat TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `)
}

function migrateSchema(): void {
  // Migrate interactions table: expand type CHECK constraint
  const interactionCols = db.prepare("PRAGMA table_info(interactions)").all() as { name: string; type: string }[]
  // Check if table uses old constraint by trying to detect via column info
  // Safest approach: recreate if the table exists (idempotent via IF NOT EXISTS already handled above for new DBs)
  const hasInteractions = interactionCols.length > 0
  if (hasInteractions) {
    // Try inserting a test type — if it fails, we need to migrate
    try {
      const testStmt = db.prepare("INSERT INTO interactions (contact_id, type, description, date) VALUES (0, 'coffee', '', '2000-01-01')")
      testStmt.run()
      // Clean up test row
      db.prepare("DELETE FROM interactions WHERE contact_id = 0 AND date = '2000-01-01'").run()
    } catch {
      // Old constraint — recreate table
      db.exec(`
        ALTER TABLE interactions RENAME TO interactions_old;
        CREATE TABLE interactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'coffee', 'event', 'other')),
          description TEXT DEFAULT '',
          date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        );
        INSERT INTO interactions (id, contact_id, type, description, date, created_at)
          SELECT id, contact_id, type, description, date, created_at FROM interactions_old;
        DROP TABLE interactions_old;
      `)
    }
  }

  // Migrate groups table: add color column if missing
  const groupCols = db.prepare("PRAGMA table_info(groups)").all() as { name: string }[]
  const hasColor = groupCols.some(c => c.name === 'color')
  if (!hasColor && groupCols.length > 0) {
    db.exec("ALTER TABLE groups ADD COLUMN color TEXT DEFAULT '#6366F1'")
  }

  // Migrate reminders table: add repeat column if missing
  const reminderCols = db.prepare("PRAGMA table_info(reminders)").all() as { name: string }[]
  const hasRepeat = reminderCols.some(c => c.name === 'repeat')
  if (!hasRepeat && reminderCols.length > 0) {
    db.exec("ALTER TABLE reminders ADD COLUMN repeat TEXT NOT NULL DEFAULT 'none'")
  }
}

export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'nexus.db')
}

export function closeDatabase(): void {
  if (db) {
    db.close()
  }
}

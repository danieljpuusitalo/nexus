import Database from 'better-sqlite3'
import { app, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { initSecretStore, migrateSecretsFromSettings } from './secure-store'
import { autoBackupOnStart, preMigrationBackup } from './backup'

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) {
    const dbFile = app.isPackaged ? 'nexus.db' : 'nexus-dev.db'
    const dbPath = path.join(app.getPath('userData'), dbFile)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema()
    preMigrationBackup(db)
    migrateSchema()
    initSecretStore(db)
    migrateSecretsFromSettings(db)
    autoBackupOnStart(db)
    if (!app.isPackaged) seedDevData()
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

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Contact enhancements: birthday, keep_in_touch_days
  const contactCols = db.prepare("PRAGMA table_info(contacts)").all() as { name: string }[]
  if (!contactCols.some(c => c.name === 'birthday')) {
    db.exec("ALTER TABLE contacts ADD COLUMN birthday TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'keep_in_touch_days')) {
    db.exec("ALTER TABLE contacts ADD COLUMN keep_in_touch_days INTEGER DEFAULT 0")
  }

  // Custom fields table
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      field_value TEXT DEFAULT '',
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `)

  // Important dates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS important_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `)

  // Location field on contacts
  if (!contactCols.some(c => c.name === 'location')) {
    db.exec("ALTER TABLE contacts ADD COLUMN location TEXT DEFAULT ''")
  }

  // Social & expanded contact fields
  if (!contactCols.some(c => c.name === 'website')) {
    db.exec("ALTER TABLE contacts ADD COLUMN website TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'twitter_url')) {
    db.exec("ALTER TABLE contacts ADD COLUMN twitter_url TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'facebook_url')) {
    db.exec("ALTER TABLE contacts ADD COLUMN facebook_url TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'instagram_url')) {
    db.exec("ALTER TABLE contacts ADD COLUMN instagram_url TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'address')) {
    db.exec("ALTER TABLE contacts ADD COLUMN address TEXT DEFAULT ''")
  }
  if (!contactCols.some(c => c.name === 'education')) {
    db.exec("ALTER TABLE contacts ADD COLUMN education TEXT DEFAULT ''")
  }

  // Related contacts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id_1 INTEGER NOT NULL,
      contact_id_2 INTEGER NOT NULL,
      relationship_type TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id_1) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id_2) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `)

  // Expand interactions CHECK constraint to include calendar and job_change
  try {
    const testCalendar = db.prepare("INSERT INTO interactions (contact_id, type, description, date) VALUES (0, 'calendar', '', '2000-01-01')")
    testCalendar.run()
    db.prepare("DELETE FROM interactions WHERE contact_id = 0 AND date = '2000-01-01'").run()
  } catch {
    db.exec(`
      ALTER TABLE interactions RENAME TO interactions_old2;
      CREATE TABLE interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'coffee', 'event', 'calendar', 'job_change', 'other')),
        description TEXT DEFAULT '',
        date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
      INSERT INTO interactions (id, contact_id, type, description, date, created_at)
        SELECT id, contact_id, type, description, date, created_at FROM interactions_old2;
      DROP TABLE interactions_old2;
    `)
  }

  // --- Sync tracking columns ---
  // Add cloud_id (UUID), synced_at, and deleted_at to all syncable tables
  const syncTables = [
    { table: 'contacts', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'tags', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'groups', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'interactions', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'reminders', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'custom_fields', cols: ['cloud_id', 'synced_at', 'deleted_at'] },
    { table: 'important_dates', cols: ['cloud_id', 'synced_at', 'deleted_at'] }
  ]

  for (const { table, cols } of syncTables) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    const existingNames = new Set(existing.map(c => c.name))
    for (const col of cols) {
      if (!existingNames.has(col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT DEFAULT NULL`)
      }
    }
  }

  // Junction tables need cloud_id for sync tracking (they lack an integer PK in some cases)
  const junctionTables = ['contact_tags', 'contact_groups']
  for (const table of junctionTables) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    const existingNames = new Set(existing.map(c => c.name))
    if (!existingNames.has('cloud_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN cloud_id TEXT DEFAULT NULL`)
    }
    if (!existingNames.has('synced_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN synced_at TEXT DEFAULT NULL`)
    }
  }

  // Sync log table — tracks last successful sync timestamp per table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      table_name TEXT PRIMARY KEY,
      last_pushed_at TEXT DEFAULT NULL,
      last_pulled_at TEXT DEFAULT NULL
    );
  `)

  // Saved views table
  db.exec(`
    CREATE TABLE IF NOT EXISTS views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      filter_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Onboarding progress table
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      step_id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Favorites table
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL CHECK(item_type IN ('contact', 'group', 'view')),
      item_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_type, item_id)
    );
  `)

  // Interaction attachments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS interaction_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      interaction_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (interaction_id) REFERENCES interactions(id) ON DELETE CASCADE
    );
  `)

  // Copilot conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS copilot_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New Chat',
      messages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // --- Performance Indexes ---
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON contacts(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_interactions_contact_id ON interactions(contact_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date);
    CREATE INDEX IF NOT EXISTS idx_reminders_contact_id ON reminders(contact_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
    CREATE INDEX IF NOT EXISTS idx_custom_fields_contact_id ON custom_fields(contact_id);
    CREATE INDEX IF NOT EXISTS idx_important_dates_contact_id ON important_dates(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id ON contact_tags(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON contact_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_contact_groups_contact_id ON contact_groups(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_groups_group_id ON contact_groups(group_id);
    CREATE INDEX IF NOT EXISTS idx_contact_relationships_id1 ON contact_relationships(contact_id_1);
    CREATE INDEX IF NOT EXISTS idx_contact_relationships_id2 ON contact_relationships(contact_id_2);
    CREATE INDEX IF NOT EXISTS idx_interaction_attachments_interaction_id ON interaction_attachments(interaction_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_cloud_id ON contacts(cloud_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_synced_at ON contacts(synced_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_keep_in_touch_days ON contacts(keep_in_touch_days);
    CREATE INDEX IF NOT EXISTS idx_favorites_item_type ON favorites(item_type);
  `)
}

// ---- Dev-only seed data ----
function seedDevData(): void {
  const count = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE deleted_at IS NULL').get() as { n: number }
  if (count.n > 0) return // already seeded

  const contacts = [
    { first_name: 'Luisa', last_name: 'Fernández', email: 'luisa.f@ejemplo.es', phone: '+34 612 345 678', company: 'Telefónica', job_title: 'VP of Product', location: 'Madrid, Spain', birthday: '1988-04-12', how_we_met: 'Web Summit 2024' },
    { first_name: 'Henrik', last_name: 'Andersen', email: 'henrik@andersen.dk', phone: '+45 20 12 34 56', company: 'Maersk', job_title: 'Supply Chain Director', location: 'Copenhagen, Denmark', birthday: '1982-11-03', how_we_met: 'LinkedIn outreach' },
    { first_name: 'Sophie', last_name: 'Dubois', email: 'sophie.dubois@mail.fr', phone: '+33 6 12 34 56 78', company: 'LVMH', job_title: 'Brand Strategist', location: 'Paris, France', birthday: '1991-07-22', how_we_met: 'Conference in Lyon' },
    { first_name: 'Marco', last_name: 'Bellini', email: 'marco.bellini@outlook.it', phone: '+39 320 123 4567', company: 'Ferrari', job_title: 'Lead Engineer', location: 'Milan, Italy', birthday: '1985-02-14', how_we_met: 'Mutual friend intro' },
    { first_name: 'Anna', last_name: 'Kowalski', email: 'anna.k@startup.pl', phone: '+48 501 234 567', company: 'Docplanner', job_title: 'CTO', location: 'Warsaw, Poland', birthday: '1990-09-30', how_we_met: 'Hack the North' },
    { first_name: 'Lars', last_name: 'Johansson', email: 'lars.j@spotify.se', phone: '+46 70 123 45 67', company: 'Spotify', job_title: 'Staff Engineer', location: 'Stockholm, Sweden', birthday: '1987-06-18', how_we_met: 'Meetup in Berlin' },
    { first_name: 'Elena', last_name: 'Popov', email: 'elena.popov@yandex.bg', phone: '+359 88 123 4567', company: 'Payhawk', job_title: 'Head of Design', location: 'Sofia, Bulgaria', birthday: '1993-12-05', how_we_met: 'Dribbble DM' },
    { first_name: 'Dieter', last_name: 'Müller', email: 'dieter.m@siemens.de', phone: '+49 170 1234567', company: 'Siemens', job_title: 'Product Manager', location: 'Munich, Germany', birthday: '1984-03-27', how_we_met: 'SaaStr conference' },
    { first_name: 'Ines', last_name: 'Rodrigues', email: 'ines.r@outsystems.pt', phone: '+351 912 345 678', company: 'OutSystems', job_title: 'Solutions Architect', location: 'Lisbon, Portugal', birthday: '1989-08-09', how_we_met: 'GitHub collab' },
    { first_name: 'Bram', last_name: 'de Vries', email: 'bram@booking.nl', phone: '+31 6 12345678', company: 'Booking.com', job_title: 'Data Scientist', location: 'Amsterdam, Netherlands', birthday: '1992-01-15', how_we_met: 'PyData Amsterdam' },
    { first_name: 'Katarina', last_name: 'Novak', email: 'katarina.n@rimac.hr', phone: '+385 91 234 5678', company: 'Rimac', job_title: 'Battery Engineer', location: 'Zagreb, Croatia', birthday: '1994-05-20', how_we_met: 'EV conference' },
    { first_name: 'Tomáš', last_name: 'Dvořák', email: 'tomas.d@avast.cz', phone: '+420 601 234 567', company: 'Avast', job_title: 'Security Researcher', location: 'Prague, Czech Republic', birthday: '1986-10-11', how_we_met: 'DEF CON' },
    { first_name: 'Fiona', last_name: 'O\'Brien', email: 'fiona.ob@stripe.ie', phone: '+353 85 123 4567', company: 'Stripe', job_title: 'Engineering Manager', location: 'Dublin, Ireland', birthday: '1988-07-04', how_we_met: 'Stripe Sessions' },
    { first_name: 'Nikos', last_name: 'Papadopoulos', email: 'nikos.p@workable.gr', phone: '+30 694 123 4567', company: 'Workable', job_title: 'Founder & CEO', location: 'Athens, Greece', birthday: '1980-11-28', how_we_met: 'Startup Grind' },
    { first_name: 'Astrid', last_name: 'Berg', email: 'astrid.berg@equinor.no', phone: '+47 412 34 567', company: 'Equinor', job_title: 'Sustainability Lead', location: 'Oslo, Norway', birthday: '1991-03-16', how_we_met: 'Climate tech summit' },
    { first_name: 'Mihai', last_name: 'Ionescu', email: 'mihai.i@uipath.ro', phone: '+40 721 234 567', company: 'UiPath', job_title: 'VP Engineering', location: 'Bucharest, Romania', birthday: '1983-09-01', how_we_met: 'RPA World' },
    { first_name: 'Léa', last_name: 'Martin', email: 'lea.m@proton.ch', phone: '+41 78 123 45 67', company: 'Proton', job_title: 'Privacy Advocate', location: 'Geneva, Switzerland', birthday: '1990-12-24', how_we_met: 'Privacy conference Zurich' },
    { first_name: 'Viktor', last_name: 'Horváth', email: 'viktor.h@prezi.hu', phone: '+36 30 123 4567', company: 'Prezi', job_title: 'Creative Director', location: 'Budapest, Hungary', birthday: '1987-04-08', how_we_met: 'Design meetup' },
    { first_name: 'Isabella', last_name: 'Eriksson', email: 'isabella.e@klarna.fi', phone: '+358 40 1234567', company: 'Klarna', job_title: 'Risk Analyst', location: 'Helsinki, Finland', birthday: '1992-06-30', how_we_met: 'Fintech conference' },
    { first_name: 'Jan', last_name: 'Vermeer', email: 'jan.v@collibra.be', phone: '+32 470 12 34 56', company: 'Collibra', job_title: 'Data Governance Lead', location: 'Brussels, Belgium', birthday: '1985-08-19', how_we_met: 'Data Summit Brussels' },
  ]

  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, location, birthday, how_we_met)
    VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @location, @birthday, @how_we_met)
  `)

  // Tags
  const tagData = [
    { name: 'Engineering', color: '#3B82F6' },
    { name: 'Design', color: '#EC4899' },
    { name: 'Leadership', color: '#F59E0B' },
    { name: 'Fintech', color: '#10B981' },
    { name: 'Startup', color: '#8B5CF6' },
  ]
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)')
  for (const t of tagData) insertTag.run(t.name, t.color)
  const tags = db.prepare('SELECT id, name FROM tags').all() as { id: number; name: string }[]
  const tagMap = new Map(tags.map(t => [t.name, t.id]))

  // Groups
  const groupData = [
    { name: 'Tech Network', description: 'Engineering & product contacts', color: '#3B82F6' },
    { name: 'Conference Buddies', description: 'People met at events', color: '#F59E0B' },
    { name: 'Close Circle', description: 'Inner network', color: '#8B5CF6' },
  ]
  const insertGroup = db.prepare('INSERT OR IGNORE INTO groups (name, description, color) VALUES (?, ?, ?)')
  for (const g of groupData) insertGroup.run(g.name, g.description, g.color)
  const groups = db.prepare('SELECT id, name FROM groups').all() as { id: number; name: string }[]
  const groupMap = new Map(groups.map(g => [g.name, g.id]))

  // Tag & group assignments per contact index
  const contactTags: Record<number, string[]> = {
    0: ['Leadership'], 1: ['Leadership'], 2: ['Design'], 3: ['Engineering'],
    4: ['Engineering', 'Startup'], 5: ['Engineering'], 6: ['Design'],
    7: ['Leadership'], 8: ['Engineering', 'Startup'], 9: ['Engineering'],
    10: ['Engineering'], 11: ['Engineering'], 12: ['Engineering', 'Leadership'],
    13: ['Startup', 'Leadership'], 14: ['Leadership'], 15: ['Engineering', 'Startup'],
    16: ['Leadership'], 17: ['Design'], 18: ['Fintech'], 19: ['Fintech'],
  }
  const contactGroups: Record<number, string[]> = {
    0: ['Conference Buddies'], 2: ['Conference Buddies'], 4: ['Tech Network'],
    5: ['Tech Network', 'Conference Buddies'], 7: ['Conference Buddies'],
    8: ['Tech Network'], 9: ['Tech Network', 'Conference Buddies'],
    11: ['Conference Buddies'], 12: ['Close Circle'], 13: ['Close Circle', 'Conference Buddies'],
    14: ['Conference Buddies'], 17: ['Conference Buddies'], 19: ['Conference Buddies'],
  }

  const insertContactTag = db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)')
  const insertContactGroup = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)')

  // Interactions
  const interactionTypes = ['email', 'call', 'meeting', 'coffee', 'note', 'event'] as const
  const interactionDescs: Record<string, string[]> = {
    email: ['Followed up on proposal', 'Shared article about industry trends', 'Intro email'],
    call: ['Quick catch-up call', 'Discussed partnership opportunity', 'Quarterly check-in'],
    meeting: ['Lunch meeting downtown', 'Strategy session', 'Office visit'],
    coffee: ['Coffee near their office', 'Grabbed espresso after event', 'Morning catch-up'],
    note: ['Great energy — want to stay in touch', 'Mentioned looking for new role', 'Interested in collaboration'],
    event: ['Ran into them at meetup', 'Same panel at conference', 'Workshop together'],
  }
  const insertInteraction = db.prepare('INSERT INTO interactions (contact_id, type, description, date) VALUES (?, ?, ?, ?)')

  const keepInTouchDays = [7, 14, 30, 60, 90]

  const insertAll = db.transaction(() => {
    const contactIds: number[] = []
    for (const c of contacts) {
      const result = insertContact.run(c)
      contactIds.push(result.lastInsertRowid as number)
    }

    for (let i = 0; i < contactIds.length; i++) {
      const cid = contactIds[i]

      // Tags
      for (const tagName of (contactTags[i] || [])) {
        const tid = tagMap.get(tagName)
        if (tid) insertContactTag.run(cid, tid)
      }

      // Groups
      for (const gName of (contactGroups[i] || [])) {
        const gid = groupMap.get(gName)
        if (gid) insertContactGroup.run(cid, gid)
      }

      // Keep-in-touch for ~half of contacts
      if (i % 2 === 0) {
        const days = keepInTouchDays[i % keepInTouchDays.length]
        db.prepare('UPDATE contacts SET keep_in_touch_days = ? WHERE id = ?').run(days, cid)
      }

      // 1-3 interactions per contact, spread across recent months
      const numInteractions = 1 + (i % 3)
      for (let j = 0; j < numInteractions; j++) {
        const type = interactionTypes[(i + j) % interactionTypes.length]
        const descs = interactionDescs[type]
        const desc = descs[j % descs.length]
        const daysAgo = 3 + i * 7 + j * 15
        const date = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0]
        insertInteraction.run(cid, type, desc, date)
      }
    }

    // A few relationships
    if (contactIds.length >= 10) {
      const insertRel = db.prepare('INSERT INTO contact_relationships (contact_id_1, contact_id_2, relationship_type) VALUES (?, ?, ?)')
      insertRel.run(contactIds[3], contactIds[5], 'colleague')
      insertRel.run(contactIds[0], contactIds[7], 'met at conference')
      insertRel.run(contactIds[4], contactIds[8], 'co-founders')
      insertRel.run(contactIds[12], contactIds[13], 'friends')
      insertRel.run(contactIds[18], contactIds[19], 'same industry')
    }
  })

  insertAll()
  console.log('[Nexus] Dev seed data inserted: 20 contacts, tags, groups, interactions, relationships')

  // Download placeholder avatars in the background (non-blocking)
  downloadSeedAvatars()
}

async function downloadSeedAvatars(): Promise<void> {
  const photosDir = path.join(app.getPath('userData'), 'photos')
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true })

  const rows = db.prepare('SELECT id, first_name FROM contacts WHERE photo_url = \'\' OR photo_url IS NULL').all() as { id: number; first_name: string }[]
  const updatePhoto = db.prepare('UPDATE contacts SET photo_url = ? WHERE id = ?')

  // Genders for i.pravatar.cc — alternate male/female seeds for variety
  for (let i = 0; i < rows.length; i++) {
    const { id } = rows[i]
    const destPath = path.join(photosDir, `contact-${id}-seed.jpg`)

    // Skip if already downloaded (e.g. from a previous partial run)
    if (fs.existsSync(destPath)) {
      updatePhoto.run(destPath.replace(/\\/g, '/'), id)
      continue
    }

    try {
      // i.pravatar.cc gives unique faces per seed number, 150px is enough for thumbnails
      const resp = await net.fetch(`https://i.pravatar.cc/150?img=${(i % 70) + 1}`)
      if (!resp.ok) continue
      const buffer = Buffer.from(await resp.arrayBuffer())
      fs.writeFileSync(destPath, buffer)
      // Store with forward slashes so file:// URLs work on Windows
      updatePhoto.run(destPath.replace(/\\/g, '/'), id)
    } catch {
      // Non-critical — contacts will just show initials
    }
  }
  console.log('[Nexus] Dev avatar download complete')
}

export function getDatabasePath(): string {
  const dbFile = app.isPackaged ? 'nexus.db' : 'nexus-dev.db'
  return path.join(app.getPath('userData'), dbFile)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
  }
}

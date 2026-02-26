import { ipcMain, dialog, app } from 'electron'
import { getDatabase, getDatabasePath } from './database'
import fs from 'fs'
import path from 'path'

export function registerIpcHandlers(): void {
  const db = getDatabase()

  // --- Contacts ---
  ipcMain.handle('db:contacts:getAll', () => {
    return db.prepare('SELECT * FROM contacts ORDER BY first_name, last_name').all()
  })

  ipcMain.handle('db:contacts:getById', (_event, id: number) => {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)
  })

  ipcMain.handle('db:contacts:create', (_event, contact) => {
    const stmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, photo_url, notes, how_we_met)
      VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @photo_url, @notes, @how_we_met)
    `)
    const result = stmt.run(contact)
    return result.lastInsertRowid
  })

  ipcMain.handle('db:contacts:update', (_event, id: number, contact) => {
    const stmt = db.prepare(`
      UPDATE contacts
      SET first_name = @first_name, last_name = @last_name, email = @email, phone = @phone,
          company = @company, job_title = @job_title, linkedin_url = @linkedin_url,
          photo_url = @photo_url, notes = @notes, how_we_met = @how_we_met,
          updated_at = datetime('now')
      WHERE id = @id
    `)
    stmt.run({ ...contact, id })
  })

  ipcMain.handle('db:contacts:delete', (_event, id: number) => {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
  })

  ipcMain.handle('db:contacts:count', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number }
    return row.count
  })

  ipcMain.handle('db:contacts:getAllWithTags', () => {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    const tagStmt = db.prepare(`
      SELECT t.* FROM tags t
      JOIN contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
      ORDER BY t.name
    `)
    const groupStmt = db.prepare(`
      SELECT g.* FROM groups g
      JOIN contact_groups cg ON cg.group_id = g.id
      WHERE cg.contact_id = ?
      ORDER BY g.name
    `)
    return contacts.map(c => ({
      ...c,
      tags: tagStmt.all(c.id),
      groups: groupStmt.all(c.id)
    }))
  })

  ipcMain.handle('db:contacts:countThisMonth', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE created_at >= date('now', 'start of month')").get() as { count: number }
    return row.count
  })

  ipcMain.handle('db:contacts:getRecent', (_event, limit: number) => {
    return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT ?').all(limit || 5)
  })

  // --- Tags ---
  ipcMain.handle('db:tags:getAll', () => {
    return db.prepare('SELECT * FROM tags ORDER BY name').all()
  })

  ipcMain.handle('db:tags:create', (_event, tag) => {
    const stmt = db.prepare('INSERT INTO tags (name, color) VALUES (@name, @color)')
    const result = stmt.run(tag)
    return result.lastInsertRowid
  })

  ipcMain.handle('db:tags:update', (_event, id: number, tag: { name: string; color: string }) => {
    db.prepare('UPDATE tags SET name = @name, color = @color WHERE id = @id').run({ ...tag, id })
  })

  ipcMain.handle('db:tags:delete', (_event, id: number) => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  })

  ipcMain.handle('db:tags:getAllWithCounts', () => {
    return db.prepare(`
      SELECT t.*, COUNT(ct.contact_id) as contact_count
      FROM tags t
      LEFT JOIN contact_tags ct ON ct.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `).all()
  })

  ipcMain.handle('db:tags:getContacts', (_event, tagId: number) => {
    return db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_tags ct ON ct.contact_id = c.id
      WHERE ct.tag_id = ?
      ORDER BY c.first_name, c.last_name
    `).all(tagId)
  })

  // --- Contact Tags ---
  ipcMain.handle('db:contactTags:add', (_event, contactId: number, tagId: number) => {
    db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(contactId, tagId)
  })

  ipcMain.handle('db:contactTags:remove', (_event, contactId: number, tagId: number) => {
    db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?').run(contactId, tagId)
  })

  ipcMain.handle('db:contactTags:getForContact', (_event, contactId: number) => {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
      ORDER BY t.name
    `).all(contactId)
  })

  // --- Groups ---
  ipcMain.handle('db:groups:getAll', () => {
    return db.prepare('SELECT * FROM groups ORDER BY name').all()
  })

  ipcMain.handle('db:groups:getAllWithCounts', () => {
    return db.prepare(`
      SELECT g.*, COUNT(cg.contact_id) as contact_count
      FROM groups g
      LEFT JOIN contact_groups cg ON cg.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `).all()
  })

  ipcMain.handle('db:groups:create', (_event, group) => {
    const stmt = db.prepare('INSERT INTO groups (name, description, color) VALUES (@name, @description, @color)')
    const result = stmt.run({ color: '#6366F1', ...group })
    return result.lastInsertRowid
  })

  ipcMain.handle('db:groups:update', (_event, id: number, group) => {
    db.prepare('UPDATE groups SET name = @name, description = @description, color = @color WHERE id = @id').run({ ...group, id })
  })

  ipcMain.handle('db:groups:delete', (_event, id: number) => {
    db.prepare('DELETE FROM groups WHERE id = ?').run(id)
  })

  ipcMain.handle('db:groups:getContacts', (_event, groupId: number) => {
    return db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_groups cg ON cg.contact_id = c.id
      WHERE cg.group_id = ?
      ORDER BY c.first_name, c.last_name
    `).all(groupId)
  })

  // --- Contact Groups ---
  ipcMain.handle('db:contactGroups:add', (_event, contactId: number, groupId: number) => {
    db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)').run(contactId, groupId)
  })

  ipcMain.handle('db:contactGroups:remove', (_event, contactId: number, groupId: number) => {
    db.prepare('DELETE FROM contact_groups WHERE contact_id = ? AND group_id = ?').run(contactId, groupId)
  })

  ipcMain.handle('db:contactGroups:getForContact', (_event, contactId: number) => {
    return db.prepare(`
      SELECT g.* FROM groups g
      JOIN contact_groups cg ON cg.group_id = g.id
      WHERE cg.contact_id = ?
      ORDER BY g.name
    `).all(contactId)
  })

  // --- Interactions ---
  ipcMain.handle('db:interactions:getAll', () => {
    return db.prepare(`
      SELECT i.*, c.first_name, c.last_name
      FROM interactions i
      JOIN contacts c ON c.id = i.contact_id
      ORDER BY i.date DESC
    `).all()
  })

  ipcMain.handle('db:interactions:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC').all(contactId)
  })

  ipcMain.handle('db:interactions:create', (_event, interaction) => {
    const stmt = db.prepare(`
      INSERT INTO interactions (contact_id, type, description, date)
      VALUES (@contact_id, @type, @description, @date)
    `)
    const result = stmt.run(interaction)
    return result.lastInsertRowid
  })

  ipcMain.handle('db:interactions:delete', (_event, id: number) => {
    db.prepare('DELETE FROM interactions WHERE id = ?').run(id)
  })

  ipcMain.handle('db:interactions:getLastForContacts', () => {
    return db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all()
  })

  ipcMain.handle('db:interactions:countThisWeek', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM interactions WHERE date >= date('now', 'weekday 0', '-6 days')").get() as { count: number }
    return row.count
  })

  ipcMain.handle('db:interactions:getRecentContacted', (_event, limit: number) => {
    return db.prepare(`
      SELECT c.*, MAX(i.date) as last_interaction_date
      FROM interactions i
      JOIN contacts c ON c.id = i.contact_id
      GROUP BY c.id
      ORDER BY last_interaction_date DESC
      LIMIT ?
    `).all(limit || 5)
  })

  // --- Reminders ---
  ipcMain.handle('db:reminders:getAll', () => {
    return db.prepare(`
      SELECT r.*, c.first_name, c.last_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      ORDER BY r.due_date ASC
    `).all()
  })

  ipcMain.handle('db:reminders:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM reminders WHERE contact_id = ? ORDER BY due_date ASC').all(contactId)
  })

  ipcMain.handle('db:reminders:create', (_event, reminder) => {
    const stmt = db.prepare(`
      INSERT INTO reminders (contact_id, message, due_date, repeat)
      VALUES (@contact_id, @message, @due_date, @repeat)
    `)
    const result = stmt.run({ repeat: 'none', ...reminder })
    return result.lastInsertRowid
  })

  ipcMain.handle('db:reminders:toggleComplete', (_event, id: number) => {
    db.prepare('UPDATE reminders SET completed = NOT completed WHERE id = ?').run(id)
  })

  ipcMain.handle('db:reminders:delete', (_event, id: number) => {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
  })

  ipcMain.handle('db:reminders:countPending', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE completed = 0').get() as { count: number }
    return row.count
  })

  ipcMain.handle('db:reminders:getOverdueCount', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM reminders WHERE completed = 0 AND due_date < date('now')").get() as { count: number }
    return row.count
  })

  ipcMain.handle('db:reminders:getDueToday', () => {
    return db.prepare(`
      SELECT r.*, c.first_name, c.last_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      WHERE r.completed = 0 AND r.due_date = date('now')
      ORDER BY r.created_at ASC
    `).all()
  })

  // --- Data / Settings ---
  ipcMain.handle('db:stats', () => {
    const contacts = (db.prepare('SELECT COUNT(*) as c FROM contacts').get() as { c: number }).c
    const tags = (db.prepare('SELECT COUNT(*) as c FROM tags').get() as { c: number }).c
    const groups = (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c
    const interactions = (db.prepare('SELECT COUNT(*) as c FROM interactions').get() as { c: number }).c
    const reminders = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as { c: number }).c
    return { contacts, tags, groups, interactions, reminders }
  })

  ipcMain.handle('db:export:csv', async () => {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    if (contacts.length === 0) return { success: false, message: 'No contacts to export' }

    const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'created_at']
    const csvRows = [headers.join(',')]
    for (const c of contacts) {
      const row = headers.map(h => {
        const val = String(c[h] || '').replace(/"/g, '""')
        return `"${val}"`
      })
      csvRows.push(row.join(','))
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Contacts',
      defaultPath: 'nexus-contacts.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }
    fs.writeFileSync(result.filePath, csvRows.join('\n'), 'utf8')
    return { success: true, message: `Exported ${contacts.length} contacts` }
  })

  ipcMain.handle('db:export:filteredCsv', async (_event, contactIds: number[]) => {
    if (!contactIds.length) return { success: false, message: 'No contacts to export' }
    const placeholders = contactIds.map(() => '?').join(',')
    const contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders}) ORDER BY first_name, last_name`).all(...contactIds) as Record<string, unknown>[]

    const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'created_at']
    const csvRows = [headers.join(',')]
    for (const c of contacts) {
      const row = headers.map(h => {
        const val = String(c[h] || '').replace(/"/g, '""')
        return `"${val}"`
      })
      csvRows.push(row.join(','))
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Filtered Contacts',
      defaultPath: 'nexus-contacts-filtered.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }
    fs.writeFileSync(result.filePath, csvRows.join('\n'), 'utf8')
    return { success: true, message: `Exported ${contacts.length} contacts` }
  })

  ipcMain.handle('db:import:selectCsv', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    const content = fs.readFileSync(result.filePaths[0], 'utf8')
    return content
  })

  ipcMain.handle('db:import:execute', (_event, rows: Record<string, string>[], mode: string) => {
    let imported = 0
    let skipped = 0
    const insertStmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, notes, how_we_met)
      VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @notes, @how_we_met)
    `)
    const findByEmail = db.prepare('SELECT id FROM contacts WHERE email = ? AND email != ""')
    const updateStmt = db.prepare(`
      UPDATE contacts SET first_name = @first_name, last_name = @last_name, phone = @phone,
        company = @company, job_title = @job_title, linkedin_url = @linkedin_url,
        notes = @notes, how_we_met = @how_we_met, updated_at = datetime('now')
      WHERE id = @id
    `)

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const contact = {
          first_name: row.first_name || '',
          last_name: row.last_name || '',
          email: row.email || '',
          phone: row.phone || '',
          company: row.company || '',
          job_title: row.job_title || '',
          linkedin_url: row.linkedin_url || '',
          notes: row.notes || '',
          how_we_met: row.how_we_met || ''
        }
        if (!contact.first_name) { skipped++; continue }

        const existing = contact.email ? findByEmail.get(contact.email) as { id: number } | undefined : undefined
        if (existing) {
          if (mode === 'update') {
            updateStmt.run({ ...contact, id: existing.id })
            imported++
          } else {
            skipped++
          }
        } else {
          insertStmt.run(contact)
          imported++
        }
      }
    })
    transaction()
    return { imported, skipped }
  })

  ipcMain.handle('db:backup', async () => {
    const dbPath = getDatabasePath()
    const result = await dialog.showSaveDialog({
      title: 'Backup Database',
      defaultPath: `nexus-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    fs.copyFileSync(dbPath, result.filePath)
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('db:resetDatabase', () => {
    // Drop all data tables and reinitialize
    db.exec(`
      DELETE FROM contact_tags;
      DELETE FROM contact_groups;
      DELETE FROM interactions;
      DELETE FROM reminders;
      DELETE FROM tags;
      DELETE FROM groups;
      DELETE FROM contacts;
    `)
    return { success: true }
  })
}

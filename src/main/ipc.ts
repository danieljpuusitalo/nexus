import { ipcMain, dialog, app, BrowserWindow, shell } from 'electron'
import { getDatabase, getDatabasePath } from './database'
import { getSecret as getSecretValue, setSecret as setSecretValue, deleteSecret as deleteSecretValue } from './secure-store'
import { safeOpenExternal } from './url-validator'
import { createBackup as backupCreateBackup, listBackups as backupListBackups, restoreFromBackup as backupRestoreFromBackup } from './backup'
import {
  startGoogleAuth,
  disconnectGoogle,
  getGoogleStatus,
  getValidAccessToken,
} from './google-auth'
import {
  startMicrosoftAuth,
  disconnectMicrosoft,
  getMicrosoftStatus,
  getValidMicrosoftAccessToken,
  fetchCalendarEvents as fetchMsCalendarEvents,
  fetchRecentEmails as fetchMsEmails,
} from './microsoft-auth'
import {
  getAutoSyncStatus as getGoogleAutoSyncStatus,
  enableAutoSync as enableGoogleAutoSync,
  disableAutoSync as disableGoogleAutoSync,
  runIncrementalSync as runGoogleSync,
} from './google-contacts-sync'
import {
  importMicrosoftContacts,
  getAutoSyncStatus as getMsAutoSyncStatus,
  enableAutoSync as enableMsAutoSync,
  disableAutoSync as disableMsAutoSync,
} from './microsoft-contacts-sync'
import { normaliseContact } from './contact-normaliser'
import fs from 'fs'
import path from 'path'

// Safe IPC handler wrapper — catches errors, validates sender
function safeHandle(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...rest) => {
    // Sender check: only accept messages from our main window
    const mainWin = BrowserWindow.getAllWindows()[0]
    if (mainWin && event.sender.id !== mainWin.webContents.id) {
      console.warn(`[Security] Blocked IPC "${channel}" from unknown sender (id=${event.sender.id})`)
      return { error: 'unauthorized' }
    }
    try {
      return await handler(event, ...rest)
    } catch (err) {
      console.error(`[IPC ${channel}]`, err)
      return { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  })
}

export function registerIpcHandlers(): void {
  const db = getDatabase()

  // --- Contacts ---
  safeHandle('db:contacts:getAll', () => {
    return db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all()
  })

  safeHandle('db:contacts:getById', (_event, id: number) => {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)
  })

  safeHandle('db:contacts:create', (_event, contact) => {
    const stmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, photo_url, notes, how_we_met, birthday, keep_in_touch_days, location, website, twitter_url, facebook_url, instagram_url, address, education)
      VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @photo_url, @notes, @how_we_met, @birthday, @keep_in_touch_days, @location, @website, @twitter_url, @facebook_url, @instagram_url, @address, @education)
    `)
    const result = stmt.run({ birthday: '', keep_in_touch_days: 0, location: '', website: '', twitter_url: '', facebook_url: '', instagram_url: '', address: '', education: '', ...contact })
    return result.lastInsertRowid
  })

  safeHandle('db:contacts:update', (_event, id: number, contact) => {
    const stmt = db.prepare(`
      UPDATE contacts
      SET first_name = @first_name, last_name = @last_name, email = @email, phone = @phone,
          company = @company, job_title = @job_title, linkedin_url = @linkedin_url,
          photo_url = @photo_url, notes = @notes, how_we_met = @how_we_met,
          birthday = @birthday, keep_in_touch_days = @keep_in_touch_days,
          location = @location, website = @website, twitter_url = @twitter_url,
          facebook_url = @facebook_url, instagram_url = @instagram_url,
          address = @address, education = @education,
          updated_at = datetime('now')
      WHERE id = @id
    `)
    stmt.run({ birthday: '', keep_in_touch_days: 0, location: '', website: '', twitter_url: '', facebook_url: '', instagram_url: '', address: '', education: '', ...contact, id })
  })

  safeHandle('db:contacts:delete', (_event, id: number) => {
    // Soft-delete if synced to cloud (so deletion can be pushed), otherwise hard-delete
    const row = db.prepare('SELECT cloud_id FROM contacts WHERE id = ?').get(id) as { cloud_id: string | null } | undefined
    if (row?.cloud_id) {
      db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(id)
    } else {
      db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
    }
  })

  safeHandle('db:contacts:count', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE deleted_at IS NULL').get() as { count: number }
    return row.count
  })

  safeHandle('db:contacts:getAllWithTags', () => {
    // Single query with GROUP_CONCAT to avoid N+1
    const contacts = db.prepare(`
      SELECT c.*,
        COALESCE(t_agg.tags_json, '[]') as _tags_json,
        COALESCE(g_agg.groups_json, '[]') as _groups_json
      FROM contacts c
      LEFT JOIN (
        SELECT ct.contact_id,
          '[' || GROUP_CONCAT('{"id":' || t.id || ',"name":' || json_quote(t.name) || ',"color":' || json_quote(t.color) || '}') || ']' as tags_json
        FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id
        GROUP BY ct.contact_id
      ) t_agg ON t_agg.contact_id = c.id
      LEFT JOIN (
        SELECT cg.contact_id,
          '[' || GROUP_CONCAT('{"id":' || g.id || ',"name":' || json_quote(g.name) || ',"description":' || json_quote(g.description) || ',"color":' || json_quote(g.color) || '}') || ']' as groups_json
        FROM contact_groups cg JOIN groups g ON cg.group_id = g.id
        GROUP BY cg.contact_id
      ) g_agg ON g_agg.contact_id = c.id
      WHERE c.deleted_at IS NULL
      ORDER BY c.first_name, c.last_name
    `).all() as (Record<string, unknown> & { _tags_json: string; _groups_json: string })[]

    return contacts.map(c => {
      const { _tags_json, _groups_json, ...rest } = c
      return {
        ...rest,
        tags: JSON.parse(_tags_json),
        groups: JSON.parse(_groups_json)
      }
    })
  })

  safeHandle('db:contacts:countThisMonth', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE deleted_at IS NULL AND created_at >= date('now', 'start of month')").get() as { count: number }
    return row.count
  })

  // --- Duplicate Detection ---
  safeHandle('db:contacts:findDuplicates', () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    const duplicates: { contact1: Record<string, unknown>; contact2: Record<string, unknown>; matchType: string; score: number }[] = []

    // Levenshtein distance
    function levenshtein(a: string, b: string): number {
      const m = a.length, n = b.length
      const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i])
      for (let j = 1; j <= n; j++) d[0][j] = j
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
      return d[m][n]
    }

    const seenPairs = new Set<string>()
    function pairKey(a: number, b: number) { return a < b ? `${a}:${b}` : `${b}:${a}` }

    // Pass 1: exact email match (case-insensitive)
    const emailMap = new Map<string, Record<string, unknown>[]>()
    for (const c of contacts) {
      const email = (c.email as string || '').toLowerCase().trim()
      if (!email) continue
      if (!emailMap.has(email)) emailMap.set(email, [])
      emailMap.get(email)!.push(c)
    }
    for (const [, group] of emailMap) {
      if (group.length < 2) continue
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const key = pairKey(group[i].id as number, group[j].id as number)
          if (!seenPairs.has(key)) {
            seenPairs.add(key)
            duplicates.push({ contact1: group[i], contact2: group[j], matchType: 'email', score: 1.0 })
          }
        }
      }
    }

    // Pass 2: name similarity
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const key = pairKey(contacts[i].id as number, contacts[j].id as number)
        if (seenPairs.has(key)) continue
        const nameA = `${contacts[i].first_name} ${contacts[i].last_name}`.toLowerCase().trim()
        const nameB = `${contacts[j].first_name} ${contacts[j].last_name}`.toLowerCase().trim()
        if (!nameA || !nameB) continue
        const maxLen = Math.max(nameA.length, nameB.length)
        if (maxLen === 0) continue
        const dist = levenshtein(nameA, nameB)
        const normalized = dist / maxLen
        if (normalized < 0.2) {
          seenPairs.add(key)
          duplicates.push({ contact1: contacts[i], contact2: contacts[j], matchType: 'name', score: 1 - normalized })
        }
      }
    }

    return duplicates
  })

  // --- Merge Contacts ---
  safeHandle('db:contacts:merge', (_event, keepId: number, mergeId: number) => {
    const keep = db.prepare('SELECT * FROM contacts WHERE id = ?').get(keepId) as Record<string, unknown> | undefined
    const merge = db.prepare('SELECT * FROM contacts WHERE id = ?').get(mergeId) as Record<string, unknown> | undefined
    if (!keep || !merge) return { success: false }

    const mergeTransaction = db.transaction(() => {
      // Fill empty fields from merge contact
      const fillFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url',
        'photo_url', 'notes', 'how_we_met', 'birthday', 'location', 'website', 'twitter_url',
        'facebook_url', 'instagram_url', 'address', 'education']
      for (const field of fillFields) {
        if (!keep[field] && merge[field]) {
          db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(merge[field], keepId)
        }
      }

      // Reassign interactions, reminders, custom_fields, important_dates
      db.prepare('UPDATE interactions SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE reminders SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE custom_fields SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE important_dates SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId)

      // Reassign tags (INSERT OR IGNORE to avoid duplicates)
      const mergeTags = db.prepare('SELECT tag_id FROM contact_tags WHERE contact_id = ?').all(mergeId) as { tag_id: number }[]
      for (const { tag_id } of mergeTags) {
        db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(keepId, tag_id)
      }
      db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(mergeId)

      // Reassign groups
      const mergeGroups = db.prepare('SELECT group_id FROM contact_groups WHERE contact_id = ?').all(mergeId) as { group_id: number }[]
      for (const { group_id } of mergeGroups) {
        db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)').run(keepId, group_id)
      }
      db.prepare('DELETE FROM contact_groups WHERE contact_id = ?').run(mergeId)

      // Reassign relationships
      db.prepare('UPDATE contact_relationships SET contact_id_1 = ? WHERE contact_id_1 = ?').run(keepId, mergeId)
      db.prepare('UPDATE contact_relationships SET contact_id_2 = ? WHERE contact_id_2 = ?').run(keepId, mergeId)

      // Delete merge contact
      const mergeRow = db.prepare('SELECT cloud_id FROM contacts WHERE id = ?').get(mergeId) as { cloud_id: string | null } | undefined
      if (mergeRow?.cloud_id) {
        db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(mergeId)
      } else {
        db.prepare('DELETE FROM contacts WHERE id = ?').run(mergeId)
      }
    })

    try {
      mergeTransaction()
      return { success: true }
    } catch (err) {
      console.error('Merge failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // --- Tags ---
  safeHandle('db:tags:getAll', () => {
    return db.prepare('SELECT * FROM tags ORDER BY name').all()
  })

  safeHandle('db:tags:create', (_event, tag) => {
    const stmt = db.prepare('INSERT INTO tags (name, color) VALUES (@name, @color)')
    const result = stmt.run(tag)
    return result.lastInsertRowid
  })

  safeHandle('db:tags:update', (_event, id: number, tag: { name: string; color: string }) => {
    db.prepare('UPDATE tags SET name = @name, color = @color WHERE id = @id').run({ ...tag, id })
  })

  safeHandle('db:tags:delete', (_event, id: number) => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  })

  safeHandle('db:tags:getAllWithCounts', () => {
    return db.prepare(`
      SELECT t.*, COUNT(ct.contact_id) as contact_count
      FROM tags t
      LEFT JOIN contact_tags ct ON ct.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `).all()
  })

  safeHandle('db:tags:getContacts', (_event, tagId: number) => {
    return db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_tags ct ON ct.contact_id = c.id
      WHERE ct.tag_id = ?
      ORDER BY c.first_name, c.last_name
    `).all(tagId)
  })

  // --- Contact Tags ---
  safeHandle('db:contactTags:add', (_event, contactId: number, tagId: number) => {
    db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)').run(contactId, tagId)
  })

  safeHandle('db:contactTags:remove', (_event, contactId: number, tagId: number) => {
    db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?').run(contactId, tagId)
  })

  safeHandle('db:contactTags:getForContact', (_event, contactId: number) => {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
      ORDER BY t.name
    `).all(contactId)
  })

  // --- Groups ---
  safeHandle('db:groups:getAll', () => {
    return db.prepare('SELECT * FROM groups ORDER BY name').all()
  })

  safeHandle('db:groups:getAllWithCounts', () => {
    return db.prepare(`
      SELECT g.*, COUNT(cg.contact_id) as contact_count
      FROM groups g
      LEFT JOIN contact_groups cg ON cg.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `).all()
  })

  safeHandle('db:groups:create', (_event, group) => {
    const stmt = db.prepare('INSERT INTO groups (name, description, color) VALUES (@name, @description, @color)')
    const result = stmt.run({ color: '#6366F1', ...group })
    return result.lastInsertRowid
  })

  safeHandle('db:groups:update', (_event, id: number, group) => {
    db.prepare('UPDATE groups SET name = @name, description = @description, color = @color WHERE id = @id').run({ ...group, id })
  })

  safeHandle('db:groups:delete', (_event, id: number) => {
    db.prepare('DELETE FROM groups WHERE id = ?').run(id)
  })

  safeHandle('db:groups:getContacts', (_event, groupId: number) => {
    return db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_groups cg ON cg.contact_id = c.id
      WHERE cg.group_id = ?
      ORDER BY c.first_name, c.last_name
    `).all(groupId)
  })

  // --- Contact Groups ---
  safeHandle('db:contactGroups:add', (_event, contactId: number, groupId: number) => {
    db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)').run(contactId, groupId)
  })

  safeHandle('db:contactGroups:remove', (_event, contactId: number, groupId: number) => {
    db.prepare('DELETE FROM contact_groups WHERE contact_id = ? AND group_id = ?').run(contactId, groupId)
  })

  safeHandle('db:contactGroups:getForContact', (_event, contactId: number) => {
    return db.prepare(`
      SELECT g.* FROM groups g
      JOIN contact_groups cg ON cg.group_id = g.id
      WHERE cg.contact_id = ?
      ORDER BY g.name
    `).all(contactId)
  })

  // --- Interactions ---
  safeHandle('db:interactions:getAll', () => {
    return db.prepare(`
      SELECT i.*, c.first_name, c.last_name
      FROM interactions i
      JOIN contacts c ON c.id = i.contact_id
      ORDER BY i.date DESC
    `).all()
  })

  safeHandle('db:interactions:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC').all(contactId)
  })

  safeHandle('db:interactions:create', (_event, interaction) => {
    const stmt = db.prepare(`
      INSERT INTO interactions (contact_id, type, description, date)
      VALUES (@contact_id, @type, @description, @date)
    `)
    const result = stmt.run(interaction)
    return result.lastInsertRowid
  })

  safeHandle('db:interactions:delete', (_event, id: number) => {
    db.prepare('DELETE FROM interactions WHERE id = ?').run(id)
  })

  safeHandle('db:interactions:getLastForContacts', () => {
    return db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all()
  })

  safeHandle('db:interactions:countThisWeek', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM interactions WHERE date >= date('now', 'weekday 0', '-6 days')").get() as { count: number }
    return row.count
  })

  safeHandle('db:interactions:getRecentContacted', (_event, limit: number) => {
    return db.prepare(`
      SELECT c.*, MAX(i.date) as last_interaction_date
      FROM interactions i
      JOIN contacts c ON c.id = i.contact_id
      GROUP BY c.id
      ORDER BY last_interaction_date DESC
      LIMIT ?
    `).all(limit || 5)
  })

  // --- Interaction Attachments ---
  safeHandle('db:attachments:getForInteraction', (_event, interactionId: number) => {
    return db.prepare('SELECT * FROM interaction_attachments WHERE interaction_id = ? ORDER BY created_at').all(interactionId)
  })

  safeHandle('db:attachments:add', async (_event, interactionId: number, filePath: string) => {
    // Enforce 50MB file size limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    const stats = fs.statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 50MB.`)
    }
    const fileName = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const attachDir = path.join(app.getPath('userData'), 'attachments')
    if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true })
    const destName = `${Date.now()}-${fileName}`
    const destPath = path.join(attachDir, destName)
    fs.copyFileSync(filePath, destPath)
    const stmt = db.prepare('INSERT INTO interaction_attachments (interaction_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)')
    const result = stmt.run(interactionId, fileName, destPath, ext)
    return { id: result.lastInsertRowid, file_name: fileName, file_path: destPath, file_type: ext }
  })

  safeHandle('db:attachments:delete', (_event, id: number) => {
    const row = db.prepare('SELECT file_path FROM interaction_attachments WHERE id = ?').get(id) as { file_path: string } | undefined
    if (row?.file_path && fs.existsSync(row.file_path)) {
      fs.unlinkSync(row.file_path)
    }
    db.prepare('DELETE FROM interaction_attachments WHERE id = ?').run(id)
  })

  safeHandle('db:attachments:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Attach File',
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  safeHandle('db:attachments:openFile', (_event, filePath: string) => {
    // Validate path is within userData to prevent arbitrary file access
    const resolved = path.resolve(filePath)
    const userDataDir = app.getPath('userData')
    if (!resolved.startsWith(userDataDir)) {
      console.warn('[Security] Blocked openPath outside userData:', resolved)
      return
    }
    if (fs.existsSync(resolved)) {
      shell.openPath(resolved)
    }
  })

  // --- Reminders ---
  safeHandle('db:reminders:getAll', () => {
    return db.prepare(`
      SELECT r.*, c.first_name, c.last_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      ORDER BY r.due_date ASC
    `).all()
  })

  safeHandle('db:reminders:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM reminders WHERE contact_id = ? ORDER BY due_date ASC').all(contactId)
  })

  safeHandle('db:reminders:create', (_event, reminder) => {
    const stmt = db.prepare(`
      INSERT INTO reminders (contact_id, message, due_date, repeat)
      VALUES (@contact_id, @message, @due_date, @repeat)
    `)
    const result = stmt.run({ repeat: 'none', ...reminder })
    return result.lastInsertRowid
  })

  safeHandle('db:reminders:toggleComplete', (_event, id: number) => {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as { id: number; contact_id: number; message: string; due_date: string; completed: number; repeat: string } | undefined
    if (!reminder) return

    db.prepare('UPDATE reminders SET completed = NOT completed WHERE id = ?').run(id)

    // Auto-reschedule: if completing (was 0) and has a repeat interval
    if (reminder.completed === 0 && reminder.repeat && reminder.repeat !== 'none') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      let nextDate: Date

      switch (reminder.repeat) {
        case 'weekly':
          nextDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
        case 'monthly':
          nextDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())
          break
        case 'quarterly':
          nextDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
          break
        default:
          return
      }

      const nextDueDate = nextDate.toISOString().split('T')[0]
      db.prepare('INSERT INTO reminders (contact_id, message, due_date, repeat) VALUES (?, ?, ?, ?)').run(
        reminder.contact_id, reminder.message, nextDueDate, reminder.repeat
      )
    }
  })

  safeHandle('db:reminders:delete', (_event, id: number) => {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
  })

  safeHandle('db:reminders:countPending', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE completed = 0').get() as { count: number }
    return row.count
  })

  safeHandle('db:reminders:getOverdueCount', () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM reminders WHERE completed = 0 AND due_date < date('now')").get() as { count: number }
    return row.count
  })

  safeHandle('db:reminders:getDueToday', () => {
    return db.prepare(`
      SELECT r.*, c.first_name, c.last_name
      FROM reminders r
      JOIN contacts c ON c.id = r.contact_id
      WHERE r.completed = 0 AND r.due_date = date('now')
      ORDER BY r.created_at ASC
    `).all()
  })

  // --- App Info ---
  safeHandle('app:getVersion', () => {
    return app.getVersion()
  })

  // --- Data / Settings ---
  safeHandle('db:stats', () => {
    const contacts = (db.prepare('SELECT COUNT(*) as c FROM contacts').get() as { c: number }).c
    const tags = (db.prepare('SELECT COUNT(*) as c FROM tags').get() as { c: number }).c
    const groups = (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c
    const interactions = (db.prepare('SELECT COUNT(*) as c FROM interactions').get() as { c: number }).c
    const reminders = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as { c: number }).c
    return { contacts, tags, groups, interactions, reminders }
  })

  safeHandle('db:export:csv', async () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    if (contacts.length === 0) return { success: false, message: 'No contacts to export' }

    const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'birthday', 'location', 'created_at']
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

  safeHandle('db:export:filteredCsv', async (_event, contactIds: number[]) => {
    if (!contactIds.length) return { success: false, message: 'No contacts to export' }
    const placeholders = contactIds.map(() => '?').join(',')
    const contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders}) ORDER BY first_name, last_name`).all(...contactIds) as Record<string, unknown>[]

    const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'notes', 'how_we_met', 'birthday', 'created_at']
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

  // Full data export (JSON) — includes all fields, interactions, tags, groups
  safeHandle('db:export:json', async () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all()
    const tags = db.prepare('SELECT * FROM tags').all()
    const groups = db.prepare('SELECT * FROM groups').all()
    const contactTags = db.prepare('SELECT ct.contact_id, t.name as tag_name FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id').all()
    const contactGroups = db.prepare('SELECT cg.contact_id, g.name as group_name FROM contact_groups cg JOIN groups g ON cg.group_id = g.id').all()
    const interactions = db.prepare('SELECT i.*, c.first_name, c.last_name FROM interactions i JOIN contacts c ON i.contact_id = c.id WHERE c.deleted_at IS NULL ORDER BY i.date DESC').all()
    const customFields = db.prepare('SELECT cf.*, c.first_name, c.last_name FROM custom_fields cf JOIN contacts c ON cf.contact_id = c.id WHERE c.deleted_at IS NULL').all()
    const importantDates = db.prepare('SELECT id.*, c.first_name, c.last_name FROM important_dates id JOIN contacts c ON id.contact_id = c.id WHERE c.deleted_at IS NULL').all()
    const reminders = db.prepare('SELECT r.*, c.first_name, c.last_name FROM reminders r JOIN contacts c ON r.contact_id = c.id WHERE c.deleted_at IS NULL').all()

    const exportData = {
      exported_at: new Date().toISOString(),
      source: 'Nexus CRM',
      version: '1.0',
      contacts,
      tags,
      groups,
      contact_tags: contactTags,
      contact_groups: contactGroups,
      interactions,
      custom_fields: customFields,
      important_dates: importantDates,
      reminders
    }

    const result = await dialog.showSaveDialog({
      title: 'Export All Data (JSON)',
      defaultPath: 'nexus-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }
    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8')
    return { success: true, message: `Exported ${(contacts as unknown[]).length} contacts with all related data` }
  })

  // Enhanced CSV export — includes tags and groups as columns
  safeHandle('db:export:fullCsv', async () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    if (contacts.length === 0) return { success: false, message: 'No contacts to export' }

    // Get tags and groups per contact
    const tagRows = db.prepare('SELECT ct.contact_id, GROUP_CONCAT(t.name, "; ") as tags FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id GROUP BY ct.contact_id').all() as { contact_id: number; tags: string }[]
    const groupRows = db.prepare('SELECT cg.contact_id, GROUP_CONCAT(g.name, "; ") as groups FROM contact_groups cg JOIN groups g ON cg.group_id = g.id GROUP BY cg.contact_id').all() as { contact_id: number; groups: string }[]
    const tagMap = new Map(tagRows.map(r => [r.contact_id, r.tags]))
    const groupMap = new Map(groupRows.map(r => [r.contact_id, r.groups]))

    const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education', 'notes', 'how_we_met', 'birthday', 'location', 'keep_in_touch_days', 'tags', 'groups', 'created_at']
    const csvRows = [headers.join(',')]
    for (const c of contacts) {
      const row = headers.map(h => {
        let val: string
        if (h === 'tags') val = tagMap.get(c.id as number) || ''
        else if (h === 'groups') val = groupMap.get(c.id as number) || ''
        else val = String(c[h] || '')
        return `"${val.replace(/"/g, '""')}"`
      })
      csvRows.push(row.join(','))
    }

    const result = await dialog.showSaveDialog({
      title: 'Export All Contacts (CSV)',
      defaultPath: 'nexus-contacts-full.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }
    fs.writeFileSync(result.filePath, csvRows.join('\n'), 'utf8')
    return { success: true, message: `Exported ${contacts.length} contacts with tags and groups` }
  })

  // vCard export
  safeHandle('db:export:vcard', async () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    if (contacts.length === 0) return { success: false, message: 'No contacts to export' }

    const vcards = contacts.map(c => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0']
      lines.push(`N:${c.last_name || ''};${c.first_name || ''};;;`)
      lines.push(`FN:${[c.first_name, c.last_name].filter(Boolean).join(' ')}`)
      if (c.email) lines.push(`EMAIL:${c.email}`)
      if (c.phone) lines.push(`TEL:${c.phone}`)
      if (c.company) lines.push(`ORG:${c.company}`)
      if (c.job_title) lines.push(`TITLE:${c.job_title}`)
      if (c.location) lines.push(`ADR:;;${c.location};;;;`)
      if (c.birthday) lines.push(`BDAY:${String(c.birthday).replace(/-/g, '')}`)
      if (c.linkedin_url) lines.push(`URL:${c.linkedin_url}`)
      if (c.notes) lines.push(`NOTE:${String(c.notes).replace(/\n/g, '\\n')}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    })

    const result = await dialog.showSaveDialog({
      title: 'Export Contacts (vCard)',
      defaultPath: 'nexus-contacts.vcf',
      filters: [{ name: 'vCard', extensions: ['vcf'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }
    fs.writeFileSync(result.filePath, vcards.join('\r\n'), 'utf8')
    return { success: true, message: `Exported ${contacts.length} contacts as vCard` }
  })

  // Full portfolio export — CSV + vCard + interactions CSV + reminders CSV
  safeHandle('db:export:full', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths.length) return { success: false, message: 'Cancelled' }
    const exportDir = result.filePaths[0]

    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    if (contacts.length === 0) return { success: false, message: 'No contacts to export' }

    // Contacts CSV (with tags/groups)
    const tagRows = db.prepare('SELECT ct.contact_id, GROUP_CONCAT(t.name, "; ") as tags FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id GROUP BY ct.contact_id').all() as { contact_id: number; tags: string }[]
    const groupRows = db.prepare('SELECT cg.contact_id, GROUP_CONCAT(g.name, "; ") as groups FROM contact_groups cg JOIN groups g ON cg.group_id = g.id GROUP BY cg.contact_id').all() as { contact_id: number; groups: string }[]
    const tagMap = new Map(tagRows.map(r => [r.contact_id, r.tags]))
    const groupMap = new Map(groupRows.map(r => [r.contact_id, r.groups]))

    const contactHeaders = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'location', 'birthday', 'notes', 'how_we_met', 'linkedin_url', 'tags', 'groups', 'keep_in_touch_days', 'created_at']
    const contactCsv = [contactHeaders.join(',')]
    for (const c of contacts) {
      const row = contactHeaders.map(h => {
        let val: string
        if (h === 'tags') val = tagMap.get(c.id as number) || ''
        else if (h === 'groups') val = groupMap.get(c.id as number) || ''
        else val = String(c[h] || '')
        return `"${val.replace(/"/g, '""')}"`
      })
      contactCsv.push(row.join(','))
    }
    fs.writeFileSync(path.join(exportDir, 'contacts.csv'), contactCsv.join('\n'), 'utf8')

    // vCard
    const vcards = contacts.map(c => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0']
      lines.push(`N:${c.last_name || ''};${c.first_name || ''};;;`)
      lines.push(`FN:${[c.first_name, c.last_name].filter(Boolean).join(' ')}`)
      if (c.email) lines.push(`EMAIL:${c.email}`)
      if (c.phone) lines.push(`TEL:${c.phone}`)
      if (c.company) lines.push(`ORG:${c.company}`)
      if (c.job_title) lines.push(`TITLE:${c.job_title}`)
      if (c.birthday) lines.push(`BDAY:${String(c.birthday).replace(/-/g, '')}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    })
    fs.writeFileSync(path.join(exportDir, 'contacts.vcf'), vcards.join('\r\n'), 'utf8')

    // Interactions CSV
    const interactions = db.prepare(`
      SELECT i.type, i.description, i.date, c.first_name, c.last_name
      FROM interactions i JOIN contacts c ON i.contact_id = c.id
      WHERE c.deleted_at IS NULL ORDER BY i.date DESC
    `).all() as Record<string, unknown>[]
    if (interactions.length > 0) {
      const intHeaders = ['date', 'first_name', 'last_name', 'type', 'description']
      const intCsv = [intHeaders.join(',')]
      for (const i of interactions) {
        const row = intHeaders.map(h => `"${String(i[h] || '').replace(/"/g, '""')}"`)
        intCsv.push(row.join(','))
      }
      fs.writeFileSync(path.join(exportDir, 'interactions.csv'), intCsv.join('\n'), 'utf8')
    }

    // Reminders CSV
    const reminders = db.prepare(`
      SELECT r.title, r.due_date, r.completed, r.repeat, c.first_name, c.last_name
      FROM reminders r JOIN contacts c ON r.contact_id = c.id
      WHERE c.deleted_at IS NULL ORDER BY r.due_date
    `).all() as Record<string, unknown>[]
    if (reminders.length > 0) {
      const remHeaders = ['due_date', 'first_name', 'last_name', 'title', 'completed', 'repeat']
      const remCsv = [remHeaders.join(',')]
      for (const r of reminders) {
        const row = remHeaders.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`)
        remCsv.push(row.join(','))
      }
      fs.writeFileSync(path.join(exportDir, 'reminders.csv'), remCsv.join('\n'), 'utf8')
    }

    return { success: true, message: `Exported ${contacts.length} contacts (CSV + vCard), ${interactions.length} interactions, ${reminders.length} reminders` }
  })

  safeHandle('db:import:selectCsv', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Data',
      filters: [{ name: 'CSV, JSON, or VCF', extensions: ['csv', 'json', 'vcf', 'vcard'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const content = fs.readFileSync(filePath, 'utf8')

    // If it's a VCF file, parse and import directly
    if (filePath.endsWith('.vcf') || filePath.endsWith('.vcard')) {
      const { parseVCardFile } = await import('./vcard-parser')
      const parsed = parseVCardFile(content)
      if (parsed.length === 0) return '__VCF_EMPTY__'

      let imported = 0
      let skipped = 0
      const findByEmail = db.prepare(`SELECT id FROM contacts WHERE email = ? AND email != ''`)
      const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
      const insertStmt = db.prepare(`
        INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, notes, how_we_met, birthday, website, address)
        VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @notes, @how_we_met, @birthday, @website, @address)
      `)

      const transaction = db.transaction(() => {
        for (const raw of parsed) {
          const c = normaliseContact(raw)
          if (!c.first_name && !c.last_name) { skipped++; continue }
          const existing = (c.email && (findByEmail.get(c.email) as { id: number } | undefined)) ||
            (findByName.get(c.first_name, c.last_name) as { id: number } | undefined)
          if (existing) { skipped++; continue }
          insertStmt.run(c)
          imported++
        }
      })
      transaction()

      return `__VCF_RESULT__${JSON.stringify({ imported, skipped, total: parsed.length })}`
    }

    return content
  })

  safeHandle('db:import:readFile', async (_event, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf8')

    // If it's a VCF file, parse and import directly
    if (filePath.endsWith('.vcf') || filePath.endsWith('.vcard')) {
      const { parseVCardFile } = await import('./vcard-parser')
      const parsed = parseVCardFile(content)
      if (parsed.length === 0) return '__VCF_EMPTY__'

      let imported = 0
      let skipped = 0
      const findByEmail = db.prepare(`SELECT id FROM contacts WHERE email = ? AND email != ''`)
      const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
      const insertStmt = db.prepare(`
        INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, notes, how_we_met, birthday, website, address)
        VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @notes, @how_we_met, @birthday, @website, @address)
      `)

      const transaction = db.transaction(() => {
        for (const raw of parsed) {
          const c = normaliseContact(raw)
          if (!c.first_name && !c.last_name) { skipped++; continue }
          const existing = (c.email && (findByEmail.get(c.email) as { id: number } | undefined)) ||
            (findByName.get(c.first_name, c.last_name) as { id: number } | undefined)
          if (existing) { skipped++; continue }
          insertStmt.run(c)
          imported++
        }
      })
      transaction()

      return `__VCF_RESULT__${JSON.stringify({ imported, skipped, total: parsed.length })}`
    }

    return content
  })

  safeHandle('db:import:execute', (_event, rows: Record<string, string>[], mode: string) => {
    let imported = 0
    let skipped = 0
    const insertStmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, email, phone, company, job_title, linkedin_url, notes, how_we_met, birthday, location, website, twitter_url, facebook_url, instagram_url, address, education)
      VALUES (@first_name, @last_name, @email, @phone, @company, @job_title, @linkedin_url, @notes, @how_we_met, @birthday, @location, @website, @twitter_url, @facebook_url, @instagram_url, @address, @education)
    `)
    const findByEmail = db.prepare(`SELECT id FROM contacts WHERE email = ? AND email != ''`)
    const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
    const updateStmt = db.prepare(`
      UPDATE contacts SET first_name = @first_name, last_name = @last_name, phone = @phone,
        company = @company, job_title = @job_title, linkedin_url = @linkedin_url,
        notes = @notes, how_we_met = @how_we_met, birthday = @birthday, location = @location,
        website = @website, twitter_url = @twitter_url, facebook_url = @facebook_url,
        instagram_url = @instagram_url, address = @address, education = @education,
        updated_at = datetime('now')
      WHERE id = @id
    `)

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const contact = normaliseContact({
          first_name: row.first_name || '',
          last_name: row.last_name || '',
          email: row.email || '',
          phone: row.phone || '',
          company: row.company || '',
          job_title: row.job_title || '',
          linkedin_url: row.linkedin_url || '',
          notes: row.notes || '',
          how_we_met: row.how_we_met || '',
          birthday: row.birthday || '',
          location: row.location || '',
          website: row.website || '',
          twitter_url: row.twitter_url || '',
          facebook_url: row.facebook_url || '',
          instagram_url: row.instagram_url || '',
          address: row.address || '',
          education: row.education || ''
        })
        if (!contact.first_name && !contact.last_name) { skipped++; continue }

        let existing: { id: number } | undefined
        if (contact.email) {
          existing = findByEmail.get(contact.email) as { id: number } | undefined
        }
        if (!existing && contact.first_name && contact.last_name) {
          existing = findByName.get(contact.first_name, contact.last_name) as { id: number } | undefined
        }

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

  safeHandle('db:backup', () => {
    const result = backupCreateBackup(db)
    return { success: !!result, path: result }
  })

  safeHandle('db:backup:list', () => {
    return backupListBackups()
  })

  safeHandle('db:backup:restore', async (_event, backupPath: string) => {
    // Validate the path is within our backup directory
    const backupDir = path.join(app.getPath('userData'), 'backups')
    const resolved = path.resolve(backupPath)
    if (!resolved.startsWith(backupDir)) {
      return { success: false, error: 'Invalid backup path.' }
    }
    const result = backupRestoreFromBackup(db, resolved)
    if (result.success) {
      // App needs restart after restore
      app.relaunch()
      app.exit(0)
    }
    return result
  })

  safeHandle('db:resetDatabase', () => {
    db.exec(`
      DELETE FROM custom_fields;
      DELETE FROM important_dates;
      DELETE FROM contact_tags;
      DELETE FROM contact_groups;
      DELETE FROM interactions;
      DELETE FROM reminders;
      DELETE FROM tags;
      DELETE FROM groups;
      DELETE FROM contacts;
      DELETE FROM settings;
    `)
    return { success: true }
  })

  // --- Import: Instagram ZIP ---
  safeHandle('db:import:instagramZip', async (_event, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return { imported: 0, skipped: 0, total: 0 }
    const buffer = fs.readFileSync(filePath)
    const { parseInstagramZip, normaliseInstagramContacts } = await import('./instagram-parser')
    const raw = await parseInstagramZip(buffer)
    if (raw.length === 0) return { imported: 0, skipped: 0, total: 0 }

    const contacts = normaliseInstagramContacts(raw)
    let imported = 0, skipped = 0
    const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
    const insertStmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, instagram_url, how_we_met)
      VALUES (@first_name, @last_name, @instagram_url, @how_we_met)
    `)

    const transaction = db.transaction(() => {
      for (const c of contacts) {
        if (!c.first_name && !c.last_name) { skipped++; continue }
        const existing = findByName.get(c.first_name, c.last_name) as { id: number } | undefined
        if (existing) { skipped++; continue }
        insertStmt.run(c)
        imported++
      }
    })
    transaction()
    return { imported, skipped, total: raw.length }
  })

  // --- Import: WhatsApp ---
  safeHandle('db:import:whatsappFile', async (_event, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return { imported: 0, skipped: 0, total: 0 }

    const { parseWhatsAppChat, parseWhatsAppZip, normaliseWhatsAppContacts } = await import('./whatsapp-parser')
    let raw

    if (filePath.endsWith('.zip')) {
      const buffer = fs.readFileSync(filePath)
      raw = await parseWhatsAppZip(buffer)
    } else {
      const content = fs.readFileSync(filePath, 'utf8')
      raw = parseWhatsAppChat(content)
    }

    if (raw.length === 0) return { imported: 0, skipped: 0, total: 0 }

    const contacts = normaliseWhatsAppContacts(raw)
    let imported = 0, skipped = 0
    const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
    const findByPhone = db.prepare(`SELECT id FROM contacts WHERE phone = ? AND phone != ''`)
    const insertStmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, phone, how_we_met)
      VALUES (@first_name, @last_name, @phone, @how_we_met)
    `)

    const transaction = db.transaction(() => {
      for (const c of contacts) {
        if (!c.first_name && !c.last_name) { skipped++; continue }
        const existing = (c.phone && (findByPhone.get(c.phone) as { id: number } | undefined)) ||
          (findByName.get(c.first_name, c.last_name) as { id: number } | undefined)
        if (existing) { skipped++; continue }
        insertStmt.run(c)
        imported++
      }
    })
    transaction()
    return { imported, skipped, total: raw.length }
  })

  // --- Import: Telegram ---
  safeHandle('db:import:telegramFile', async (_event, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return { imported: 0, skipped: 0, total: 0 }

    const { parseTelegramJson, parseTelegramZip, normaliseTelegramContacts } = await import('./telegram-parser')
    let raw

    if (filePath.endsWith('.zip')) {
      const buffer = fs.readFileSync(filePath)
      raw = await parseTelegramZip(buffer)
    } else {
      const content = fs.readFileSync(filePath, 'utf8')
      raw = parseTelegramJson(content)
    }

    if (raw.length === 0) return { imported: 0, skipped: 0, total: 0 }

    const contacts = normaliseTelegramContacts(raw)
    let imported = 0, skipped = 0
    const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != ''`)
    const findByPhone = db.prepare(`SELECT id FROM contacts WHERE phone = ? AND phone != ''`)
    const insertStmt = db.prepare(`
      INSERT INTO contacts (first_name, last_name, phone, how_we_met)
      VALUES (@first_name, @last_name, @phone, @how_we_met)
    `)

    const transaction = db.transaction(() => {
      for (const c of contacts) {
        if (!c.first_name && !c.last_name) { skipped++; continue }
        const existing = (c.phone && (findByPhone.get(c.phone) as { id: number } | undefined)) ||
          (findByName.get(c.first_name, c.last_name) as { id: number } | undefined)
        if (existing) { skipped++; continue }
        insertStmt.run(c)
        imported++
      }
    })
    transaction()
    return { imported, skipped, total: raw.length }
  })

  // --- QR Code ---
  safeHandle('contact:generateQR', async (_event, contact: { first_name: string; last_name: string; email?: string; phone?: string; company?: string; job_title?: string; website?: string; linkedin_url?: string }) => {
    const { generateContactQR } = await import('./qr-contact')
    return generateContactQR(contact)
  })

  // --- Business Card OCR ---
  safeHandle('db:import:businessCardText', async (_event, text: string) => {
    const { parseBusinessCardText, normaliseBusinessCard } = await import('./business-card-ocr')
    const data = parseBusinessCardText(text)
    const contact = normaliseBusinessCard(data)
    return contact
  })

  // --- Import: Select File (platform-specific imports) ---
  safeHandle('db:import:selectPlatformFile', async (_event, platform: string) => {
    const filterMap: Record<string, { name: string; extensions: string[] }> = {
      instagram: { name: 'Instagram Data Export', extensions: ['zip'] },
      whatsapp: { name: 'WhatsApp Chat or Data Export', extensions: ['txt', 'zip'] },
      telegram: { name: 'Telegram Data Export', extensions: ['json', 'zip'] },
    }
    const filter = filterMap[platform]
    if (!filter) return null

    const result = await dialog.showOpenDialog({
      title: `Select your ${platform.charAt(0).toUpperCase() + platform.slice(1)} file`,
      filters: [filter],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // --- Settings ---
  safeHandle('db:settings:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  safeHandle('db:settings:set', (_event, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  safeHandle('db:settings:getAll', () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const r of rows) result[r.key] = r.value
    return result
  })

  // --- Copilot Conversations ---
  safeHandle('db:copilot:getAll', () => {
    return db.prepare('SELECT * FROM copilot_conversations ORDER BY updated_at DESC').all()
  })

  safeHandle('db:copilot:save', (_event, id: number | null, title: string, messagesJson: string) => {
    if (id) {
      db.prepare("UPDATE copilot_conversations SET title = ?, messages_json = ?, updated_at = datetime('now') WHERE id = ?").run(title, messagesJson, id)
      return id
    } else {
      const result = db.prepare("INSERT INTO copilot_conversations (title, messages_json) VALUES (?, ?)").run(title, messagesJson)
      return result.lastInsertRowid
    }
  })

  safeHandle('db:copilot:delete', (_event, id: number) => {
    db.prepare('DELETE FROM copilot_conversations WHERE id = ?').run(id)
  })

  // --- Import Interactions from CSV ---
  safeHandle('db:import:executeInteractions', (_event, rows: Record<string, string>[]) => {
    let imported = 0
    let skipped = 0
    const findByEmail = db.prepare(`SELECT id FROM contacts WHERE email = ? AND email != '' AND deleted_at IS NULL`)
    const findByName = db.prepare(`SELECT id FROM contacts WHERE first_name = ? AND last_name = ? AND first_name != '' AND deleted_at IS NULL`)
    const insertInt = db.prepare('INSERT INTO interactions (contact_id, type, description, date) VALUES (?, ?, ?, ?)')

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const email = row.contact_email || row.email || ''
        const name = row.contact_name || row.name || ''
        const [firstName, ...rest] = name.split(' ')
        const lastName = rest.join(' ')
        const type = row.type || 'note'
        const description = row.description || row.notes || ''
        const date = row.date || new Date().toISOString().split('T')[0]

        let contact: { id: number } | undefined
        if (email) contact = findByEmail.get(email) as { id: number } | undefined
        if (!contact && firstName) contact = findByName.get(firstName, lastName) as { id: number } | undefined

        if (contact) {
          insertInt.run(contact.id, type, description, date)
          imported++
        } else {
          skipped++
        }
      }
    })
    transaction()
    return { imported, skipped }
  })

  // --- Plan / Subscription ---
  safeHandle('db:plan:getStatus', () => {
    const get = (key: string) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    }

    const planType = get('plan_type') || 'free'
    const trialStart = get('plan_trial_start')
    const contactCount = (db.prepare('SELECT COUNT(*) as c FROM contacts WHERE deleted_at IS NULL').get() as { c: number }).c
    const aiActionsUsed = parseInt(get('ai_actions_this_month') || '0', 10)
    const aiResetMonth = get('ai_actions_reset_month')
    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

    // Auto-reset AI actions counter on new month
    let effectiveAiActions = aiActionsUsed
    if (aiResetMonth !== currentMonth) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_actions_this_month', '0')").run()
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_actions_reset_month', ?)").run(currentMonth)
      effectiveAiActions = 0
    }

    // Check if trial is still active (14 days)
    let trialActive = false
    let trialDaysLeft = 0
    if (trialStart && planType === 'free') {
      const elapsed = (Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24)
      if (elapsed < 14) {
        trialActive = true
        trialDaysLeft = Math.ceil(14 - elapsed)
      }
    }

    const isPro = planType === 'pro' || planType === 'lifetime' || trialActive

    return {
      planType,
      isPro,
      trialActive,
      trialDaysLeft,
      contactCount,
      contactLimit: isPro ? Infinity : 50,
      aiActionsUsed: effectiveAiActions,
      aiActionsLimit: isPro ? Infinity : 10,
      integrationsEnabled: isPro
    }
  })

  safeHandle('db:plan:startTrial', () => {
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'plan_trial_start'").get()
    if (existing) return { success: false, message: 'Trial already used' }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('plan_trial_start', ?)").run(new Date().toISOString())
    return { success: true }
  })

  safeHandle('db:plan:setPlan', (_event, planType: string) => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('plan_type', ?)").run(planType)
    return { success: true }
  })

  safeHandle('db:plan:trackAiAction', () => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const resetMonth = (db.prepare("SELECT value FROM settings WHERE key = 'ai_actions_reset_month'").get() as { value: string } | undefined)?.value
    if (resetMonth !== currentMonth) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_actions_this_month', '1')").run()
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_actions_reset_month', ?)").run(currentMonth)
      return { count: 1 }
    }
    const current = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'ai_actions_this_month'").get() as { value: string } | undefined)?.value || '0', 10)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_actions_this_month', ?)").run(String(current + 1))
    return { count: current + 1 }
  })

  // --- Stripe Checkout ---
  ipcMain.handle('stripe:createCheckout', async (_event, plan: string, billing: string) => {
    // Get Supabase URL and user session from settings
    const supabaseUrl = (db.prepare("SELECT value FROM settings WHERE key = 'supabase_url'").get() as { value: string } | undefined)?.value
      || process.env.VITE_SUPABASE_URL || ''
    const supabaseAnonKey = (db.prepare("SELECT value FROM settings WHERE key = 'supabase_anon_key'").get() as { value: string } | undefined)?.value
      || process.env.VITE_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !supabaseAnonKey) {
      return { error: 'Cloud not configured. Supabase credentials required for payments.' }
    }

    // Retrieve user session token from renderer-stored localStorage via settings
    const sessionToken = getSecretValue(db, 'supabase_access_token')

    if (!sessionToken) {
      return { error: 'Not signed in. Please sign in to upgrade.' }
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ plan, billing }),
      })

      const data = await response.json()

      if (data.url) {
        // Open Stripe checkout in default browser
        safeOpenExternal(data.url)
        return { success: true, url: data.url }
      }

      return { error: data.error || 'Failed to create checkout session' }
    } catch (err) {
      return { error: `Checkout failed: ${(err as Error).message}` }
    }
  })

  ipcMain.handle('stripe:checkSubscription', async () => {
    const supabaseUrl = (db.prepare("SELECT value FROM settings WHERE key = 'supabase_url'").get() as { value: string } | undefined)?.value
      || process.env.VITE_SUPABASE_URL || ''
    const supabaseAnonKey = (db.prepare("SELECT value FROM settings WHERE key = 'supabase_anon_key'").get() as { value: string } | undefined)?.value
      || process.env.VITE_SUPABASE_ANON_KEY || ''
    const sessionToken = getSecretValue(db, 'supabase_access_token')

    if (!supabaseUrl || !supabaseAnonKey || !sessionToken) {
      return null // No cloud — fall back to local plan
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/check-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'apikey': supabaseAnonKey,
        },
      })
      return await response.json()
    } catch {
      return null // Network error — fall back to local plan
    }
  })

  safeHandle('stripe:openPortal', async () => {
    // For managing subscription (cancel, update payment method)
    // This would need a manage-billing Edge Function, but for now
    // we direct to the Stripe Customer Portal via Supabase
    const supabaseUrl = (db.prepare("SELECT value FROM settings WHERE key = 'supabase_url'").get() as { value: string } | undefined)?.value
      || process.env.VITE_SUPABASE_URL || ''

    if (supabaseUrl) {
      safeOpenExternal(`${supabaseUrl}/functions/v1/customer-portal`)
    }
    return { success: true }
  })

  // --- Custom Fields ---
  safeHandle('db:customFields:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM custom_fields WHERE contact_id = ? ORDER BY id').all(contactId)
  })

  safeHandle('db:customFields:create', (_event, data: { contact_id: number; field_name: string; field_value: string }) => {
    const result = db.prepare('INSERT INTO custom_fields (contact_id, field_name, field_value) VALUES (@contact_id, @field_name, @field_value)').run(data)
    return result.lastInsertRowid
  })

  safeHandle('db:customFields:update', (_event, id: number, data: { field_name: string; field_value: string }) => {
    db.prepare('UPDATE custom_fields SET field_name = @field_name, field_value = @field_value WHERE id = @id').run({ ...data, id })
  })

  safeHandle('db:customFields:delete', (_event, id: number) => {
    db.prepare('DELETE FROM custom_fields WHERE id = ?').run(id)
  })

  // --- Important Dates ---
  safeHandle('db:importantDates:getForContact', (_event, contactId: number) => {
    return db.prepare('SELECT * FROM important_dates WHERE contact_id = ? ORDER BY date').all(contactId)
  })

  safeHandle('db:importantDates:create', (_event, data: { contact_id: number; label: string; date: string }) => {
    const result = db.prepare('INSERT INTO important_dates (contact_id, label, date) VALUES (@contact_id, @label, @date)').run(data)
    return result.lastInsertRowid
  })

  safeHandle('db:importantDates:update', (_event, id: number, data: { label: string; date: string }) => {
    db.prepare('UPDATE important_dates SET label = @label, date = @date WHERE id = @id').run({ ...data, id })
  })

  safeHandle('db:importantDates:delete', (_event, id: number) => {
    db.prepare('DELETE FROM important_dates WHERE id = ?').run(id)
  })

  // --- Contact Photos ---
  safeHandle('db:contacts:selectPhoto', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Photo',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  safeHandle('db:contacts:savePhoto', (_event, id: number, sourcePath: string) => {
    const ext = path.extname(sourcePath)
    const photosDir = path.join(app.getPath('userData'), 'photos')
    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true })
    const filename = `contact-${id}-${Date.now()}${ext}`
    const destPath = path.join(photosDir, filename)
    fs.copyFileSync(sourcePath, destPath)
    db.prepare('UPDATE contacts SET photo_url = ?, updated_at = datetime(\'now\') WHERE id = ?').run(destPath, id)
    return destPath
  })

  // --- Upcoming Birthdays ---
  safeHandle('db:contacts:getUpcomingBirthdays', (_event, days: number) => {
    // Get all contacts with birthdays set, then filter in JS for upcoming
    const contacts = db.prepare("SELECT * FROM contacts WHERE deleted_at IS NULL AND birthday != '' AND birthday IS NOT NULL ORDER BY first_name").all() as Record<string, unknown>[]
    const now = new Date()
    const results: (Record<string, unknown> & { days_until: number })[] = []
    for (const c of contacts) {
      const bday = c.birthday as string
      if (!bday) continue
      const [, m, d] = bday.split('-').map(Number)
      const thisYear = new Date(now.getFullYear(), m - 1, d)
      let diff = Math.ceil((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (diff < 0) diff += 365
      if (diff <= days) results.push({ ...c, days_until: diff })
    }
    results.sort((a, b) => a.days_until - b.days_until)
    return results
  })

  // --- Keep in Touch Due ---
  safeHandle('db:contacts:getDueForContact', () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL AND keep_in_touch_days > 0 ORDER BY first_name').all() as Record<string, unknown>[]
    const lastInteractions = db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all() as { contact_id: number; last_date: string }[]
    const lastMap = new Map<number, string>()
    for (const r of lastInteractions) lastMap.set(r.contact_id, r.last_date)

    const now = new Date()
    const results: (Record<string, unknown> & { days_overdue: number; last_contact_date: string | null })[] = []
    for (const c of contacts) {
      const freq = c.keep_in_touch_days as number
      const lastDate = lastMap.get(c.id as number)
      if (!lastDate) {
        results.push({ ...c, days_overdue: freq, last_contact_date: null })
        continue
      }
      const daysSince = Math.floor((now.getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > freq) {
        results.push({ ...c, days_overdue: daysSince - freq, last_contact_date: lastDate })
      }
    }
    results.sort((a, b) => b.days_overdue - a.days_overdue)
    return results
  })

  // --- Pipeline Data ---
  safeHandle('db:pipeline:getData', () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY first_name, last_name').all() as Record<string, unknown>[]
    const lastInteractions = db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all() as { contact_id: number; last_date: string }[]
    const lastMap = new Map<number, string>()
    for (const r of lastInteractions) lastMap.set(r.contact_id, r.last_date)

    // Batch-load tags for all contacts in one query instead of N+1
    const allTags = db.prepare(`
      SELECT ct.contact_id, t.id, t.name, t.color
      FROM contact_tags ct
      JOIN tags t ON t.id = ct.tag_id
      ORDER BY t.name
    `).all() as { contact_id: number; id: number; name: string; color: string }[]
    const tagMap = new Map<number, { id: number; name: string; color: string }[]>()
    for (const t of allTags) {
      if (!tagMap.has(t.contact_id)) tagMap.set(t.contact_id, [])
      tagMap.get(t.contact_id)!.push({ id: t.id, name: t.name, color: t.color })
    }

    return contacts.map(c => ({
      ...c,
      last_interaction_date: lastMap.get(c.id as number) || null,
      tags: (tagMap.get(c.id as number) || []).slice(0, 2)
    }))
  })

  // --- Dashboard: Activity Feed ---
  safeHandle('db:dashboard:getActivityFeed', (_event, limit: number) => {
    return db.prepare(`
      SELECT * FROM (
        SELECT i.id, i.type, i.description, i.date as event_date, 'interaction' as event_type,
               c.id as contact_id, c.first_name, c.last_name
        FROM interactions i JOIN contacts c ON c.id = i.contact_id
        WHERE c.deleted_at IS NULL
        UNION ALL
        SELECT id, '' as type, '' as description, created_at as event_date, 'new_contact' as event_type,
               id as contact_id, first_name, last_name
        FROM contacts WHERE deleted_at IS NULL
      ) ORDER BY event_date DESC LIMIT ?
    `).all(limit || 20)
  })

  // --- Dashboard: Keep in Touch Due ---
  safeHandle('db:dashboard:getKeepInTouchDue', () => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL AND keep_in_touch_days > 0 ORDER BY first_name').all() as Record<string, unknown>[]
    const lastInteractions = db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all() as { contact_id: number; last_date: string }[]
    const lastMap = new Map<number, string>()
    for (const r of lastInteractions) lastMap.set(r.contact_id, r.last_date)

    const now = new Date()
    const results: (Record<string, unknown> & { days_overdue: number; last_contact_date: string | null })[] = []
    for (const c of contacts) {
      const freq = c.keep_in_touch_days as number
      const lastDate = lastMap.get(c.id as number)
      if (!lastDate) {
        results.push({ ...c, days_overdue: freq, last_contact_date: null })
        continue
      }
      const daysSince = Math.floor((now.getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > freq) {
        results.push({ ...c, days_overdue: daysSince - freq, last_contact_date: lastDate })
      }
    }
    results.sort((a, b) => b.days_overdue - a.days_overdue)
    return results
  })

  // --- Dashboard: Upcoming Birthdays ---
  safeHandle('db:dashboard:getUpcomingBirthdays', (_event, days: number) => {
    const contacts = db.prepare("SELECT * FROM contacts WHERE deleted_at IS NULL AND birthday != '' AND birthday IS NOT NULL ORDER BY first_name").all() as Record<string, unknown>[]
    const now = new Date()
    const results: (Record<string, unknown> & { days_until: number })[] = []
    for (const c of contacts) {
      const bday = c.birthday as string
      if (!bday) continue
      const [, m, d] = bday.split('-').map(Number)
      const thisYear = new Date(now.getFullYear(), m - 1, d)
      let diff = Math.ceil((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (diff < 0) diff += 365
      if (diff <= days) results.push({ ...c, days_until: diff })
    }
    results.sort((a, b) => a.days_until - b.days_until)
    return results
  })

  // --- Sync Operations ---
  // Get all rows from a table that need pushing (modified after last sync)
  safeHandle('db:sync:getPendingChanges', (_event, table: string) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return []

    // Rows where updated_at > synced_at (or synced_at is null = never synced)
    if (table === 'contacts') {
      return db.prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL OR updated_at > synced_at`).all()
    }
    // Tables without updated_at: check synced_at is null (created since last sync)
    return db.prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL`).all()
  })

  // Get pending junction table changes
  safeHandle('db:sync:getPendingJunctionChanges', (_event, table: string) => {
    const validTables = ['contact_tags', 'contact_groups']
    if (!validTables.includes(table)) return []
    return db.prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL`).all()
  })

  // Get deleted rows (soft-deleted locally, need to push deletion to cloud)
  safeHandle('db:sync:getDeletedRows', (_event, table: string) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return []
    return db.prepare(`SELECT id, cloud_id FROM ${table} WHERE deleted_at IS NOT NULL AND cloud_id IS NOT NULL`).all()
  })

  // Mark a local row as synced (set cloud_id + synced_at)
  safeHandle('db:sync:markSynced', (_event, table: string, localId: number, cloudId: string) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return
    db.prepare(`UPDATE ${table} SET cloud_id = ?, synced_at = datetime('now') WHERE id = ?`).run(cloudId, localId)
  })

  // Mark junction row as synced
  safeHandle('db:sync:markJunctionSynced', (_event, table: string, col1: string, val1: number, col2: string, val2: number, cloudId: string) => {
    const validTables = ['contact_tags', 'contact_groups']
    if (!validTables.includes(table)) return
    const validCols = ['contact_id', 'tag_id', 'group_id']
    if (!validCols.includes(col1) || !validCols.includes(col2)) return
    db.prepare(`UPDATE ${table} SET cloud_id = ?, synced_at = datetime('now') WHERE ${col1} = ? AND ${col2} = ?`).run(cloudId, val1, val2)
  })

  // Purge hard-deleted rows (after deletion synced to cloud)
  safeHandle('db:sync:purgeDeleted', (_event, table: string, localId: number) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(localId)
  })

  // Upsert a row pulled from cloud (insert or update by cloud_id)
  safeHandle('db:sync:upsertFromCloud', (_event, table: string, cloudId: string, data: Record<string, unknown>) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return

    // Whitelist allowed columns per table to prevent injection via dynamic keys
    const allowedColumns: Record<string, Set<string>> = {
      contacts: new Set(['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'photo_url', 'notes', 'how_we_met', 'birthday', 'keep_in_touch_days', 'location', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education']),
      tags: new Set(['name', 'color']),
      groups: new Set(['name', 'description', 'color']),
      interactions: new Set(['contact_id', 'type', 'description', 'date']),
      reminders: new Set(['contact_id', 'message', 'due_date', 'completed', 'repeat']),
      custom_fields: new Set(['contact_id', 'field_name', 'field_value']),
      important_dates: new Set(['contact_id', 'label', 'date'])
    }
    const allowed = allowedColumns[table]
    if (!allowed) return

    // Filter data to only allowed columns
    const safeData: Record<string, unknown> = {}
    for (const key of Object.keys(data)) {
      if (allowed.has(key)) safeData[key] = data[key]
    }

    const existing = db.prepare(`SELECT id FROM ${table} WHERE cloud_id = ?`).get(cloudId) as { id: number } | undefined

    if (existing) {
      const keys = Object.keys(safeData)
      if (keys.length === 0) return existing.id
      const setClauses = keys.map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE ${table} SET ${setClauses}, synced_at = datetime('now') WHERE cloud_id = @cloud_id`).run({ ...safeData, cloud_id: cloudId })
      return existing.id
    } else {
      const cols = [...Object.keys(safeData), 'cloud_id', 'synced_at']
      const placeholders = cols.map(c => `@${c}`)
      const result = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`).run({
        ...safeData,
        cloud_id: cloudId,
        synced_at: new Date().toISOString().replace('T', ' ').split('.')[0]
      })
      return result.lastInsertRowid
    }
  })

  // Get sync log (last push/pull timestamps per table)
  safeHandle('db:sync:getLog', () => {
    return db.prepare('SELECT * FROM sync_log').all()
  })

  // Update sync log
  safeHandle('db:sync:updateLog', (_event, table: string, field: 'last_pushed_at' | 'last_pulled_at', timestamp: string) => {
    db.prepare(`INSERT OR REPLACE INTO sync_log (table_name, ${field}) VALUES (?, ?)`).run(table, timestamp)
  })

  // Get cloud_id mapping for a table (for resolving foreign keys during sync)
  safeHandle('db:sync:getIdMap', (_event, table: string) => {
    const validTables = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']
    if (!validTables.includes(table)) return []
    return db.prepare(`SELECT id, cloud_id FROM ${table} WHERE cloud_id IS NOT NULL`).all()
  })

  // --- Dashboard: Relationship Health ---
  safeHandle('db:dashboard:getRelationshipHealth', () => {
    const contacts = db.prepare('SELECT id, keep_in_touch_days FROM contacts WHERE deleted_at IS NULL').all() as { id: number; keep_in_touch_days: number }[]
    const lastInteractions = db.prepare('SELECT contact_id, MAX(date) as last_date FROM interactions GROUP BY contact_id').all() as { contact_id: number; last_date: string }[]
    const lastMap = new Map<number, string>()
    for (const r of lastInteractions) lastMap.set(r.contact_id, r.last_date)

    const now = new Date()
    const counts = { fresh: 0, good: 0, stale: 0, cold: 0, none: 0 }

    for (const c of contacts) {
      const lastDate = lastMap.get(c.id)
      if (!lastDate) { counts.none++; continue }
      const daysSince = Math.floor((now.getTime() - new Date(lastDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      const freq = c.keep_in_touch_days || 30

      if (daysSince <= freq * 0.5) counts.fresh++
      else if (daysSince <= freq) counts.good++
      else if (daysSince <= freq * 1.5) counts.stale++
      else counts.cold++
    }
    return counts
  })

  // --- Bulk Operations ---
  safeHandle('db:contacts:bulkSetFrequency', (_event, ids: number[], days: number) => {
    const stmt = db.prepare("UPDATE contacts SET keep_in_touch_days = ?, updated_at = datetime('now') WHERE id = ?")
    const txn = db.transaction(() => { for (const id of ids) stmt.run(days, id) })
    txn()
  })

  safeHandle('db:contacts:bulkAddTag', (_event, contactIds: number[], tagId: number) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)')
    const txn = db.transaction(() => { for (const id of contactIds) stmt.run(id, tagId) })
    txn()
  })

  safeHandle('db:contacts:bulkAddGroup', (_event, contactIds: number[], groupId: number) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?, ?)')
    const txn = db.transaction(() => { for (const id of contactIds) stmt.run(id, groupId) })
    txn()
  })

  safeHandle('db:contacts:bulkArchive', (_event, ids: number[]) => {
    const stmt = db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?")
    const txn = db.transaction(() => { for (const id of ids) stmt.run(id) })
    txn()
  })

  safeHandle('db:contacts:bulkDelete', (_event, ids: number[]) => {
    const stmt = db.prepare('DELETE FROM contacts WHERE id = ?')
    const txn = db.transaction(() => { for (const id of ids) stmt.run(id) })
    txn()
  })

  // --- Quick Action: Uncategorized contacts ---
  safeHandle('db:contacts:getUncategorized', (_event, limit: number) => {
    return db.prepare(
      'SELECT * FROM contacts WHERE deleted_at IS NULL AND keep_in_touch_days = 0 ORDER BY created_at DESC LIMIT ?'
    ).all(limit || 50)
  })

  safeHandle('db:contacts:countUncategorized', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE deleted_at IS NULL AND keep_in_touch_days = 0').get() as { count: number }
    return row.count
  })

  safeHandle('db:contacts:setKeepInTouch', (_event, id: number, days: number) => {
    db.prepare("UPDATE contacts SET keep_in_touch_days = ?, updated_at = datetime('now') WHERE id = ?").run(days, id)
  })

  safeHandle('db:contacts:archive', (_event, id: number) => {
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(id)
  })

  // --- Related Contacts ---
  safeHandle('db:relationships:getForContact', (_event, contactId: number) => {
    return db.prepare(`
      SELECT cr.id, cr.relationship_type, cr.created_at,
        CASE WHEN cr.contact_id_1 = ? THEN cr.contact_id_2 ELSE cr.contact_id_1 END as related_id,
        CASE WHEN cr.contact_id_1 = ? THEN c2.first_name ELSE c1.first_name END as first_name,
        CASE WHEN cr.contact_id_1 = ? THEN c2.last_name ELSE c1.last_name END as last_name,
        CASE WHEN cr.contact_id_1 = ? THEN c2.company ELSE c1.company END as company,
        CASE WHEN cr.contact_id_1 = ? THEN c2.photo_url ELSE c1.photo_url END as photo_url
      FROM contact_relationships cr
      JOIN contacts c1 ON c1.id = cr.contact_id_1
      JOIN contacts c2 ON c2.id = cr.contact_id_2
      WHERE (cr.contact_id_1 = ? OR cr.contact_id_2 = ?)
        AND c1.deleted_at IS NULL AND c2.deleted_at IS NULL
      ORDER BY cr.created_at DESC
    `).all(contactId, contactId, contactId, contactId, contactId, contactId, contactId)
  })

  safeHandle('db:relationships:create', (_event, data: { contact_id_1: number; contact_id_2: number; relationship_type: string }) => {
    const result = db.prepare(
      'INSERT INTO contact_relationships (contact_id_1, contact_id_2, relationship_type) VALUES (@contact_id_1, @contact_id_2, @relationship_type)'
    ).run(data)
    return result.lastInsertRowid
  })

  safeHandle('db:relationships:delete', (_event, id: number) => {
    db.prepare('DELETE FROM contact_relationships WHERE id = ?').run(id)
  })

  // --- Dashboard: Network Updates (Job Changes) ---
  ipcMain.handle('db:dashboard:getNetworkUpdates', (_event, limit: number) => {
    return db.prepare(`
      SELECT i.id, i.description, i.date, c.id as contact_id, c.first_name, c.last_name, c.company, c.job_title, c.photo_url
      FROM interactions i
      JOIN contacts c ON c.id = i.contact_id
      WHERE i.type = 'job_change' AND c.deleted_at IS NULL
      ORDER BY i.date DESC
      LIMIT ?
    `).all(limit || 10)
  })

  // --- Google Integration ---

  ipcMain.handle('google:getStatus', () => {
    return getGoogleStatus(db)
  })

  ipcMain.handle('google:connect', async () => {
    try {
      await startGoogleAuth(db)
      return { success: true, status: getGoogleStatus(db) }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('google:disconnect', () => {
    disconnectGoogle(db)
    return { success: true }
  })

  ipcMain.handle('google:getAccessToken', async () => {
    try {
      const token = await getValidAccessToken(db)
      return token
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('google:getAutoSyncStatus', () => {
    return getGoogleAutoSyncStatus(db)
  })

  ipcMain.handle('google:enableAutoSync', (_event, frequency: string) => {
    enableGoogleAutoSync(db, frequency)
    return { success: true }
  })

  ipcMain.handle('google:disableAutoSync', () => {
    disableGoogleAutoSync(db)
    return { success: true }
  })

  ipcMain.handle('google:runSync', async () => {
    try {
      console.log('[Google Sync] Starting...')
      const result = await runGoogleSync(db)
      console.log('[Google Sync] Result:', JSON.stringify(result))
      return { success: true, ...result }
    } catch (err) {
      console.error('[Google Sync] Error:', err)
      return { success: false, error: String(err) }
    }
  })

  safeHandle('google:runSignatureEnrichment', async () => {
    // Signature enrichment runs on email bodies if available.
    // Currently requires email bodies to be passed in — placeholder for future Gmail API body fetching.
    // For now, return empty result since we don't yet fetch email bodies.
    return { enriched: 0, scanned: 0 }
  })

  // --- Microsoft / Outlook ---

  ipcMain.handle('microsoft:setCredentials', (_event, clientId: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('microsoft_client_id', clientId)
    return { success: true }
  })

  ipcMain.handle('microsoft:getStatus', () => {
    return getMicrosoftStatus(db)
  })

  ipcMain.handle('microsoft:connect', async () => {
    try {
      await startMicrosoftAuth(db)
      return { success: true, status: getMicrosoftStatus(db) }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('microsoft:disconnect', () => {
    disconnectMicrosoft(db)
    return { success: true }
  })

  ipcMain.handle('microsoft:getAccessToken', async () => {
    try {
      return await getValidMicrosoftAccessToken(db)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('microsoft:syncCalendar', async () => {
    try {
      const now = new Date()
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const events = await fetchMsCalendarEvents(db, start, end) as {
        subject: string
        start: { dateTime: string }
        end: { dateTime: string }
        attendees: { emailAddress: { address: string; name: string } }[]
      }[]

      const contacts = db.prepare(`SELECT id, email, first_name, last_name FROM contacts WHERE deleted_at IS NULL AND email != ''`).all() as {
        id: number; email: string; first_name: string; last_name: string
      }[]
      const emailMap = new Map(contacts.map(c => [c.email.toLowerCase(), c.id]))

      let matched = 0
      for (const event of events) {
        if (!event.attendees) continue
        for (const att of event.attendees) {
          const contactId = emailMap.get(att.emailAddress.address.toLowerCase())
          if (!contactId) continue

          const eventDate = event.start.dateTime.split('T')[0]
          const existing = db.prepare(
            "SELECT id FROM interactions WHERE contact_id = ? AND type = 'calendar' AND date = ? AND description = ?"
          ).get(contactId, eventDate, event.subject)

          if (!existing) {
            db.prepare(
              "INSERT INTO interactions (contact_id, type, description, date) VALUES (?, 'calendar', ?, ?)"
            ).run(contactId, event.subject, eventDate)
            matched++
          }
        }
      }

      return { total: events.length, matched }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('microsoft:syncEmail', async () => {
    try {
      const emails = await fetchMsEmails(db, 100) as {
        subject: string
        from: { emailAddress: { address: string } }
        toRecipients: { emailAddress: { address: string } }[]
        receivedDateTime: string
      }[]

      const contacts = db.prepare(`SELECT id, email FROM contacts WHERE deleted_at IS NULL AND email != ''`).all() as {
        id: number; email: string
      }[]
      const emailMap = new Map(contacts.map(c => [c.email.toLowerCase(), c.id]))

      let matched = 0
      for (const email of emails) {
        const senderMatch = emailMap.get(email.from?.emailAddress?.address?.toLowerCase() || '')
        const recipientMatches = (email.toRecipients || [])
          .map(r => emailMap.get(r.emailAddress?.address?.toLowerCase() || ''))
          .filter(Boolean)

        const contactId = senderMatch || recipientMatches[0]
        if (!contactId) continue

        const emailDate = email.receivedDateTime?.split('T')[0]
        if (!emailDate) continue

        const existing = db.prepare(
          "SELECT id FROM interactions WHERE contact_id = ? AND type = 'email' AND date = ? AND description = ?"
        ).get(contactId, emailDate, email.subject || '(no subject)')

        if (!existing) {
          db.prepare(
            "INSERT INTO interactions (contact_id, type, description, date) VALUES (?, 'email', ?, ?)"
          ).run(contactId, email.subject || '(no subject)', emailDate)
          matched++
        }
      }

      return { total: emails.length, matched }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('microsoft:importContacts', async () => {
    try {
      const result = await importMicrosoftContacts(db)
      return { success: true, ...result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  safeHandle('microsoft:getContactsAutoSyncStatus', () => {
    return getMsAutoSyncStatus(db)
  })

  safeHandle('microsoft:enableContactsAutoSync', (_event, frequency: string) => {
    enableMsAutoSync(db, frequency)
    return { success: true }
  })

  safeHandle('microsoft:disableContactsAutoSync', () => {
    disableMsAutoSync(db)
    return { success: true }
  })

  // --- AI ---

  ipcMain.handle('ai:getStatus', () => {
    return { configured: !!getSecretValue(db, 'ai_api_key') }
  })

  ipcMain.handle('ai:setApiKey', (_event, key: string) => {
    setSecretValue(db, 'ai_api_key', key)
    return { success: true }
  })

  ipcMain.handle('ai:removeApiKey', () => {
    deleteSecretValue(db, 'ai_api_key')
    return { success: true }
  })

  ipcMain.handle('ai:chat', async (_event, messages: { role: string; content: string }[], systemPrompt: string) => {
    try {
      const { sendMessage } = await import('./ai-client')
      return await sendMessage(db, messages as { role: 'user' | 'assistant'; content: string }[], systemPrompt)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:networkQuery', async (_event, question: string, history: { role: string; content: string }[]) => {
    try {
      const { networkQuery } = await import('./ai-client')
      return await networkQuery(db, question, history as { role: 'user' | 'assistant'; content: string }[])
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:reconnectionMessages', async (_event, contactId: number) => {
    try {
      const { generateReconnectionMessages } = await import('./ai-client')
      return await generateReconnectionMessages(db, contactId)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:meetingBriefing', async (_event, contactId: number, topic?: string) => {
    try {
      const { generateMeetingBriefing } = await import('./ai-client')
      return await generateMeetingBriefing(db, contactId, topic)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:summarizeNotes', async (_event, text: string) => {
    try {
      const { summarizeInteractionNotes } = await import('./ai-client')
      return await summarizeInteractionNotes(db, text)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:suggestTags', async (_event, contactId: number) => {
    try {
      const { suggestTags } = await import('./ai-client')
      return await suggestTags(db, contactId)
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('ai:weeklyDigest', async () => {
    try {
    // Compute network insights without AI (data-driven)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Contacts going cold (have KIT freq, overdue)
    const goingCold = db.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.company, c.keep_in_touch_days,
             MAX(i.date) as last_date,
             CAST(julianday('now') - julianday(MAX(i.date)) AS INTEGER) as days_since
      FROM contacts c
      LEFT JOIN interactions i ON c.id = i.contact_id
      WHERE c.keep_in_touch_days > 0 AND c.deleted_at IS NULL
      GROUP BY c.id
      HAVING days_since > c.keep_in_touch_days
      ORDER BY (days_since - c.keep_in_touch_days) DESC
      LIMIT 10
    `).all()

    // Never contacted (no interactions at all)
    const neverContacted = db.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.company
      FROM contacts c
      LEFT JOIN interactions i ON c.id = i.contact_id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      HAVING COUNT(i.id) = 0
      LIMIT 10
    `).all()

    // Recent job changes
    const jobChanges = db.prepare(`
      SELECT i.contact_id, c.first_name, c.last_name, i.description, i.date
      FROM interactions i
      JOIN contacts c ON i.contact_id = c.id
      WHERE i.type = 'job_change' AND i.date >= ?
      ORDER BY i.date DESC
      LIMIT 5
    `).all(monthAgo)

    // Activity this week
    const weeklyActivity = db.prepare(`
      SELECT COUNT(*) as n FROM interactions WHERE date >= ?
    `).get(weekAgo) as { n: number }

    // New contacts this week
    const newContacts = db.prepare(`
      SELECT COUNT(*) as n FROM contacts WHERE created_at >= ? AND deleted_at IS NULL
    `).get(weekAgo) as { n: number }

    return {
      goingCold,
      neverContacted,
      jobChanges,
      weeklyInteractions: weeklyActivity.n,
      newContactsThisWeek: newContacts.n
    }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // --- Saved Views ---
  safeHandle('db:views:getAll', () => {
    return db.prepare('SELECT * FROM views ORDER BY sort_order ASC, name ASC').all()
  })

  safeHandle('db:views:create', (_event, view: { name: string; emoji: string; filter_json: string }) => {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM views').get() as { m: number }
    const stmt = db.prepare('INSERT INTO views (name, emoji, filter_json, sort_order) VALUES (?, ?, ?, ?)')
    const result = stmt.run(view.name, view.emoji || '', view.filter_json, maxOrder.m + 1)
    return result.lastInsertRowid
  })

  safeHandle('db:views:update', (_event, id: number, view: { name?: string; emoji?: string; filter_json?: string }) => {
    if (view.name !== undefined) db.prepare('UPDATE views SET name = ? WHERE id = ?').run(view.name, id)
    if (view.emoji !== undefined) db.prepare('UPDATE views SET emoji = ? WHERE id = ?').run(view.emoji, id)
    if (view.filter_json !== undefined) db.prepare('UPDATE views SET filter_json = ? WHERE id = ?').run(view.filter_json, id)
  })

  safeHandle('db:views:delete', (_event, id: number) => {
    db.prepare('DELETE FROM views WHERE id = ?').run(id)
  })

  // --- Favorites ---
  safeHandle('db:favorites:getAll', () => {
    const rows = db.prepare('SELECT * FROM favorites ORDER BY sort_order ASC').all() as {
      id: number; item_type: string; item_id: number; sort_order: number
    }[]

    // Enrich with names
    return rows.map(fav => {
      let label = ''
      let emoji = ''
      if (fav.item_type === 'contact') {
        const c = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(fav.item_id) as { first_name: string; last_name: string } | undefined
        label = c ? `${c.first_name} ${c.last_name}`.trim() : 'Unknown'
      } else if (fav.item_type === 'group') {
        const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(fav.item_id) as { name: string } | undefined
        label = g?.name || 'Unknown'
      } else if (fav.item_type === 'view') {
        const v = db.prepare('SELECT name, emoji FROM views WHERE id = ?').get(fav.item_id) as { name: string; emoji: string } | undefined
        label = v?.name || 'Unknown'
        emoji = v?.emoji || ''
      }
      return { ...fav, label, emoji }
    })
  })

  safeHandle('db:favorites:add', (_event, itemType: string, itemId: number) => {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM favorites').get() as { m: number }
    db.prepare('INSERT OR IGNORE INTO favorites (item_type, item_id, sort_order) VALUES (?, ?, ?)').run(itemType, itemId, maxOrder.m + 1)
  })

  safeHandle('db:favorites:remove', (_event, itemType: string, itemId: number) => {
    db.prepare('DELETE FROM favorites WHERE item_type = ? AND item_id = ?').run(itemType, itemId)
  })

  safeHandle('db:favorites:isFavorite', (_event, itemType: string, itemId: number) => {
    const row = db.prepare('SELECT id FROM favorites WHERE item_type = ? AND item_id = ?').get(itemType, itemId)
    return !!row
  })

  // --- Locations ---
  safeHandle('db:contacts:getLocationStats', () => {
    return db.prepare(`
      SELECT location, COUNT(*) as contact_count
      FROM contacts
      WHERE deleted_at IS NULL AND location != '' AND location IS NOT NULL
      GROUP BY location
      ORDER BY contact_count DESC
    `).all()
  })

  safeHandle('db:contacts:getByLocation', (_event, location: string) => {
    return db.prepare(`
      SELECT id, first_name, last_name, company, photo_url, location
      FROM contacts
      WHERE deleted_at IS NULL AND location = ?
      ORDER BY first_name, last_name
    `).all(location)
  })

  safeHandle('db:contacts:getWithoutLocation', () => {
    return db.prepare(`
      SELECT id, first_name, last_name, company, photo_url
      FROM contacts
      WHERE deleted_at IS NULL AND (location = '' OR location IS NULL)
      ORDER BY first_name, last_name
    `).all()
  })

  safeHandle('db:contacts:setLocation', (_event, id: number, location: string) => {
    db.prepare("UPDATE contacts SET location = ?, updated_at = datetime('now') WHERE id = ?").run(location, id)
  })

  // --- Onboarding ---
  safeHandle('db:onboarding:getProgress', () => {
    const rows = db.prepare('SELECT step_id, completed_at FROM onboarding_progress').all() as { step_id: string; completed_at: string }[]
    const map: Record<string, string> = {}
    for (const r of rows) map[r.step_id] = r.completed_at
    return map
  })

  safeHandle('db:onboarding:completeStep', (_event, stepId: string) => {
    db.prepare('INSERT OR IGNORE INTO onboarding_progress (step_id) VALUES (?)').run(stepId)
  })

  safeHandle('db:onboarding:resetProgress', () => {
    db.prepare('DELETE FROM onboarding_progress').run()
  })

  safeHandle('db:onboarding:checkStatus', () => {
    // Dynamic checks against real data
    const contactCount = (db.prepare('SELECT COUNT(*) as n FROM contacts WHERE deleted_at IS NULL').get() as { n: number }).n
    const interactionCount = (db.prepare('SELECT COUNT(*) as n FROM interactions').get() as { n: number }).n
    const groupCount = (db.prepare('SELECT COUNT(*) as n FROM groups').get() as { n: number }).n
    const kitCount = (db.prepare('SELECT COUNT(*) as n FROM contacts WHERE keep_in_touch_days > 0 AND deleted_at IS NULL').get() as { n: number }).n
    const groupWith10 = db.prepare(`
      SELECT g.id FROM groups g
      JOIN contact_groups cg ON g.id = cg.group_id
      JOIN contacts c ON cg.contact_id = c.id AND c.deleted_at IS NULL
      GROUP BY g.id HAVING COUNT(cg.contact_id) >= 10 LIMIT 1
    `).get()
    const noteCount = (db.prepare("SELECT COUNT(*) as n FROM interactions WHERE type = 'note'").get() as { n: number }).n
    const googleConnected = getSecretValue(db, 'google_refresh_token')
    const googleImported = db.prepare("SELECT value FROM settings WHERE key = 'google_contacts_last_import'").get()
    const hasImported = !!googleImported || contactCount >= 5

    return {
      contacts: contactCount,
      interactions: interactionCount,
      groups: groupCount,
      kitContacts: kitCount,
      hasGroupWith10: !!groupWith10,
      notes: noteCount,
      googleConnected: !!googleConnected,
      hasImported
    }
  })

  // --- Visualizations ---
  safeHandle('db:viz:groupsTree', () => {
    // Single query: fetch all group-contact pairs, then group in JS
    const rows = db.prepare(`
      SELECT g.id as group_id, g.name as group_name, g.color as group_color,
             c.id as contact_id, c.first_name, c.last_name, c.company, c.photo_url
      FROM groups g
      JOIN contact_groups cg ON g.id = cg.group_id
      JOIN contacts c ON cg.contact_id = c.id AND c.deleted_at IS NULL
      ORDER BY g.name, c.first_name, c.last_name
    `).all() as { group_id: number; group_name: string; group_color: string; contact_id: number; first_name: string; last_name: string; company: string; photo_url: string }[]

    const groupMap = new Map<number, { id: number; name: string; color: string; contact_count: number; contacts: { id: number; first_name: string; last_name: string; company: string; photo_url: string }[] }>()
    for (const r of rows) {
      let g = groupMap.get(r.group_id)
      if (!g) {
        g = { id: r.group_id, name: r.group_name, color: r.group_color, contact_count: 0, contacts: [] }
        groupMap.set(r.group_id, g)
      }
      g.contacts.push({ id: r.contact_id, first_name: r.first_name, last_name: r.last_name, company: r.company, photo_url: r.photo_url })
      g.contact_count++
    }

    return Array.from(groupMap.values())
      .filter(g => g.contact_count > 0 && g.contact_count <= 250)
      .sort((a, b) => b.contact_count - a.contact_count)
  })

  safeHandle('db:viz:relatedWeb', () => {
    // All contacts with interaction counts + primary group
    const contacts = db.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.company, c.photo_url,
             COUNT(DISTINCT i.id) as interaction_count,
             g.color as group_color, g.name as group_name
      FROM contacts c
      LEFT JOIN interactions i ON c.id = i.contact_id
      LEFT JOIN contact_groups cg ON c.id = cg.contact_id
      LEFT JOIN groups g ON cg.group_id = g.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY interaction_count DESC
      LIMIT 200
    `).all()

    // Relationships
    const relationships = db.prepare(`
      SELECT cr.contact_id_1, cr.contact_id_2, cr.relationship_type
      FROM contact_relationships cr
    `).all()

    return { contacts, relationships }
  })
}

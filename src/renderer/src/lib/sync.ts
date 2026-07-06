import { getSupabase } from './supabase'
import { encryptRow, decryptRow } from './crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Tables that support full CRUD sync (have updated_at for conflict detection)
const ENTITY_TABLES = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates'] as const
type EntityTable = typeof ENTITY_TABLES[number]

// Tables with foreign keys that need ID mapping during sync
const FK_MAP: Record<string, { table: string; column: string }[]> = {
  interactions: [{ table: 'contacts', column: 'contact_id' }],
  reminders: [{ table: 'contacts', column: 'contact_id' }],
  custom_fields: [{ table: 'contacts', column: 'contact_id' }],
  important_dates: [{ table: 'contacts', column: 'contact_id' }],
  contact_tags: [{ table: 'contacts', column: 'contact_id' }, { table: 'tags', column: 'tag_id' }],
  contact_groups: [{ table: 'contacts', column: 'contact_id' }, { table: 'groups', column: 'group_id' }]
}

// Columns to exclude from cloud push (local-only metadata)
const LOCAL_ONLY_COLS = new Set(['id', 'cloud_id', 'synced_at', 'deleted_at'])

// Columns that are per-table data (not metadata) — used to build upsert payloads
const TABLE_COLS: Record<EntityTable, string[]> = {
  contacts: ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'photo_url', 'notes', 'how_we_met', 'birthday', 'keep_in_touch_days'],
  tags: ['name', 'color'],
  groups: ['name', 'description', 'color'],
  interactions: ['contact_id', 'type', 'description', 'date'],
  reminders: ['contact_id', 'message', 'due_date', 'completed', 'repeat'],
  custom_fields: ['contact_id', 'field_name', 'field_value'],
  important_dates: ['contact_id', 'label', 'date']
}

interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
  errors: string[]
}

let syncing = false
let syncInterval: ReturnType<typeof setInterval> | null = null

export function startSyncLoop(): void {
  if (syncInterval) return
  // Sync every 60 seconds
  syncInterval = setInterval(() => {
    syncAll().catch(console.error)
  }, 60000)
  // Initial sync after short delay
  setTimeout(() => syncAll().catch(console.error), 3000)
}

export function stopSyncLoop(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

export async function syncAll(): Promise<SyncResult> {
  if (syncing) return { pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] }
  syncing = true

  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: [] }

  try {
    const supabase = getSupabase()
    if (!supabase) {
      result.errors.push('Cloud not configured')
      return result
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      result.errors.push('Not authenticated')
      return result
    }

    // Build ID maps for all tables first (needed for FK resolution)
    const idMaps = new Map<string, Map<number, string>>() // localId → cloudId
    const reverseIdMaps = new Map<string, Map<string, number>>() // cloudId → localId

    for (const table of ENTITY_TABLES) {
      const rows = await window.api.sync.getIdMap(table) as { id: number; cloud_id: string }[]
      const forward = new Map<number, string>()
      const reverse = new Map<string, number>()
      for (const r of rows) {
        forward.set(r.id, r.cloud_id)
        reverse.set(r.cloud_id, r.id)
      }
      idMaps.set(table, forward)
      reverseIdMaps.set(table, reverse)
    }

    // Sync order matters: parent tables first, then child tables, then junctions
    const syncOrder: EntityTable[] = ['contacts', 'tags', 'groups', 'interactions', 'reminders', 'custom_fields', 'important_dates']

    // --- PUSH PHASE ---
    for (const table of syncOrder) {
      const pushResult = await pushTable(supabase, user.id, table, idMaps)
      result.pushed += pushResult.pushed
      result.conflicts += pushResult.conflicts
      result.errors.push(...pushResult.errors)
    }

    // Push junction tables
    await pushJunctionTable(supabase, user.id, 'contact_tags', 'contact_id', 'tag_id', idMaps)
    await pushJunctionTable(supabase, user.id, 'contact_groups', 'contact_id', 'group_id', idMaps)

    // Push deletions
    for (const table of syncOrder) {
      const delResult = await pushDeletions(supabase, table)
      result.pushed += delResult
    }

    // --- PULL PHASE ---
    // Refresh ID maps after push (new cloud_ids assigned)
    for (const table of ENTITY_TABLES) {
      const rows = await window.api.sync.getIdMap(table) as { id: number; cloud_id: string }[]
      const forward = new Map<number, string>()
      const reverse = new Map<string, number>()
      for (const r of rows) {
        forward.set(r.id, r.cloud_id)
        reverse.set(r.cloud_id, r.id)
      }
      idMaps.set(table, forward)
      reverseIdMaps.set(table, reverse)
    }

    for (const table of syncOrder) {
      const pullResult = await pullTable(supabase, user.id, table, reverseIdMaps)
      result.pulled += pullResult.pulled
      result.conflicts += pullResult.conflicts
      result.errors.push(...pullResult.errors)
    }

  } catch (err) {
    result.errors.push(String(err))
  } finally {
    syncing = false
  }

  return result
}

async function pushTable(
  supabase: SupabaseClient,
  userId: string,
  table: EntityTable,
  idMaps: Map<string, Map<number, string>>
): Promise<{ pushed: number; conflicts: number; errors: string[] }> {
  const result = { pushed: 0, conflicts: 0, errors: [] as string[] }

  const pending = await window.api.sync.getPendingChanges(table) as Record<string, unknown>[]
  if (pending.length === 0) return result

  for (const row of pending) {
    try {
      // Build cloud payload (exclude local-only columns)
      const payload: Record<string, unknown> = { user_id: userId }
      for (const col of TABLE_COLS[table]) {
        let value = row[col]

        // Resolve foreign key: local integer ID → cloud UUID
        const fks = FK_MAP[table]
        if (fks) {
          const fk = fks.find(f => f.column === col)
          if (fk && typeof value === 'number') {
            const cloudId = idMaps.get(fk.table)?.get(value)
            if (!cloudId) {
              // FK target not yet synced — skip this row for now
              continue
            }
            value = cloudId
          }
        }

        payload[col] = value
      }

      // Encrypt sensitive fields before pushing to cloud
      const encryptedPayload = await encryptRow(table, payload)
      Object.assign(payload, encryptedPayload)

      const cloudId = row.cloud_id as string | null

      if (cloudId) {
        // Update existing cloud row — check for conflicts first
        const { data: cloudRow } = await supabase.from(table).select('updated_at').eq('id', cloudId).single()

        if (cloudRow) {
          const cloudUpdated = new Date(cloudRow.updated_at).getTime()
          const localUpdated = new Date(String(row.updated_at || row.created_at)).getTime()

          if (cloudUpdated > localUpdated) {
            // Cloud is newer — conflict, cloud wins (will be pulled later)
            result.conflicts++
            continue
          }
        }

        // Local is newer or same — push update
        const { error } = await supabase.from(table).update(payload).eq('id', cloudId)
        if (error) {
          result.errors.push(`Push ${table} ${row.id}: ${error.message}`)
          continue
        }
      } else {
        // New row — insert to cloud
        const { data, error } = await supabase.from(table).insert(payload).select('id').single()
        if (error) {
          result.errors.push(`Insert ${table} ${row.id}: ${error.message}`)
          continue
        }
        // Save cloud_id back to local
        await window.api.sync.markSynced(table, row.id as number, data.id)
        idMaps.get(table)?.set(row.id as number, data.id)
      }

      // Mark as synced
      if (cloudId) {
        await window.api.sync.markSynced(table, row.id as number, cloudId)
      }

      result.pushed++
    } catch (err) {
      result.errors.push(`Push ${table} ${row.id}: ${String(err)}`)
    }
  }

  return result
}

async function pushJunctionTable(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  col1: string,
  col2: string,
  idMaps: Map<string, Map<number, string>>
): Promise<void> {
  const pending = await window.api.sync.getPendingJunctionChanges(table) as Record<string, unknown>[]
  if (pending.length === 0) return

  const fks = FK_MAP[table]
  if (!fks || fks.length !== 2) return

  for (const row of pending) {
    try {
      const fk1 = fks.find(f => f.column === col1)!
      const fk2 = fks.find(f => f.column === col2)!

      const cloudVal1 = idMaps.get(fk1.table)?.get(row[col1] as number)
      const cloudVal2 = idMaps.get(fk2.table)?.get(row[col2] as number)

      if (!cloudVal1 || !cloudVal2) continue // FK targets not synced yet

      const payload = {
        user_id: userId,
        [col1]: cloudVal1,
        [col2]: cloudVal2
      }

      const { data, error } = await supabase.from(table).upsert(payload, { onConflict: `${col1},${col2}` }).select('id').single()
      if (error) continue

      await window.api.sync.markJunctionSynced(table, col1, row[col1] as number, col2, row[col2] as number, data.id)
    } catch {
      // Skip junction errors silently
    }
  }
}

async function pushDeletions(supabase: SupabaseClient, table: EntityTable): Promise<number> {
  const deleted = await window.api.sync.getDeletedRows(table) as { id: number; cloud_id: string }[]
  let count = 0

  for (const row of deleted) {
    try {
      const { error } = await supabase.from(table).delete().eq('id', row.cloud_id)
      if (!error) {
        await window.api.sync.purgeDeleted(table, row.id)
        count++
      }
    } catch {
      // Skip deletion errors
    }
  }

  return count
}

async function pullTable(
  supabase: SupabaseClient,
  userId: string,
  table: EntityTable,
  reverseIdMaps: Map<string, Map<string, number>>
): Promise<{ pulled: number; conflicts: number; errors: string[] }> {
  const result = { pulled: 0, conflicts: 0, errors: [] as string[] }

  try {
    // Get sync log for this table
    const syncLogs = await window.api.sync.getLog() as { table_name: string; last_pulled_at: string | null }[]
    const lastPull = syncLogs.find(l => l.table_name === table)?.last_pulled_at

    // Pull rows updated since last pull
    let query = supabase.from(table).select('*').eq('user_id', userId).order('updated_at', { ascending: true })
    if (lastPull) {
      query = query.gt('updated_at', lastPull)
    }

    const { data: cloudRows, error } = await query
    if (error) {
      result.errors.push(`Pull ${table}: ${error.message}`)
      return result
    }
    if (!cloudRows || cloudRows.length === 0) return result

    let latestTimestamp = lastPull || ''

    for (const cloudRow of cloudRows) {
      try {
        const cloudId = cloudRow.id as string

        // Check if we already have this row locally
        const existingLocalId = reverseIdMaps.get(table)?.get(cloudId)

        // Build local data payload (resolve cloud FK UUIDs back to local integer IDs)
        const localData: Record<string, unknown> = {}
        for (const col of TABLE_COLS[table]) {
          let value = cloudRow[col]

          // Reverse-resolve FK: cloud UUID → local integer ID
          const fks = FK_MAP[table]
          if (fks) {
            const fk = fks.find(f => f.column === col)
            if (fk && typeof value === 'string') {
              const localId = reverseIdMaps.get(fk.table)?.get(value)
              if (!localId) continue // FK target not pulled yet — skip
              value = localId
            }
          }

          localData[col] = value
        }

        // Decrypt sensitive fields after pulling from cloud
        const decryptedData = await decryptRow(table, localData)
        Object.assign(localData, decryptedData)

        // Also sync created_at if available
        if (cloudRow.created_at) {
          localData.created_at = new Date(cloudRow.created_at).toISOString().replace('T', ' ').split('.')[0]
        }
        if (cloudRow.updated_at) {
          localData.updated_at = new Date(cloudRow.updated_at).toISOString().replace('T', ' ').split('.')[0]
        }

        // Upsert into local DB
        const localId = await window.api.sync.upsertFromCloud(table, cloudId, localData) as number
        if (localId && !existingLocalId) {
          reverseIdMaps.get(table)?.set(cloudId, localId)
        }

        result.pulled++

        // Track latest timestamp
        const ts = cloudRow.updated_at as string
        if (ts > latestTimestamp) latestTimestamp = ts
      } catch (err) {
        result.errors.push(`Pull ${table} row: ${String(err)}`)
      }
    }

    // Update sync log
    if (latestTimestamp) {
      await window.api.sync.updateLog(table, 'last_pulled_at', latestTimestamp)
    }
  } catch (err) {
    result.errors.push(`Pull ${table}: ${String(err)}`)
  }

  return result
}

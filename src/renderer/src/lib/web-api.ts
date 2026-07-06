// Web-compatible implementation of window.api
// Replaces Electron IPC calls with Supabase client queries
// Used when running as a standalone web app (non-Electron)

import { getSupabase } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

function sb(): SupabaseClient {
  const client = getSupabase()
  if (!client) throw new Error('Supabase not configured')
  return client
}

async function getUserId(): Promise<string> {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

// Helper to get access token for Edge Function calls
async function getAccessToken(): Promise<string> {
  const { data: { session } } = await sb().auth.getSession()
  return session?.access_token || ''
}

function downloadFile(content: string, filename: string, type = 'text/csv') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function unsupported(feature: string) {
  console.warn(`[Web] ${feature} is not available in the web version`)
  return null
}

export function createWebApi() {
  return {
    // --- Contacts ---
    contacts: {
      getAll: async () => {
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null).order('first_name').order('last_name')
        return data || []
      },
      getAllWithTags: async () => {
        const { data: contacts } = await sb().from('contacts').select('*, contact_tags(tag_id, tags(id, name, color))').is('deleted_at', null).order('first_name')
        return (contacts || []).map((c: Record<string, unknown>) => ({
          ...c,
          tags: ((c.contact_tags as Array<{ tags: Record<string, unknown> }>) || []).map(ct => ct.tags).filter(Boolean)
        }))
      },
      getById: async (id: number | string) => {
        const { data } = await sb().from('contacts').select('*').eq('id', id).single()
        return data
      },
      create: async (contact: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('contacts').insert({ ...contact, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, contact: Record<string, unknown>) => {
        await sb().from('contacts').update(contact).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
        return { success: true }
      },
      count: async () => {
        const { count } = await sb().from('contacts').select('*', { count: 'exact', head: true }).is('deleted_at', null)
        return count || 0
      },
      countThisMonth: async () => {
        const start = new Date()
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        const { count } = await sb().from('contacts').select('*', { count: 'exact', head: true })
          .is('deleted_at', null).gte('created_at', start.toISOString())
        return count || 0
      },
      getUpcomingBirthdays: async (days: number) => {
        // Fetch all contacts with birthdays, filter client-side for upcoming
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null).neq('birthday', '')
        if (!data) return []
        const now = new Date()
        return data.filter((c: Record<string, unknown>) => {
          if (!c.birthday) return false
          const bd = new Date(c.birthday as string)
          const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate())
          if (thisYear < now) thisYear.setFullYear(thisYear.getFullYear() + 1)
          const diff = (thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          return diff <= days
        })
      },
      getDueForContact: async () => {
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null).gt('keep_in_touch_days', 0)
        return data || []
      },
      selectPhoto: () => unsupported('Photo file picker'),
      savePhoto: async (_id: number | string, _sourcePath: string) => unsupported('Photo save'),
      getUncategorized: async (limit: number) => {
        // Contacts with no tags and no groups
        const { data: contacts } = await sb().from('contacts').select('*, contact_tags(tag_id), contact_groups(group_id)')
          .is('deleted_at', null).limit(limit)
        return (contacts || []).filter((c: Record<string, unknown>) =>
          ((c.contact_tags as unknown[]) || []).length === 0 && ((c.contact_groups as unknown[]) || []).length === 0
        )
      },
      countUncategorized: async () => {
        const contacts = await createWebApi().contacts.getUncategorized(10000)
        return contacts?.length || 0
      },
      getLocationStats: async () => {
        const { data } = await sb().from('contacts').select('location').is('deleted_at', null).neq('location', '')
        const stats: Record<string, number> = {}
        for (const c of data || []) {
          const loc = (c as Record<string, string>).location
          stats[loc] = (stats[loc] || 0) + 1
        }
        return Object.entries(stats).map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count)
      },
      getByLocation: async (location: string) => {
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null).eq('location', location)
        return data || []
      },
      getWithoutLocation: async () => {
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null)
          .or('location.is.null,location.eq.')
        return data || []
      },
      setLocation: async (id: number | string, location: string) => {
        await sb().from('contacts').update({ location }).eq('id', id)
        return { success: true }
      },
      setKeepInTouch: async (id: number | string, days: number) => {
        await sb().from('contacts').update({ keep_in_touch_days: days }).eq('id', id)
        return { success: true }
      },
      archive: async (id: number | string) => {
        await sb().from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
        return { success: true }
      },
      bulkSetFrequency: async (ids: (number | string)[], days: number) => {
        await sb().from('contacts').update({ keep_in_touch_days: days }).in('id', ids)
        return { success: true }
      },
      bulkAddTag: async (ids: (number | string)[], tagId: number | string) => {
        const userId = await getUserId()
        const rows = ids.map(id => ({ contact_id: id, tag_id: tagId, user_id: userId }))
        await sb().from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id' })
        return { success: true }
      },
      bulkAddGroup: async (ids: (number | string)[], groupId: number | string) => {
        const userId = await getUserId()
        const rows = ids.map(id => ({ contact_id: id, group_id: groupId, user_id: userId }))
        await sb().from('contact_groups').upsert(rows, { onConflict: 'contact_id,group_id' })
        return { success: true }
      },
      bulkArchive: async (ids: (number | string)[]) => {
        await sb().from('contacts').update({ deleted_at: new Date().toISOString() }).in('id', ids)
        return { success: true }
      },
      bulkDelete: async (ids: (number | string)[]) => {
        await sb().from('contacts').update({ deleted_at: new Date().toISOString() }).in('id', ids)
        return { success: true }
      },
      findDuplicates: async () => {
        const { data: contacts } = await sb().from('contacts').select('*').is('deleted_at', null).order('first_name')
        if (!contacts || contacts.length < 2) return []
        const duplicates: { contact1: Record<string, unknown>; contact2: Record<string, unknown>; matchType: string; score: number }[] = []
        const seenPairs = new Set<string>()
        function pairKey(a: string, b: string) { return a < b ? `${a}:${b}` : `${b}:${a}` }
        // Email match
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
              const key = pairKey(String(group[i].id), String(group[j].id))
              if (!seenPairs.has(key)) {
                seenPairs.add(key)
                duplicates.push({ contact1: group[i], contact2: group[j], matchType: 'email', score: 1.0 })
              }
            }
          }
        }
        return duplicates
      },
      merge: async (keepId: number | string, mergeId: number | string) => {
        // Fill empty fields from merge contact
        const { data: keep } = await sb().from('contacts').select('*').eq('id', keepId).single()
        const { data: mergeContact } = await sb().from('contacts').select('*').eq('id', mergeId).single()
        if (keep && mergeContact) {
          const fillFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url',
            'photo_url', 'notes', 'how_we_met', 'birthday', 'location', 'website', 'twitter_url',
            'facebook_url', 'instagram_url', 'address', 'education']
          const updates: Record<string, unknown> = {}
          for (const field of fillFields) {
            if (!keep[field] && mergeContact[field]) updates[field] = mergeContact[field]
          }
          if (Object.keys(updates).length > 0) {
            await sb().from('contacts').update(updates).eq('id', keepId)
          }
        }
        // Move interactions, reminders, custom_fields, important_dates
        await sb().from('interactions').update({ contact_id: keepId }).eq('contact_id', mergeId)
        await sb().from('reminders').update({ contact_id: keepId }).eq('contact_id', mergeId)
        await sb().from('custom_fields').update({ contact_id: keepId }).eq('contact_id', mergeId)
        await sb().from('important_dates').update({ contact_id: keepId }).eq('contact_id', mergeId)
        // Soft-delete merge contact
        await sb().from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', mergeId)
        return { success: true }
      }
    },

    // --- Tags ---
    tags: {
      getAll: async () => {
        const { data } = await sb().from('tags').select('*').order('name')
        return data || []
      },
      getAllWithCounts: async () => {
        const { data } = await sb().from('tags').select('*, contact_tags(count)').order('name')
        return (data || []).map((t: Record<string, unknown>) => ({
          ...t,
          contact_count: ((t.contact_tags as Array<{ count: number }>) || [{ count: 0 }])[0]?.count || 0
        }))
      },
      create: async (tag: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('tags').insert({ ...tag, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, tag: Record<string, unknown>) => {
        await sb().from('tags').update(tag).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('tags').delete().eq('id', id)
        return { success: true }
      },
      getContacts: async (tagId: number | string) => {
        const { data } = await sb().from('contact_tags').select('contacts(*)').eq('tag_id', tagId)
        return (data || []).map((ct: Record<string, unknown>) => ct.contacts).filter(Boolean)
      }
    },

    // --- Contact Tags ---
    contactTags: {
      add: async (contactId: number | string, tagId: number | string) => {
        const userId = await getUserId()
        await sb().from('contact_tags').insert({ contact_id: contactId, tag_id: tagId, user_id: userId })
        return { success: true }
      },
      remove: async (contactId: number | string, tagId: number | string) => {
        await sb().from('contact_tags').delete().eq('contact_id', contactId).eq('tag_id', tagId)
        return { success: true }
      },
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('contact_tags').select('tags(*)').eq('contact_id', contactId)
        return (data || []).map((ct: Record<string, unknown>) => ct.tags).filter(Boolean)
      }
    },

    // --- Groups ---
    groups: {
      getAll: async () => {
        const { data } = await sb().from('groups').select('*').order('name')
        return data || []
      },
      getAllWithCounts: async () => {
        const { data } = await sb().from('groups').select('*, contact_groups(count)').order('name')
        return (data || []).map((g: Record<string, unknown>) => ({
          ...g,
          contact_count: ((g.contact_groups as Array<{ count: number }>) || [{ count: 0 }])[0]?.count || 0
        }))
      },
      create: async (group: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('groups').insert({ ...group, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, group: Record<string, unknown>) => {
        await sb().from('groups').update(group).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('groups').delete().eq('id', id)
        return { success: true }
      },
      getContacts: async (groupId: number | string) => {
        const { data } = await sb().from('contact_groups').select('contacts(*)').eq('group_id', groupId)
        return (data || []).map((cg: Record<string, unknown>) => cg.contacts).filter(Boolean)
      }
    },

    // --- Contact Groups ---
    contactGroups: {
      add: async (contactId: number | string, groupId: number | string) => {
        const userId = await getUserId()
        await sb().from('contact_groups').insert({ contact_id: contactId, group_id: groupId, user_id: userId })
        return { success: true }
      },
      remove: async (contactId: number | string, groupId: number | string) => {
        await sb().from('contact_groups').delete().eq('contact_id', contactId).eq('group_id', groupId)
        return { success: true }
      },
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('contact_groups').select('groups(*)').eq('contact_id', contactId)
        return (data || []).map((cg: Record<string, unknown>) => cg.groups).filter(Boolean)
      }
    },

    // --- Interactions ---
    interactions: {
      getAll: async () => {
        const { data } = await sb().from('interactions').select('*, contacts(first_name, last_name)').order('date', { ascending: false })
        return (data || []).map((i: Record<string, unknown>) => {
          const c = i.contacts as Record<string, string> | null
          return { ...i, contact_name: c ? `${c.first_name} ${c.last_name}`.trim() : '' }
        })
      },
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('interactions').select('*').eq('contact_id', contactId).order('date', { ascending: false })
        return data || []
      },
      create: async (interaction: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('interactions').insert({ ...interaction, user_id: userId }).select().single()
        return data
      },
      delete: async (id: number | string) => {
        await sb().from('interactions').delete().eq('id', id)
        return { success: true }
      },
      getLastForContacts: async () => {
        // Get most recent interaction per contact
        const { data } = await sb().from('interactions').select('contact_id, date').order('date', { ascending: false })
        const map: Record<string, string> = {}
        for (const i of data || []) {
          const rec = i as Record<string, string>
          if (!map[rec.contact_id]) map[rec.contact_id] = rec.date
        }
        return Object.entries(map).map(([contact_id, last_date]) => ({ contact_id, last_date }))
      },
      countThisWeek: async () => {
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const { count } = await sb().from('interactions').select('*', { count: 'exact', head: true })
          .gte('date', weekAgo.toISOString().split('T')[0])
        return count || 0
      },
      getRecentContacted: async (limit: number) => {
        const { data } = await sb().from('interactions').select('contact_id, date, contacts(first_name, last_name, photo_url)')
          .order('date', { ascending: false }).limit(limit * 3) // overfetch to deduplicate
        const seen = new Set<string>()
        const result: unknown[] = []
        for (const i of data || []) {
          const rec = i as Record<string, unknown>
          const cid = rec.contact_id as string
          if (seen.has(cid)) continue
          seen.add(cid)
          result.push(rec)
          if (result.length >= limit) break
        }
        return result
      }
    },

    // --- Reminders ---
    reminders: {
      getAll: async () => {
        const { data } = await sb().from('reminders').select('*, contacts(first_name, last_name)').order('due_date')
        return (data || []).map((r: Record<string, unknown>) => {
          const c = r.contacts as Record<string, string> | null
          return { ...r, contact_name: c ? `${c.first_name} ${c.last_name}`.trim() : '' }
        })
      },
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('reminders').select('*').eq('contact_id', contactId).order('due_date')
        return data || []
      },
      create: async (reminder: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('reminders').insert({ ...reminder, user_id: userId }).select().single()
        return data
      },
      toggleComplete: async (id: number | string) => {
        const { data: existing } = await sb().from('reminders').select('completed').eq('id', id).single()
        if (existing) {
          await sb().from('reminders').update({ completed: !existing.completed }).eq('id', id)
        }
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('reminders').delete().eq('id', id)
        return { success: true }
      },
      countPending: async () => {
        const { count } = await sb().from('reminders').select('*', { count: 'exact', head: true }).eq('completed', false)
        return count || 0
      },
      getOverdueCount: async () => {
        const today = new Date().toISOString().split('T')[0]
        const { count } = await sb().from('reminders').select('*', { count: 'exact', head: true })
          .eq('completed', false).lt('due_date', today)
        return count || 0
      },
      getDueToday: async () => {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await sb().from('reminders').select('*, contacts(first_name, last_name)')
          .eq('completed', false).eq('due_date', today)
        return data || []
      }
    },

    // --- Settings ---
    settings: {
      get: async (key: string) => {
        const userId = await getUserId()
        const { data } = await sb().from('settings').select('value').eq('user_id', userId).eq('key', key).single()
        return data?.value ?? null
      },
      set: async (key: string, value: string) => {
        const userId = await getUserId()
        await sb().from('settings').upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' })
        return { success: true }
      },
      getAll: async () => {
        const userId = await getUserId()
        const { data } = await sb().from('settings').select('key, value').eq('user_id', userId)
        const result: Record<string, string> = {}
        for (const r of data || []) result[(r as Record<string, string>).key] = (r as Record<string, string>).value
        return result
      }
    },

    // --- Custom Fields ---
    customFields: {
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('custom_fields').select('*').eq('contact_id', contactId)
        return data || []
      },
      create: async (field: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('custom_fields').insert({ ...field, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, field: Record<string, unknown>) => {
        await sb().from('custom_fields').update(field).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('custom_fields').delete().eq('id', id)
        return { success: true }
      }
    },

    // --- Important Dates ---
    importantDates: {
      getForContact: async (contactId: number | string) => {
        const { data } = await sb().from('important_dates').select('*').eq('contact_id', contactId)
        return data || []
      },
      create: async (date: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('important_dates').insert({ ...date, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, date: Record<string, unknown>) => {
        await sb().from('important_dates').update(date).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('important_dates').delete().eq('id', id)
        return { success: true }
      }
    },

    // --- Relationships ---
    relationships: {
      getForContact: async (contactId: number | string) => {
        const { data: r1 } = await sb().from('contact_relationships').select('*, contacts!contact_relationships_contact_id_2_fkey(id, first_name, last_name)')
          .eq('contact_id_1', contactId)
        const { data: r2 } = await sb().from('contact_relationships').select('*, contacts!contact_relationships_contact_id_1_fkey(id, first_name, last_name)')
          .eq('contact_id_2', contactId)
        return [...(r1 || []), ...(r2 || [])]
      },
      create: async (rel: Record<string, unknown>) => {
        const userId = await getUserId()
        const { data } = await sb().from('contact_relationships').insert({ ...rel, user_id: userId }).select().single()
        return data
      },
      delete: async (id: number | string) => {
        await sb().from('contact_relationships').delete().eq('id', id)
        return { success: true }
      }
    },

    // --- Attachments ---
    attachments: {
      getForInteraction: async (_interactionId: number | string) => {
        return []
      },
      add: async () => unsupported('File attachments (desktop only)'),
      delete: async () => unsupported('File attachment delete (desktop only)'),
      selectFile: async () => unsupported('File picker (desktop only)'),
      openFile: async () => unsupported('Open file (desktop only)')
    },

    // --- Copilot Conversations ---
    copilot: {
      getAll: async () => {
        const userId = await getUserId()
        const { data } = await sb().from('copilot_conversations').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
        return data || []
      },
      save: async (id: number | string | null, title: string, messagesJson: string) => {
        const userId = await getUserId()
        if (id) {
          await sb().from('copilot_conversations').update({ title, messages_json: messagesJson, updated_at: new Date().toISOString() }).eq('id', id)
          return id
        } else {
          const { data } = await sb().from('copilot_conversations').insert({ user_id: userId, title, messages_json: messagesJson }).select().single()
          return data?.id
        }
      },
      delete: async (id: number | string) => {
        await sb().from('copilot_conversations').delete().eq('id', id)
        return { success: true }
      }
    },

    // --- Pipeline ---
    pipeline: {
      getData: async () => {
        const { data: contacts } = await sb().from('contacts').select('id, first_name, last_name, company, photo_url, contact_tags(tags(id, name, color))')
          .is('deleted_at', null)
        const { data: interactions } = await sb().from('interactions').select('contact_id, date').order('date', { ascending: false })

        // Build last interaction map
        const lastMap: Record<string, string> = {}
        for (const i of interactions || []) {
          const rec = i as Record<string, string>
          if (!lastMap[rec.contact_id]) lastMap[rec.contact_id] = rec.date
        }

        return (contacts || []).map((c: Record<string, unknown>) => ({
          ...c,
          last_interaction: lastMap[c.id as string] || null,
          tags: ((c.contact_tags as Array<{ tags: unknown }>) || []).map(ct => ct.tags).filter(Boolean).slice(0, 2)
        }))
      }
    },

    // --- Visualizations ---
    viz: {
      groupsTree: async () => {
        const { data: groups } = await sb().from('groups').select('id, name, color, contact_groups(contacts(id, first_name, last_name))')
        return (groups || []).map((g: Record<string, unknown>) => ({
          ...g,
          contacts: ((g.contact_groups as Array<{ contacts: unknown }>) || []).map(cg => cg.contacts).filter(Boolean)
        }))
      },
      relatedWeb: async () => {
        const { data: contacts } = await sb().from('contacts').select('id, first_name, last_name, photo_url, contact_groups(group_id)')
          .is('deleted_at', null).limit(200)
        const { data: rels } = await sb().from('contact_relationships').select('contact_id_1, contact_id_2, relationship_type')
        const { data: interactions } = await sb().from('interactions').select('contact_id')

        // Count interactions per contact
        const interactionCounts: Record<string, number> = {}
        for (const i of interactions || []) {
          const cid = (i as Record<string, string>).contact_id
          interactionCounts[cid] = (interactionCounts[cid] || 0) + 1
        }

        return {
          contacts: (contacts || []).map((c: Record<string, unknown>) => ({
            ...c,
            interaction_count: interactionCounts[c.id as string] || 0,
            group_id: ((c.contact_groups as Array<{ group_id: string }>) || [])[0]?.group_id || null
          })),
          relationships: rels || []
        }
      }
    },

    // --- Dashboard ---
    dashboard: {
      getActivityFeed: async (limit: number) => {
        const { data } = await sb().from('interactions').select('*, contacts(first_name, last_name)')
          .order('date', { ascending: false }).limit(limit)
        return (data || []).map((i: Record<string, unknown>) => {
          const c = i.contacts as Record<string, string> | null
          return { ...i, contact_name: c ? `${c.first_name} ${c.last_name}`.trim() : '' }
        })
      },
      getKeepInTouchDue: async () => {
        const { data: contacts } = await sb().from('contacts').select('*').is('deleted_at', null).gt('keep_in_touch_days', 0)
        const { data: interactions } = await sb().from('interactions').select('contact_id, date').order('date', { ascending: false })

        const lastMap: Record<string, string> = {}
        for (const i of interactions || []) {
          const rec = i as Record<string, string>
          if (!lastMap[rec.contact_id]) lastMap[rec.contact_id] = rec.date
        }

        const now = Date.now()
        return (contacts || []).filter((c: Record<string, unknown>) => {
          const last = lastMap[c.id as string]
          if (!last) return true
          const elapsed = (now - new Date(last).getTime()) / (1000 * 60 * 60 * 24)
          return elapsed > (c.keep_in_touch_days as number)
        }).map((c: Record<string, unknown>) => ({
          ...c,
          last_interaction: lastMap[c.id as string] || null,
          days_overdue: lastMap[c.id as string]
            ? Math.floor((now - new Date(lastMap[c.id as string]).getTime()) / (1000 * 60 * 60 * 24)) - (c.keep_in_touch_days as number)
            : 999
        }))
      },
      getUpcomingBirthdays: async (days: number) => {
        return createWebApi().contacts.getUpcomingBirthdays(days)
      },
      getRelationshipHealth: async () => {
        const pipelineData = await createWebApi().pipeline.getData()
        const now = Date.now()
        const counts = { fresh: 0, good: 0, stale: 0, cold: 0, none: 0 }
        for (const c of pipelineData as Array<{ last_interaction: string | null }>) {
          if (!c.last_interaction) { counts.none++; continue }
          const days = (now - new Date(c.last_interaction).getTime()) / (1000 * 60 * 60 * 24)
          if (days <= 7) counts.fresh++
          else if (days <= 30) counts.good++
          else if (days <= 90) counts.stale++
          else counts.cold++
        }
        return counts
      },
      getNetworkUpdates: async (limit: number) => {
        const { data } = await sb().from('interactions').select('*, contacts(first_name, last_name)')
          .eq('type', 'job_change').order('date', { ascending: false }).limit(limit)
        return (data || []).map((i: Record<string, unknown>) => {
          const c = i.contacts as Record<string, string> | null
          return { ...i, contact_name: c ? `${c.first_name} ${c.last_name}`.trim() : '' }
        })
      }
    },

    // --- Sync (not needed for web — data is already in Supabase) ---
    sync: {
      getPendingChanges: async () => [],
      getPendingJunctionChanges: async () => [],
      getDeletedRows: async () => [],
      markSynced: async () => ({ success: true }),
      markJunctionSynced: async () => ({ success: true }),
      purgeDeleted: async () => ({ success: true }),
      upsertFromCloud: async () => ({ success: true }),
      getLog: async () => ({}),
      updateLog: async () => ({ success: true }),
      getIdMap: async () => []
    },

    // --- App ---
    app: {
      getVersion: async () => 'web'
    },

    // --- Google (OAuth handled differently in browser) ---
    google: {
      setCredentials: async () => unsupported('Google credentials (use Settings)'),
      getStatus: async () => ({ connected: false, email: '' }),
      connect: async () => unsupported('Google connect (desktop only)'),
      disconnect: async () => ({ success: true }),
      getAccessToken: async () => null
    },

    // --- Microsoft ---
    microsoft: {
      setCredentials: async () => unsupported('Microsoft credentials'),
      getStatus: async () => ({ connected: false, email: '' }),
      connect: async () => unsupported('Microsoft connect (desktop only)'),
      disconnect: async () => ({ success: true }),
      getAccessToken: async () => null,
      syncCalendar: async () => unsupported('Calendar sync (desktop only)'),
      syncEmail: async () => unsupported('Email sync (desktop only)')
    },

    // --- AI (proxy through Supabase Edge Function) ---
    ai: {
      getStatus: async () => {
        const key = await createWebApi().settings.get('anthropic_api_key')
        return { configured: Boolean(key) }
      },
      setApiKey: async (key: string) => {
        await createWebApi().settings.set('anthropic_api_key', key)
        return { success: true }
      },
      removeApiKey: async () => {
        await createWebApi().settings.set('anthropic_api_key', '')
        return { success: true }
      },
      chat: async (messages: { role: string; content: string }[], systemPrompt: string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'chat', messages, systemPrompt })
        })
        return res.json()
      },
      networkQuery: async (question: string, history: { role: string; content: string }[]) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'networkQuery', question, history })
        })
        return res.json()
      },
      reconnectionMessages: async (contactId: number | string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'reconnectionMessages', contactId })
        })
        return res.json()
      },
      meetingBriefing: async (contactId: number | string, topic?: string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'meetingBriefing', contactId, topic })
        })
        return res.json()
      },
      summarizeNotes: async (text: string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'summarizeNotes', text })
        })
        return res.json()
      },
      suggestTags: async (contactId: number | string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'suggestTags', contactId })
        })
        return res.json()
      },
      weeklyDigest: async () => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/ai-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'weeklyDigest' })
        })
        return res.json()
      }
    },

    // --- Plan ---
    plan: {
      getStatus: async () => {
        // For web, check Supabase subscription directly
        try {
          const token = await getAccessToken()
          const url = import.meta.env.VITE_SUPABASE_URL
          const res = await fetch(`${url}/functions/v1/check-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          })
          const sub = await res.json()
          const contactCount = await createWebApi().contacts.count() as number

          return {
            planType: sub.planType || 'free',
            isPro: sub.isPro || false,
            trialActive: sub.trialActive || false,
            trialDaysLeft: sub.trialDaysLeft || 0,
            contactCount,
            contactLimit: sub.isPro ? Infinity : 50,
            aiActionsUsed: 0, // Tracked server-side for web
            aiActionsLimit: sub.isPro ? Infinity : 10,
            integrationsEnabled: sub.isPro || false
          }
        } catch {
          return {
            planType: 'free', isPro: false, trialActive: false, trialDaysLeft: 0,
            contactCount: 0, contactLimit: 50, aiActionsUsed: 0, aiActionsLimit: 10,
            integrationsEnabled: false
          }
        }
      },
      startTrial: async () => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        // Trigger trial via checkout with trial_period
        const res = await fetch(`${url}/functions/v1/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ plan: 'pro', billing: 'annual' })
        })
        const data = await res.json()
        if (data.url) window.open(data.url, '_blank')
        return { success: true }
      },
      setPlan: async () => ({ success: true }), // Managed by Stripe webhooks
      trackAiAction: async () => ({ count: 0 }) // Tracked server-side
    },

    // --- Stripe ---
    stripe: {
      createCheckout: async (plan: string, billing: string) => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ plan, billing })
        })
        const data = await res.json()
        if (data.url) window.open(data.url, '_blank')
        return data
      },
      checkSubscription: async () => {
        const token = await getAccessToken()
        const url = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${url}/functions/v1/check-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        })
        return res.json()
      },
      openPortal: async () => {
        const url = import.meta.env.VITE_SUPABASE_URL
        window.open(`${url}/functions/v1/customer-portal`, '_blank')
        return { success: true }
      }
    },

    // --- Onboarding ---
    onboarding: {
      getProgress: async () => {
        const userId = await getUserId()
        const { data } = await sb().from('onboarding_progress').select('step_id, completed_at').eq('user_id', userId)
        return data || []
      },
      completeStep: async (stepId: string) => {
        const userId = await getUserId()
        await sb().from('onboarding_progress').upsert({ user_id: userId, step_id: stepId, completed_at: new Date().toISOString() })
        return { success: true }
      },
      resetProgress: async () => {
        const userId = await getUserId()
        await sb().from('onboarding_progress').delete().eq('user_id', userId)
        return { success: true }
      },
      checkStatus: async () => {
        const progress = await createWebApi().onboarding.getProgress()
        return { completedSteps: (progress as unknown[]).length, totalSteps: 15 }
      }
    },

    // --- Views ---
    views: {
      getAll: async () => {
        const userId = await getUserId()
        const { data } = await sb().from('views').select('*').eq('user_id', userId).order('sort_order')
        return data || []
      },
      create: async (view: { name: string; emoji: string; filter_json: string }) => {
        const userId = await getUserId()
        const { data } = await sb().from('views').insert({ ...view, user_id: userId }).select().single()
        return data
      },
      update: async (id: number | string, view: Record<string, unknown>) => {
        await sb().from('views').update(view).eq('id', id)
        return { success: true }
      },
      delete: async (id: number | string) => {
        await sb().from('views').delete().eq('id', id)
        return { success: true }
      }
    },

    // --- Favorites ---
    favorites: {
      getAll: async () => {
        const userId = await getUserId()
        const { data } = await sb().from('favorites').select('*').eq('user_id', userId).order('sort_order')
        return data || []
      },
      add: async (itemType: string, itemId: number | string) => {
        const userId = await getUserId()
        await sb().from('favorites').insert({ user_id: userId, item_type: itemType, item_id: itemId })
        return { success: true }
      },
      remove: async (itemType: string, itemId: number | string) => {
        const userId = await getUserId()
        await sb().from('favorites').delete().eq('user_id', userId).eq('item_type', itemType).eq('item_id', itemId)
        return { success: true }
      },
      isFavorite: async (itemType: string, itemId: number | string) => {
        const userId = await getUserId()
        const { count } = await sb().from('favorites').select('*', { count: 'exact', head: true })
          .eq('user_id', userId).eq('item_type', itemType).eq('item_id', itemId)
        return (count || 0) > 0
      }
    },

    // --- Data (Export/Import) ---
    data: {
      stats: async () => {
        const contacts = await createWebApi().contacts.count()
        const { count: tags } = await sb().from('tags').select('*', { count: 'exact', head: true })
        const { count: groups } = await sb().from('groups').select('*', { count: 'exact', head: true })
        const { count: interactions } = await sb().from('interactions').select('*', { count: 'exact', head: true })
        const { count: reminders } = await sb().from('reminders').select('*', { count: 'exact', head: true })
        return { contacts, tags: tags || 0, groups: groups || 0, interactions: interactions || 0, reminders: reminders || 0 }
      },
      exportCsv: async () => {
        const { data } = await sb().from('contacts').select('*').is('deleted_at', null).order('first_name')
        if (!data || data.length === 0) return
        const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education', 'location', 'birthday', 'notes']
        const csv = [headers.join(','), ...(data as Record<string, unknown>[]).map(c =>
          headers.map(h => `"${String(c[h] || '').replace(/"/g, '""')}"`).join(',')
        )].join('\n')
        downloadFile(csv, 'nexus-contacts.csv')
      },
      exportFullCsv: async () => {
        const { data } = await sb().from('contacts').select('*, contact_tags(tags(name)), contact_groups(groups(name))')
          .is('deleted_at', null).order('first_name')
        if (!data || data.length === 0) return
        const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education', 'location', 'birthday', 'keep_in_touch_days', 'notes', 'tags', 'groups']
        const csv = [headers.join(','), ...(data as Record<string, unknown>[]).map(c => {
          const tags = ((c.contact_tags as Array<{ tags: { name: string } }>) || []).map(ct => ct.tags?.name).filter(Boolean).join('; ')
          const groups = ((c.contact_groups as Array<{ groups: { name: string } }>) || []).map(cg => cg.groups?.name).filter(Boolean).join('; ')
          return [...['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'linkedin_url', 'website', 'twitter_url', 'facebook_url', 'instagram_url', 'address', 'education', 'location', 'birthday', 'keep_in_touch_days', 'notes']
            .map(h => `"${String(c[h] || '').replace(/"/g, '""')}"`), `"${tags}"`, `"${groups}"`].join(',')
        })].join('\n')
        downloadFile(csv, 'nexus-contacts-full.csv')
      },
      exportJson: async () => {
        const contacts = await createWebApi().contacts.getAll()
        const interactions = await createWebApi().interactions.getAll()
        const reminders = await createWebApi().reminders.getAll()
        downloadFile(JSON.stringify({ contacts, interactions, reminders }, null, 2), 'nexus-export.json', 'application/json')
      },
      exportFilteredCsv: async (contactIds: (number | string)[]) => {
        const { data } = await sb().from('contacts').select('*').in('id', contactIds)
        if (!data || data.length === 0) return
        const headers = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title']
        const csv = [headers.join(','), ...(data as Record<string, unknown>[]).map(c =>
          headers.map(h => `"${String(c[h] || '').replace(/"/g, '""')}"`).join(',')
        )].join('\n')
        downloadFile(csv, 'nexus-contacts-filtered.csv')
      },
      importSelectCsv: async () => {
        // Browser file picker
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.csv'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) { resolve(null); return }
            const text = await file.text()
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
            if (lines.length < 2) { resolve(null); return }
            const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
            const rows = lines.slice(1).map(line => {
              const vals = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []
              const row: Record<string, string> = {}
              headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '') })
              return row
            })
            resolve({ headers, rows, filePath: file.name })
          }
          input.click()
        })
      },
      importExecute: async (rows: Record<string, string>[], _mode: string) => {
        const userId = await getUserId()
        let imported = 0
        for (const row of rows) {
          await sb().from('contacts').insert({
            user_id: userId,
            first_name: row.first_name || row.firstName || '',
            last_name: row.last_name || row.lastName || '',
            email: row.email || '',
            phone: row.phone || '',
            company: row.company || '',
            job_title: row.job_title || row.jobTitle || '',
            linkedin_url: row.linkedin_url || row.linkedinUrl || '',
            location: row.location || '',
            birthday: row.birthday || '',
            notes: row.notes || '',
            website: row.website || '',
            twitter_url: row.twitter_url || '',
            facebook_url: row.facebook_url || '',
            instagram_url: row.instagram_url || '',
            address: row.address || '',
            education: row.education || ''
          })
          imported++
        }
        return { imported, skipped: 0 }
      },
      importInteractions: async (rows: Record<string, string>[]) => {
        const userId = await getUserId()
        let imported = 0
        let skipped = 0
        for (const row of rows) {
          const email = row.contact_email || row.email || ''
          const name = row.contact_name || row.name || ''
          const [firstName, ...rest] = name.split(' ')
          const lastName = rest.join(' ')
          const type = row.type || 'note'
          const description = row.description || row.notes || ''
          const date = row.date || new Date().toISOString().split('T')[0]

          let contactId: string | null = null
          if (email) {
            const { data } = await sb().from('contacts').select('id').eq('email', email).is('deleted_at', null).single()
            if (data) contactId = data.id as string
          }
          if (!contactId && firstName) {
            const { data } = await sb().from('contacts').select('id').eq('first_name', firstName).eq('last_name', lastName).is('deleted_at', null).single()
            if (data) contactId = data.id as string
          }

          if (contactId) {
            await sb().from('interactions').insert({ user_id: userId, contact_id: contactId, type, description, date })
            imported++
          } else {
            skipped++
          }
        }
        return { imported, skipped }
      },
      backup: async () => unsupported('Backup (data is already in cloud)'),
      resetDatabase: async () => unsupported('Reset database (use Settings)')
    }
  }
}

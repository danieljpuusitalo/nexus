import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL_KEY = 'nexus_supabase_url'
const SUPABASE_ANON_KEY_KEY = 'nexus_supabase_anon_key'

let client: SupabaseClient | null = null

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (client) return client

  const result = await chrome.storage.local.get([SUPABASE_URL_KEY, SUPABASE_ANON_KEY_KEY])
  const url = result[SUPABASE_URL_KEY]
  const anonKey = result[SUPABASE_ANON_KEY_KEY]

  if (!url || !anonKey) return null

  client = createClient(url, anonKey, {
    auth: {
      storage: {
        getItem: async (key: string) => {
          const r = await chrome.storage.local.get(key)
          return r[key] ?? null
        },
        setItem: async (key: string, value: string) => {
          await chrome.storage.local.set({ [key]: value })
        },
        removeItem: async (key: string) => {
          await chrome.storage.local.remove(key)
        },
      },
      autoRefreshToken: true,
      persistSession: true,
    },
  })

  return client
}

export async function configureSupabase(url: string, anonKey: string): Promise<void> {
  await chrome.storage.local.set({
    [SUPABASE_URL_KEY]: url,
    [SUPABASE_ANON_KEY_KEY]: anonKey,
  })
  client = null
}

export async function isConfigured(): Promise<boolean> {
  const result = await chrome.storage.local.get([SUPABASE_URL_KEY, SUPABASE_ANON_KEY_KEY])
  return Boolean(result[SUPABASE_URL_KEY] && result[SUPABASE_ANON_KEY_KEY])
}

/// <reference types="vite/client" />

import type { NexusAPI } from '../../preload/index'

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    api: NexusAPI
  }
}

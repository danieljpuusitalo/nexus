/// <reference types="vite/client" />

import type { NexusAPI } from '../../preload/index'

declare global {
  interface Window {
    api: NexusAPI
  }
}

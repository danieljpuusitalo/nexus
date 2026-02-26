import type { NexusAPI } from './index'

declare global {
  interface Window {
    api: NexusAPI
  }
}

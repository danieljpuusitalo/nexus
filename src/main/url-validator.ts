/**
 * URL validation for external links.
 * Centralizes all shell.openExternal calls through one validator.
 */

import { shell } from 'electron'

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

export function safeOpenExternal(url: string): void {
  if (isAllowedExternalUrl(url)) {
    shell.openExternal(url)
  } else {
    console.warn('[Security] Blocked openExternal for disallowed URL:', url)
  }
}

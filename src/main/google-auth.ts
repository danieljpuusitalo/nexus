/**
 * Google OAuth 2.0 flow for Electron.
 *
 * Opens a BrowserWindow for the Google consent screen, captures the
 * authorization code from the redirect, exchanges it for tokens, and
 * stores them in the local settings table.
 *
 * Scopes: Calendar (read), Contacts (read).
 */

import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'

declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REDIRECT_URI = 'http://localhost'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
]

export interface GoogleTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

// --- Settings helpers ---

function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

// --- Public API ---

export function getGoogleCredentials(
  db: Database.Database
): { clientId: string; clientSecret: string } | null {
  // Prefer embedded (build-time) credentials
  if (__GOOGLE_CLIENT_ID__ && __GOOGLE_CLIENT_SECRET__) {
    return { clientId: __GOOGLE_CLIENT_ID__, clientSecret: __GOOGLE_CLIENT_SECRET__ }
  }
  // Fall back to DB values (backward compat for users who already saved creds)
  const clientId = getSetting(db, 'google_client_id')
  const clientSecret = getSetting(db, 'google_client_secret')
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function isGoogleConnected(db: Database.Database): boolean {
  return Boolean(getSetting(db, 'google_refresh_token'))
}

export function getGoogleStatus(db: Database.Database): {
  configured: boolean
  connected: boolean
  email: string | null
} {
  const hasEmbedded = Boolean(__GOOGLE_CLIENT_ID__ && __GOOGLE_CLIENT_SECRET__)
  const hasDbCreds = Boolean(getSetting(db, 'google_client_id') && getSetting(db, 'google_client_secret'))
  return {
    configured: hasEmbedded || hasDbCreds,
    connected: isGoogleConnected(db),
    email: getSetting(db, 'google_email'),
  }
}

export async function startGoogleAuth(db: Database.Database): Promise<GoogleTokens> {
  const creds = getGoogleCredentials(db)
  if (!creds) throw new Error('Google credentials not configured. Add Client ID and Secret in Settings.')

  return new Promise((resolve, reject) => {
    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id', creds.clientId)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    let resolved = false

    function handleRedirect(url: string): void {
      if (resolved) return
      if (!url.startsWith(REDIRECT_URI)) return

      resolved = true
      const parsedUrl = new URL(url)
      const code = parsedUrl.searchParams.get('code')
      const error = parsedUrl.searchParams.get('error')

      authWindow.close()

      if (error) {
        reject(new Error(`Google auth denied: ${error}`))
        return
      }

      if (!code) {
        reject(new Error('No authorization code received'))
        return
      }

      exchangeCode(code, creds.clientId, creds.clientSecret)
        .then(async (tokens) => {
          // Store tokens
          setSetting(db, 'google_access_token', tokens.access_token)
          setSetting(db, 'google_refresh_token', tokens.refresh_token)
          setSetting(db, 'google_token_expiry', String(tokens.expires_at))

          // Fetch and store user email
          try {
            const email = await fetchGoogleEmail(tokens.access_token)
            if (email) setSetting(db, 'google_email', email)
          } catch {
            // Non-critical — continue without email
          }

          resolve(tokens)
        })
        .catch(reject)
    }

    // Intercept redirects (server-side 302)
    authWindow.webContents.on('will-redirect', (_event, url) => {
      handleRedirect(url)
    })

    // Intercept navigation (client-side redirects)
    authWindow.webContents.on('will-navigate', (_event, url) => {
      handleRedirect(url)
    })

    authWindow.on('closed', () => {
      if (!resolved) {
        reject(new Error('Auth window was closed'))
      }
    })

    authWindow.loadURL(authUrl.toString())
  })
}

export function disconnectGoogle(db: Database.Database): void {
  const keys = [
    'google_access_token',
    'google_refresh_token',
    'google_token_expiry',
    'google_email',
  ]
  for (const key of keys) {
    deleteSetting(db, key)
  }
}

export async function getValidAccessToken(db: Database.Database): Promise<string | null> {
  if (!isGoogleConnected(db)) return null

  const accessToken = getSetting(db, 'google_access_token')
  const expiry = getSetting(db, 'google_token_expiry')

  // Return existing token if still valid (with 60s buffer)
  if (accessToken && expiry && Date.now() < Number(expiry) - 60000) {
    return accessToken
  }

  // Token expired — refresh it
  return refreshGoogleToken(db)
}

// --- Internal helpers ---

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

async function refreshGoogleToken(db: Database.Database): Promise<string | null> {
  const creds = getGoogleCredentials(db)
  if (!creds) return null

  const refreshToken = getSetting(db, 'google_refresh_token')
  if (!refreshToken) return null

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      // Refresh failed — token may have been revoked
      console.warn('[Google] Token refresh failed (status %d) — disconnecting', response.status)
      disconnectGoogle(db)
      return null
    }

    const data = (await response.json()) as {
      access_token: string
      expires_in: number
    }

    setSetting(db, 'google_access_token', data.access_token)
    setSetting(db, 'google_token_expiry', String(Date.now() + data.expires_in * 1000))

    return data.access_token
  } catch (err) {
    console.warn('[Google] Token refresh error:', err)
    return null
  }
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) return null
  const data = (await response.json()) as { email?: string }
  return data.email ?? null
}

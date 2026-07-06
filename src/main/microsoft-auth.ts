/**
 * Microsoft OAuth 2.0 flow for Electron.
 *
 * Opens a BrowserWindow for the Microsoft consent screen, captures the
 * authorization code from the redirect, exchanges it for tokens, and
 * stores them in the local settings table.
 *
 * Scopes: Calendars.Read, Mail.Read, User.Read
 */

import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const REDIRECT_URI = 'http://localhost'

const SCOPES = [
  'User.Read',
  'Calendars.Read',
  'Mail.Read',
  'Contacts.Read',
  'offline_access'
]

export interface MicrosoftTokens {
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

export function getMicrosoftCredentials(
  db: Database.Database
): { clientId: string } | null {
  const clientId = getSetting(db, 'microsoft_client_id')
  if (!clientId) return null
  return { clientId }
}

export function isMicrosoftConnected(db: Database.Database): boolean {
  return Boolean(getSetting(db, 'microsoft_refresh_token'))
}

export function getMicrosoftStatus(db: Database.Database): {
  configured: boolean
  connected: boolean
  email: string | null
} {
  const creds = getMicrosoftCredentials(db)
  return {
    configured: Boolean(creds),
    connected: isMicrosoftConnected(db),
    email: getSetting(db, 'microsoft_email')
  }
}

export async function startMicrosoftAuth(db: Database.Database): Promise<MicrosoftTokens> {
  const creds = getMicrosoftCredentials(db)
  if (!creds) throw new Error('Microsoft credentials not configured. Add Client ID in Settings.')

  return new Promise((resolve, reject) => {
    const authUrl = new URL(MS_AUTH_URL)
    authUrl.searchParams.set('client_id', creds.clientId)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES.join(' '))
    authUrl.searchParams.set('response_mode', 'query')

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
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
        reject(new Error(`Microsoft auth denied: ${error}`))
        return
      }

      if (!code) {
        reject(new Error('No authorization code received'))
        return
      }

      exchangeCode(code, creds.clientId)
        .then(async (tokens) => {
          setSetting(db, 'microsoft_access_token', tokens.access_token)
          setSetting(db, 'microsoft_refresh_token', tokens.refresh_token)
          setSetting(db, 'microsoft_token_expiry', String(tokens.expires_at))

          try {
            const email = await fetchMicrosoftEmail(tokens.access_token)
            if (email) setSetting(db, 'microsoft_email', email)
          } catch {
            // Non-critical
          }

          resolve(tokens)
        })
        .catch(reject)
    }

    authWindow.webContents.on('will-redirect', (_event, url) => {
      handleRedirect(url)
    })

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

export function disconnectMicrosoft(db: Database.Database): void {
  const keys = [
    'microsoft_access_token',
    'microsoft_refresh_token',
    'microsoft_token_expiry',
    'microsoft_email'
  ]
  for (const key of keys) {
    deleteSetting(db, key)
  }
}

export async function getValidMicrosoftAccessToken(db: Database.Database): Promise<string | null> {
  if (!isMicrosoftConnected(db)) return null

  const accessToken = getSetting(db, 'microsoft_access_token')
  const expiry = getSetting(db, 'microsoft_token_expiry')

  if (accessToken && expiry && Date.now() < Number(expiry) - 60000) {
    return accessToken
  }

  return refreshMicrosoftToken(db)
}

// --- Internal helpers ---

async function exchangeCode(code: string, clientId: string): Promise<MicrosoftTokens> {
  const response = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: SCOPES.join(' ')
    })
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
    expires_at: Date.now() + data.expires_in * 1000
  }
}

async function refreshMicrosoftToken(db: Database.Database): Promise<string | null> {
  const creds = getMicrosoftCredentials(db)
  if (!creds) return null

  const refreshToken = getSetting(db, 'microsoft_refresh_token')
  if (!refreshToken) return null

  try {
    const response = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        grant_type: 'refresh_token',
        scope: SCOPES.join(' ')
      })
    })

    if (!response.ok) {
      console.warn('[Microsoft] Token refresh failed (status %d) — disconnecting', response.status)
      disconnectMicrosoft(db)
      return null
    }

    const data = (await response.json()) as {
      access_token: string
      expires_in: number
    }

    setSetting(db, 'microsoft_access_token', data.access_token)
    setSetting(db, 'microsoft_token_expiry', String(Date.now() + data.expires_in * 1000))

    return data.access_token
  } catch (err) {
    console.warn('[Microsoft] Token refresh error:', err)
    return null
  }
}

async function fetchMicrosoftEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) return null
  const data = (await response.json()) as { mail?: string; userPrincipalName?: string }
  return data.mail ?? data.userPrincipalName ?? null
}

// --- Calendar + Mail sync functions ---

export async function fetchCalendarEvents(
  db: Database.Database,
  startDate: string,
  endDate: string
): Promise<unknown[]> {
  const token = await getValidMicrosoftAccessToken(db)
  if (!token) return []

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDate}T00:00:00Z&endDateTime=${endDate}T23:59:59Z&$top=100&$select=subject,start,end,attendees,bodyPreview`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) return []
    const data = (await response.json()) as { value: unknown[] }
    return data.value || []
  } catch {
    return []
  }
}

export async function fetchRecentEmails(
  db: Database.Database,
  maxResults: number = 50
): Promise<unknown[]> {
  const token = await getValidMicrosoftAccessToken(db)
  if (!token) return []

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$select=subject,from,toRecipients,receivedDateTime&$orderby=receivedDateTime desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!response.ok) return []
    const data = (await response.json()) as { value: unknown[] }
    return data.value || []
  } catch {
    return []
  }
}

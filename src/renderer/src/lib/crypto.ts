/**
 * Client-side encryption for sensitive contact data before uploading to Supabase.
 * Uses AES-256-GCM via Web Crypto API.
 *
 * Encrypted fields: notes, how_we_met, phone (personal details)
 * Plaintext fields: first_name, last_name, email, company, job_title (needed for search)
 */

const STORAGE_KEY = 'nexus_encryption_key'
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

// Encrypted values are stored as: base64(iv + ciphertext)
const ENCRYPTED_PREFIX = 'enc:'

// Fields to encrypt before cloud push
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  contacts: ['notes', 'how_we_met', 'phone'],
  interactions: ['description'],
  reminders: ['message'],
  custom_fields: ['field_value']
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(STORAGE_KEY)

  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, ALGORITHM, true, ['encrypt', 'decrypt'])
  }

  // Generate a new key
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )

  // Export and store
  const exported = await crypto.subtle.exportKey('raw', key)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
  localStorage.setItem(STORAGE_KEY, b64)

  return key
}

export async function encryptValue(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext

  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return ENCRYPTED_PREFIX + btoa(String.fromCharCode(...combined))
}

export async function decryptValue(encrypted: string): Promise<string> {
  if (!encrypted || !encrypted.startsWith(ENCRYPTED_PREFIX)) return encrypted

  try {
    const key = await getOrCreateKey()
    const data = encrypted.slice(ENCRYPTED_PREFIX.length)
    const combined = Uint8Array.from(atob(data), c => c.charCodeAt(0))

    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // If decryption fails (wrong key, corrupted data), return the encrypted value
    return encrypted
  }
}

export async function encryptRow(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const fields = ENCRYPTED_FIELDS[table]
  if (!fields) return row

  const result = { ...row }
  for (const field of fields) {
    if (typeof result[field] === 'string' && result[field]) {
      result[field] = await encryptValue(result[field] as string)
    }
  }
  return result
}

export async function decryptRow(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const fields = ENCRYPTED_FIELDS[table]
  if (!fields) return row

  const result = { ...row }
  for (const field of fields) {
    if (typeof result[field] === 'string' && (result[field] as string).startsWith(ENCRYPTED_PREFIX)) {
      result[field] = await decryptValue(result[field] as string)
    }
  }
  return result
}

export function hasEncryptionKey(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

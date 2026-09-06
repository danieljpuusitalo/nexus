import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Guard against claiming a domain we do not own.
 *
 * `nexuscrm.app` was hardcoded across the landing pages, the referral links,
 * the Stripe checkout URLs and the VAPID subject as though it were ours. It is
 * not — it serves an unrelated company's website, and the privacy URL the app
 * pointed users at returned 404. Nobody had ever claimed to own it; it just
 * got written down once and copied.
 *
 * The placeholder is under `.invalid`, which RFC 2606 reserves permanently and
 * which no registrar can ever sell. So if this placeholder ever ships by
 * accident it fails loudly and locally instead of quietly resolving to a
 * stranger's site.
 *
 * When a real domain is registered, replace the placeholder and add nothing
 * here — the test keeps working, because it only bans domains we know are not
 * ours.
 */

const ROOT = path.resolve(__dirname, '..')

/** Domains we must never reference as if they were ours. */
const FORBIDDEN = ['nexuscrm.app']

/**
 * `package.json` "appId" is a reverse-DNS bundle identifier, not a URL. It is
 * never resolved, and changing it would break the update path for anyone who
 * already installed the app, so it is deliberately left alone.
 */
const ALLOWED_PATHS = ['package.json']

const SEARCH_DIRS = ['landing', 'src', 'supabase', 'scripts', 'extension/src']
const EXTENSIONS = new Set(['.html', '.ts', '.tsx', '.js', '.jsx', '.json', '.xml', '.md', '.txt'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-web') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

describe('unowned domains', () => {
  it('are not referenced anywhere in shipped code or pages', () => {
    const offenders: string[] = []

    for (const dir of SEARCH_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/')
        if (ALLOWED_PATHS.includes(rel)) continue
        const content = fs.readFileSync(file, 'utf8')
        for (const domain of FORBIDDEN) {
          if (content.includes(domain)) offenders.push(`${rel} → ${domain}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

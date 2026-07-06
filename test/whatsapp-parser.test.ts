import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseWhatsAppChat } from '../src/main/whatsapp-parser'

describe('parseWhatsAppChat', () => {
  it('extracts unique contacts from chat export', () => {
    const content = readFileSync(join(__dirname, 'fixtures/whatsapp-chat.txt'), 'utf8')
    const result = parseWhatsAppChat(content)
    // Should find Alice Smith, phone number, and Bob Jones (3 unique senders)
    expect(result.length).toBeGreaterThanOrEqual(2)
    const names = result.map(c => c.first_name)
    expect(names).toContain('Alice')
  })

  it('returns empty array for empty input', () => {
    expect(parseWhatsAppChat('')).toHaveLength(0)
  })

  it('handles malformed chat lines', () => {
    const result = parseWhatsAppChat('this is not a whatsapp export\njust random text')
    expect(result).toHaveLength(0)
  })

  it('deduplicates same sender across messages', () => {
    const content = readFileSync(join(__dirname, 'fixtures/whatsapp-chat.txt'), 'utf8')
    const result = parseWhatsAppChat(content)
    // Alice appears twice but should be deduplicated
    const alices = result.filter(c => c.first_name === 'Alice')
    expect(alices).toHaveLength(1)
  })
})

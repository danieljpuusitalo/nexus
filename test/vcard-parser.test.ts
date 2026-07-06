import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseVCardFile } from '../src/main/vcard-parser'

describe('parseVCardFile', () => {
  it('parses valid vCard file with multiple contacts', () => {
    const content = readFileSync(join(__dirname, 'fixtures/sample.vcf'), 'utf8')
    const result = parseVCardFile(content)
    expect(result).toHaveLength(2)
    expect(result[0].first_name).toBe('Jane')
    expect(result[0].last_name).toBe('Doe')
    expect(result[0].email).toBe('jane@example.com')
    expect(result[0].phone).toBe('+31612345678')
    expect(result[0].company).toBe('Acme Corp')
    expect(result[0].job_title).toBe('Engineer')
  })

  it('handles contact with minimal fields', () => {
    const content = readFileSync(join(__dirname, 'fixtures/sample.vcf'), 'utf8')
    const result = parseVCardFile(content)
    expect(result[1].first_name).toBe('Bob')
    expect(result[1].last_name).toBe('Smith')
    expect(result[1].email).toBe('bob@test.org')
  })

  it('returns empty array for empty input', () => {
    expect(parseVCardFile('')).toHaveLength(0)
  })

  it('handles malformed vCard gracefully', () => {
    const result = parseVCardFile('not a vcard at all\nrandom text')
    expect(result).toHaveLength(0)
  })

  it('handles vCard missing END tag', () => {
    const broken = 'BEGIN:VCARD\nVERSION:3.0\nN:Test;User;;;\nEMAIL:test@test.com'
    const result = parseVCardFile(broken)
    // Should still parse or return empty gracefully
    expect(Array.isArray(result)).toBe(true)
  })
})

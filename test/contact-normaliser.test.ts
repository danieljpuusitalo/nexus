import { describe, it, expect } from 'vitest'
import { normaliseContact } from '../src/main/contact-normaliser'

const base = {
  first_name: '', last_name: '', email: '', phone: '', company: '',
  job_title: '', linkedin_url: '', notes: '', how_we_met: '',
  birthday: '', location: '', website: '', twitter_url: '',
  facebook_url: '', instagram_url: '', address: '', education: ''
}

describe('normaliseContact', () => {
  it('trims and capitalizes names', () => {
    const result = normaliseContact({ ...base, first_name: '  john ', last_name: ' doe ' })
    expect(result.first_name).toBe('John')
    expect(result.last_name).toBe('Doe')
  })

  it('lowercases email', () => {
    const result = normaliseContact({ ...base, email: ' John@Example.COM ' })
    expect(result.email).toBe('john@example.com')
  })

  it('trims phone', () => {
    const result = normaliseContact({ ...base, phone: ' +31 6 1234567 ' })
    expect(result.phone).toBe('+31 6 1234567')
  })

  it('handles empty input gracefully', () => {
    const result = normaliseContact({ ...base })
    expect(result.first_name).toBe('')
    expect(result.last_name).toBe('')
  })

  it('passes through notes and how_we_met', () => {
    const result = normaliseContact({ ...base, notes: 'Met at conference', how_we_met: 'Web Summit' })
    expect(result.notes).toBe('Met at conference')
    expect(result.how_we_met).toBe('Web Summit')
  })
})

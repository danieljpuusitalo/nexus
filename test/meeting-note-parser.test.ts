import { describe, it, expect } from 'vitest'
import { parseMeetingNote, extractDate, looksLikeName } from '../src/main/meeting-note-parser'

describe('extractDate', () => {
  it('reads ISO dates', () => {
    expect(extractDate('Recorded on 2026-09-06 at 10:00')).toBe('2026-09-06')
  })

  it('reads "6 September 2026"', () => {
    expect(extractDate('Date: 6 September 2026')).toBe('2026-09-06')
  })

  it('reads "September 6, 2026"', () => {
    expect(extractDate('September 6, 2026')).toBe('2026-09-06')
  })

  it('reads an unambiguous slash date', () => {
    // 24 cannot be a month, so this is provably DD/MM/YYYY
    expect(extractDate('24/09/2026')).toBe('2026-09-24')
  })

  it('refuses an ambiguous slash date rather than guessing', () => {
    // Could be 1 Feb or 2 Jan — filing it under the wrong date is worse than
    // falling back to the file's mtime.
    expect(extractDate('01/02/2026')).toBeNull()
  })

  it('rejects impossible dates', () => {
    expect(extractDate('2026-13-45')).toBeNull()
  })

  it('returns null when there is no date', () => {
    expect(extractDate('no date here')).toBeNull()
  })
})

describe('looksLikeName', () => {
  it('accepts ordinary names', () => {
    expect(looksLikeName('Alice Smith')).toBe(true)
    expect(looksLikeName('Daniel')).toBe(true)
  })

  it('accepts Dutch/German particles', () => {
    expect(looksLikeName('Daniel van der Berg')).toBe(true)
  })

  it('rejects transcript section headers', () => {
    // This is the failure that would otherwise import "Action Items" as a person.
    expect(looksLikeName('Action Items')).toBe(false)
    expect(looksLikeName('Summary')).toBe(false)
    expect(looksLikeName('Next Steps')).toBe(false)
    expect(looksLikeName('Key Takeaways')).toBe(false)
  })

  it('rejects strings with digits or symbols', () => {
    expect(looksLikeName('Speaker 1')).toBe(false)
    expect(looksLikeName('https://zoom.us/j/123')).toBe(false)
  })

  it('rejects lowercase prose', () => {
    expect(looksLikeName('we agreed to follow up')).toBe(false)
  })
})

describe('parseMeetingNote — Granola-style markdown', () => {
  const note = `# Series A intro — Acme Robotics

Date: 2026-09-04
Attendees: Sarah Chen <sarah@acmerobotics.com>, Daniel Uusitalo

## Summary
Sarah walked through their traction. ARR is ~€1.2M, growing 15% MoM.
They are raising €6M at a €30M pre.

## Action Items
- Send the data room link
`

  it('pulls out the title, date and attendees', () => {
    const r = parseMeetingNote(note, 'acme.md')
    expect(r.title).toBe('Series A intro — Acme Robotics')
    expect(r.date).toBe('2026-09-04')
    expect(r.attendeeEmails).toContain('sarah@acmerobotics.com')
    expect(r.attendeeNames).toContain('Sarah Chen')
  })

  it('does not import section headings as attendees', () => {
    const r = parseMeetingNote(note, 'acme.md')
    expect(r.attendeeNames).not.toContain('Summary')
    expect(r.attendeeNames).not.toContain('Action Items')
  })

  it('keeps the body as the summary', () => {
    const r = parseMeetingNote(note, 'acme.md')
    expect(r.summary).toContain('ARR is ~€1.2M')
  })
})

describe('parseMeetingNote — transcript with speaker labels', () => {
  const transcript = `Tactiq transcript — Weekly partner sync
2026-08-19

[00:00:04] Daniel Uusitalo: Let's start with the pipeline.
[00:00:12] Marta Nowak: I met the Helsinki team last week.
[00:01:30] Daniel Uusitalo: Good — did they share numbers?
`

  it('derives attendees from speaker labels when there is no attendee list', () => {
    const r = parseMeetingNote(transcript, 'sync.txt')
    expect(r.attendeeNames).toContain('Daniel Uusitalo')
    expect(r.attendeeNames).toContain('Marta Nowak')
  })

  it('deduplicates repeated speakers', () => {
    const r = parseMeetingNote(transcript, 'sync.txt')
    expect(r.attendeeNames.filter(n => n === 'Daniel Uusitalo')).toHaveLength(1)
  })

  it('detects the notetaker for provenance', () => {
    expect(parseMeetingNote(transcript, 'sync.txt').source).toBe('Tactiq')
  })
})

describe('parseMeetingNote — WebVTT', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Alice Smith>Thanks for making the time today.

00:00:05.000 --> 00:00:09.000
<v Bob Jones>Of course. Let's dig in.
`

  it('reads speakers from <v> tags', () => {
    const r = parseMeetingNote(vtt, '2026-07-02 catchup.vtt')
    expect(r.attendeeNames).toEqual(expect.arrayContaining(['Alice Smith', 'Bob Jones']))
  })

  it('falls back to the filename for the date', () => {
    expect(parseMeetingNote(vtt, '2026-07-02 catchup.vtt').date).toBe('2026-07-02')
  })

  it('falls back to the filename for the title', () => {
    expect(parseMeetingNote(vtt, '2026-07-02 catchup.vtt').title).toBe('catchup')
  })
})

describe('parseMeetingNote — JSON export', () => {
  const json = JSON.stringify({
    title: 'Portfolio review',
    date: '2026-05-11T14:00:00Z',
    participants: [
      { name: 'Priya Raman', email: 'priya@fund.vc' },
      'tom@startup.io',
    ],
    summary: 'Discussed runway and the bridge round.',
  })

  it('reads title, date, participants and summary', () => {
    const r = parseMeetingNote(json, 'export.json')
    expect(r.title).toBe('Portfolio review')
    expect(r.date).toBe('2026-05-11')
    expect(r.attendeeEmails).toEqual(expect.arrayContaining(['priya@fund.vc', 'tom@startup.io']))
    expect(r.attendeeNames).toContain('Priya Raman')
    expect(r.summary).toContain('bridge round')
  })
})

describe('parseMeetingNote — summary quality', () => {
  // Verbatim from a real Tactiq export. Tactiq files these under a
  // "Highlights" heading, but they are timestamped speech-recognition
  // fragments, not a summary — note "the consumerator is away".
  const TACTIQ_HIGHLIGHTS = `# Davide Mazzanti and Daniel Uusitalo

  Participants: Daniel Uusitalo, Davide Mazzanti

## Highlights
07:01 Davide Mazzanti: Etc, but you know it's only one brand so if you say no, we're fine.
10:44 Davide Mazzanti: Very important towards the brand we had to keep us there to keep the same pricing
12:28 Davide Mazzanti: and it's important it back. So there is a very long conversation in Germany
13:31 Davide Mazzanti: the consumerator is away. We take the fun money to produce a new one
25:43 Daniel Uusitalo: No, I believe it no absolutely believe you god that actually is that I have to say
`

  it('refuses to treat timestamped transcript fragments as a summary', () => {
    const r = parseMeetingNote(TACTIQ_HIGHLIGHTS, 'tactiq.txt')
    // Showing this where a summary belongs is unreadable and looks like the
    // product wrote it. Better to show nothing and say so.
    expect(r.summary).toBe('')
    expect(r.transcript).toContain('the consumerator is away')
  })

  it('still accepts a real prose summary under the same heading', () => {
    const r = parseMeetingNote(
      '# Board call\n\n## Highlights\nARR is ~€1.2M, growing 15% MoM.\nRaising €6M at a €30M pre.\nWants an intro to Northzone.\nFollow up in two weeks.\n',
      'board.md'
    )
    expect(r.summary).toContain('ARR is ~€1.2M')
  })
})

describe('parseMeetingNote — fallbacks', () => {
  it('uses the file mtime when the note carries no date', () => {
    const r = parseMeetingNote('Just some notes with no date.', 'notes.txt', new Date(2026, 2, 15))
    expect(r.date).toBe('2026-03-15')
  })

  it('always produces a title', () => {
    expect(parseMeetingNote('body only', '').title).toBe('Meeting')
  })

  it('handles an empty file without throwing', () => {
    const r = parseMeetingNote('', 'empty.md')
    expect(r.attendeeEmails).toHaveLength(0)
    expect(r.attendeeNames).toHaveLength(0)
  })

  it('strips YAML frontmatter fences but keeps the fields', () => {
    const r = parseMeetingNote(
      '---\ntitle: Board call\ndate: 2026-01-09\n---\n\nWent well.',
      'board.md'
    )
    expect(r.title).toBe('Board call')
    expect(r.date).toBe('2026-01-09')
    expect(r.summary).toContain('Went well.')
    expect(r.summary).not.toContain('---')
  })
})

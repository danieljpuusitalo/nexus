/**
 * Tests for the pure functions in data.ts: the analysis that has to be
 * correct regardless of what snapshot happens to be loaded.
 *
 * `data.ts` imports `snapshot.json` and reads `localStorage` at module load
 * (`currentStage()`). Vitest's default `node` environment has no
 * `localStorage`, which `currentStage()` already guards for (`typeof
 * localStorage !== 'undefined'`), so the module loads to the full,
 * unprojected stage without any test setup or environment change.
 */

import { describe, expect, it } from 'vitest'
import { balance, reckoning, rhythm, type OpenLoop } from './data'

describe('rhythm', () => {
  it('has no gaps to describe with fewer than two dates', () => {
    expect(rhythm([])).toEqual({
      averageGap: null,
      longestGap: null,
      sinceLast: 0,
      overdue: false,
      busiestMonth: null,
    })
    const one = rhythm(['2026-01-01'])
    expect(one.averageGap).toBeNull()
    expect(one.longestGap).toBeNull()
  })

  it('averages the gaps between conversations, in either input order', () => {
    const forward = rhythm(['2026-01-01', '2026-01-11', '2026-01-21'])
    const backward = rhythm(['2026-01-21', '2026-01-01', '2026-01-11'])
    expect(forward.averageGap).toBe(10)
    expect(forward.longestGap).toBe(10)
    expect(backward).toEqual(forward)
  })

  it('is overdue only once the current silence passes twice the own average', () => {
    const now = Date.now()
    const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString()
    // Regular 10-day cadence, but it has been 30 days since the last one.
    const overdue = rhythm([iso(50), iso(40), iso(30)])
    expect(overdue.averageGap).toBe(10)
    expect(overdue.overdue).toBe(true)

    // Same cadence, silence still inside twice the average.
    const onTime = rhythm([iso(30), iso(20), iso(15)])
    expect(onTime.overdue).toBe(false)
  })
})

/** Minimal open loops, only the fields the functions under test touch. */
function loop(partial: Partial<OpenLoop>): OpenLoop {
  return {
    text: 'do the thing',
    owner: 'me',
    done: false,
    conversationId: 1,
    conversationTitle: 'A call',
    agreedAt: '2026-01-01',
    personId: 1,
    personName: 'Someone',
    late: false,
    inferred: false,
    ...partial,
  }
}

describe('balance', () => {
  it('is symmetric: both directions counted the same way', () => {
    const loops = [
      loop({ owner: 'me', done: false, text: 'a' }),
      loop({ owner: 'me', done: true, text: 'b' }),
      loop({ owner: 'them', done: false, text: 'c' }),
      loop({ owner: 'them', done: true, text: 'd' }),
      loop({ owner: 'them', done: true, text: 'e' }),
    ]
    const b = balance(loops)
    expect(b.iOwe.map(l => l.text)).toEqual(['a'])
    expect(b.theyOwe.map(l => l.text)).toEqual(['c'])
    expect(b.iPromised).toBe(2)
    expect(b.iDelivered).toBe(1)
    expect(b.theyPromised).toBe(3)
    expect(b.theyDelivered).toBe(2)
  })

  it('is honest about an empty record rather than inventing a ratio', () => {
    const b = balance([])
    expect(b).toEqual({
      iOwe: [],
      theyOwe: [],
      iDelivered: 0,
      iPromised: 0,
      theyDelivered: 0,
      theyPromised: 0,
    })
  })
})

describe('reckoning', () => {
  const now = new Date('2026-09-26T00:00:00Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10)

  it('says nothing was recorded rather than a fabricated perfect zero', () => {
    const r = reckoning([], now)
    expect(r.mine).toEqual({ promised: 0, open: 0, over90: 0, kept: 0 })
    expect(r.theirs).toEqual({ promised: 0, open: 0, over90: 0, kept: 0 })
    expect(r.iOweOldestFirst).toEqual([])
    expect(r.owedToMe).toEqual([])
  })

  it('counts promised, open, over90 and kept separately, per owner', () => {
    const loops = [
      // Mine, promised inside the window, still open, and old enough to be over90.
      loop({ owner: 'me', text: 'old debt', agreedAt: daysAgo(120), done: false }),
      // Mine, promised inside the window, open, but not yet over 90 days.
      loop({ owner: 'me', text: 'recent debt', agreedAt: daysAgo(10), done: false }),
      // Mine, kept.
      loop({ owner: 'me', text: 'kept one', agreedAt: daysAgo(5), done: true }),
      // Mine, promised well outside the one-year window: not counted as promised,
      // but still counted as open because it never stopped being true.
      loop({ owner: 'me', text: 'ancient debt', agreedAt: daysAgo(500), done: false }),
      // Theirs, open.
      loop({ owner: 'them', text: 'their debt', agreedAt: daysAgo(3), done: false }),
    ]
    const r = reckoning(loops, now)

    expect(r.mine).toEqual({ promised: 3, open: 3, over90: 2, kept: 1 })
    expect(r.theirs).toEqual({ promised: 1, open: 1, over90: 0, kept: 0 })

    // Oldest first: the ancient one leads even though it fell outside the window.
    expect(r.iOweOldestFirst.map(l => l.text)).toEqual(['ancient debt', 'old debt', 'recent debt'])
    expect(r.owedToMe.map(l => l.text)).toEqual(['their debt'])
  })

  it('respects a shorter window when asked', () => {
    const loops = [
      loop({ owner: 'me', text: 'this month', agreedAt: daysAgo(10), done: false }),
      loop({ owner: 'me', text: 'last year', agreedAt: daysAgo(200), done: false }),
    ]
    const r = reckoning(loops, now, 30)
    expect(r.mine.promised).toBe(1)
    // Open still counts both: the window narrows "promised", not "open".
    expect(r.mine.open).toBe(2)
  })
})

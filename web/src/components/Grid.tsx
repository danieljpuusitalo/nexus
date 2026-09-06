/**
 * The contribution grid, borrowed from GitHub and pointed at people.
 *
 * A year of conversations laid out as weeks across and days down. It answers
 * two questions a heat score cannot: *when* did this relationship happen, and
 * *what shape* was it. A cluster in March followed by nothing reads completely
 * differently from a steady tick every fortnight, and a single number would
 * flatten both into "medium".
 *
 * Deliberately not a score. The grid is the raw record drawn to scale; no
 * weighting, no decay, no judgement about whether that is good or bad. The
 * shape is the analysis.
 */

import { useMemo, useState } from 'react'

const DAY_MS = 86_400_000
const WEEKS = 53

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = (out.getDay() + 6) % 7 // Monday first
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - dow)
  return out
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Grid({
  dates,
  cell = 11,
  gap = 3,
}: {
  dates: string[]
  cell?: number
  gap?: number
}) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null)

  const { columns, months, total, busiest } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const iso of dates) {
      const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
      if (Number.isNaN(d.getTime())) continue
      const k = key(d)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }

    const end = startOfWeek(new Date())
    const first = new Date(end.getTime() - (WEEKS - 1) * 7 * DAY_MS)

    const columns: { date: Date; count: number }[][] = []
    const months: { label: string; col: number }[] = []
    let seenMonth = -1
    let total = 0
    let busiest = 0

    for (let w = 0; w < WEEKS; w++) {
      const col: { date: Date; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(first.getTime() + (w * 7 + d) * DAY_MS)
        const count = counts.get(key(day)) ?? 0
        if (day <= new Date()) {
          total += count
          busiest = Math.max(busiest, count)
        }
        col.push({ date: day, count: day > new Date() ? -1 : count })
      }
      const m = col[0].date.getMonth()
      if (m !== seenMonth && col[0].date.getDate() <= 7) {
        months.push({ label: col[0].date.toLocaleDateString('en-GB', { month: 'short' }), col: w })
        seenMonth = m
      }
      columns.push(col)
    }
    return { columns, months, total, busiest }
  }, [dates])

  function tone(count: number): string {
    if (count < 0) return 'transparent'
    if (count === 0) return 'var(--line)'
    if (busiest <= 1) return 'var(--ember)'
    const step = count / busiest
    if (step > 0.66) return 'var(--ember)'
    if (step > 0.33) return 'var(--ember-deep)'
    return 'rgba(194, 83, 39, 0.55)'
  }

  const width = WEEKS * (cell + gap)

  return (
    <div className="grid-wrap">
      <div className="grid-months" style={{ width, height: 13 }}>
        {months.map(m => (
          <span key={`${m.label}-${m.col}`} style={{ left: m.col * (cell + gap) }}>
            {m.label}
          </span>
        ))}
      </div>

      <div className="grid-body">
        <div className="grid-days" style={{ gap }}>
          {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
            <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
              {d}
            </span>
          ))}
        </div>

        <div className="grid-cols" style={{ gap }}>
          {columns.map((col, ci) => (
            <div key={ci} className="grid-col" style={{ gap }}>
              {col.map((c, ri) => (
                <i
                  key={ri}
                  style={{ width: cell, height: cell, background: tone(c.count) }}
                  onMouseEnter={e => {
                    if (c.count < 0) return
                    const r = (e.target as HTMLElement).getBoundingClientRect()
                    setHover({
                      x: r.left + r.width / 2,
                      y: r.top,
                      label: `${c.count === 0 ? 'No conversations' : `${c.count} conversation${c.count === 1 ? '' : 's'}`} on ${c.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
                    })
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid-foot" style={{ width }}>
        <span>
          {total} conversation{total === 1 ? '' : 's'} in the last year
        </span>
        <span className="grid-scale">
          less
          <i style={{ background: 'var(--line)' }} />
          <i style={{ background: 'rgba(194, 83, 39, 0.55)' }} />
          <i style={{ background: 'var(--ember-deep)' }} />
          <i style={{ background: 'var(--ember)' }} />
          more
        </span>
      </div>

      {hover && (
        <div className="grid-tip" style={{ left: hover.x, top: hover.y - 8 }}>
          {hover.label}
        </div>
      )}
    </div>
  )
}

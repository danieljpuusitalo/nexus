/**
 * The rhythm of a relationship.
 *
 * A person's conversations placed on a shared twelve month timeline, so the
 * difference between someone you speak to every fortnight and someone you met
 * once last spring is visible without reading a single word. Every row uses the
 * same window, otherwise the shapes would not be comparable, which is the only
 * reason to draw them.
 */

const BUCKETS = 26 // one tick per fortnight across a year

export default function Cadence({ dates }: { dates: string[] }) {
  const now = Date.now()
  const span = 365 * 86_400_000
  const hits = new Set<number>()

  for (const d of dates) {
    const t = new Date(d.length <= 10 ? `${d}T00:00:00` : d).getTime()
    if (Number.isNaN(t)) continue
    const age = now - t
    if (age < 0 || age > span) continue
    hits.add(BUCKETS - 1 - Math.floor((age / span) * BUCKETS))
  }

  return (
    <div className="cadence" aria-hidden>
      {Array.from({ length: BUCKETS }, (_, i) => (
        <i key={i} className={hits.has(i) ? 'hit' : ''} style={{ height: hits.has(i) ? '100%' : '2px' }} />
      ))}
    </div>
  )
}

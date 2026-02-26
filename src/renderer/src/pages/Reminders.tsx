import { useEffect, useState } from 'react'
import type { Reminder } from '../types'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([])

  useEffect(() => { loadReminders() }, [])

  async function loadReminders() {
    const data = await window.api.reminders.getAll()
    setReminders(data as Reminder[])
  }

  async function handleToggle(id: number) {
    await window.api.reminders.toggleComplete(id)
    await loadReminders()
  }

  async function handleDelete(id: number) {
    await window.api.reminders.delete(id)
    await loadReminders()
  }

  const today = todayStr()
  const weekEnd = addDays(today, 7)

  const incomplete = reminders.filter(r => !r.completed)
  const overdue = incomplete.filter(r => r.due_date < today)
  const dueToday = incomplete.filter(r => r.due_date === today)
  const upcoming = incomplete.filter(r => r.due_date > today && r.due_date <= weekEnd)

  const totalActive = overdue.length + dueToday.length + upcoming.length

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Reminders</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {totalActive === 0 ? 'All caught up!' : `${totalActive} active reminder${totalActive === 1 ? '' : 's'}`}
        </p>
      </div>

      {totalActive === 0 ? (
        <div className="border border-zinc-800/60 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">&#9989;</div>
          <p className="text-sm text-zinc-500">No pending reminders. Set one from a contact's detail page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Overdue */}
          {overdue.length > 0 && (
            <ReminderSection
              title="Overdue"
              count={overdue.length}
              accent="red"
              reminders={overdue}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}

          {/* Today */}
          {dueToday.length > 0 && (
            <ReminderSection
              title="Today"
              count={dueToday.length}
              accent="amber"
              reminders={dueToday}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <ReminderSection
              title="Upcoming (Next 7 Days)"
              count={upcoming.length}
              accent="violet"
              reminders={upcoming}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ReminderSection({ title, count, accent, reminders, onToggle, onDelete }: {
  title: string
  count: number
  accent: 'red' | 'amber' | 'violet'
  reminders: Reminder[]
  onToggle: (id: number) => void
  onDelete: (id: number) => void
}) {
  const accentColors = {
    red: { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-400', dot: 'bg-red-400' },
    amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-400', dot: 'bg-amber-400' },
    violet: { border: 'border-violet-500/20', bg: 'bg-violet-500/5', text: 'text-violet-400', dot: 'bg-violet-400' }
  }
  const c = accentColors[accent]

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <h2 className={`text-sm font-semibold ${c.text} uppercase tracking-wider`}>{title}</h2>
        <span className="text-xs text-zinc-600">({count})</span>
      </div>
      <div className={`${c.border} ${c.bg} border rounded-xl overflow-hidden divide-y divide-zinc-800/30`}>
        {reminders.map(rem => (
          <div key={rem.id} className="flex items-center gap-4 px-5 py-3.5 group">
            <button
              onClick={() => onToggle(rem.id)}
              className={`w-5 h-5 rounded border border-zinc-600 hover:border-current flex items-center justify-center flex-shrink-0 transition-colors ${c.text}`}
            >
              {rem.completed ? <span className="text-xs">&#10003;</span> : null}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200">{rem.message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-500">
                  {rem.first_name} {rem.last_name}
                </span>
                <span className="text-xs text-zinc-700">&middot;</span>
                <span className="text-xs text-zinc-500">
                  {new Date(rem.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {rem.repeat !== 'none' && (
                  <>
                    <span className="text-xs text-zinc-700">&middot;</span>
                    <span className={`text-xs ${c.text} opacity-60`}>{rem.repeat}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => onDelete(rem.id)}
              className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0"
            >
              &#10005;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

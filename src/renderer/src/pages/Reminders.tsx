import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Reminder } from '../types'
import EmptyState from '../components/ui/EmptyState'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function Reminders() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming')

  useEffect(() => { loadReminders().finally(() => setLoading(false)) }, [])

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
  const completed = reminders.filter(r => r.completed).sort((a, b) => b.due_date.localeCompare(a.due_date))

  const overdue = incomplete.filter(r => r.due_date < today)
  const dueToday = incomplete.filter(r => r.due_date === today)
  const thisWeek = incomplete.filter(r => r.due_date > today && r.due_date <= weekEnd)
  const later = incomplete.filter(r => r.due_date > weekEnd)

  const totalActive = incomplete.length

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 w-36 bg-zinc-800 rounded animate-pulse" />
          {[1,2,3].map(i => <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Reminders</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {totalActive === 0 ? 'All caught up!' : `${totalActive} active reminder${totalActive === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800/60">
          <button
            onClick={() => setTab('upcoming')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'upcoming'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Upcoming
            {totalActive > 0 && (
              <span className="ml-2 text-[10px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">{totalActive}</span>
            )}
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'completed'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Completed
            {completed.length > 0 && (
              <span className="ml-2 text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">{completed.length}</span>
            )}
          </button>
        </div>

        {tab === 'upcoming' ? (
          totalActive === 0 ? (
            <EmptyState
              icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>}
              title="No reminders set"
              body="Open a contact and add a reminder to stay on top of follow-ups."
              actionLabel="Go to Contacts"
              actionRoute="/contacts"
            />
          ) : (
            <div className="space-y-6">
              {overdue.length > 0 && (
                <ReminderSection title="Overdue" count={overdue.length} accent="red" reminders={overdue}
                  onToggle={handleToggle} onDelete={handleDelete} onContact={id => navigate(`/contacts?contactId=${id}`)} />
              )}
              {dueToday.length > 0 && (
                <ReminderSection title="Today" count={dueToday.length} accent="amber" reminders={dueToday}
                  onToggle={handleToggle} onDelete={handleDelete} onContact={id => navigate(`/contacts?contactId=${id}`)} />
              )}
              {thisWeek.length > 0 && (
                <ReminderSection title="This Week" count={thisWeek.length} accent="violet" reminders={thisWeek}
                  onToggle={handleToggle} onDelete={handleDelete} onContact={id => navigate(`/contacts?contactId=${id}`)} />
              )}
              {later.length > 0 && (
                <ReminderSection title="Later" count={later.length} accent="zinc" reminders={later}
                  onToggle={handleToggle} onDelete={handleDelete} onContact={id => navigate(`/contacts?contactId=${id}`)} />
              )}
            </div>
          )
        ) : (
          completed.length === 0 ? (
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-12 text-center">
              <p className="text-sm text-zinc-500">No completed reminders yet.</p>
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40">
              {completed.map(rem => (
                <div key={rem.id} className="flex items-center gap-4 px-5 py-3.5 group">
                  <button onClick={() => handleToggle(rem.id)}
                    className="w-5 h-5 rounded border border-emerald-400 dark:border-emerald-500 bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-500 dark:text-emerald-400 text-xs">&#10003;</span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 line-through">{rem.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button onClick={() => navigate(`/contacts?contactId=${rem.contact_id}`)}
                        className="text-xs text-violet-500 hover:text-violet-600 dark:hover:text-violet-300 transition-colors">
                        {rem.first_name} {rem.last_name}
                      </button>
                      <span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">
                        {new Date(rem.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {rem.repeat !== 'none' && (
                        <><span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span><span className="text-xs text-zinc-400 dark:text-zinc-600">{rem.repeat}</span></>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(rem.id)}
                    className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function ReminderSection({ title, count, accent, reminders, onToggle, onDelete, onContact }: {
  title: string; count: number; accent: 'red' | 'amber' | 'violet' | 'zinc'
  reminders: Reminder[]; onToggle: (id: number) => void; onDelete: (id: number) => void; onContact: (id: number) => void
}) {
  const accentColors = {
    red: { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-500 dark:text-red-400', dot: 'bg-red-400' },
    amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-500 dark:text-amber-400', dot: 'bg-amber-400' },
    violet: { border: 'border-violet-500/20', bg: 'bg-violet-500/5', text: 'text-violet-500 dark:text-violet-400', dot: 'bg-violet-400' },
    zinc: { border: 'border-zinc-200 dark:border-zinc-800/60', bg: 'bg-zinc-50 dark:bg-zinc-900/30', text: 'text-zinc-500', dot: 'bg-zinc-400' }
  }
  const c = accentColors[accent]

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <h2 className={`text-sm font-semibold ${c.text} uppercase tracking-wider`}>{title}</h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">({count})</span>
      </div>
      <div className={`${c.border} ${c.bg} border rounded-xl overflow-hidden divide-y divide-zinc-200/30 dark:divide-zinc-800/30`}>
        {reminders.map(rem => (
          <div key={rem.id} className="flex items-center gap-4 px-5 py-3.5 group">
            <button onClick={() => onToggle(rem.id)}
              className={`w-5 h-5 rounded border border-zinc-400 dark:border-zinc-600 hover:border-current flex items-center justify-center flex-shrink-0 transition-colors ${c.text}`}>
              {rem.completed ? <span className="text-xs">&#10003;</span> : null}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{rem.message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <button onClick={() => onContact(rem.contact_id)}
                  className="text-xs text-violet-500 hover:text-violet-600 dark:hover:text-violet-300 transition-colors">
                  {rem.first_name} {rem.last_name}
                </button>
                <span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span>
                <span className="text-xs text-zinc-500">
                  {new Date(rem.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {rem.repeat !== 'none' && (
                  <><span className="text-xs text-zinc-300 dark:text-zinc-700">&middot;</span><span className={`text-xs ${c.text} opacity-60`}>{rem.repeat}</span></>
                )}
              </div>
            </div>
            <button onClick={() => onDelete(rem.id)} className="text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm flex-shrink-0">&#10005;</button>
          </div>
        ))}
      </div>
    </div>
  )
}

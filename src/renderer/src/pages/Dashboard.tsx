import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact, Reminder } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const [contactCount, setContactCount] = useState(0)
  const [thisMonthCount, setThisMonthCount] = useState(0)
  const [weekInteractions, setWeekInteractions] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [dueToday, setDueToday] = useState<Reminder[]>([])
  const [recentContacts, setRecentContacts] = useState<Contact[]>([])
  const [recentContacted, setRecentContacted] = useState<(Contact & { last_interaction_date: string })[]>([])

  useEffect(() => {
    window.api.contacts.count().then(setContactCount)
    window.api.contacts.countThisMonth().then(c => setThisMonthCount(c as number))
    window.api.interactions.countThisWeek().then(c => setWeekInteractions(c as number))
    window.api.reminders.getOverdueCount().then(c => setOverdueCount(c as number))
    window.api.reminders.getDueToday().then(r => setDueToday(r as Reminder[]))
    window.api.contacts.getRecent(5).then(c => setRecentContacts(c as Contact[]))
    window.api.interactions.getRecentContacted(5).then(c => setRecentContacted(c as (Contact & { last_interaction_date: string })[]))
  }, [])

  async function handleToggleReminder(id: number) {
    await window.api.reminders.toggleComplete(id)
    const updated = await window.api.reminders.getDueToday()
    setDueToday(updated as Reminder[])
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Your relationship overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <StatCard label="Total Contacts" value={contactCount} accent="violet" />
          <StatCard label="Added This Month" value={thisMonthCount} accent="blue" />
          <StatCard label="Interactions This Week" value={weekInteractions} accent="emerald" />
          <StatCard label="Overdue Reminders" value={overdueCount} accent={overdueCount > 0 ? 'red' : 'zinc'} />
        </div>

        {/* Due Today */}
        {dueToday.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-4">Due Today</h2>
            <div className="space-y-2">
              {dueToday.map(rem => (
                <div key={rem.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
                  <button
                    onClick={() => handleToggleReminder(rem.id)}
                    className="w-5 h-5 rounded border border-zinc-600 hover:border-amber-400 flex items-center justify-center flex-shrink-0 transition-colors"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{rem.message}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{rem.first_name} {rem.last_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-2 gap-8">
          {/* Recently Added */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Recently Added</h2>
            {recentContacts.length === 0 ? (
              <p className="text-sm text-zinc-600">No contacts yet</p>
            ) : (
              <div className="space-y-1">
                {recentContacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => navigate('/contacts')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400 flex-shrink-0">
                      {c.first_name[0]}{c.last_name?.[0] || ''}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{c.first_name} {c.last_name}</p>
                      {c.company && <p className="text-xs text-zinc-500 truncate">{c.company}</p>}
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Recently Contacted */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Recently Contacted</h2>
            {recentContacted.length === 0 ? (
              <p className="text-sm text-zinc-600">No interactions logged yet</p>
            ) : (
              <div className="space-y-1">
                {recentContacted.map(c => (
                  <button
                    key={c.id}
                    onClick={() => navigate('/contacts')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400 flex-shrink-0">
                      {c.first_name[0]}{c.last_name?.[0] || ''}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{c.first_name} {c.last_name}</p>
                      {c.company && <p className="text-xs text-zinc-500 truncate">{c.company}</p>}
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(c.last_interaction_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Empty state for brand-new users */}
        {contactCount === 0 && (
          <div className="mt-10 text-center py-12">
            <div className="text-4xl mb-4">&#x1F91D;</div>
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">Welcome to Nexus</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Your personal CRM is ready. Start by adding your first contact.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
    zinc: 'from-zinc-800/50 to-zinc-800/30 border-zinc-700/30'
  }

  const textColors: Record<string, string> = {
    violet: 'text-violet-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    zinc: 'text-zinc-400'
  }

  return (
    <div className={`bg-gradient-to-br ${colors[accent] || colors.zinc} border rounded-xl p-5`}>
      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColors[accent] || textColors.zinc}`}>{value}</p>
    </div>
  )
}

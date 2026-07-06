import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact, Reminder } from '../types'
import { fetchUpcomingEvents } from '../lib/google-calendar'
import EmptyState from '../components/ui/EmptyState'

interface KeepInTouchContact extends Contact {
  days_overdue: number
  last_contact_date: string | null
}

interface BirthdayContact extends Contact {
  days_until: number
}

interface ActivityEvent {
  id: number
  event_type: 'interaction' | 'new_contact'
  event_date: string
  type?: string
  description?: string
  contact_id: number
  first_name: string
  last_name: string
}

interface HealthCounts {
  fresh: number
  good: number
  stale: number
  cold: number
  none: number
}

interface CalendarEventItem {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; self?: boolean }[]
}

interface NetworkUpdate {
  id: number
  description: string
  date: string
  contact_id: number
  first_name: string
  last_name: string
  company: string
  job_title: string
  photo_url: string
}

const TYPE_ICONS: Record<string, string> = {
  meeting: '\u{1F91D}', call: '\u{1F4DE}', email: '\u{1F4E7}', note: '\u{1F4DD}',
  coffee: '\u2615', event: '\u{1F3AF}', calendar: '\u{1F4C5}', job_change: '\u{1F4BC}',
  other: '\u{1F4AC}'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [contactCount, setContactCount] = useState(0)
  const [thisMonthCount, setThisMonthCount] = useState(0)
  const [weekInteractions, setWeekInteractions] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [dueToday, setDueToday] = useState<Reminder[]>([])
  const [keepInTouchDue, setKeepInTouchDue] = useState<KeepInTouchContact[]>([])
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayContact[]>([])
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([])
  const [healthCounts, setHealthCounts] = useState<HealthCounts>({ fresh: 0, good: 0, stale: 0, cold: 0, none: 0 })
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([])
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [googleConnected, setGoogleConnected] = useState(false)
  const [networkUpdates, setNetworkUpdates] = useState<NetworkUpdate[]>([])
  const [reconnection, setReconnection] = useState<{
    id: number; first_name: string; last_name: string; company: string;
    photo_url: string; days_since: number; message: string
  } | null>(null)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [checklistProgress, setChecklistProgress] = useState<{ done: number; total: number }>({ done: 0, total: 15 })
  const [checklistDismissed, setChecklistDismissed] = useState(true)

  useEffect(() => {
    Promise.all([
      window.api.contacts.count().then(setContactCount),
      window.api.contacts.countThisMonth().then(c => setThisMonthCount(c as number)),
      window.api.interactions.countThisWeek().then(c => setWeekInteractions(c as number)),
      window.api.reminders.getOverdueCount().then(c => setOverdueCount(c as number)),
      window.api.reminders.getDueToday().then(r => setDueToday(r as Reminder[])),
      window.api.dashboard.getKeepInTouchDue().then(r => setKeepInTouchDue(r as KeepInTouchContact[])),
      window.api.dashboard.getUpcomingBirthdays(30).then(r => setUpcomingBirthdays(r as BirthdayContact[])),
      window.api.dashboard.getActivityFeed(15).then(r => setActivityFeed(r as ActivityEvent[])),
      window.api.dashboard.getRelationshipHealth().then(r => setHealthCounts(r as HealthCounts)),
      window.api.dashboard.getNetworkUpdates(5).then(r => setNetworkUpdates(r as NetworkUpdate[])),
      window.api.contacts.countUncategorized().then(c => setUncategorizedCount(c as number)),
      window.api.onboarding.getProgress().then((prog: unknown) => {
        const p = prog as Record<string, string>
        setChecklistProgress({ done: Object.keys(p).length, total: 15 })
      }),
      window.api.settings.get('checklist_dismissed').then((v: unknown) => {
        setChecklistDismissed(v === 'true')
      }),
      window.api.dashboard.getReconnectionSuggestion().then((r: unknown) => setReconnection(r as typeof reconnection)),
      window.api.google.getStatus().then((status: unknown) => {
        const s = status as { connected: boolean }
        setGoogleConnected(s.connected)
        if (s.connected) loadCalendarEvents(new Date())
      })
    ]).finally(() => setLoading(false))
  }, [])

  async function loadCalendarEvents(date: Date) {
    try {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      const hoursUntilEndOfDay = (endOfDay.getTime() - Date.now()) / 3600000
      if (hoursUntilEndOfDay <= 0) {
        const token = await window.api.google.getAccessToken() as string | null
        if (!token) return
        const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
        url.searchParams.set('timeMin', startOfDay.toISOString())
        url.searchParams.set('timeMax', endOfDay.toISOString())
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        url.searchParams.set('maxResults', '20')
        const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
        if (response.ok) {
          const data = await response.json() as { items: CalendarEventItem[] }
          setCalendarEvents(data.items || [])
        }
      } else {
        const events = await fetchUpcomingEvents(Math.max(hoursUntilEndOfDay, 1))
        setCalendarEvents(events as CalendarEventItem[])
      }
    } catch {
      setCalendarEvents([])
    }
  }

  function navigateCalendarDate(direction: number) {
    const newDate = new Date(calendarDate)
    newDate.setDate(newDate.getDate() + direction)
    setCalendarDate(newDate)
    loadCalendarEvents(newDate)
  }

  function isToday(date: Date): boolean {
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  }

  async function handleToggleReminder(id: number) {
    await window.api.reminders.toggleComplete(id)
    const updated = await window.api.reminders.getDueToday()
    setDueToday(updated as Reminder[])
  }

  function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  function relativeTime(dateStr: string): string {
    const now = new Date()
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00')
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function getAvatarColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
    return `hsl(${hash % 360}, 50%, 40%)`
  }

  // Merge birthdays + network updates into one chronological feed
  const networkPulseItems = [
    ...upcomingBirthdays.slice(0, 5).map(c => ({
      id: `bday-${c.id}`,
      icon: '\u{1F382}',
      name: `${c.first_name} ${c.last_name}`,
      description: c.days_until === 0 ? 'Birthday today!' : c.days_until === 1 ? 'Birthday tomorrow' : `Birthday in ${c.days_until} days`,
      contactId: c.id,
      sortKey: c.days_until
    })),
    ...networkUpdates.map(u => ({
      id: `update-${u.id}`,
      icon: '\u{1F4BC}',
      name: `${u.first_name} ${u.last_name}`,
      description: u.description,
      contactId: u.contact_id,
      sortKey: Math.floor((new Date().getTime() - new Date(u.date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
    }))
  ].sort((a, b) => a.sortKey - b.sortKey)

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-64 bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            {[1,2,3,4].map(i => <div key={i} className="h-5 w-24 bg-zinc-800 rounded animate-pulse" />)}
          </div>
          {[1,2,3].map(i => (
            <div key={i} className="space-y-2 pb-6 border-b border-zinc-800/60">
              <div className="h-3 w-28 bg-zinc-800 rounded animate-pulse" />
              {[1,2].map(j => <div key={j} className="h-10 bg-zinc-800/50 rounded-lg animate-pulse" />)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{getGreeting()}!</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!checklistDismissed && checklistProgress.done < checklistProgress.total && (
              <button onClick={() => navigate('/onboarding')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800/40">
                Checklist {checklistProgress.done}/{checklistProgress.total}
              </button>
            )}
            {uncategorizedCount > 0 && (
              <button onClick={() => navigate('/quick-action')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors border border-violet-200 dark:border-violet-800/40">
                {'\u{26A1}'} Quick Action
                <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{uncategorizedCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Stat Bar */}
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{contactCount}</span> Contacts
          <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{thisMonthCount}</span> Added This Month
          <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{weekInteractions}</span> Interactions This Week
          {overdueCount > 0 && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">&middot;</span>
              <span className="font-semibold text-red-500">{overdueCount}</span> <span className="text-red-500">Overdue</span>
            </>
          )}
        </div>

        {/* Today's Agenda (Calendar) */}
        <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Today's Agenda</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => navigateCalendarDate(-1)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-xs">
                &#8249;
              </button>
              <button onClick={() => { setCalendarDate(new Date()); loadCalendarEvents(new Date()) }}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${isToday(calendarDate) ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                {isToday(calendarDate) ? 'Today' : calendarDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
              <button onClick={() => navigateCalendarDate(1)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-xs">
                &#8250;
              </button>
            </div>
          </div>
          {!googleConnected ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-600 py-2">Connect Google in Settings to see your calendar</p>
          ) : calendarEvents.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-600 py-2">No events {isToday(calendarDate) ? 'today' : 'on this day'}</p>
          ) : (
            <div className="space-y-1">
              {calendarEvents.map(ev => {
                const startTime = ev.start.dateTime
                  ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : 'All day'
                const endTime = ev.end?.dateTime
                  ? new Date(ev.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : ''
                const attendeeCount = ev.attendees ? ev.attendees.filter(a => !a.self).length : 0
                return (
                  <div key={ev.id} className="flex items-start gap-3 py-2">
                    <div className="w-1 h-7 rounded-full bg-violet-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{ev.summary || '(No title)'}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {startTime}{endTime ? ` - ${endTime}` : ''}
                        {attendeeCount > 0 && <span className="ml-2 text-zinc-400 dark:text-zinc-600">{attendeeCount} attendee{attendeeCount !== 1 ? 's' : ''}</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Reminders Due Today */}
        {dueToday.length > 0 && (
          <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
            <h2 className="text-xs font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wider mb-3">Reminders Due Today</h2>
            <div className="space-y-1">
              {dueToday.map(rem => (
                <div key={rem.id} className="flex items-center gap-3 py-2">
                  <button onClick={() => handleToggleReminder(rem.id)}
                    className="w-4 h-4 rounded border border-zinc-400 dark:border-zinc-600 hover:border-amber-400 flex items-center justify-center flex-shrink-0 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{rem.message}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{rem.first_name} {rem.last_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reach Out Today */}
        {keepInTouchDue.length > 0 && (
          <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider">Reach Out Today</h2>
              <button onClick={() => navigate('/keep-in-touch')} className="text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium">
                View all
              </button>
            </div>
            <div className="space-y-1">
              {keepInTouchDue.slice(0, 5).map(c => {
                const fullName = `${c.first_name} ${c.last_name}`.trim()
                return (
                  <button key={c.id}
                    onClick={() => navigate(`/contacts?contactId=${c.id}`)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/20 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: getAvatarColor(fullName) }}>
                      {c.first_name[0]}{c.last_name?.[0] || ''}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{fullName}</p>
                      {c.company && <p className="text-xs text-zinc-500 truncate">{c.company}</p>}
                    </div>
                    <span className="text-xs font-medium text-red-500 dark:text-red-400 flex-shrink-0">{c.days_overdue}d overdue</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Reconnection Suggestion */}
        {reconnection && (
          <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
            <h2 className="text-xs font-semibold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-3">Reconnect Today</h2>
            <button
              onClick={() => navigate(`/contacts?contactId=${reconnection.id}`)}
              className="w-full flex items-center gap-4 p-4 text-left bg-violet-50 dark:bg-violet-900/10 hover:bg-violet-100 dark:hover:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30 rounded-xl transition-colors"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: getAvatarColor(`${reconnection.first_name} ${reconnection.last_name}`) }}>
                {reconnection.first_name[0]}{reconnection.last_name?.[0] || ''}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {reconnection.first_name} {reconnection.last_name}
                  {reconnection.company && <span className="font-normal text-zinc-500"> at {reconnection.company}</span>}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{reconnection.message}</p>
              </div>
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400 flex-shrink-0">View &rarr;</span>
            </button>
          </section>
        )}

        {/* Network Pulse (birthdays + job changes merged) */}
        {networkPulseItems.length > 0 && (
          <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Network Pulse</h2>
            <div className="space-y-1">
              {networkPulseItems.slice(0, 8).map(item => (
                <button key={item.id}
                  onClick={() => navigate(`/contacts?contactId=${item.contactId}`)}
                  className="w-full flex items-center gap-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/20 rounded-lg px-2 -mx-2 transition-colors">
                  <span className="text-sm flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">
                      <span className="font-medium">{item.name}</span>
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{item.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Weekly Stats — Relationship Health */}
        {contactCount > 0 && (
          <section className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800/60">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Relationship Health</h2>
            <div className="flex flex-wrap gap-2">
              <HealthChip label="Fresh" count={healthCounts.fresh} dotColor="bg-emerald-400" />
              <HealthChip label="Good" count={healthCounts.good} dotColor="bg-blue-400" />
              <HealthChip label="Stale" count={healthCounts.stale} dotColor="bg-amber-400" />
              <HealthChip label="Cold" count={healthCounts.cold} dotColor="bg-red-400" />
              <HealthChip label="No Data" count={healthCounts.none} dotColor="bg-zinc-400" />
            </div>
          </section>
        )}

        {/* Activity Feed */}
        {activityFeed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Recent Activity</h2>
            <div className="space-y-0.5">
              {activityFeed.map((event, i) => (
                <button
                  key={`${event.event_type}-${event.id}-${i}`}
                  onClick={() => navigate(`/contacts?contactId=${event.contact_id}`)}
                  className="w-full flex items-start gap-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/20 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <span className="text-sm flex-shrink-0 mt-0.5">
                    {event.event_type === 'new_contact' ? '\u{2728}' : TYPE_ICONS[event.type || ''] || '\u{1F4AC}'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                      {event.event_type === 'new_contact'
                        ? <><span className="font-medium">{event.first_name} {event.last_name}</span> added</>
                        : <><span className="font-medium">{event.first_name} {event.last_name}</span> — {event.description}</>
                      }
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">{relativeTime(event.event_date)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Empty state for brand-new users */}
        {contactCount === 0 && (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>}
            title="Your network starts here"
            body="Add your first contact to get started."
            actionLabel="Add Contact"
            actionRoute="/contacts"
          />
        )}
      </div>
    </div>
  )
}

function HealthChip({ label, count, dotColor }: { label: string; count: number; dotColor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      {label} <span className="font-bold text-zinc-800 dark:text-zinc-200">{count}</span>
    </span>
  )
}

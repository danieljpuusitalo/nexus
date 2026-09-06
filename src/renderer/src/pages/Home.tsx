/**
 * Home: what happened recently, and who it was with.
 *
 * Deliberately not a dashboard. No counters, no charts, no streaks — those
 * measure the app, not the work. The only question this screen answers is
 * "what have I been talking about lately, and with whom", which is the same
 * question the whole product answers, just unfiltered by person.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Conversation, { type LedgerMeeting, relativeDate } from '../components/Conversation'

interface PersonRow {
  id: number
  first_name: string
  last_name: string
  conversations: number
  last_conversation_at: string
}

export default function Home(): React.JSX.Element {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<LedgerMeeting[]>([])
  const [people, setPeople] = useState<PersonRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([window.api.ledger.getRecent(15), window.api.ledger.getPeople(8)])
      .then(([ms, ps]) => {
        setRecent(ms as LedgerMeeting[])
        setPeople(ps as PersonRow[])
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6 max-w-3xl space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        ))}
      </div>
    )
  }

  // Nothing ingested yet. Say what to do rather than showing an empty shell.
  if (recent.length === 0) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Every conversation, in one place
        </h1>
        <p className="text-sm text-zinc-500 mt-1 mb-6">
          Nexus reads what your notetaker already writes and files it against the people who were
          there — whichever tool recorded it.
        </p>
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-500">No conversations yet.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
            Point Nexus at the folder your notetaker exports to and it will do the rest.
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700"
          >
            Connect a source
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Recent</h1>
      <p className="text-sm text-zinc-500 mb-5">Your latest conversations, whoever recorded them.</p>

      {people.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-5 border-b border-zinc-200 dark:border-zinc-800/60">
          {people.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/people/${p.id}`)}
              title={`${p.conversations} conversation${p.conversations === 1 ? '' : 's'}`}
              className="shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800/60 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-semibold">
                {`${p.first_name.charAt(0)}${p.last_name.charAt(0)}`.toUpperCase()}
              </span>
              <span className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                {p.first_name}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 whitespace-nowrap">
                {relativeDate(p.last_conversation_at)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {recent.map(m => (
          <Conversation key={m.id} meeting={m} />
        ))}
      </div>
    </div>
  )
}

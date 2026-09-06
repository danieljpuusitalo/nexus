/**
 * Everyone you have had a conversation with.
 *
 * Not a contact list — nothing here was typed in. These people exist because
 * the record says you spoke to them, which is why there is no "add person"
 * button and no empty state asking you to import anything. Connect a source
 * and the list fills itself.
 *
 * Ordered by recency rather than alphabetically: the person you spoke to
 * yesterday is far more likely to be the one you are looking for than the one
 * whose surname starts with A.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { relativeDate } from '../components/Conversation'

interface PersonRow {
  id: number
  first_name: string
  last_name: string
  email: string
  company: string | null
  conversations: number
  last_conversation_at: string
  last_title: string | null
}

function initials(p: PersonRow): string {
  return `${p.first_name.charAt(0)}${p.last_name.charAt(0)}`.toUpperCase() || '?'
}

export default function People(): React.JSX.Element {
  const navigate = useNavigate()
  const [people, setPeople] = useState<PersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    window.api.ledger
      .getPeople()
      .then((rows: unknown) => setPeople(rows as PersonRow[]))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(p =>
      `${p.first_name} ${p.last_name} ${p.email || ''} ${p.company || ''}`.toLowerCase().includes(q)
    )
  }, [people, query])

  if (loading) {
    return (
      <div className="p-6 space-y-2 max-w-3xl">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">People</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {people.length === 0
            ? 'Nobody yet. Connect a source in Settings and the people you talk to will appear here.'
            : `${people.length} ${people.length === 1 ? 'person' : 'people'} you have spoken to.`}
        </p>
      </div>

      {people.length > 0 && (
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search people…"
          className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
      )}

      {people.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-500">No conversations recorded yet.</p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700"
          >
            Connect a source
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/people/${p.id}`)}
              className="w-full text-left flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 px-4 py-3 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors"
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                {initials(p)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {`${p.first_name} ${p.last_name}`.trim()}
                  {p.company ? (
                    <span className="font-normal text-zinc-500"> · {p.company}</span>
                  ) : null}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {p.conversations} conversation{p.conversations === 1 ? '' : 's'}
                  {p.last_title ? ` · ${p.last_title}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
                {relativeDate(p.last_conversation_at)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">Nobody matches that search.</p>
          )}
        </div>
      )}
    </div>
  )
}

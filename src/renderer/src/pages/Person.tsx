/**
 * A person, and every conversation you have had with them.
 *
 * This is the product. Every notetaker keeps a flat chronological list trapped
 * inside itself; to find what you discussed with someone you scroll and search
 * inside Tactiq, then inside Fathom, then inside your inbox. This page inverts
 * that: one person, one page, every conversation, whichever tool recorded it.
 *
 * Everything else on this screen exists to serve that list. There is no edit
 * form, no tag picker, no custom fields — the record is not something you
 * maintain, it is something that accumulates.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Conversation, { type LedgerMeeting, formatDate, relativeDate } from '../components/Conversation'

interface PersonHeader {
  id: number
  first_name: string
  last_name: string
  email: string
  company: string | null
  job_title: string | null
  linkedin_url: string | null
  conversations: number
  first_conversation_at: string | null
  last_conversation_at: string | null
}

export default function Person(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contactId = Number(id)

  const [person, setPerson] = useState<PersonHeader | null>(null)
  const [meetings, setMeetings] = useState<LedgerMeeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!Number.isFinite(contactId)) return
    let cancelled = false
    setLoading(true)

    Promise.all([
      window.api.ledger.getPerson(contactId),
      window.api.ledger.getForContact(contactId),
    ])
      .then(([p, ms]) => {
        if (cancelled) return
        setPerson(p as PersonHeader | null)
        setMeetings(ms as LedgerMeeting[])
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [contactId])

  if (loading) {
    return (
      <div className="p-6 max-w-3xl space-y-3">
        <div className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
      </div>
    )
  }

  if (!person) {
    return (
      <div className="p-6 max-w-3xl">
        <button onClick={() => navigate('/people')} className="text-sm text-violet-600 hover:underline">
          ← People
        </button>
        <p className="mt-6 text-sm text-zinc-500">That person is no longer in the record.</p>
      </div>
    )
  }

  const fullName = `${person.first_name} ${person.last_name}`.trim()
  const initials =
    `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`.toUpperCase() || '?'

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => navigate('/people')}
        className="text-sm text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400"
      >
        ← People
      </button>

      <header className="flex items-start gap-4 mt-4 mb-6">
        <div className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-lg font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{fullName}</h1>
          {(person.job_title || person.company) && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {[person.job_title, person.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              className="text-xs text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400"
            >
              {person.email}
            </a>
          )}
        </div>
      </header>

      {/* The one number worth stating up front: how long this relationship has
          been on the record, and when it was last alive. */}
      {person.conversations > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500 mb-6 pb-5 border-b border-zinc-200 dark:border-zinc-800/60">
          <span>
            <span className="text-zinc-900 dark:text-zinc-100 font-medium">
              {person.conversations}
            </span>{' '}
            conversation{person.conversations === 1 ? '' : 's'}
          </span>
          {person.last_conversation_at && (
            <span>
              Last spoke{' '}
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                {relativeDate(person.last_conversation_at)}
              </span>
            </span>
          )}
          {person.first_conversation_at && (
            <span>Known since {formatDate(person.first_conversation_at)}</span>
          )}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-500">No conversations recorded with {person.first_name} yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => (
            <Conversation key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  )
}

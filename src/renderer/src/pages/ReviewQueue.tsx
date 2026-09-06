/**
 * The review queue: people the ledger could not place.
 *
 * The resolver refuses to guess. When two contacts fit a name, or none do, the
 * participant link is left empty and lands here instead of being silently
 * attached to whoever the database happened to return first. That refusal is
 * only worth anything if the leftovers are easy to fix, which is what this
 * screen is for — one question, two buttons, done.
 *
 * A silent wrong link is the one failure a per-person ledger cannot absorb: it
 * is invisible once written, and every view built on top of it inherits it.
 */

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import type { Contact } from '../types'

interface QueueRow {
  id: number
  meeting_id: number
  raw_name: string
  raw_email: string
  resolution: 'ambiguous' | 'unresolved'
  title: string
  started_at: string
  source: string
}

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function labelOf(row: QueueRow): string {
  return row.raw_name || row.raw_email || '(unnamed attendee)'
}

export default function ReviewQueue(): React.JSX.Element {
  const { toast } = useToast()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [openFor, setOpenFor] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  async function load(): Promise<void> {
    const [queue, all] = await Promise.all([
      window.api.ledger.getReviewQueue(200),
      window.api.contacts.getAll(),
    ])
    setRows(queue as QueueRow[])
    setContacts(all as Contact[])
  }

  useEffect(() => {
    load()
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  // Ambiguous first: those are the ones where we know the person is already in
  // the database and only need to be told which one.
  const ordered = useMemo(
    () => [...rows].sort((a, b) => (a.resolution === b.resolution ? 0 : a.resolution === 'ambiguous' ? -1 : 1)),
    [rows]
  )

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = contacts.filter(c => {
      if (!q) return true
      return `${c.first_name} ${c.last_name} ${c.email || ''}`.toLowerCase().includes(q)
    })
    return list.slice(0, 30)
  }, [contacts, search])

  async function assign(row: QueueRow, contactId: number, contactName: string): Promise<void> {
    setBusy(row.id)
    try {
      const res = (await window.api.ledger.assignParticipant(row.id, contactId)) as { ok: boolean }
      if (!res?.ok) {
        toast('Could not link that person — try reloading', 'error')
        return
      }
      setRows(prev => prev.filter(r => r.id !== row.id))
      setOpenFor(null)
      setSearch('')
      toast(`Linked to ${contactName}`, 'success')
    } catch {
      toast('Could not link that person', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function createAndAssign(row: QueueRow): Promise<void> {
    const label = labelOf(row)
    // Split on the last space so "Davide Mazzanti" and single names both work.
    const parts = (row.raw_name || '').trim().split(/\s+/)
    const first = parts[0] || row.raw_email || 'Unknown'
    const last = parts.length > 1 ? parts.slice(1).join(' ') : ''

    setBusy(row.id)
    try {
      const created = (await window.api.contacts.create({
        first_name: first,
        last_name: last,
        email: row.raw_email || '',
      })) as { id: number } | null
      if (!created?.id) {
        toast('Could not create that contact', 'error')
        return
      }
      await window.api.ledger.assignParticipant(row.id, created.id)
      setRows(prev => prev.filter(r => r.id !== row.id))
      setOpenFor(null)
      toast(`Created ${label} and linked the meeting`, 'success')
      load().catch(() => undefined)
    } catch {
      toast('Could not create that contact', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Who is this?</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {ordered.length === 0
            ? 'Everyone in your meetings has been matched to a contact.'
            : `${ordered.length} ${ordered.length === 1 ? 'person' : 'people'} in your meetings could not be matched. Nexus never guesses — a wrong link is invisible once made.`}
        </p>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          title="Nothing to review"
          body="Attendees Nexus cannot place will show up here instead of being attached to the wrong person."
        />
      ) : (
        <div className="space-y-2">
          {ordered.map(row => (
            <div
              key={row.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {labelOf(row)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {row.title || 'Untitled meeting'} · {formatDate(row.started_at)}
                    {row.source ? ` · ${row.source === 'file' ? 'Imported file' : row.source}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    row.resolution === 'ambiguous'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                  title={
                    row.resolution === 'ambiguous'
                      ? 'Several contacts matched this name'
                      : 'No contact matched this name'
                  }
                >
                  {row.resolution === 'ambiguous' ? 'Several matches' : 'No match'}
                </span>
              </div>

              {openFor === row.id ? (
                <div className="mt-3">
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search your contacts…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800/60">
                    {candidates.length === 0 ? (
                      <p className="p-3 text-xs text-zinc-500">No contacts match that search.</p>
                    ) : (
                      candidates.map(c => (
                        <button
                          key={c.id}
                          disabled={busy === row.id}
                          onClick={() => assign(row, c.id, `${c.first_name} ${c.last_name}`.trim())}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-50"
                        >
                          {`${c.first_name} ${c.last_name}`.trim()}
                          {c.email ? (
                            <span className="text-zinc-400 dark:text-zinc-600"> · {c.email}</span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setOpenFor(null)
                      setSearch('')
                    }}
                    className="mt-2 text-xs text-zinc-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    disabled={busy === row.id}
                    onClick={() => {
                      setOpenFor(row.id)
                      // Ambiguous names already match contacts — pre-filter to them.
                      setSearch(row.resolution === 'ambiguous' ? row.raw_name : '')
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    Pick a contact
                  </button>
                  <button
                    disabled={busy === row.id}
                    onClick={() => createAndAssign(row)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                  >
                    Create new contact
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { Contact } from '../types'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'

interface DuplicatePair {
  contact1: Contact
  contact2: Contact
  matchType: 'email' | 'name'
  score: number
}

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

export default function MergeFix() {
  const { toast } = useToast()
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DuplicatePair | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeConfirm, setMergeConfirm] = useState<{ keepId: number; mergeId: number; keepName: string } | null>(null)

  useEffect(() => {
    loadDuplicates()
  }, [])

  async function loadDuplicates() {
    setLoading(true)
    const pairs = await window.api.contacts.findDuplicates() as DuplicatePair[]
    setDuplicates(pairs)
    setLoading(false)
  }

  async function handleMerge(keepId: number, mergeId: number) {
    setMerging(true)
    const result = await window.api.contacts.merge(keepId, mergeId) as { success: boolean }
    if (result?.success) {
      toast('Contacts combined successfully')
    } else {
      toast('Something went wrong. Try again?', 'error')
    }
    setSelected(null)
    setMerging(false)
    setMergeConfirm(null)
    await loadDuplicates()
  }

  async function handleDismiss(pair: DuplicatePair) {
    setDuplicates(prev => prev.filter(p => p !== pair))
    if (selected === pair) setSelected(null)
  }

  const COMPARE_FIELDS: { key: keyof Contact; label: string }[] = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'linkedin_url', label: 'LinkedIn' },
    { key: 'website', label: 'Website' },
    { key: 'twitter_url', label: 'Twitter' },
    { key: 'facebook_url', label: 'Facebook' },
    { key: 'instagram_url', label: 'Instagram' },
    { key: 'location', label: 'Location' },
    { key: 'address', label: 'Address' },
    { key: 'education', label: 'Education' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'notes', label: 'Notes' },
    { key: 'how_we_met', label: 'How We Met' },
  ]

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Clean Up</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Find contacts that might be the same person and combine them into one.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-400 animate-pulse">Looking for contacts that might be the same person...</p>
          </div>
        ) : duplicates.length === 0 ? (
          <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-12 text-center">
            <p className="text-4xl mb-3">&#10003;</p>
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">No matches found</p>
            <p className="text-sm text-zinc-500 mt-1">Your contacts are clean!</p>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Duplicate pairs list */}
            <div className="w-80 flex-shrink-0">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                {duplicates.length} possible match{duplicates.length !== 1 ? 'es' : ''}
              </p>
              <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/40 max-h-[70vh] overflow-y-auto">
                {duplicates.map((pair, i) => (
                  <button key={i} onClick={() => setSelected(pair)}
                    className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${selected === pair ? 'bg-violet-50 dark:bg-violet-900/20 border-l-2 border-violet-500' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-900"
                          style={{ backgroundColor: getAvatarColor(`${pair.contact1.first_name} ${pair.contact1.last_name}`) }}>
                          {pair.contact1.first_name[0]}{pair.contact1.last_name?.[0] || ''}
                        </div>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white dark:border-zinc-900"
                          style={{ backgroundColor: getAvatarColor(`${pair.contact2.first_name} ${pair.contact2.last_name}`) }}>
                          {pair.contact2.first_name[0]}{pair.contact2.last_name?.[0] || ''}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {pair.contact1.first_name} {pair.contact1.last_name}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">
                          & {pair.contact2.first_name} {pair.contact2.last_name}
                        </p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pair.matchType === 'email' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                        {pair.matchType}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison view */}
            <div className="flex-1 min-w-0">
              {!selected ? (
                <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-12 text-center">
                  <p className="text-sm text-zinc-400">Select a pair to compare</p>
                </div>
              ) : (
                <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_1fr] border-b border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/50">
                    <div className="px-4 py-3 text-center">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {selected.contact1.first_name} {selected.contact1.last_name}
                      </p>
                      {selected.contact1.company && <p className="text-xs text-zinc-500">{selected.contact1.company}</p>}
                    </div>
                    <div className="px-4 py-3 text-center border-l border-zinc-200 dark:border-zinc-800/60">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {selected.contact2.first_name} {selected.contact2.last_name}
                      </p>
                      {selected.contact2.company && <p className="text-xs text-zinc-500">{selected.contact2.company}</p>}
                    </div>
                  </div>

                  {/* Field comparison */}
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40 max-h-[50vh] overflow-y-auto">
                    {COMPARE_FIELDS.map(({ key, label }) => {
                      const v1 = String(selected.contact1[key] || '')
                      const v2 = String(selected.contact2[key] || '')
                      if (!v1 && !v2) return null
                      const differs = v1 !== v2
                      return (
                        <div key={key} className="grid grid-cols-[1fr_1fr]">
                          <div className={`px-4 py-2 ${differs && v1 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                            <p className="text-[10px] text-zinc-400 uppercase">{label}</p>
                            <p className="text-xs text-zinc-800 dark:text-zinc-200 break-words">{v1 || <span className="text-zinc-300 dark:text-zinc-700">-</span>}</p>
                          </div>
                          <div className={`px-4 py-2 border-l border-zinc-200 dark:border-zinc-800/60 ${differs && v2 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                            <p className="text-[10px] text-zinc-400 uppercase">{label}</p>
                            <p className="text-xs text-zinc-800 dark:text-zinc-200 break-words">{v2 || <span className="text-zinc-300 dark:text-zinc-700">-</span>}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-[1fr_1fr] border-t border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/50">
                    <div className="px-4 py-3 text-center">
                      <button onClick={() => setMergeConfirm({ keepId: selected.contact1.id, mergeId: selected.contact2.id, keepName: `${selected.contact1.first_name} ${selected.contact1.last_name}` })} disabled={merging}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors">
                        {merging ? 'Merging...' : 'Keep this one'}
                      </button>
                    </div>
                    <div className="px-4 py-3 text-center border-l border-zinc-200 dark:border-zinc-800/60">
                      <button onClick={() => setMergeConfirm({ keepId: selected.contact2.id, mergeId: selected.contact1.id, keepName: `${selected.contact2.first_name} ${selected.contact2.last_name}` })} disabled={merging}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors">
                        {merging ? 'Merging...' : 'Keep this one'}
                      </button>
                    </div>
                  </div>
                  <div className="text-center py-2 border-t border-zinc-100 dark:border-zinc-800/40">
                    <button onClick={() => handleDismiss(selected)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                      Not the same person &mdash; dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!mergeConfirm}
        title="Combine these contacts?"
        message={mergeConfirm ? `Keep "${mergeConfirm.keepName}" and add the other contact's details to it. The other contact will be removed. This can't be undone.` : ''}
        confirmLabel="Combine"
        destructive
        onConfirm={() => mergeConfirm && handleMerge(mergeConfirm.keepId, mergeConfirm.mergeId)}
        onCancel={() => setMergeConfirm(null)}
      />
    </div>
  )
}

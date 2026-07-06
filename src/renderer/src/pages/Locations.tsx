import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface LocationStat {
  location: string
  contact_count: number
}

interface ContactBasic {
  id: number
  first_name: string
  last_name: string
  company: string
  photo_url: string
}

export default function Locations() {
  const navigate = useNavigate()
  const [locationStats, setLocationStats] = useState<LocationStat[]>([])
  const [unlocated, setUnlocated] = useState<ContactBasic[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [locationContacts, setLocationContacts] = useState<ContactBasic[]>([])
  const [editingContact, setEditingContact] = useState<number | null>(null)
  const [editLocation, setEditLocation] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const stats = await window.api.contacts.getLocationStats() as LocationStat[]
    setLocationStats(stats)
    const noLoc = await window.api.contacts.getWithoutLocation() as ContactBasic[]
    setUnlocated(noLoc)
  }

  async function handleSelectLocation(location: string) {
    setSelectedLocation(location)
    const contacts = await window.api.contacts.getByLocation(location) as ContactBasic[]
    setLocationContacts(contacts)
  }

  async function handleSetLocation(contactId: number, location: string) {
    await window.api.contacts.setLocation(contactId, location)
    setEditingContact(null)
    setEditLocation('')
    await loadData()
    if (selectedLocation) {
      const contacts = await window.api.contacts.getByLocation(selectedLocation) as ContactBasic[]
      setLocationContacts(contacts)
    }
  }

  function getInitials(first: string, last: string): string {
    return (first[0] || '') + (last?.[0] || '')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Locations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {locationStats.length} location{locationStats.length !== 1 ? 's' : ''} &middot; {unlocated.length} without location
          </p>
        </div>
        <button
          onClick={() => navigate('/map')}
          className="px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
        >
          Open Map
        </button>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">
        {/* Left: Contacts without location */}
        <div className="w-80 flex-shrink-0 border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800/60">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Without Location</h2>
            <p className="text-xs text-zinc-500">{unlocated.length} contacts</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {unlocated.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/30 group">
                <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden">
                  {c.photo_url ? (
                    <img src={`file://${c.photo_url}`} className="w-full h-full object-cover" />
                  ) : (
                    getInitials(c.first_name, c.last_name)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => navigate(`/contacts?contactId=${c.id}`)}
                    className="text-sm text-zinc-700 dark:text-zinc-300 hover:text-violet-600 dark:hover:text-violet-400 truncate block transition-colors">
                    {c.first_name} {c.last_name}
                  </button>
                  {c.company && <p className="text-xs text-zinc-400 truncate">{c.company}</p>}
                </div>
                {editingContact === c.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editLocation}
                      onChange={e => setEditLocation(e.target.value)}
                      placeholder="City, Country"
                      className="w-32 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700/50 rounded px-2 py-1 text-xs outline-none focus:border-violet-500/50"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSetLocation(c.id, editLocation); if (e.key === 'Escape') setEditingContact(null) }}
                    />
                    <button onClick={() => handleSetLocation(c.id, editLocation)}
                      className="text-xs text-emerald-500 hover:text-emerald-600 font-medium">Set</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingContact(c.id); setEditLocation('') }}
                    className="text-xs text-zinc-400 hover:text-violet-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    + Location
                  </button>
                )}
              </div>
            ))}
            {unlocated.length === 0 && (
              <p className="text-sm text-zinc-500 py-8 text-center">All contacts have locations!</p>
            )}
          </div>
        </div>

        {/* Right: Location buckets */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {locationStats.map(stat => (
                <button key={stat.location}
                  onClick={() => handleSelectLocation(stat.location)}
                  className={`text-left px-4 py-3 border rounded-xl transition-colors ${
                    selectedLocation === stat.location
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-zinc-200 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{stat.location}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-600 flex-shrink-0 ml-2 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                      {stat.contact_count}
                    </span>
                  </div>
                </button>
              ))}
              {locationStats.length === 0 && (
                <div className="col-span-2 text-center py-12">
                  <p className="text-sm text-zinc-500">No locations found. Add locations to your contacts to see them here.</p>
                </div>
              )}
            </div>

            {/* Selected location contacts */}
            {selectedLocation && locationContacts.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedLocation}</h3>
                  <button onClick={() => { setSelectedLocation(null); setLocationContacts([]) }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Close</button>
                </div>
                <div className="border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/30">
                  {locationContacts.map(c => (
                    <button key={c.id}
                      onClick={() => navigate(`/contacts?contactId=${c.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left">
                      <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden">
                        {c.photo_url ? (
                          <img src={`file://${c.photo_url}`} className="w-full h-full object-cover" />
                        ) : (
                          getInitials(c.first_name, c.last_name)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.first_name} {c.last_name}</p>
                        {c.company && <p className="text-xs text-zinc-500 truncate">{c.company}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

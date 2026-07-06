import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import EmptyState from '../components/ui/EmptyState'

const GroupsTree = lazy(() => import('../components/viz/GroupsTree'))
const RelatedWeb = lazy(() => import('../components/viz/RelatedWeb'))

type MapTab = 'map' | 'groups-tree' | 'related-web'

interface LocationStat {
  location: string
  contact_count: number
}

interface ContactPin {
  id: number
  first_name: string
  last_name: string
  company: string
  photo_url: string
  location: string
}

// Simple geocode cache so we don't re-fetch on every render
const geocodeCache = new Map<string, [number, number] | null>()

// Rate-limit Nominatim: 1 request per second
let lastGeocode = 0

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  if (geocodeCache.has(location)) return geocodeCache.get(location)!
  try {
    const now = Date.now()
    const wait = Math.max(0, 1100 - (now - lastGeocode))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastGeocode = Date.now()

    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
      { headers: { 'User-Agent': 'NexusCRM/1.0' } }
    )
    const data = await resp.json()
    if (data.length > 0) {
      const result: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      geocodeCache.set(location, result)
      return result
    }
  } catch {
    // ignore geocode failures
  }
  geocodeCache.set(location, null)
  return null
}

export default function MapView() {
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [locationStats, setLocationStats] = useState<LocationStat[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [selectedContacts, setSelectedContacts] = useState<ContactPin[]>([])
  const [geocodedCount, setGeocodedCount] = useState(0)
  const [totalLocations, setTotalLocations] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<MapTab>('map')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    loadLocationStats()
  }, [])

  async function loadLocationStats() {
    const stats = await window.api.contacts.getLocationStats() as LocationStat[]
    setLocationStats(stats)
    setTotalLocations(stats.length)
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current).setView([30, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map)

    mapInstanceRef.current = map

    // Leaflet needs invalidateSize after the flex layout settles
    const raf = requestAnimationFrame(() => map.invalidateSize())

    // ResizeObserver to handle any container size changes (sidebar, window resize)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(mapRef.current)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Add markers for locations
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || locationStats.length === 0) return

    let mounted = true
    const markers: L.Marker[] = []

    async function addMarkers() {
      let count = 0
      for (const stat of locationStats) {
        if (!mounted) break
        const coords = await geocodeLocation(stat.location)
        if (coords && mounted) {
          const marker = L.marker(coords)
            .addTo(map!)
            .bindPopup(`<b>${stat.location}</b><br>${stat.contact_count} contact${stat.contact_count > 1 ? 's' : ''}`)
            .on('click', () => handleLocationClick(stat.location))
          markers.push(marker)
        }
        count++
        if (mounted) setGeocodedCount(count)
      }

      // Fit bounds if we have markers
      if (markers.length > 0 && mounted) {
        const group = L.featureGroup(markers)
        map!.fitBounds(group.getBounds().pad(0.1))
      }
    }

    addMarkers()

    return () => {
      mounted = false
      markers.forEach(m => m.remove())
    }
  }, [locationStats])

  // Invalidate map size when tab switches back to map (display:none → contents)
  useEffect(() => {
    if (activeTab !== 'map') return
    // Small delay to let display:contents take effect before Leaflet recalculates
    const timer = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 50)
    return () => clearTimeout(timer)
  }, [activeTab])

  async function handleLocationClick(location: string) {
    setSelectedLocation(location)
    setSidebarOpen(true)
    const contacts = await window.api.contacts.getByLocation(location) as ContactPin[]
    setSelectedContacts(contacts)
  }

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!searchQuery.trim() || !mapInstanceRef.current) return
    const coords = await geocodeLocation(searchQuery.trim())
    if (coords) {
      mapInstanceRef.current.setView(coords, 10)
    }
  }

  function getInitials(first: string, last: string): string {
    return (first[0] || '') + (last?.[0] || '')
  }

  const totalContacts = locationStats.reduce((sum, s) => sum + s.contact_count, 0)

  const tabClass = (tab: MapTab) =>
    `px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
      activeTab === tab
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
    }`

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Map</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {activeTab === 'map' ? (
              <>
                {totalContacts} contact{totalContacts !== 1 ? 's' : ''} across {totalLocations} location{totalLocations !== 1 ? 's' : ''}
                {geocodedCount < totalLocations && (
                  <span className="text-zinc-400 ml-2">({geocodedCount}/{totalLocations} mapped)</span>
                )}
              </>
            ) : activeTab === 'groups-tree' ? 'Interactive group network visualization' : 'Contact relationship network'}
          </p>
        </div>
        <button
          onClick={() => navigate('/locations')}
          className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
        >
          Contacts by Location
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-3 border-b border-zinc-200 dark:border-zinc-800/60">
        <button onClick={() => setActiveTab('map')} className={tabClass('map')}>Map</button>
        <button onClick={() => setActiveTab('groups-tree')} className={tabClass('groups-tree')}>Groups Tree</button>
        <button onClick={() => setActiveTab('related-web')} className={tabClass('related-web')}>Related Web</button>
      </div>

      {/* Map tab — use CSS display to keep the map div in the DOM across tab switches */}
      <div style={{ display: activeTab === 'map' ? 'contents' : 'none' }}>
      {/* Search */}
      <div className="px-4 pb-3">
        <form onSubmit={handleSearchSubmit} className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Go to location..."
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
          />
        </form>
      </div>

      {/* Map + Sidebar */}
      <div className="flex-1 flex min-h-0 px-4 pb-4 gap-3">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800/60 relative">
          <div ref={mapRef} className="w-full h-full" />
          {/* Sidebar toggle button */}
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="absolute top-3 right-3 z-[1000] w-8 h-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-lg flex items-center justify-center shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-4 h-4 text-zinc-600 dark:text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {sidebarOpen ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
            </svg>
          </button>
        </div>

        {/* Right Sidebar */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 overflow-y-auto">
            {selectedLocation ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedLocation}</h2>
                  <button onClick={() => { setSelectedLocation(null); setSelectedContacts([]); setSidebarOpen(false) }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                    Close
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mb-3">{selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''}</p>
                <div className="space-y-1">
                  {selectedContacts.map(c => (
                    <button key={c.id}
                      onClick={() => navigate(`/contacts?contactId=${c.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-left">
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
            ) : (
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Locations</h2>
                <div className="space-y-0.5">
                  {locationStats.map(stat => (
                    <button key={stat.location}
                      onClick={() => handleLocationClick(stat.location)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors text-left">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{stat.location}</span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-600 flex-shrink-0 ml-2">{stat.contact_count}</span>
                    </button>
                  ))}
                  {locationStats.length === 0 && (
                    <EmptyState
                      icon={<svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
                      title="No contacts with locations"
                      body="Add locations in the Locations page."
                      actionLabel="Go to Locations"
                      actionRoute="/locations"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {activeTab === 'groups-tree' && (
        <div className="flex-1 min-h-0 px-4 pb-4">
          <div className="h-full border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden bg-white dark:bg-zinc-950">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading...</div>}>
              <GroupsTree />
            </Suspense>
          </div>
        </div>
      )}

      {activeTab === 'related-web' && (
        <div className="flex-1 min-h-0 px-4 pb-4">
          <div className="h-full border border-zinc-200 dark:border-zinc-800/60 rounded-xl overflow-hidden bg-white dark:bg-zinc-950">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading...</div>}>
              <RelatedWeb />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

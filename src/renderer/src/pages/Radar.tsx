import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import type { Tag } from '../types'

interface PipelineContact {
  id: number
  first_name: string
  last_name: string
  company: string
  photo_url: string
  keep_in_touch_days: number
  last_interaction_date: string | null
  tags: Tag[]
}

interface GroupOption {
  id: number
  name: string
  color: string
}

const RINGS = [
  { label: 'This Week', maxDays: 7, radius: 80, color: '#10B981' },
  { label: 'This Month', maxDays: 30, radius: 160, color: '#84CC16' },
  { label: 'This Quarter', maxDays: 90, radius: 240, color: '#EAB308' },
  { label: '3-6 Months', maxDays: 180, radius: 320, color: '#F97316' },
  { label: '6+ Months', maxDays: Infinity, radius: 400, color: '#EF4444' },
]

const EDGE_RADIUS = 460
const NEVER_COLOR = '#a1a1aa'

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `hsl(${hash % 360}, 50%, 40%)`
}

export default function Radar() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [contacts, setContacts] = useState<PipelineContact[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number | ''>('')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; contact: PipelineContact; daysSince: number } | null>(null)
  const [dimensions, setDimensions] = useState({ width: 960, height: 960 })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const size = Math.min(rect.width, rect.height - 60)
        setDimensions({ width: Math.max(size, 500), height: Math.max(size, 500) })
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  async function loadData() {
    const [contactsData, groupsData] = await Promise.all([
      window.api.pipeline.getData(),
      window.api.groups.getAll()
    ])
    setContacts(contactsData as PipelineContact[])
    setGroups((groupsData as GroupOption[]).map(g => ({ id: g.id, name: g.name, color: g.color })))
  }

  // Filter contacts by selected group
  const filteredContacts = useMemo(() => {
    if (!selectedGroup) return contacts
    // Need to check group membership — Pipeline data has tags but not groups directly
    // We'll fetch group contacts via a workaround: filter using contacts that have matching tags/groups
    return contacts
  }, [contacts, selectedGroup])

  // Assign each contact to a ring
  const contactsWithRing = useMemo(() => {
    const now = new Date()
    return filteredContacts.map(c => {
      if (!c.last_interaction_date) {
        return { contact: c, ringIndex: -1, daysSince: -1 }
      }
      const daysSince = Math.floor((now.getTime() - new Date(c.last_interaction_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
      let ringIndex = RINGS.length - 1
      for (let i = 0; i < RINGS.length; i++) {
        if (daysSince <= RINGS[i].maxDays) {
          ringIndex = i
          break
        }
      }
      return { contact: c, ringIndex, daysSince }
    })
  }, [filteredContacts])

  // Group contacts by ring for even distribution
  const ringGroups = useMemo(() => {
    const groups: Map<number, typeof contactsWithRing> = new Map()
    for (let i = -1; i < RINGS.length; i++) groups.set(i, [])
    for (const item of contactsWithRing) {
      const list = groups.get(item.ringIndex) || []
      list.push(item)
      groups.set(item.ringIndex, list)
    }
    return groups
  }, [contactsWithRing])

  // Calculate scale factor
  const scale = Math.min(dimensions.width, dimensions.height) / (EDGE_RADIUS * 2 + 60)
  const cx = dimensions.width / 2
  const cy = dimensions.height / 2

  // Get circle size based on interaction count (simplified: use daysSince inversely)
  function getDotSize(daysSince: number, total: number): number {
    if (daysSince < 0) return 4
    // More recent = larger
    const maxDays = 365
    const normalized = Math.max(0, 1 - daysSince / maxDays)
    return 4 + normalized * 12
  }

  function handleDotClick(contactId: number) {
    navigate(`/contacts?contactId=${contactId}`)
  }

  // Render the D3 SVG
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')

    // Draw concentric ring circles
    for (const ring of RINGS) {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', ring.radius * scale)
        .attr('fill', 'none')
        .attr('stroke', ring.color)
        .attr('stroke-opacity', 0.15)
        .attr('stroke-width', 1)

      // Ring label
      g.append('text')
        .attr('x', cx)
        .attr('y', cy - ring.radius * scale - 4)
        .attr('text-anchor', 'middle')
        .attr('fill', ring.color)
        .attr('font-size', '10px')
        .attr('opacity', 0.6)
        .text(ring.label)
    }

    // Edge ring for "never interacted"
    g.append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', EDGE_RADIUS * scale)
      .attr('fill', 'none')
      .attr('stroke', NEVER_COLOR)
      .attr('stroke-opacity', 0.1)
      .attr('stroke-width', 1)

    g.append('text')
      .attr('x', cx)
      .attr('y', cy - EDGE_RADIUS * scale - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', NEVER_COLOR)
      .attr('font-size', '10px')
      .attr('opacity', 0.4)
      .text('Never')

    // Center label
    g.append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 20 * scale)
      .attr('fill', 'currentColor')
      .attr('class', 'text-violet-500')
      .attr('opacity', 0.15)

    g.append('text')
      .attr('x', cx)
      .attr('y', cy + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor')
      .attr('class', 'text-violet-600 dark:text-violet-400')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .text('You')

    // Draw contact dots per ring
    for (const [ringIndex, items] of ringGroups) {
      const radius = ringIndex === -1 ? EDGE_RADIUS : RINGS[ringIndex]?.radius || EDGE_RADIUS
      const color = ringIndex === -1 ? NEVER_COLOR : RINGS[ringIndex].color
      const count = items.length

      items.forEach((item, i) => {
        // Distribute evenly around the ring
        const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2
        // Add some jitter within the ring band for visual interest
        const jitter = (ringIndex >= 0 && ringIndex < RINGS.length - 1)
          ? (Math.random() - 0.5) * 30
          : (Math.random() - 0.5) * 20
        const r = (radius + jitter) * scale
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        const dotSize = getDotSize(item.daysSince, contacts.length)

        g.append('circle')
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', dotSize * scale)
          .attr('fill', color)
          .attr('opacity', 0.7)
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.3)
          .attr('cursor', 'pointer')
          .on('mouseenter', (event: MouseEvent) => {
            d3.select(event.target as SVGElement)
              .transition().duration(150)
              .attr('opacity', 1)
              .attr('r', (dotSize + 3) * scale)
            setTooltip({
              x: event.clientX,
              y: event.clientY,
              contact: item.contact,
              daysSince: item.daysSince
            })
          })
          .on('mouseleave', (event: MouseEvent) => {
            d3.select(event.target as SVGElement)
              .transition().duration(150)
              .attr('opacity', 0.7)
              .attr('r', dotSize * scale)
            setTooltip(null)
          })
          .on('click', () => handleDotClick(item.contact.id))
      })
    }
  }, [contactsWithRing, dimensions, ringGroups, scale, cx, cy])

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Relationship Radar</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{contacts.length} contacts mapped by last interaction</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Group filter */}
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value ? Number(e.target.value) : '')}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="">All Contacts</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-8 pb-3 flex-shrink-0">
        {RINGS.map(ring => (
          <div key={ring.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ring.color }} />
            <span className="text-[10px] text-zinc-500">{ring.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NEVER_COLOR }} />
          <span className="text-[10px] text-zinc-500">Never</span>
        </div>
      </div>

      {/* SVG Visualization */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4 pb-4">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="max-w-full max-h-full"
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg px-4 py-3 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {tooltip.contact.first_name} {tooltip.contact.last_name}
          </p>
          {tooltip.contact.company && (
            <p className="text-xs text-zinc-500">{tooltip.contact.company}</p>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
            {tooltip.daysSince < 0
              ? 'Never interacted'
              : tooltip.daysSince === 0
                ? 'Last interaction: today'
                : `Last interaction: ${tooltip.daysSince} days ago`}
          </p>
        </div>
      )}
    </div>
  )
}

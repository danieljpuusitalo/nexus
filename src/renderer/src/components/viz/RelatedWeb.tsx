import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'

interface ContactNode {
  id: number
  first_name: string
  last_name: string
  company: string
  interaction_count: number
  group_color: string | null
  group_name: string | null
}

interface Relationship {
  contact_id_1: number
  contact_id_2: number
  relationship_type: string
}

interface SimNode extends d3.SimulationNodeDatum {
  contactId: number
  label: string
  color: string
  radius: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | number
  target: SimNode | number
}

export default function RelatedWeb() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<{ contacts: ContactNode[]; relationships: Relationship[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [linkDialog, setLinkDialog] = useState<{ sourceId: number; targetId: number; sourceName: string; targetName: string } | null>(null)
  const [linkType, setLinkType] = useState('')

  function loadData() {
    window.api.viz.relatedWeb().then((d: unknown) => {
      setData(d as { contacts: ContactNode[]; relationships: Relationship[] })
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  async function handleCreateLink() {
    if (!linkDialog || !linkType.trim()) return
    await window.api.relationships.create({
      contact_id_1: linkDialog.sourceId,
      contact_id_2: linkDialog.targetId,
      relationship_type: linkType.trim()
    })
    setLinkDialog(null)
    setLinkType('')
    loadData()
  }

  useEffect(() => {
    if (loading || !svgRef.current || !data || data.contacts.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    const maxInteractions = Math.max(...data.contacts.map(c => c.interaction_count), 1)

    // Build nodes
    const nodes: SimNode[] = data.contacts.map(c => ({
      contactId: c.id,
      label: `${c.first_name} ${c.last_name}`.trim(),
      color: c.group_color || '#a1a1aa',
      radius: Math.max(6, Math.min(20, 6 + (c.interaction_count / maxInteractions) * 14))
    }))

    // Build links from relationships
    const nodeIds = new Set(nodes.map(n => n.contactId))
    const links: SimLink[] = data.relationships
      .filter(r => nodeIds.has(r.contact_id_1) && nodeIds.has(r.contact_id_2))
      .map(r => ({
        source: r.contact_id_1,
        target: r.contact_id_2
      }))

    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.contactId).distance(60))
      .force('charge', d3.forceManyBody().strength(-20))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 2))

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#a1a1aa')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1)

    // Nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.8)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        navigate(`/contacts?contactId=${d.contactId}`)
      })

    // Tooltip
    const tooltip = svg.append('g').style('display', 'none')
    const tooltipBg = tooltip.append('rect').attr('fill', '#18181b').attr('rx', 4).attr('ry', 4)
    const tooltipText = tooltip.append('text').attr('fill', '#e4e4e7').attr('font-size', 11).attr('dx', 6).attr('dy', 14)

    node.on('mouseenter', (_event, d) => {
      tooltipText.text(d.label)
      const bbox = (tooltipText.node() as SVGTextElement).getBBox()
      tooltipBg.attr('width', bbox.width + 12).attr('height', bbox.height + 8)
      tooltip.style('display', 'block')
    })
    .on('mousemove', (event) => {
      const [x, y] = d3.pointer(event, svg.node())
      tooltip.attr('transform', `translate(${x + 10},${y - 20})`)
    })
    .on('mouseleave', () => tooltip.style('display', 'none'))

    // Drag with proximity detection for linking
    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        // Check proximity to another node
        const threshold = 30
        let nearest: SimNode | null = null
        let minDist = Infinity
        for (const other of nodes) {
          if (other.contactId === d.contactId) continue
          const dx = (other.x || 0) - (d.x || 0)
          const dy = (other.y || 0) - (d.y || 0)
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < threshold && dist < minDist) {
            nearest = other
            minDist = dist
          }
        }
        if (nearest) {
          // Check if relationship already exists
          const exists = data!.relationships.some(r =>
            (r.contact_id_1 === d.contactId && r.contact_id_2 === nearest!.contactId) ||
            (r.contact_id_2 === d.contactId && r.contact_id_1 === nearest!.contactId)
          )
          if (!exists) {
            setLinkDialog({ sourceId: d.contactId, targetId: nearest.contactId, sourceName: d.label, targetName: nearest.label })
          }
        }
        d.fx = null; d.fy = null
      })
    node.call(drag)

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!)
      node.attr('cx', d => d.x!).attr('cy', d => d.y!)
    })

    return () => { simulation.stop() }
  }, [data, loading])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading visualization...</div>
  }

  if (!data || data.contacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <p className="text-sm text-zinc-500 mb-1">No contacts to visualize.</p>
          <p className="text-xs text-zinc-400">Add contacts to see your network web.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-400">
        {data.contacts.length} contacts &middot; Bubble size = interaction count &middot; Color = primary group &middot; Click to view &middot; Drag onto another to link
      </div>

      {/* Link dialog */}
      {linkDialog && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg p-5 w-80">
            <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-3">
              Link {linkDialog.sourceName} &harr; {linkDialog.targetName}
            </h3>
            <input
              type="text"
              value={linkType}
              onChange={e => setLinkType(e.target.value)}
              placeholder="Relationship type (e.g. colleague, friend)"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 mb-3"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateLink()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setLinkDialog(null); setLinkType('') }}
                className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={handleCreateLink} disabled={!linkType.trim()}
                className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors">Link</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

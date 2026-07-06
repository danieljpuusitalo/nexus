import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'

interface GroupNode {
  id: number
  name: string
  color: string
  contact_count: number
  contacts: { id: number; first_name: string; last_name: string; company: string }[]
}

interface SimNode extends d3.SimulationNodeDatum {
  nodeId: string
  label: string
  type: 'center' | 'group' | 'contact'
  color: string
  contactId?: number
  radius: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
}

export default function GroupsTree() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [groups, setGroups] = useState<GroupNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.viz.groupsTree().then((data: unknown) => {
      setGroups(data as GroupNode[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (loading || !svgRef.current || groups.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    // Build nodes + links
    const nodes: SimNode[] = [
      { nodeId: 'center', label: 'You', type: 'center', color: '#8B5CF6', radius: 20 }
    ]
    const links: SimLink[] = []

    for (const g of groups) {
      const gId = `group-${g.id}`
      nodes.push({
        nodeId: gId,
        label: g.name,
        type: 'group',
        color: g.color,
        radius: Math.min(8 + g.contact_count * 0.5, 18)
      })
      links.push({ source: 'center', target: gId })

      for (const c of g.contacts) {
        const cId = `contact-${c.id}`
        if (!nodes.find(n => n.nodeId === cId)) {
          nodes.push({
            nodeId: cId,
            label: `${c.first_name} ${c.last_name}`.trim(),
            type: 'contact',
            color: g.color,
            contactId: c.id,
            radius: 5
          })
        }
        links.push({ source: gId, target: cId })
      }
    }

    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.nodeId).distance(d => {
        const s = d.source as SimNode
        return s.type === 'center' ? 120 : 50
      }))
      .force('charge', d3.forceManyBody().strength(d => (d as SimNode).type === 'center' ? -300 : -30))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 3))

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
      .attr('stroke', '#e4e4e7')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1)

    // Nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', d => d.type === 'center' ? 3 : d.type === 'group' ? 2 : 1)
      .attr('cursor', d => d.type === 'contact' ? 'pointer' : d.type === 'group' ? 'pointer' : 'default')
      .on('click', (_event, d) => {
        if (d.type === 'contact' && d.contactId) {
          navigate(`/contacts?contactId=${d.contactId}`)
        }
      })

    // Labels for center + groups
    const label = g.append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes.filter(n => n.type !== 'contact'))
      .join('text')
      .text(d => d.label)
      .attr('font-size', d => d.type === 'center' ? 12 : 10)
      .attr('font-weight', d => d.type === 'center' ? 700 : 600)
      .attr('fill', '#71717a')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('pointer-events', 'none')

    // Tooltip for contacts
    const tooltip = svg.append('g').attr('class', 'tooltip').style('display', 'none')
    const tooltipBg = tooltip.append('rect').attr('fill', '#18181b').attr('rx', 4).attr('ry', 4)
    const tooltipText = tooltip.append('text').attr('fill', '#e4e4e7').attr('font-size', 11).attr('dx', 6).attr('dy', 14)

    node.on('mouseenter', (_event, d) => {
      if (d.type !== 'contact') return
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

    // Drag
    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
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
      label.attr('x', d => d.x!).attr('y', d => d.y!)
    })

    return () => { simulation.stop() }
  }, [groups, loading])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-sm text-zinc-500">Loading visualization...</div>
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <p className="text-sm text-zinc-500 mb-1">No groups with contacts to visualize.</p>
          <p className="text-xs text-zinc-400">Create groups and add contacts to see the network tree.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-400">
        Showing groups of &le; 250 contacts &middot; Scroll to zoom &middot; Click contacts to view
      </div>
    </div>
  )
}

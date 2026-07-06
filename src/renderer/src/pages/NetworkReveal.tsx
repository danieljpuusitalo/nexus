import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface NetworkStats {
  contactCount: number
  cities: string[]
  companies: string[]
}

export default function NetworkReveal() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [animDone, setAnimDone] = useState(false)

  useEffect(() => {
    loadStats()
    window.api.settings.set('network_reveal_shown', 'true')
  }, [])

  async function loadStats() {
    const contacts = await window.api.contacts.getAllWithTags() as { location?: string; company?: string }[]
    const citySet = new Set<string>()
    const companySet = new Set<string>()
    for (const c of contacts) {
      if (c.location) citySet.add(c.location)
      if (c.company) companySet.add(c.company)
    }
    setStats({
      contactCount: contacts.length,
      cities: [...citySet],
      companies: [...companySet],
    })
    // Animate after a beat
    setTimeout(() => setAnimDone(true), 800)
  }

  const drawGraph = useCallback(() => {
    if (!stats || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width = 500
    const h = canvas.height = 400
    ctx.clearRect(0, 0, w, h)

    // Simple radial layout: center node ("You") + company cluster nodes
    const cx = w / 2, cy = h / 2
    const nodes: { x: number; y: number; r: number; label: string; color: string }[] = []

    // Center node
    nodes.push({ x: cx, y: cy, r: 20, label: 'You', color: '#8B5CF6' })

    // Company nodes around the center
    const topCompanies = stats.companies.slice(0, 12)
    topCompanies.forEach((company, i) => {
      const angle = (i / topCompanies.length) * Math.PI * 2 - Math.PI / 2
      const dist = 100 + Math.random() * 60
      nodes.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 8 + Math.random() * 6,
        label: company.length > 12 ? company.slice(0, 12) + '...' : company,
        color: `hsl(${(i * 137) % 360}, 50%, 55%)`
      })
    })

    // Draw edges
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)'
    ctx.lineWidth = 1
    for (let i = 1; i < nodes.length; i++) {
      ctx.beginPath()
      ctx.moveTo(nodes[0].x, nodes[0].y)
      ctx.lineTo(nodes[i].x, nodes[i].y)
      ctx.stroke()
    }

    // Draw nodes
    for (const node of nodes) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
      ctx.fillStyle = node.color
      ctx.fill()

      ctx.fillStyle = '#e4e4e7'
      ctx.font = `${node.r > 15 ? 11 : 9}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(node.label, node.x, node.y + node.r + 14)
    }
  }, [stats])

  useEffect(() => {
    if (animDone) drawGraph()
  }, [animDone, drawGraph])

  function handleSaveImage() {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = 'my-nexus-network.png'
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  if (!stats) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-10 h-10 rounded-full bg-violet-500/20 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950 px-8">
      <div className="text-center max-w-xl">
        <div className={`transition-all duration-1000 ${animDone ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-3xl font-bold text-zinc-100 mb-3">
            You know{' '}
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {stats.contactCount} people
            </span>
          </h1>
          <p className="text-zinc-400 text-lg mb-6">
            across{' '}
            <span className="text-zinc-200 font-semibold">{stats.cities.length} {stats.cities.length === 1 ? 'city' : 'cities'}</span>
            {' '}and{' '}
            <span className="text-zinc-200 font-semibold">{stats.companies.length} {stats.companies.length === 1 ? 'company' : 'companies'}</span>
          </p>
        </div>

        <div className={`transition-all duration-1000 delay-300 ${animDone ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <canvas ref={canvasRef} className="mx-auto mb-6 rounded-xl" style={{ maxWidth: '100%', height: 'auto' }} />
        </div>

        <div className={`flex gap-3 justify-center transition-all duration-700 delay-700 ${animDone ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={handleSaveImage}
            className="px-5 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 rounded-lg transition-colors">
            Save as image
          </button>
          <button onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
            Go to Dashboard &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}

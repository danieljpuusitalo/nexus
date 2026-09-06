import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Index from './components/Index'
import Palette from './components/Palette'
import Person from './routes/Person'
import Review from './routes/Review'
import Loops from './routes/Loops'
import { AskIcon, LoopIcon, PeopleIcon } from './components/Icons'
import { allLoops, initials, load } from './lib/data'

function Rail() {
  const { queries, self } = load()
  const owed = allLoops().filter(l => !l.done && l.owner === 'me').length
  const cls = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? 'on' : ''}`

  return (
    <nav className="rail">
      <div className="glyph">N</div>

      <NavLink to="/" end className={cls}>
        <PeopleIcon />
        <span className="tip">People</span>
      </NavLink>
      <NavLink to="/loops" className={cls}>
        <LoopIcon />
        {owed > 0 && <span className="badge">{owed}</span>}
        <span className="tip">Open loops</span>
      </NavLink>
      <NavLink to="/review" className={cls}>
        <AskIcon />
        {queries.length > 0 && <span className="badge">{queries.length}</span>}
        <span className="tip">Who is this?</span>
      </NavLink>

      <div className="me" title={self}>
        {initials(self)}
      </div>
    </nav>
  )
}

/**
 * The index pane hides on the review screen: that screen is a queue of
 * questions, not a record you browse, so a list of people beside it would only
 * be noise.
 */
function Shell() {
  const [mode, setMode] = useState<'people' | 'stream'>('people')
  const [palette, setPalette] = useState(false)
  const location = useLocation()
  // The index is a list of people. Loops and review are queues of questions,
  // so a people list beside them would only be noise.
  const solo = location.pathname.startsWith('/review') || location.pathname.startsWith('/loops')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(v => !v)
        return
      }
      if (e.key === 'Escape') setPalette(false)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.finder input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app" style={solo ? { gridTemplateColumns: 'var(--rail-w) 1fr' } : undefined}>
      <Rail />
      {!solo && <Index mode={mode} setMode={setMode} />}
      <Routes>
        <Route path="/" element={<Person />} />
        <Route path="/people/:id" element={<Person />} />
        <Route path="/loops" element={<Loops />} />
        <Route path="/review" element={<Review />} />
      </Routes>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

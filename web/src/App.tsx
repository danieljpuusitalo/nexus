import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import Recent from './routes/Recent'
import People from './routes/People'
import Person from './routes/Person'
import Review from './routes/Review'
import { load } from './lib/data'

function Rail() {
  const { people, conversations, queries, self } = load()
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '')

  return (
    <aside className="rail">
      <div className="wordmark">
        <b>Nexus</b>
        <span>the record</span>
      </div>

      <nav className="nav">
        <NavLink to="/" end className={cls}>
          Recent
        </NavLink>
        <NavLink to="/people" className={cls}>
          People
        </NavLink>
        <NavLink to="/review" className={cls}>
          Who is this?
          {queries.length > 0 && <span className="count">{queries.length}</span>}
        </NavLink>
      </nav>

      <div className="rail-foot">
        <div>
          <span className="pulse" />
          watching for new
        </div>
        <div>
          {conversations.length} conversations · {people.length} people
        </div>
        <div style={{ opacity: 0.6 }}>{self}</div>
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="shell">
        <Rail />
        <Routes>
          <Route path="/" element={<Recent />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/:id" element={<Person />} />
          <Route path="/review" element={<Review />} />
        </Routes>
      </div>
    </HashRouter>
  )
}

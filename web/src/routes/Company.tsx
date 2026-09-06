/**
 * A company: everyone you know there, and everything said across all of them.
 *
 * Nobody creates this. It exists because two people you spoke to work at the
 * same place, which the record already knew. That is the rule the whole
 * product runs on, applied to organisations.
 *
 * It matters at scale rather than in a demo. Past a couple of hundred people,
 * the question you actually have is "where are we with Reo Pack", and reading
 * Davide's page, then Ana's, then trying to hold both in your head is not an
 * answer to it.
 */

import { Link, useParams } from 'react-router-dom'
import Conversation from '../components/Conversation'
import Grid from '../components/Grid'
import { ago, companyBySlug, initials, loopsForCompany, longDate } from '../lib/data'

export default function Company() {
  const { slug } = useParams<{ slug: string }>()
  const company = companyBySlug(slug ?? '')

  if (!company) {
    return (
      <div className="record">
        <div className="blank">
          <div>Not in the record.</div>
        </div>
      </div>
    )
  }

  const loops = loopsForCompany(company)
  const iOwe = loops.filter(l => l.owner === 'me' && !l.done)
  const theyOwe = loops.filter(l => l.owner === 'them' && !l.done)
  const dates = company.conversations.map(c => c.started_at)
  const first = [...dates].sort()[0]

  return (
    <div className="record">
      <div className="record-inner">
        <div className="crumb">
          <Link to="/people">People</Link>
          <span>/</span>
          <span style={{ color: 'var(--dim)' }}>{company.name}</span>
        </div>

        <header className="head">
          <span className="av org">{company.name.slice(0, 2).toUpperCase()}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>{company.name}</h1>
            <div className="under">
              {company.people.length} {company.people.length === 1 ? 'person' : 'people'} ·{' '}
              {company.conversations.length} conversation
              {company.conversations.length === 1 ? '' : 's'}
            </div>
          </div>
        </header>

        {/* Who you actually know there. The relationship is with people, and a
            company view that hides them would be an org chart, not a record. */}
        <div className="roster">
          {company.people.map(p => (
            <Link key={p.id} to={`/people/${p.id}`} className="roster-card">
              <span className="av">{initials(p.name)}</span>
              <span style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                <span>{p.role ?? p.email}</span>
                <span className="roster-when">{ago(p.last_conversation_at)}</span>
              </span>
            </Link>
          ))}
        </div>

        {(iOwe.length > 0 || theyOwe.length > 0) && (
          <div className="balance">
            <section>
              <h4>
                You owe <b>{iOwe.length}</b>
              </h4>
              {iOwe.length === 0 ? (
                <p className="none">Nothing outstanding.</p>
              ) : (
                <ul>
                  {iOwe.map(l => (
                    <li key={l.text}>
                      {l.text}
                      <span className="to"> to {l.personName.split(' ')[0]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4>
                They owe <b>{theyOwe.length}</b>
              </h4>
              {theyOwe.length === 0 ? (
                <p className="none">Nothing outstanding.</p>
              ) : (
                <ul>
                  {theyOwe.map(l => (
                    <li key={l.text}>
                      {l.text}
                      <span className="to"> from {l.personName.split(' ')[0]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <Grid dates={dates} cell={10} gap={2} />

        <div className="reads">
          {first && <span>Known since <b>{longDate(first)}</b></span>}
          <span>
            Across <b>{company.people.length}</b>{' '}
            {company.people.length === 1 ? 'relationship' : 'relationships'}
          </span>
        </div>

        {company.conversations.map((c, i) => (
          <Conversation key={c.id} c={c} i={i} />
        ))}
      </div>
    </div>
  )
}

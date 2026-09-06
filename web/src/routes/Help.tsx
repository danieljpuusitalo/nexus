/**
 * Ways to help: where one person's need meets another's offer.
 *
 * This is the half of a network product that nobody builds. Every other tool
 * points inward and answers "who can I get something from". This one points
 * outward: given everything people have told you they need, and everything
 * others have told you they can give, where could you connect two people who
 * would both be better off.
 *
 * That is the actual mechanism by which networks create value rather than
 * merely storing contacts, and it is the reason to be in someone's network at
 * all.
 *
 * Both quotes are always shown. A suggestion you cannot audit is a suggestion
 * you should not act on, and putting two people together on a machine's say-so
 * is how you spend social capital you did not mean to spend.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import Draft from '../components/Draft'
import {
  ago,
  draftIntro,
  initials,
  introductions,
  longDate,
  unmet,
  type Introduction,
} from '../lib/data'

function Card({ i, onDraft }: { i: Introduction; onDraft: () => void }) {
  return (
    <article className={`intro ${i.promised ? 'owed' : ''}`}>
      {i.promised && (
        <div className="intro-promise">
          You said you would do this {ago(i.promised.agreedAt)}
        </div>
      )}

      <div className="intro-pair">
        <div className="side">
          <Link to={`/people/${i.seeker.id}`} className="side-who">
            <span className="av">{initials(i.seeker.name)}</span>
            <span>
              <b>{i.seeker.name}</b>
              <span>{[i.seeker.role, i.seeker.company].filter(Boolean).join(', ')}</span>
            </span>
          </Link>
          <div className="side-label">is looking for</div>
          <div className="side-text">{i.need.text}</div>
          {i.need.quote && <blockquote>{i.need.quote}</blockquote>}
          <div className="side-when">{longDate(i.need.at)}</div>
        </div>

        <div className="joint">
          <span />
          <em title={i.shared.join(', ')}>
            {i.shared[0]}
            {i.shared.length > 1 ? ` +${i.shared.length - 1}` : ''}
          </em>
          <span />
        </div>

        <div className="side">
          <Link to={`/people/${i.helper.id}`} className="side-who">
            <span className="av">{initials(i.helper.name)}</span>
            <span>
              <b>{i.helper.name}</b>
              <span>{[i.helper.role, i.helper.company].filter(Boolean).join(', ')}</span>
            </span>
          </Link>
          <div className="side-label give">can offer</div>
          <div className="side-text">{i.offer.text}</div>
          {i.offer.quote && <blockquote>{i.offer.quote}</blockquote>}
          <div className="side-when">{longDate(i.offer.at)}</div>
        </div>
      </div>

      <div className="acts">
        <button className="act go" onClick={onDraft}>
          Draft the introduction
        </button>
        <button className="act">Not a fit</button>
      </div>
    </article>
  )
}

export default function Help() {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const [drafting, setDrafting] = useState<Introduction | null>(null)

  const all = introductions().filter(i => !dismissed[i.key])
  const open = unmet()

  return (
    <div className="record">
      <div className="record-inner wide">
        <div className="crumb">
          <span>Ways to help</span>
          <span>/</span>
          <span style={{ color: 'var(--dim)' }}>{all.length} possible</span>
        </div>

        <p className="blurb">
          People tell you what they need and what they can give, in the calls you already record.
          These are the places where one meets the other. Nothing is sent, and nobody is contacted;
          the introduction is yours to make or not.
        </p>

        {all.length === 0 ? (
          <p className="quiet">Nothing to connect right now.</p>
        ) : (
          all.map(i => (
            <Card key={i.key} i={i} onDraft={() => setDrafting(i)} />
          ))
        )}

        {open.length > 0 && (
          <>
            <div className="loop-head" style={{ marginTop: 34 }}>
              <h2>Nobody yet</h2>
              <span>{open.length}</span>
            </div>
            <p className="blurb" style={{ marginBottom: 14 }}>
              Things people are looking for that nobody in your library can help with. Worth
              carrying in your head; the match may walk in next week.
            </p>
            {open.map(s => (
              <div className="unmet" key={s.id}>
                <Link to={`/people/${s.person_id}`} className="unmet-who">
                  {initials(s.text)}
                </Link>
                <div>
                  <div className="side-text">{s.text}</div>
                  <div className="side-when">
                    said {ago(s.at)} · {s.tags.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {drafting && (
        <Draft
          title="Introduction"
          context={`${drafting.seeker.name} and ${drafting.helper.name}`}
          initial={draftIntro(drafting)}
          onClose={() => setDrafting(null)}
          onDone={() => setDismissed(d => ({ ...d, [drafting.key]: true }))}
        />
      )}
    </div>
  )
}

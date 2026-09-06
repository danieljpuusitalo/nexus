/**
 * A control for looking at the product at different library maturities.
 *
 * Prototype apparatus, and it is honest about being that. It exists because
 * the sparse states are the ones every real user starts in and the ones a demo
 * never shows: day one has no rhythm to draw, no matches to make and nobody to
 * be owed by. Those screens have to be designed, not discovered after launch.
 */

import { STAGES, currentStage, load, setStage } from '../lib/data'

export default function Stage() {
  const stage = currentStage()
  const { sample, conversations } = load()
  if (!sample) return null

  return (
    <div className="notice stage">
      <span className="live" />
      <span>Sample record</span>
      <span className="stage-sep" />
      {STAGES.map(s => (
        <button
          key={s.id}
          className={s.id === stage ? 'on' : ''}
          onClick={() => setStage(s.id)}
        >
          {s.label}
        </button>
      ))}
      <span className="stage-count">
        {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
      </span>
    </div>
  )
}

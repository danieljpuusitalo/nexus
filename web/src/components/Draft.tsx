/**
 * A draft, in a box, that you edit and send yourself.
 *
 * Deliberately not a send button and deliberately not connected to anything.
 * The product's job is to remove the blank page, which is the part that
 * actually stops people following through, not to put words in someone's mouth
 * or send mail on their behalf. Every message leaves through the user's own
 * hands, in their own voice.
 */

import { useEffect, useRef, useState } from 'react'

export default function Draft({
  title,
  context,
  initial,
  onClose,
  onDone,
}: {
  title: string
  context: string
  initial: string
  onClose: () => void
  onDone?: () => void
}) {
  const [text, setText] = useState(initial)
  const [copied, setCopied] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    area.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; selecting the text still works.
      area.current?.select()
    }
  }

  return (
    <div className="veil" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <h3>{title}</h3>
            <p>{context}</p>
          </div>
          <button className="act" onClick={onClose}>
            Close
          </button>
        </div>

        <textarea
          ref={area}
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck
          rows={12}
        />

        <div className="drawer-foot">
          <span>Nexus never sends anything. Copy it, edit it, send it as you.</span>
          <div className="row">
            <button className="act" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onDone && (
              <button
                className="act go"
                onClick={() => {
                  onDone()
                  onClose()
                }}
              >
                Mark done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

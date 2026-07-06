import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: number
  title: string
  messages_json: string
  created_at: string
  updated_at: string
}

const SUGGESTED_PROMPTS = [
  { icon: '\u{1F4AC}', text: 'Help me draft an introduction between two contacts' },
  { icon: '\u{1F50D}', text: 'Who do I know who works in fintech?' },
  { icon: '\u{1F30D}', text: 'Find contacts in my network in Berlin' },
  { icon: '\u{23F0}', text: "Who haven't I spoken to in 6 months?" },
  { icon: '\u{1F4BC}', text: 'Who should I reconnect with this week?' },
  { icon: '\u{1F3F7}', text: 'Show me all contacts tagged as "investor"' }
]

export default function Copilot() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiConfigured, setAiConfigured] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Chat history
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConvoId, setCurrentConvoId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    window.api.ai.getStatus().then((s: unknown) => {
      setAiConfigured((s as { configured: boolean }).configured)
    })
    loadConversations()
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    const data = await window.api.copilot.getAll() as Conversation[]
    setConversations(data)
  }

  async function autoSave(msgs: Message[]) {
    if (msgs.length === 0) return
    const title = msgs[0].content.slice(0, 50) + (msgs[0].content.length > 50 ? '...' : '')
    const id = await window.api.copilot.save(currentConvoId, title, JSON.stringify(msgs)) as number
    if (!currentConvoId) setCurrentConvoId(id)
    await loadConversations()
  }

  async function handleSend(text?: string) {
    const question = text || input.trim()
    if (!question || loading) return

    setInput('')
    setError('')
    const userMsg: Message = { role: 'user', content: question }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setLoading(true)

    try {
      const result = await window.api.ai.networkQuery(question, messages) as { answer: string; contacts: number[] }
      const final = [...updated, { role: 'assistant' as const, content: result.answer }]
      setMessages(final)
      await autoSave(final)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function handleNewChat() {
    // Save current before starting new
    if (messages.length > 0) {
      await autoSave(messages)
    }
    setMessages([])
    setCurrentConvoId(null)
    setError('')
    setInput('')
    inputRef.current?.focus()
  }

  function handleLoadConversation(convo: Conversation) {
    try {
      const msgs = JSON.parse(convo.messages_json) as Message[]
      setMessages(msgs)
      setCurrentConvoId(convo.id)
      setShowHistory(false)
    } catch { /* ignore corrupt data */ }
  }

  async function handleDeleteConversation(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    await window.api.copilot.delete(id)
    if (currentConvoId === id) {
      setMessages([])
      setCurrentConvoId(null)
    }
    await loadConversations()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function renderContent(content: string) {
    const parts = content.split(/(\[contact:\d+\])/)
    return parts.map((part, i) => {
      const match = part.match(/\[contact:(\d+)\]/)
      if (match) {
        return (
          <button key={i} onClick={() => navigate(`/contacts?contactId=${match[1]}`)}
            className="text-violet-600 dark:text-violet-400 hover:underline font-medium">
            #{match[1]}
          </button>
        )
      }
      const lines = part.split('\n')
      return lines.map((line, li) => {
        if (line.startsWith('### ')) return <h4 key={`${i}-${li}`} className="font-semibold text-zinc-800 dark:text-zinc-200 mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={`${i}-${li}`} className="font-bold text-zinc-800 dark:text-zinc-200 mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('- ')) return <div key={`${i}-${li}`} className="flex gap-2 ml-2"><span className="text-zinc-400">&#8226;</span><span>{renderBold(line.slice(2))}</span></div>
        if (line.trim() === '') return <br key={`${i}-${li}`} />
        return <p key={`${i}-${li}`}>{renderBold(line)}</p>
      })
    })
  }

  function renderBold(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">{p.slice(2, -2)}</strong>
      }
      return p
    })
  }

  if (!aiConfigured) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">{'\u{1F916}'}</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Set up your AI Copilot</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Copilot helps you draft messages, prepare for meetings, and understand your network. It uses your own API key from Anthropic (the company behind Claude).
          </p>
          <div className="text-left bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 mb-5 space-y-2.5">
            <p className="text-sm text-zinc-600 dark:text-zinc-300"><strong>1.</strong> Go to <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-400 underline">console.anthropic.com</a> and create a free account</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300"><strong>2.</strong> Click "API Keys" and create a new key</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300"><strong>3.</strong> Copy it and paste it in Settings</p>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-5">
            You only pay for what you use (typically a few cents per conversation). Your key stays on your computer, encrypted, and is never sent anywhere except directly to Anthropic.
          </p>
          <button onClick={() => navigate('/settings')}
            className="px-5 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors">
            Add API Key &rarr;
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Chat History Sidebar */}
      {showHistory && (
        <div className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800/60 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/60">
            <button onClick={handleNewChat}
              className="w-full px-3 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/10 transition-colors text-center">
              + New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-zinc-400 p-4 text-center">No conversations yet</p>
            ) : (
              conversations.map(convo => (
                <button key={convo.id} onClick={() => handleLoadConversation(convo)}
                  className={`w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/30 transition-colors group ${currentConvoId === convo.id ? 'bg-violet-50 dark:bg-violet-900/20' : ''}`}>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{convo.title}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-zinc-400">{new Date(convo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <button onClick={(e) => handleDeleteConversation(e, convo.id)}
                      className="text-[10px] text-zinc-300 dark:text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">&times;</button>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/60">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(!showHistory)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Chat history">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="10" rx="1" />
                <line x1="5" y1="6" x2="11" y2="6" />
                <line x1="5" y1="9" x2="9" y2="9" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Copilot</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Ask questions about your network</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={handleNewChat}
              className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-300 dark:border-zinc-700/50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
              + New Chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <span className="text-4xl block mb-3">{'\u{1F916}'}</span>
                <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-1">What would you like to know?</h2>
                <p className="text-sm text-zinc-500">Ask me anything about your network</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button key={i} onClick={() => handleSend(prompt.text)}
                    className="flex items-start gap-3 p-4 text-left border border-zinc-200 dark:border-zinc-800/60 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                    <span className="text-base flex-shrink-0 mt-0.5">{prompt.icon}</span>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{prompt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm">{'\u{1F916}'}</span>
                    </div>
                  )}
                  <div className={`max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="text-sm">{msg.content}</p>
                    ) : (
                      <div className="text-sm leading-relaxed space-y-1">
                        {renderContent(msg.content)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-sm">{'\u{1F916}'}</span>
                  </div>
                  <div className="flex gap-1 items-center py-3">
                    <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-8 py-4 border-t border-zinc-200 dark:border-zinc-800/60">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your network..."
                rows={1}
                className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 resize-none"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2L2 8.5l5 2L10 14l4-12z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
                Powered by your Anthropic API key
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

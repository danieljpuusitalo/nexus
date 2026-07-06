import { useNavigate } from 'react-router-dom'

export default function Welcome() {
  const navigate = useNavigate()

  async function handleSkip() {
    await window.api.settings.set('first_launch_complete', 'true')
    navigate('/')
  }

  async function handleAction(route: string) {
    await window.api.settings.set('first_launch_complete', 'true')
    navigate(route)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center max-w-lg px-8">
        <div className="mb-6">
          <span className="text-5xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            NEXUS
          </span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 mb-3">Welcome to Nexus</h1>
        <p className="text-zinc-400 mb-10">
          Your personal CRM — built for people who take relationships seriously.
        </p>

        <div className="grid gap-3">
          <button
            onClick={() => handleAction('/import')}
            className="flex items-center gap-4 p-5 text-left border border-zinc-800/60 rounded-xl hover:bg-zinc-900/50 hover:border-zinc-700 transition-colors group"
          >
            <span className="text-2xl">&#x1F4E5;</span>
            <div>
              <p className="text-sm font-semibold text-zinc-200 group-hover:text-white">Import my contacts</p>
              <p className="text-xs text-zinc-500">From LinkedIn CSV, Google, or other sources</p>
            </div>
          </button>

          <button
            onClick={() => handleAction('/contacts')}
            className="flex items-center gap-4 p-5 text-left border border-zinc-800/60 rounded-xl hover:bg-zinc-900/50 hover:border-zinc-700 transition-colors group"
          >
            <span className="text-2xl">&#x2795;</span>
            <div>
              <p className="text-sm font-semibold text-zinc-200 group-hover:text-white">Add my first contact</p>
              <p className="text-xs text-zinc-500">Start building your network manually</p>
            </div>
          </button>

          <button
            onClick={() => handleAction('/onboarding')}
            className="flex items-center gap-4 p-5 text-left border border-zinc-800/60 rounded-xl hover:bg-zinc-900/50 hover:border-zinc-700 transition-colors group"
          >
            <span className="text-2xl">&#x1F3AF;</span>
            <div>
              <p className="text-sm font-semibold text-zinc-200 group-hover:text-white">Take a quick tour</p>
              <p className="text-xs text-zinc-500">Learn what Nexus can do in 2 minutes</p>
            </div>
          </button>
        </div>

        <button
          onClick={handleSkip}
          className="mt-6 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Skip — I'll explore on my own
        </button>
      </div>
    </div>
  )
}

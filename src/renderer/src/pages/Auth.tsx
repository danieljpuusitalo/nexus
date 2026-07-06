import { useState } from 'react'
import { useAuth } from '../lib/auth'

type AuthView = 'login' | 'signup' | 'forgot'

export default function Auth() {
  const { signIn, signUp, signInWithGoogle, resetPassword, goOffline, isCloudEnabled } = useAuth()
  const [view, setView] = useState<AuthView>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (view === 'login') {
        const { error: err } = await signIn(email, password)
        if (err) setError(err)
      } else if (view === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          return
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters')
          return
        }
        const { error: err } = await signUp(email, password)
        if (err) setError(err)
        else setMessage('Check your email for a confirmation link.')
      } else if (view === 'forgot') {
        const { error: err } = await resetPassword(email)
        if (err) setError(err)
        else setMessage('Password reset email sent. Check your inbox.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    const { error: err } = await signInWithGoogle()
    if (err) setError(err)
  }

  function switchView(newView: AuthView) {
    setView(newView)
    setError('')
    setMessage('')
  }

  if (!isCloudEnabled) {
    // No Supabase config — auto-skip to offline mode
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-wide bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent">
            NEXUS
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Personal Relationship Manager</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create account' : 'Reset password'}
          </h2>
          <p className="text-sm text-zinc-500 mb-5">
            {view === 'login' ? 'Sign in to sync your contacts' : view === 'signup' ? 'Start managing your network' : 'Enter your email to reset'}
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 dark:text-emerald-400">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            {view !== 'forgot' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
                  placeholder="At least 6 characters"
                />
              </div>
            )}

            {view === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
                  placeholder="Confirm your password"
                />
              </div>
            )}

            {view === 'login' && (
              <div className="text-right">
                <button type="button" onClick={() => switchView('forgot')}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Please wait...' : view === 'login' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>

          {view !== 'forgot' && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              </div>

              <button
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 border border-zinc-300 dark:border-zinc-700/50 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-center gap-2"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </>
          )}

          <div className="mt-4 text-center text-sm text-zinc-500">
            {view === 'login' ? (
              <>Don&apos;t have an account?{' '}<button onClick={() => switchView('signup')} className="text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium">Sign up</button></>
            ) : view === 'signup' ? (
              <>Already have an account?{' '}<button onClick={() => switchView('login')} className="text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium">Sign in</button></>
            ) : (
              <button onClick={() => switchView('login')} className="text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium">Back to sign in</button>
            )}
          </div>
        </div>

        {/* Offline mode */}
        <div className="text-center mt-4">
          <button
            onClick={goOffline}
            className="text-sm text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
          >
            Continue offline (local only)
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

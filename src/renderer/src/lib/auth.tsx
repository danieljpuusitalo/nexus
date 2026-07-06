import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabase, isCloudConfigured } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  isOffline: boolean
  isCloudEnabled: boolean
}

interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  goOffline: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  isOffline: false,
  isCloudEnabled: false,
  signUp: async () => ({ error: 'Not initialized' }),
  signIn: async () => ({ error: 'Not initialized' }),
  signInWithGoogle: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
  resetPassword: async () => ({ error: 'Not initialized' }),
  goOffline: () => {}
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isOffline: false,
    isCloudEnabled: isCloudConfigured()
  })

  useEffect(() => {
    const supabase = getSupabase()

    if (!supabase) {
      // No cloud config — run in local-only mode
      setState(prev => ({ ...prev, loading: false, isOffline: true }))
      return
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false
      }))
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        isOffline: false
      }))
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email: string, password: string) {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Cloud not configured' }

    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }

  async function signIn(email: string, password: string) {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Cloud not configured' }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signInWithGoogle() {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Cloud not configured' }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    const supabase = getSupabase()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setState(prev => ({ ...prev, user: null, session: null }))
  }

  async function resetPassword(email: string) {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Cloud not configured' }

    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error: error?.message ?? null }
  }

  function goOffline() {
    setState(prev => ({ ...prev, isOffline: true, loading: false }))
  }

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signInWithGoogle, signOut, resetPassword, goOffline }}>
      {children}
    </AuthContext.Provider>
  )
}

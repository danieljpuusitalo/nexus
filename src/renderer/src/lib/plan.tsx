import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export interface PlanStatus {
  planType: 'free' | 'pro' | 'lifetime'
  isPro: boolean
  trialActive: boolean
  trialDaysLeft: number
  contactCount: number
  contactLimit: number
  aiActionsUsed: number
  aiActionsLimit: number
  integrationsEnabled: boolean
}

interface PlanContextValue {
  plan: PlanStatus | null
  loading: boolean
  refresh: () => Promise<void>
  canAddContact: () => boolean
  canUseAi: () => boolean
  canUseIntegrations: () => boolean
  trackAiAction: () => Promise<boolean>
}

const DEFAULT_PLAN: PlanStatus = {
  planType: 'pro',
  isPro: true,
  trialActive: false,
  trialDaysLeft: 0,
  contactCount: 0,
  contactLimit: Infinity,
  aiActionsUsed: 0,
  aiActionsLimit: Infinity,
  integrationsEnabled: true
}

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  loading: true,
  refresh: async () => {},
  canAddContact: () => true,
  canUseAi: () => true,
  canUseIntegrations: () => true,
  trackAiAction: async () => true
})

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // FREE LAUNCH: All users get Pro-level access unconditionally.
    // Stripe/cloud subscription checks are dormant — will be re-enabled
    // when premium tiers launch.
    const status = await window.api.plan.getStatus() as PlanStatus

    // Override all gates to Pro regardless of stored plan_type
    const overridden: PlanStatus = {
      ...status,
      planType: 'pro',
      isPro: true,
      trialActive: false,
      trialDaysLeft: 0,
      contactLimit: Infinity,
      aiActionsLimit: Infinity,
      integrationsEnabled: true
    }

    setPlan(overridden)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const canAddContact = useCallback(() => {
    if (!plan) return true
    if (plan.isPro) return true
    return plan.contactCount < plan.contactLimit
  }, [plan])

  const canUseAi = useCallback(() => {
    if (!plan) return true
    if (plan.isPro) return true
    return plan.aiActionsUsed < plan.aiActionsLimit
  }, [plan])

  const canUseIntegrations = useCallback(() => {
    if (!plan) return true
    return plan.integrationsEnabled
  }, [plan])

  const trackAiAction = useCallback(async () => {
    if (!plan) return true
    if (plan.isPro) return true
    if (plan.aiActionsUsed >= plan.aiActionsLimit) return false
    await window.api.plan.trackAiAction()
    await refresh()
    return true
  }, [plan, refresh])

  return (
    <PlanContext.Provider value={{ plan, loading, refresh, canAddContact, canUseAi, canUseIntegrations, trackAiAction }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  return useContext(PlanContext)
}

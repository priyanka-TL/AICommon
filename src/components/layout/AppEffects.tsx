import { useEffect } from 'react'
import { STORAGE_KEY, useAppStore } from '@/store/useAppStore'
import { LIVE_INTERVAL_MS } from '@/lib/metrics'

/** App-wide background work: provisioning timers, cross-tab sync and utilisation alerts. */
export function AppEffects() {
  const environments = useAppStore((s) => s.environments)
  const scheduleProvisioning = useAppStore((s) => s.scheduleProvisioning)
  const checkAlerts = useAppStore((s) => s.checkAlerts)

  useEffect(() => {
    scheduleProvisioning()
  }, [environments, scheduleProvisioning])

  // Runs left half-way by a reload have no timer any more; mark them failed once, on first load.
  useEffect(() => {
    useAppStore.getState().recoverDeployments()
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) void useAppStore.persist.rehydrate()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    checkAlerts()
    useAppStore.getState().checkModelBudgets()
    const t = setInterval(() => {
      checkAlerts()
      useAppStore.getState().checkModelBudgets()
    }, LIVE_INTERVAL_MS)
    return () => clearInterval(t)
  }, [checkAlerts])

  return null
}

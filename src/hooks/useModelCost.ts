import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { groupCost, projectedMonthEnd, thisMonth, usageCost, type CostContext } from '@/lib/modelCost'

/** Providers and tenants, which every model cost calculation needs. */
export function useModelCostContext(): CostContext {
  const providers = useAppStore((s) => s.infraProviders)
  const tenants = useAppStore((s) => s.tenants)
  return useMemo(() => ({ providers, tenants }), [providers, tenants])
}

/** This month's platform model usage and cost for one project, per model and in total. */
export function useProjectModelCost(projectId: string) {
  const usage = useAppStore((s) => s.modelUsage)
  const ctx = useModelCostContext()
  return useMemo(() => {
    const rows = thisMonth(usage.filter((u) => u.projectId === projectId))
    const total = usageCost(rows, ctx).total
    return {
      rows,
      total,
      projected: projectedMonthEnd(total),
      byModel: groupCost(rows, (r) => r.modelId, ctx),
      byProvider: groupCost(rows, (r) => r.providerId, ctx),
    }
  }, [usage, projectId, ctx])
}

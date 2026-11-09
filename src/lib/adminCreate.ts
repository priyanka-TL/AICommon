import type { EnvSpec, Environment, Quota, Tenant } from '@/data/types'
import { budgetCheck, type BudgetCheck, type CostContext } from './cost'
import { allocationOf, checkQuota, tenantAllocated, type Overage } from './quota'

export const MAX_COPIES = 20

export interface AdminCreateCheck {
  /** Resources all copies add. */
  adds: Quota
  usedBefore: Quota
  usedAfter: Quota
  quotaOver: Overage[]
  /** Provider budget for one copy; null when the provider isn't approved for the tenant. */
  budget: (BudgetCheck & { addsTotal: number; after: number }) | null
  budgetOver: boolean
  over: boolean
}

const times = (q: Quota, n: number): Quota => ({ vcpu: q.vcpu * n, ramGb: q.ramGb * n, gpus: q.gpus * n, storageGb: q.storageGb * n })

/** Tenant quota and provider budget, before and after creating `count` identical environments. Used by the wizard and the store. */
export function adminCreateCheck(spec: EnvSpec, count: number, tenant: Tenant, environments: Environment[], ctx: Omit<CostContext, 'tenant' | 'at'>): AdminCreateCheck {
  const n = Math.max(1, count)
  const adds = times(allocationOf(spec), n)
  const usedBefore = tenantAllocated(environments, tenant.id)
  const usedAfter = { vcpu: usedBefore.vcpu + adds.vcpu, ramGb: usedBefore.ramGb + adds.ramGb, gpus: usedBefore.gpus + adds.gpus, storageGb: usedBefore.storageGb + adds.storageGb }
  const quota = checkQuota(tenant.quota, usedBefore, adds)
  const b = budgetCheck(spec, null, tenant, environments, ctx)
  const budget = b ? { ...b, addsTotal: b.adds * n, after: b.committed + b.adds * n } : null
  const budgetOver = !!budget && budget.after > budget.cap
  return { adds, usedBefore, usedAfter, quotaOver: quota.items, budget, budgetOver, over: quota.over || budgetOver }
}

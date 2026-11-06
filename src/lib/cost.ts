import type { CatalogItem, ComputeTier, EnvSpec, Tenant } from '@/data/types'
import { formatInt } from './format'

/** Credits per active hour. 1 credit = ₹1. */
export const HOURLY_RATE: Record<ComputeTier, number> = { cpu: 4, t4: 18, a10: 32, a100: 85 }
export const STORAGE_RATE_PER_GB = 0.6

/** Estimated active hours per month for each auto-shutdown setting. */
export function activeHoursPerMonth(autoShutdownHours: number) {
  switch (autoShutdownHours) {
    case 0:
      return 720
    case 1:
      return 120
    case 2:
      return 160
    case 4:
      return 220
    default:
      return 300
  }
}

export interface CostEstimate {
  compute: number
  storage: number
  llm: number
  asr: number
  capabilities: number
  credits: number
  gpuHours: number
}

export function estimateCost(spec: EnvSpec, catalog: CatalogItem[]): CostEstimate {
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const hours = activeHoursPerMonth(spec.autoShutdownHours)
  const compute = hours * HOURLY_RATE[spec.compute]
  const storage = spec.storageGb * STORAGE_RATE_PER_GB
  const llm = spec.llms.reduce((sum, l) => sum + (byId.get(l.id)?.costPerUnit ?? 0) * l.tokenBudget, 0)
  const asrHoursEach = spec.asr.length ? spec.asrHoursPerMonth / spec.asr.length : 0
  const asr = spec.asr.reduce((sum, id) => sum + (byId.get(id)?.costPerUnit ?? 0) * asrHoursEach, 0)
  const capabilities = spec.capabilities.reduce((sum, id) => {
    const item = byId.get(id)
    return sum + (item?.costUnit === 'per month' ? item.costPerUnit : 0)
  }, 0)
  const credits = Math.round(compute + storage + llm + asr + capabilities)
  return {
    compute: Math.round(compute),
    storage: Math.round(storage),
    llm: Math.round(llm),
    asr: Math.round(asr),
    capabilities: Math.round(capabilities),
    credits,
    gpuHours: spec.compute === 'cpu' ? 0 : hours,
  }
}

export interface QuotaCheck {
  creditsRemaining: number
  gpuRemaining: number
  creditOverage: number
  gpuOverage: number
  over: boolean
  message: string | null
}

export function checkQuota(tenant: Tenant, est: CostEstimate): QuotaCheck {
  const creditsRemaining = Math.max(tenant.creditQuota - tenant.creditsUsed, 0)
  const gpuRemaining = Math.max(tenant.gpuQuota - tenant.gpuUsed, 0)
  const creditOverage = Math.max(est.credits - creditsRemaining, 0)
  const gpuOverage = Math.max(est.gpuHours - gpuRemaining, 0)
  const over = creditOverage > 0 || gpuOverage > 0

  let message: string | null = null
  if (creditOverage > 0 && gpuOverage > 0) {
    message = `This exceeds your organisation’s credit quota by ${formatInt(creditOverage)} credits and its GPU quota by ${formatInt(gpuOverage)} hours. Reduce the GPU tier or token budgets, or ask your admin for more quota.`
  } else if (creditOverage > 0) {
    message = `This exceeds your organisation’s remaining credits by ${formatInt(creditOverage)}. Reduce the GPU tier or token budgets, or ask your admin for more quota.`
  } else if (gpuOverage > 0) {
    message = `This exceeds your organisation’s GPU quota by ${formatInt(gpuOverage)} hours. Reduce the GPU tier or ask your admin for more quota.`
  }

  return { creditsRemaining, gpuRemaining, creditOverage, gpuOverage, over, message }
}

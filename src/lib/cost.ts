import type { CatalogItem, ComputeTier, EnvSpec } from '@/data/types'

/** Credits per active hour per node. 1 credit = ₹1. */
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
  const nodes = spec.compute === 'cpu' ? 1 : Math.max(1, spec.gpuCount)
  const compute = hours * HOURLY_RATE[spec.compute] * nodes
  const storage = spec.storageGb * STORAGE_RATE_PER_GB
  const llm = spec.llms.reduce((sum, l) => sum + (byId.get(l.id)?.costPerUnit ?? 0) * l.tokenBudget, 0)
  const asrHoursEach = spec.asr.length ? spec.asrHoursPerMonth / spec.asr.length : 0
  const asr = spec.asr.reduce((sum, id) => sum + (byId.get(id)?.costPerUnit ?? 0) * asrHoursEach, 0)
  const capabilities = spec.capabilities.reduce((sum, id) => {
    const item = byId.get(id)
    return sum + (item?.costUnit === 'per month' ? item.costPerUnit : 0)
  }, 0)
  return {
    compute: Math.round(compute),
    storage: Math.round(storage),
    llm: Math.round(llm),
    asr: Math.round(asr),
    capabilities: Math.round(capabilities),
    credits: Math.round(compute + storage + llm + asr + capabilities),
    gpuHours: spec.compute === 'cpu' ? 0 : hours * nodes,
  }
}

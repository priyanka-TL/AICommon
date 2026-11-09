import type { CatalogItem, EnvSpec, Environment, InfraProvider, InstanceType, RateCard, Region, Tenant } from '@/data/types'

/**
 * The one cost engine. Every cost on screen comes from `costBreakdown`.
 * Amounts are in credits (1 credit = ₹1), rounded to whole credits per line.
 *
 * monthly = compute + storage + network + model usage = subtotal
 *         + platform fee % − NGO discount % (NGO tenants only) + GST %
 */

const DAY_MS = 86_400_000
/** Average days in a month, used to spread a monthly estimate across days. */
const DAYS_PER_MONTH = 30.4

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

export interface CostLines {
  compute: number
  storage: number
  network: number
  models: number
  subtotal: number
  platformFee: number
  ngoDiscount: number
  gst: number
  total: number
}

export interface CostBreakdown extends CostLines {
  gpuHours: number
  hours: number
  provider: InfraProvider | undefined
  region: Region | undefined
  rateCard: RateCard | undefined
  instance: InstanceType | undefined
}

export const ZERO_COST: CostLines = { compute: 0, storage: 0, network: 0, models: 0, subtotal: 0, platformFee: 0, ngoDiscount: 0, gst: 0, total: 0 }

const dayOf = (at: string | Date) => (typeof at === 'string' ? at : at.toISOString()).slice(0, 10)

/** The rate card in force on a date: the latest one whose "Effective from" is on or before it. */
export function rateCardAt(provider: InfraProvider | undefined, at: string | Date = new Date()): RateCard | undefined {
  if (!provider?.rateCards.length) return undefined
  const day = dayOf(at)
  const live = provider.rateCards.filter((c) => c.effectiveFrom <= day)
  return live[live.length - 1] ?? provider.rateCards[0]
}

export const latestRateCard = (provider: InfraProvider | undefined) => provider?.rateCards[provider.rateCards.length - 1]

/** Language models, speech and paid capabilities, per month. */
export function modelUsageCost(spec: EnvSpec, catalog: CatalogItem[]) {
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const llm = spec.llms.reduce((sum, l) => sum + (byId.get(l.id)?.costPerUnit ?? 0) * l.tokenBudget, 0)
  const asrHoursEach = spec.asr.length ? spec.asrHoursPerMonth / spec.asr.length : 0
  const asr = spec.asr.reduce((sum, id) => sum + (byId.get(id)?.costPerUnit ?? 0) * asrHoursEach, 0)
  const caps = spec.capabilities.reduce((sum, id) => {
    const item = byId.get(id)
    return sum + (item?.costUnit === 'per month' ? item.costPerUnit : 0)
  }, 0)
  return llm + asr + caps
}

export interface CostContext {
  providers: InfraProvider[]
  tenant: Tenant | undefined
  catalog: CatalogItem[]
  /** Which rate card applies. Defaults to today. */
  at?: string | Date
}

/** Applies fee, discount and GST to the four base lines. */
export function applyRates(base: Pick<CostLines, 'compute' | 'storage' | 'network' | 'models'>, card: RateCard | undefined, tenant: Tenant | undefined): CostLines {
  const compute = Math.round(base.compute)
  const storage = Math.round(base.storage)
  const network = Math.round(base.network)
  const models = Math.round(base.models)
  const subtotal = compute + storage + network + models
  const platformFee = Math.round((subtotal * (card?.platformFeePct ?? 0)) / 100)
  const ngoDiscount = tenant?.orgType === 'NGO' ? Math.round(((subtotal + platformFee) * (card?.ngoDiscountPct ?? 0)) / 100) : 0
  const gst = Math.round(((subtotal + platformFee - ngoDiscount) * (card?.gstPct ?? 0)) / 100)
  return { compute, storage, network, models, subtotal, platformFee, ngoDiscount, gst, total: subtotal + platformFee - ngoDiscount + gst }
}

/** Finds the instance on the card; if the card dropped it, uses the most recent card that still lists it. */
function instanceOn(provider: InfraProvider | undefined, card: RateCard | undefined, id: string) {
  const own = card?.instanceTypes.find((i) => i.id === id)
  if (own || !provider) return own
  for (let i = provider.rateCards.length - 1; i >= 0; i--) {
    const found = provider.rateCards[i]!.instanceTypes.find((x) => x.id === id)
    if (found) return found
  }
  return undefined
}

/** Monthly cost of a spec on its provider, using the rate card in force at `ctx.at`. */
export function costBreakdown(spec: EnvSpec, ctx: CostContext): CostBreakdown {
  const provider = ctx.providers.find((p) => p.id === spec.providerId)
  const card = rateCardAt(provider, ctx.at)
  const instance = instanceOn(provider, card, spec.instanceTypeId)
  const hours = activeHoursPerMonth(spec.autoShutdownHours)
  const count = Math.max(1, spec.instanceCount)
  const lines = applyRates(
    {
      compute: (instance?.hourlyRate ?? 0) * count * hours,
      storage: spec.storageGb * (card?.storageRate ?? 0),
      network: spec.egressGbPerMonth * (card?.egressRate ?? 0),
      models: modelUsageCost(spec, ctx.catalog),
    },
    card,
    ctx.tenant,
  )
  return {
    ...lines,
    hours,
    gpuHours: (instance?.gpuCount ?? spec.instance.gpuCount) * count * hours,
    provider,
    region: provider?.regions.find((r) => r.id === spec.regionId),
    rateCard: card,
    instance,
  }
}

export const addLines = (a: CostLines, b: CostLines): CostLines => ({
  compute: a.compute + b.compute,
  storage: a.storage + b.storage,
  network: a.network + b.network,
  models: a.models + b.models,
  subtotal: a.subtotal + b.subtotal,
  platformFee: a.platformFee + b.platformFee,
  ngoDiscount: a.ngoDiscount + b.ngoDiscount,
  gst: a.gst + b.gst,
  total: a.total + b.total,
})

const scaleLines = (l: CostLines, f: number): CostLines => ({
  compute: l.compute * f,
  storage: l.storage * f,
  network: l.network * f,
  models: l.models * f,
  subtotal: l.subtotal * f,
  platformFee: l.platformFee * f,
  ngoDiscount: l.ngoDiscount * f,
  gst: l.gst * f,
  total: l.total * f,
})

const roundLines = (l: CostLines): CostLines => {
  const r = Object.fromEntries(Object.entries(l).map(([k, v]) => [k, Math.round(v)])) as unknown as CostLines
  // Keep the total equal to its parts after rounding.
  r.subtotal = r.compute + r.storage + r.network + r.models
  r.total = r.subtotal + r.platformFee - r.ngoDiscount + r.gst
  return r
}

/** Days the environment was running (Active) between two instants, from its lifecycle history. */
export function runningIntervals(env: Environment, now = Date.now()): [number, number][] {
  const out: [number, number][] = []
  let start: number | null = null
  for (const h of env.history) {
    const t = new Date(h.at).getTime()
    if (h.status === 'active') start ??= t
    else if (start !== null) {
      out.push([start, t])
      start = null
    }
  }
  if (start !== null) out.push([start, now])
  return out
}

/**
 * What an environment cost between two instants. Each day is charged at the rate card
 * in force that day, so publishing a new card never changes past spend.
 */
export function spendBetween(env: Environment, from: number, to: number, ctx: Omit<CostContext, 'at'>): CostLines {
  let sum = { ...ZERO_COST }
  for (const [a, b] of runningIntervals(env, Math.min(to, Date.now()))) {
    const lo = Math.max(a, from)
    const hi = Math.min(b, to)
    if (hi <= lo) continue
    // Walk day by day so a rate card change mid-month is honoured.
    for (let t = lo; t < hi; ) {
      const dayEnd = Math.min(hi, new Date(new Date(t).toISOString().slice(0, 10)).getTime() + DAY_MS)
      const daily = costBreakdown(env.spec, { ...ctx, at: new Date(t) })
      sum = addLines(sum, scaleLines(daily, (dayEnd - t) / DAY_MS / DAYS_PER_MONTH))
      t = dayEnd
    }
  }
  return roundLines(sum)
}

export const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).getTime()
export const monthEnd = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()

/** Month-to-date spend for one environment. */
export const spendThisMonth = (env: Environment, ctx: Omit<CostContext, 'at'>) => spendBetween(env, monthStart(), Date.now(), ctx)

/** Spend since the environment was created. */
export const spendToDate = (env: Environment, ctx: Omit<CostContext, 'at'>) => spendBetween(env, new Date(env.createdAt).getTime(), Date.now(), ctx)

/** GPUs held by non-terminated environments on a provider. */
export function providerGpuUse(providerId: string, environments: Environment[]) {
  return environments
    .filter((e) => e.spec.providerId === providerId && !['terminated', 'provisioning_failed'].includes(e.status))
    .reduce((s, e) => s + e.spec.instance.gpuCount * Math.max(1, e.spec.instanceCount), 0)
}

/** Environments that keep a provider in use (and block disabling it). */
export const environmentsInUse = (providerId: string, environments: Environment[]) =>
  environments.filter((e) => e.spec.providerId === providerId && !['terminated', 'provisioning_failed'].includes(e.status))

/** Daily spend for the last `days` days (for charts), each day on that day's rate card. */
export function dailySpend(env: Environment, days: number, ctx: Omit<CostContext, 'at'>): { date: string; credits: number }[] {
  const out: { date: string; credits: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const start = today.getTime() - i * DAY_MS
    out.push({ date: new Date(start + 12 * 3_600_000).toISOString().slice(0, 10), credits: spendBetween(env, start, start + DAY_MS, ctx).total })
  }
  return out
}

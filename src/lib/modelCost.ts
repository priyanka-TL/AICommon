import type { CatalogItem, DataClassification, InfraProvider, ModelPrice, ModelUsage, Project, RateCard, Region, Tenant } from '@/data/types'
import { monthEnd, monthStart, rateAdjustments, rateCardAt } from './cost'
import { approvalFor, approvedProviders } from './providers'

/**
 * The one model cost engine. The estimator, project pages, monitoring and tenant reports all call
 * `modelCost`, so their numbers always agree.
 *
 * cost = input tokens ÷ 1,000,000 × input price + output tokens ÷ 1,000,000 × output price (+ audio minutes × per-minute price)
 *        + platform fee % − NGO discount % + GST %, on the rate card in force on the usage date.
 *
 * Amounts stay unrounded; round only when displaying.
 */

export const MODEL_CATEGORIES = new Set(['llm', 'asr', 'embedding'])
export const isPlatformModel = (item: Pick<CatalogItem, 'category'> | undefined) => !!item && MODEL_CATEGORIES.has(item.category)

/** Average days per month used for monthly estimates. */
export const ESTIMATE_DAYS_PER_MONTH = 30

export interface TokenUse {
  inputTokens?: number
  outputTokens?: number
  audioMinutes?: number
}

export interface ModelCostLines {
  /** Before fee, discount and GST. */
  base: number
  platformFee: number
  ngoDiscount: number
  gst: number
  total: number
}

export const ZERO_MODEL_COST: ModelCostLines = { base: 0, platformFee: 0, ngoDiscount: 0, gst: 0, total: 0 }

/** The formula. */
export function modelCost(use: TokenUse, price: ModelPrice | undefined, card: RateCard | undefined, tenant: Pick<Tenant, 'orgType'> | undefined): ModelCostLines {
  if (!price) return { ...ZERO_MODEL_COST }
  const base =
    ((use.inputTokens ?? 0) / 1_000_000) * price.inputPer1M +
    ((use.outputTokens ?? 0) / 1_000_000) * price.outputPer1M +
    (use.audioMinutes ?? 0) * (price.perAudioMinute ?? 0)
  return { base, ...rateAdjustments(base, card, tenant, false) }
}

export const addModelCost = (a: ModelCostLines, b: ModelCostLines): ModelCostLines => ({
  base: a.base + b.base,
  platformFee: a.platformFee + b.platformFee,
  ngoDiscount: a.ngoDiscount + b.ngoDiscount,
  gst: a.gst + b.gst,
  total: a.total + b.total,
})

const dayOf = (at: string | Date) => (typeof at === 'string' ? at : at.toISOString()).slice(0, 10)

/** A model's price at a provider on the rate card in force on `at`. */
export function modelPriceAt(provider: InfraProvider | undefined, modelId: string, at: string | Date = new Date()) {
  const card = rateCardAt(provider, dayOf(at))
  return { card, price: card?.modelPrices.find((m) => m.modelId === modelId) }
}

export const isSpeech = (price: Pick<ModelPrice, 'perAudioMinute'> | undefined) => price?.perAudioMinute !== undefined

/** Unit prices after fee, discount and GST, for display. */
export function unitPrices(price: ModelPrice | undefined, card: RateCard | undefined, tenant: Pick<Tenant, 'orgType'> | undefined) {
  return {
    input: modelCost({ inputTokens: 1_000_000 }, price, card, tenant).total,
    output: modelCost({ outputTokens: 1_000_000 }, price, card, tenant).total,
    perMinute: modelCost({ audioMinutes: 1 }, price, card, tenant).total,
    speech: isSpeech(price),
  }
}

/* ---------- usage ---------- */

export interface CostContext {
  providers: InfraProvider[]
  tenants: Tenant[]
}

/** Cost of one usage row, charged on the rate card in force on its date. */
export function rowCost(row: ModelUsage, ctx: CostContext): ModelCostLines {
  const provider = ctx.providers.find((p) => p.id === row.providerId)
  const { price, card } = modelPriceAt(provider, row.modelId, row.date)
  return modelCost(row, price, card, ctx.tenants.find((t) => t.id === row.tenantId))
}

export function usageCost(rows: ModelUsage[], ctx: CostContext): ModelCostLines {
  return rows.reduce((sum, r) => addModelCost(sum, rowCost(r, ctx)), { ...ZERO_MODEL_COST })
}

export interface CostGroup {
  key: string
  cost: number
  inputTokens: number
  outputTokens: number
  audioMinutes: number
}

/** Totals grouped by a key (model, provider, project, user, tenant), most expensive first. */
export function groupCost(rows: ModelUsage[], key: (r: ModelUsage) => string, ctx: CostContext): CostGroup[] {
  const map = new Map<string, CostGroup>()
  for (const r of rows) {
    const k = key(r)
    const g = map.get(k) ?? { key: k, cost: 0, inputTokens: 0, outputTokens: 0, audioMinutes: 0 }
    g.cost += rowCost(r, ctx).total
    g.inputTokens += r.inputTokens
    g.outputTokens += r.outputTokens
    g.audioMinutes += r.audioMinutes
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

/** Cost per day for the last `days` days, oldest first. */
export function dailyCostSeries(rows: ModelUsage[], days: number, ctx: CostContext, now = new Date()) {
  const byDay = new Map<string, number>()
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + rowCost(r, ctx).total)
  const out: { date: string; cost: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(new Date(now.getTime() - i * 86_400_000))
    out.push({ date: d, cost: byDay.get(d) ?? 0 })
  }
  return out
}

const isoDay = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Usage rows dated in the current month, up to today. */
export function thisMonth(rows: ModelUsage[], now = new Date()) {
  const from = isoDay(monthStart(now))
  const to = isoDay(now.getTime())
  return rows.filter((r) => r.date >= from && r.date <= to)
}

/** Straight-line projection of month-to-date cost to the end of the month. */
export function projectedMonthEnd(mtd: number, now = new Date()) {
  const start = monthStart(now)
  const days = Math.round((monthEnd(now) - start) / 86_400_000)
  const elapsed = Math.max(1, now.getDate())
  return (mtd / elapsed) * days
}

/* ---------- estimator ---------- */

export interface EstimateInput {
  requestsPerDay: number
  avgInputTokens: number
  avgOutputTokens: number
  /** Speech models: average audio minutes per request. */
  avgAudioMinutes?: number
}

export const DEFAULT_ESTIMATE: EstimateInput = { requestsPerDay: 500, avgInputTokens: 800, avgOutputTokens: 300, avgAudioMinutes: 1 }

export function estimateModelCost(input: EstimateInput, price: ModelPrice | undefined, card: RateCard | undefined, tenant: Pick<Tenant, 'orgType'> | undefined) {
  const n = Math.max(0, input.requestsPerDay)
  const daily = modelCost(
    isSpeech(price)
      ? { audioMinutes: n * (input.avgAudioMinutes ?? 0) }
      : { inputTokens: n * Math.max(0, input.avgInputTokens), outputTokens: n * Math.max(0, input.avgOutputTokens) },
    price,
    card,
    tenant,
  ).total
  return { daily, monthly: daily * ESTIMATE_DAYS_PER_MONTH }
}

/* ---------- choosing a provider ---------- */

export const isSensitiveClass = (c: DataClassification | undefined) => c === 'personal' || c === 'children'

export interface PlatformModelOption {
  provider: InfraProvider
  price: ModelPrice
  card: RateCard
  /** Regions the project may use for this model: approved, offered for the model, and India-only for sensitive data. */
  regions: Region[]
  inputPer1M: number
  outputPer1M: number
  perMinute: number
  speech: boolean
  indiaResident: boolean
  cheapest: boolean
}

/** A model's comparable cost per request with the default mix, used to pick "Cheapest". */
const comparable = (o: Pick<PlatformModelOption, 'inputPer1M' | 'outputPer1M' | 'perMinute' | 'speech'>) =>
  o.speech ? o.perMinute : o.inputPer1M * DEFAULT_ESTIMATE.avgInputTokens + o.outputPer1M * DEFAULT_ESTIMATE.avgOutputTokens

/**
 * Providers that can serve a model to a tenant's project: approved for the tenant, offering the model,
 * with a connected model service, in a region the project's data may use. Cheapest first.
 */
export function platformModelOptions(
  modelId: string,
  providers: InfraProvider[],
  tenant: Tenant | undefined,
  classification: DataClassification | undefined,
  at: string | Date = new Date(),
): PlatformModelOption[] {
  if (!tenant) return []
  const sensitive = isSensitiveClass(classification)
  const out: PlatformModelOption[] = []
  for (const provider of approvedProviders(providers, tenant)) {
    if (provider.modelService?.status !== 'connected') continue
    const { price, card } = modelPriceAt(provider, modelId, at)
    if (!price || !card || price.status !== 'available') continue
    const approval = approvalFor(tenant, provider.id)
    const regions = provider.regions.filter((r) => price.regionIds.includes(r.id) && (!approval || approval.regionIds.includes(r.id)) && (!sensitive || r.indiaResident))
    if (!regions.length) continue
    const u = unitPrices(price, card, tenant)
    out.push({
      provider,
      price,
      card,
      regions,
      inputPer1M: u.input,
      outputPer1M: u.output,
      perMinute: u.perMinute,
      speech: u.speech,
      indiaResident: regions.some((r) => r.indiaResident),
      cheapest: false,
    })
  }
  out.sort((a, b) => comparable(a) - comparable(b))
  if (out.length > 1) out[0]!.cheapest = true
  return out
}

/** Why a project's saved placement can no longer be used, or null. */
export function placementProblem(project: Pick<Project, 'platformModels' | 'dataClassification'>, modelId: string, providers: InfraProvider[], tenant: Tenant | undefined): string | null {
  const placement = project.platformModels[modelId]
  if (!placement) return null
  const options = platformModelOptions(modelId, providers, tenant, project.dataClassification)
  const option = options.find((o) => o.provider.id === placement.providerId)
  const provider = providers.find((p) => p.id === placement.providerId)
  if (!option) return `${provider?.name ?? 'This provider'} can no longer serve this model to the project. Choose another provider.`
  if (!option.regions.some((r) => r.id === placement.regionId)) {
    const region = provider?.regions.find((r) => r.id === placement.regionId)
    return `${region?.name ?? 'This region'} is not allowed for this project's data. Choose a region in India.`
  }
  return null
}

/* ---------- budgets ---------- */

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function tenantModelSpend(tenant: Tenant, usage: ModelUsage[], ctx: CostContext, now = new Date()) {
  const mtd = usageCost(thisMonth(usage.filter((u) => u.tenantId === tenant.id), now), ctx).total
  const budget = tenant.modelBudget?.monthly ?? 0
  return { mtd, projected: projectedMonthEnd(mtd, now), budget, pct: budget > 0 ? (mtd / budget) * 100 : 0 }
}

/** At 100% with "Block new platform model usage", new platform models cannot be added. */
export function modelUsageBlocked(tenant: Tenant | undefined, usage: ModelUsage[], ctx: CostContext) {
  if (!tenant || tenant.modelBudget?.onExceed !== 'block') return false
  return tenantModelSpend(tenant, usage, ctx).pct >= 100
}

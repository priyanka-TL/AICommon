import type { ProviderApproval, ProviderWorkload, AiService, ComputeTier, EnvSpec, GpuType, InfraProvider, InfraProviderType, InstanceType, Region } from '@/data/types'
import { latestRateCard, rateCardAt } from './cost'

export const PROVIDER_TYPE_LABELS: Record<InfraProviderType, string> = {
  public_cloud: 'Public cloud',
  indian_cloud: 'Indian cloud',
  on_premise: 'On-premise',
  model_gateway: 'Model gateway',
}

/** Providers that only serve models (no compute): kept out of environment placement. */
export const isModelOnly = (p: Pick<InfraProvider, 'type'> & { rateCards?: InfraProvider['rateCards'] }) =>
  p.type === 'model_gateway' || (!!p.rateCards && p.rateCards.length > 0 && p.rateCards.every((c) => !c.instanceTypes.length))

export const AI_SERVICE_LABELS: Record<AiService, string> = {
  bedrock: 'AWS Bedrock',
  azure_openai: 'Azure OpenAI',
  vertex: 'Google Vertex AI',
  onprem_models: 'On-premise model serving',
  openrouter: 'OpenRouter',
}

export const GPU_TYPES: GpuType[] = ['T4', 'L4', 'A10', 'A100']
export const GPU_TIER: Record<GpuType | 'none', ComputeTier> = { none: 'cpu', T4: 't4', L4: 'l4', A10: 'a10', A100: 'a100' }
const TIER_GPU: Record<ComputeTier, GpuType | 'none'> = { cpu: 'none', t4: 'T4', l4: 'L4', a10: 'A10', a100: 'A100' }

export const isSensitive = (spec: Pick<EnvSpec, 'dataClassification'>) => spec.dataClassification === 'personal' || spec.dataClassification === 'children'

export const isAllowedFor = (p: InfraProvider, tenantId: string) => p.allowedTenants === 'all' || p.allowedTenants.includes(tenantId)

type TenantRef = { id: string; approvedProviders: ProviderApproval[] }

/** The tenant's live (not revoked) approval for a provider. */
export const approvalFor = (tenant: TenantRef | undefined, providerId: string) => tenant?.approvedProviders.find((a) => a.providerId === providerId && a.status === 'approved')

/** Active providers the Super Admin may offer a tenant (provider-side access). */
export const providersOfferedTo = (providers: InfraProvider[], tenantId: string) => providers.filter((p) => p.status === 'active' && isAllowedFor(p, tenantId))

/** Providers a tenant can request environments on: active, offered to it, approved for it, and offering compute. */
export const providersFor = (providers: InfraProvider[], tenant: TenantRef) => approvedProviders(providers, tenant).filter((p) => !isModelOnly(p))

/** Every provider approved for the tenant, including model-only ones (for platform models). */
export const approvedProviders = (providers: InfraProvider[], tenant: TenantRef) => providersOfferedTo(providers, tenant.id).filter((p) => !!approvalFor(tenant, p.id))

/** Personal and children's data may only use India-resident regions. With an approval, only its approved regions. */
export const regionsFor = (p: InfraProvider | undefined, sensitive: boolean, approval?: ProviderApproval) =>
  (p?.regions ?? []).filter((r) => (!sensitive || r.indiaResident) && (!approval || approval.regionIds.includes(r.id)))

export const WORKLOAD_LABELS: Record<ProviderWorkload, string> = {
  development: 'Development',
  testing: 'Testing',
  gpu: 'GPU workloads',
  pilot: 'Pilot',
}

/** Instance types on the current rate card that the region can run. */
export function instancesFor(p: InfraProvider | undefined, region: Region | undefined): InstanceType[] {
  const card = rateCardAt(p)
  if (!card || !region) return []
  return card.instanceTypes.filter((i) => i.gpuType === 'none' || region.gpuTypes.includes(i.gpuType))
}

export function indiaResidency(p: InfraProvider): 'Yes' | 'Partial' | 'No' {
  const n = p.regions.filter((r) => r.indiaResident).length
  return n === p.regions.length ? 'Yes' : n === 0 ? 'No' : 'Partial'
}

/** Sets provider, region and instance on a spec, with the derived fields kept in step. */
export function applyPlacement(spec: EnvSpec, providerId: string, regionId: string, it: InstanceType, instanceCount = spec.instanceCount || 1): EnvSpec {
  return {
    ...spec,
    providerId,
    regionId,
    instanceTypeId: it.id,
    instanceCount,
    instance: { name: it.name, vcpu: it.vcpu, ramGb: it.ramGb, gpuType: it.gpuType, gpuCount: it.gpuCount },
    compute: GPU_TIER[it.gpuType],
    gpuCount: it.gpuCount * instanceCount,
  }
}

/**
 * Makes sure a spec points at a valid provider, region and instance for this tenant and its data.
 * Keeps the current choice where it is still valid; otherwise picks the closest match.
 */
export function ensurePlacement(spec: EnvSpec, providers: InfraProvider[], tenant: TenantRef): EnvSpec {
  const allowed = providersFor(providers, tenant)
  const provider = allowed.find((p) => p.id === spec.providerId) ?? allowed[0]
  if (!provider) return spec
  const regions = regionsFor(provider, isSensitive(spec), approvalFor(tenant, provider.id))
  const region = regions.find((r) => r.id === spec.regionId) ?? regions[0]
  if (!region) return spec
  const options = instancesFor(provider, region)
  const want = TIER_GPU[spec.compute]
  const it = options.find((i) => i.id === spec.instanceTypeId) ?? options.find((i) => i.gpuType === want) ?? options.find((i) => i.gpuType !== 'none') ?? options[0]
  if (!it) return spec
  if (provider.id === spec.providerId && region.id === spec.regionId && it.id === spec.instanceTypeId) return spec
  return applyPlacement(spec, provider.id, region.id, it, Math.max(1, spec.instanceCount))
}

/** Why a spec's region can't hold its data, or null when it can. */
export function residencyProblem(spec: EnvSpec, providers: InfraProvider[]): string | null {
  if (!isSensitive(spec)) return null
  const p = providers.find((x) => x.id === spec.providerId)
  const region = p?.regions.find((r) => r.id === spec.regionId)
  if (!p || !region || region.indiaResident) return null
  const india = regionsFor(p, true).map((r) => r.name)
  const kind = spec.dataClassification === 'children' ? 'Children’s' : 'Personal'
  return `${region.name} stores data outside India. ${kind} data must stay in India. ${india.length ? `Choose ${india.join(' or ')} on the Compute step.` : `${p.name} has no region in India, so choose another provider on the Compute step.`}`
}

export const currentCard = latestRateCard

/** The tenant's access to this environment's provider was revoked with "migrate later". */
export function needsMigration(env: { tenantId: string; status: string; spec: { providerId: string } }, tenants: { id: string; approvedProviders: ProviderApproval[] }[]) {
  if (['terminated', 'provisioning_failed'].includes(env.status)) return false
  const t = tenants.find((x) => x.id === env.tenantId)
  if (!t || approvalFor(t, env.spec.providerId)) return false
  return t.approvedProviders.some((a) => a.providerId === env.spec.providerId && a.status === 'revoked' && a.migrateLater)
}

/* ---------- wizard: same configuration on another provider ---------- */

const gpuWord = (g: GpuType | 'none') => (g === 'none' ? 'CPU only' : `${g} GPUs`)

/**
 * The closest equivalent of a spec on another provider (or region): keep the instance if it is offered,
 * otherwise the same GPU type, then any GPU, then CPU. Returns a note when the instance had to change.
 */
export function equivalentSpec(spec: EnvSpec, provider: InfraProvider, tenant: TenantRef, regionId?: string): { spec: EnvSpec; note: string | null; sameGpu: boolean } | null {
  const regions = regionsFor(provider, isSensitive(spec), approvalFor(tenant, provider.id))
  if (!regions.length) return null
  const want = spec.instance.gpuType
  const region =
    regions.find((r) => r.id === regionId) ??
    regions.find((r) => r.id === spec.regionId) ??
    regions.find((r) => want === 'none' || r.gpuTypes.includes(want)) ??
    regions[0]!
  const options = instancesFor(provider, region)
  const it =
    options.find((i) => i.id === spec.instanceTypeId) ??
    options.find((i) => i.gpuType === want) ??
    options.find((i) => i.gpuType !== 'none') ??
    options[0]
  if (!it) return null
  const next = applyPlacement(spec, provider.id, region.id, it, Math.max(1, spec.instanceCount))
  const changed = spec.instance.name && it.id !== spec.instanceTypeId
  const note = changed
    ? `Changed the instance from ${spec.instance.name} (${gpuWord(want)}) to ${it.name} (${gpuWord(it.gpuType)}) because ${provider.name}${region ? ` ${region.name}` : ''} doesn’t offer ${spec.instance.name}.`
    : null
  return { spec: next, note, sameGpu: it.gpuType === want }
}

export interface Recommendation {
  providerId: string
  regionId: string
  spec: EnvSpec
  reason: string
}

/**
 * Best approved provider for this configuration: one with a valid region (India-resident for personal or
 * children's data) and the same GPU type, preferring options within the remaining budget, then the lowest cost.
 */
export function recommendProvider(
  spec: EnvSpec,
  providers: InfraProvider[],
  tenant: TenantRef & { approvedProviders: ProviderApproval[] },
  cost: (s: EnvSpec) => number,
  remaining: (providerId: string) => number,
): Recommendation | { reason: string } {
  const sensitive = isSensitive(spec)
  const wantsGpu = spec.instance.gpuType !== 'none' || spec.purpose === 'load-testing' || spec.purpose === 'pilot'
  const want: GpuType | 'none' = spec.instance.gpuType !== 'none' ? spec.instance.gpuType : wantsGpu ? 'T4' : 'none'
  const target: EnvSpec = want === spec.instance.gpuType ? spec : { ...spec, instance: { ...spec.instance, gpuType: want }, instanceTypeId: '' }
  const candidates = providersFor(providers, tenant)
    .map((p) => {
      const eq = equivalentSpec(target, p, tenant)
      return eq && (eq.sameGpu || want === 'none') ? { p, eq, total: cost(eq.spec) } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  const what = `${sensitive ? 'India-resident option' : 'option'} with ${gpuWord(want)}`
  if (!candidates.length) return { reason: `None of your approved providers has an ${what}. Ask your admin to enable one below.` }
  const fits = candidates.filter((c) => c.total <= remaining(c.p.id))
  const pool = fits.length ? fits : candidates
  const best = pool.reduce((a, b) => (b.total < a.total ? b : a))
  const reason = fits.length
    ? `Cheapest ${what}, within your remaining ${best.p.name} budget.`
    : `No option fits the remaining budget; this is the cheapest ${what}.`
  return { providerId: best.p.id, regionId: best.eq.spec.regionId, spec: best.eq.spec, reason: reason.charAt(0).toUpperCase() + reason.slice(1) }
}

export const providerGpuTypes = (p: InfraProvider) => GPU_TYPES.filter((g) => p.regions.some((r) => r.gpuTypes.includes(g)))

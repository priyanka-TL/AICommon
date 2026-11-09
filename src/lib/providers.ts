import type { AccessMode, AiService, CatalogItem, ComputeTier, EnvSpec, GpuType, InfraProvider, InfraProviderType, InstanceType, Region } from '@/data/types'
import { latestRateCard, rateCardAt } from './cost'

export const PROVIDER_TYPE_LABELS: Record<InfraProviderType, string> = {
  public_cloud: 'Public cloud',
  indian_cloud: 'Indian cloud',
  on_premise: 'On-premise',
}

export const AI_SERVICE_LABELS: Record<AiService, string> = {
  bedrock: 'AWS Bedrock',
  azure_openai: 'Azure OpenAI',
  vertex: 'Google Vertex AI',
}

export const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  direct: 'Direct from the model provider',
  openrouter: 'Through OpenRouter',
  bedrock: 'Through AWS Bedrock',
  azure_openai: 'Through Azure OpenAI',
  vertex: 'Through Google Vertex AI',
}

/** Which cloud model services offer each model. */
const MODEL_SERVICES: Record<string, AiService[]> = {
  'llm-gpt': ['azure_openai'],
  'llm-gpt4o-mini': ['azure_openai'],
  'llm-claude': ['bedrock', 'vertex'],
  'llm-gemini': ['vertex'],
  'llm-llama': ['bedrock', 'vertex', 'azure_openai'],
  'llm-mistral': ['bedrock', 'vertex', 'azure_openai'],
  'llm-gemma': ['vertex'],
}

/** Models OpenRouter can route to. */
const OPENROUTER_MODELS = new Set(['llm-gpt', 'llm-gpt4o-mini', 'llm-claude', 'llm-gemini', 'llm-llama', 'llm-mistral', 'llm-gemma', 'llm-qwen'])

export const GPU_TYPES: GpuType[] = ['T4', 'L4', 'A10', 'A100']
export const GPU_TIER: Record<GpuType | 'none', ComputeTier> = { none: 'cpu', T4: 't4', L4: 'l4', A10: 'a10', A100: 'a100' }
const TIER_GPU: Record<ComputeTier, GpuType | 'none'> = { cpu: 'none', t4: 'T4', l4: 'L4', a10: 'A10', a100: 'A100' }

export const isSensitive = (spec: Pick<EnvSpec, 'dataClassification'>) => spec.dataClassification === 'personal' || spec.dataClassification === 'children'

export const isAllowedFor = (p: InfraProvider, tenantId: string) => p.allowedTenants === 'all' || p.allowedTenants.includes(tenantId)

/** Active providers the tenant may use. */
export const providersFor = (providers: InfraProvider[], tenantId: string) => providers.filter((p) => p.status === 'active' && isAllowedFor(p, tenantId))

/** Personal and children's data may only use India-resident regions. */
export const regionsFor = (p: InfraProvider | undefined, sensitive: boolean) => (p?.regions ?? []).filter((r) => !sensitive || r.indiaResident)

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
export function ensurePlacement(spec: EnvSpec, providers: InfraProvider[], tenantId: string): EnvSpec {
  const allowed = providersFor(providers, tenantId)
  const provider = allowed.find((p) => p.id === spec.providerId) ?? allowed[0]
  if (!provider) return spec
  const regions = regionsFor(provider, isSensitive(spec))
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

/** Ways a project can reach a model, given the providers this tenant may use. */
export function accessModesFor(model: CatalogItem, providers: InfraProvider[], tenantId: string): AccessMode[] {
  const modes: AccessMode[] = ['direct']
  if (OPENROUTER_MODELS.has(model.id)) modes.push('openrouter')
  const services = new Set(providersFor(providers, tenantId).flatMap((p) => p.aiServices))
  for (const s of MODEL_SERVICES[model.id] ?? []) if (services.has(s)) modes.push(s)
  return modes
}

export const currentCard = latestRateCard

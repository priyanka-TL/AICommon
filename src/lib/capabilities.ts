import type { CatalogItem, Deployment, DeploymentConfig, Environment, Project, ServiceAccess } from '@/data/types'

/** Where a capability on a deployment comes from. */
export type CapabilitySource = 'project' | 'environment' | 'both'

export const SOURCE_LABELS: Record<CapabilitySource, string> = {
  project: 'Project',
  environment: 'Environment',
  both: 'Project + Environment',
}

export const SERVICE_ACCESS_LABELS: Record<ServiceAccess, string> = {
  environment: 'On this environment',
  platform: 'Platform service',
  external: 'External service',
}

/** Services run as their own process (a vector database, an observability server, a low-code builder); the rest are libraries or models. */
const SERVICE_CATEGORIES = new Set(['vector-db', 'low-code'])
const SERVICE_IDS = new Set(['cap-langfuse'])
export const isServiceItem = (item: Pick<CatalogItem, 'category' | 'id'> | undefined) => !!item && (SERVICE_CATEGORIES.has(item.category) || SERVICE_IDS.has(item.id))
const MODEL_CATEGORIES = new Set(['llm', 'asr', 'embedding'])
export const isModelItem = (item: Pick<CatalogItem, 'category'> | undefined) => !!item && MODEL_CATEGORIES.has(item.category)

export const projectVersion = (project: Pick<Project, 'capabilityVersions'>, item: Pick<CatalogItem, 'id' | 'version'>) => project.capabilityVersions[item.id] ?? item.version

/** Environment-level capabilities, by item id. */
export function envCapabilityMap(env: Pick<Environment, 'capabilities'>) {
  return new Map(env.capabilities.map((c) => [c.itemId, c.version]))
}

export interface EffectiveCapability {
  item: CatalogItem
  version: string
  source: CapabilitySource
  /** Both pin a version and they differ, and nobody has chosen one yet. */
  conflict: { project: string; environment: string } | null
}

/** Project capabilities + environment capabilities, merged. A conflict resolved in `choice` uses the chosen version. */
export function effectiveCapabilities(
  project: Pick<Project, 'capabilityIds' | 'capabilityVersions'>,
  env: Pick<Environment, 'capabilities'>,
  catalog: CatalogItem[],
  choice: Record<string, string> = {},
): EffectiveCapability[] {
  const envMap = envCapabilityMap(env)
  const out: EffectiveCapability[] = []
  for (const id of project.capabilityIds) {
    const item = catalog.find((c) => c.id === id)
    if (!item) continue
    const pv = projectVersion(project, item)
    const ev = envMap.get(id)
    if (ev === undefined) {
      out.push({ item, version: pv, source: 'project', conflict: null })
      continue
    }
    const differ = ev !== pv
    const chosen = choice[id]
    out.push({
      item,
      version: differ ? (chosen ?? pv) : pv,
      source: 'both',
      conflict: differ && !(chosen === pv || chosen === ev) ? { project: pv, environment: ev } : null,
    })
  }
  for (const [id, version] of envMap) {
    if (project.capabilityIds.includes(id)) continue
    const item = catalog.find((c) => c.id === id)
    if (item) out.push({ item, version, source: 'environment', conflict: null })
  }
  return out
}

/** Items both sides pin at different versions, with no choice made. */
export function capabilityConflicts(project: Pick<Project, 'capabilityIds' | 'capabilityVersions'>, env: Pick<Environment, 'capabilities'>, catalog: CatalogItem[], choice: Record<string, string> = {}) {
  return effectiveCapabilities(project, env, catalog, choice).filter((c) => c.conflict)
}

/** Service-type project capabilities the environment doesn't run, unless the project reaches them through the platform or an external service. */
export function missingServices(
  project: Pick<Project, 'capabilityIds'>,
  env: Pick<Environment, 'capabilities'>,
  catalog: CatalogItem[],
  serviceAccess: Record<string, ServiceAccess> = {},
) {
  const envMap = envCapabilityMap(env)
  return project.capabilityIds
    .map((id) => catalog.find((c) => c.id === id))
    .filter((item): item is CatalogItem => isServiceItem(item) && !envMap.has(item!.id) && !['platform', 'external'].includes(serviceAccess[item!.id] ?? ''))
}

/** Package names to install for library-type capabilities, per runtime. */
const PACKAGES: Record<string, { node?: string; python?: string }> = {
  langchain: { node: 'langchain', python: 'langchain' },
  haystack: { python: 'haystack-ai' },
  deepeval: { python: 'deepeval' },
  promptfoo: { node: 'promptfoo' },
  langgraph: { node: '@langchain/langgraph', python: 'langgraph' },
  llamaindex: { node: 'llamaindex', python: 'llama-index' },
  crewai: { python: 'crewai' },
  'bge-m3': { python: 'FlagEmbedding' },
  qdrant: { node: '@qdrant/js-client-rest', python: 'qdrant-client' },
  langfuse: { node: 'langfuse', python: 'langfuse' },
  ragas: { python: 'ragas' },
  chroma: { node: 'chromadb', python: 'chromadb' },
  weaviate: { node: 'weaviate-client', python: 'weaviate-client' },
  pgvector: { python: 'pgvector' },
}

const keyOf = (item: CatalogItem) => {
  const n = item.name.toLowerCase()
  return Object.keys(PACKAGES).find((k) => n.replace(/[\s.]/g, '').includes(k.replace(/-/g, '')) || n.includes(k)) ?? null
}

/** Library packages (with versions) to add to the install command for these capabilities. */
export function capabilityPackages(caps: Pick<EffectiveCapability, 'item' | 'version'>[], runtime: DeploymentConfig['runtime']): string[] {
  if (runtime !== 'node' && runtime !== 'python') return []
  const out: string[] = []
  for (const c of caps) {
    if (isServiceItem(c.item) && c.item.category !== 'vector-db' && !SERVICE_IDS.has(c.item.id)) continue
    if (c.item.category === 'llm' || c.item.category === 'asr') continue
    const k = keyOf(c.item)
    const pkg = k ? PACKAGES[k]![runtime] : undefined
    if (!pkg) continue
    const v = c.version.replace(/^v/, '')
    out.push(runtime === 'python' ? `${pkg}==${v}` : `${pkg}@${v}`)
  }
  return [...new Set(out)]
}

/** Connection variables added for service capabilities, e.g. QDRANT_URL. */
export function capabilityConnectionVars(caps: Pick<EffectiveCapability, 'item' | 'version'>[], envHost: string, serviceAccess: Record<string, ServiceAccess> = {}) {
  const vars: { key: string; value: string }[] = []
  for (const c of caps) {
    if (!isServiceItem(c.item)) continue
    const base = c.item.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    const mode = serviceAccess[c.item.id] ?? 'environment'
    const host = mode === 'platform' ? `${base.toLowerCase().replace(/_/g, '-')}.platform.aicommons.example` : mode === 'external' ? `${base.toLowerCase().replace(/_/g, '-')}.example.com` : '127.0.0.1'
    vars.push({ key: `${base}_URL`, value: mode === 'environment' ? `http://${host}:${portFor(c.item)}` : `https://${host}` })
    if (mode !== 'environment') vars.push({ key: `${base}_API_KEY`, value: `\${${base}_API_KEY}` })
  }
  void envHost
  return vars
}

const portFor = (item: CatalogItem) => {
  const n = item.name.toLowerCase()
  if (n.includes('qdrant')) return 6333
  if (n.includes('langfuse')) return 3030
  if (n.includes('chroma')) return 8001
  if (n.includes('weaviate')) return 8080
  if (n.includes('langflow')) return 7860
  if (n.includes('flowise')) return 3100
  if (n.includes('dify')) return 5001
  if (n.includes('pgvector')) return 5432
  return 7000
}

/** The environments a project is on, through its deployments. */
export function projectEnvIds(projectId: string, deployments: Pick<Deployment, 'projectId' | 'envId'>[]) {
  return [...new Set(deployments.filter((d) => d.projectId === projectId).map((d) => d.envId))]
}

/** The projects on an environment, through its deployments. */
export function envProjectIds(envId: string, deployments: Pick<Deployment, 'projectId' | 'envId'>[]) {
  return [...new Set(deployments.filter((d) => d.envId === envId).map((d) => d.projectId))]
}

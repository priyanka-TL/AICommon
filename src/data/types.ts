export type Role = 'admin' | 'user'

export type TenantStatus = 'active' | 'suspended'
export type OrgType = 'NGO' | 'Social enterprise' | 'Foundation' | 'Government partner'

export type CatalogCategory =
  | 'llm'
  | 'asr'
  | 'agent-framework'
  | 'vector-db'
  | 'evaluation'
  | 'low-code'

export interface Tenant {
  id: string
  name: string
  shortName: string
  orgType: OrgType
  city: string
  state: string
  contactName: string
  contactEmail: string
  creditQuota: number
  creditsUsed: number
  gpuQuota: number
  gpuUsed: number
  allowedCapabilities: CatalogCategory[]
  status: TenantStatus
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  title: string
  tenantId: string | null
  role: Role
  status: 'active' | 'deactivated'
  lastActiveAt: string
}

export type EnvStatus = 'pending' | 'approved' | 'provisioning' | 'running' | 'stopped' | 'rejected'

export type Purpose = 'development' | 'functional-testing' | 'load-testing' | 'evaluation' | 'pilot'
export type ComputeTier = 'cpu' | 't4' | 'a10' | 'a100'
export type DataClassification = 'public' | 'internal' | 'personal' | 'children'
export type Language = 'Hindi' | 'Kannada' | 'Tamil' | 'Telugu' | 'Marathi' | 'Bengali' | 'English'

export interface LlmSelection {
  id: string
  /** Millions of tokens per month */
  tokenBudget: number
}

export interface EnvSpec {
  name: string
  description: string
  purpose: Purpose
  durationWeeks: number
  compute: ComputeTier
  storageGb: number
  /** Idle hours before auto-shutdown; 0 means off */
  autoShutdownHours: number
  llms: LlmSelection[]
  asr: string[]
  languages: Language[]
  asrHoursPerMonth: number
  capabilities: string[]
  dataClassification: DataClassification
  containsPii: boolean
  justification: string
}

export interface TimelineEntry {
  status: EnvStatus
  at: string
  note?: string
}

export interface Environment {
  id: string
  tenantId: string
  ownerId: string
  requestId: string | null
  status: EnvStatus
  spec: EnvSpec
  endpoint: string
  apiKey: string
  creditsUsed: number
  createdAt: string
  expiresAt: string | null
  timeline: TimelineEntry[]
}

export type RequestType = 'new' | 'change'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface SpecChange {
  field: string
  from: string
  to: string
}

export interface Comment {
  id: string
  authorId: string
  text: string
  at: string
}

export interface EnvRequest {
  id: string
  type: RequestType
  tenantId: string
  requesterId: string
  envId: string
  spec: EnvSpec
  previousSpec: EnvSpec | null
  status: RequestStatus
  createdAt: string
  decidedAt: string | null
  decidedById: string | null
  adminChanges: SpecChange[]
  rejectionReason: string | null
  comments: Comment[]
}

export type CatalogStatus = 'active' | 'beta' | 'deprecated'
export type CostUnit = 'per 1M tokens' | 'per audio hour' | 'per month' | 'free'

export interface CatalogItem {
  id: string
  name: string
  category: CatalogCategory
  provider: string
  hosting: 'hosted' | 'open-source'
  version: string
  versions: string[]
  licence: string
  gitUrl: string | null
  docsUrl: string | null
  costPerUnit: number
  costUnit: CostUnit
  languages: Language[]
  status: CatalogStatus
  description: string
}

export type ProviderHealth = 'healthy' | 'degraded' | 'down'

export interface Provider {
  id: string
  name: string
  kind: 'llm' | 'asr'
  maskedKey: string
  enabled: boolean
  health: ProviderHealth
  latencyMs: number
  region: string
  /** Catalog item ids served through this provider. */
  serves: string[]
}

export interface UsagePoint {
  date: string
  tenantId: string
  credits: number
  gpuHours: number
  apiCalls: number
}

export type ActivityKind =
  | 'request'
  | 'approval'
  | 'rejection'
  | 'environment'
  | 'tenant'
  | 'user'
  | 'catalog'
  | 'provider'
  | 'test'
  | 'comment'

export interface Activity {
  id: string
  at: string
  actorId: string
  tenantId: string | null
  kind: ActivityKind
  text: string
}

export interface Notification {
  id: string
  userId: string
  at: string
  text: string
  link: string | null
  read: boolean
}

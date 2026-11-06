export type Role = 'super_admin' | 'tenant_admin' | 'user'
export type ActorRole = Role | 'system'

export type TenantStatus = 'active' | 'suspended'
export type OrgType = 'NGO' | 'Social enterprise' | 'Foundation' | 'Government partner' | 'System'

export type CatalogCategory = 'llm' | 'asr' | 'agent-framework' | 'vector-db' | 'evaluation' | 'low-code'

export interface Quota {
  vcpu: number
  ramGb: number
  gpus: number
  storageGb: number
}

export interface Tenant {
  id: string
  name: string
  code: string
  description: string
  orgType: OrgType
  city: string
  state: string
  contactName: string
  contactEmail: string
  quota: Quota
  /** Catalog items this tenant has switched on (subset of what the Super Admin made available). */
  enabledItemIds: string[]
  status: TenantStatus
  isSystem: boolean
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  title: string
  tenantId: string
  role: Role
  status: 'active' | 'deactivated'
  lastActiveAt: string
}

export interface Project {
  id: string
  tenantId: string
  name: string
  description: string
  ownerId: string
  memberIds: string[]
  status: 'active' | 'archived'
  limits: Quota
  capabilityIds: string[]
  createdAt: string
}

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
  projectId: string
  purpose: Purpose
  durationWeeks: number
  compute: ComputeTier
  /** Number of GPU nodes for GPU tiers; ignored for CPU. */
  gpuCount: number
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

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'resubmitted'
  | 'escalated'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export type EnvStatus = 'provisioning' | 'active' | 'stopped' | 'suspended' | 'provisioning_failed' | 'terminated'

export type LifecycleStatus = RequestStatus | EnvStatus

export interface LifecycleEvent {
  status: LifecycleStatus
  at: string
  actorId: string
  actorRole: ActorRole
  comment?: string
}

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
  kind: 'new' | 'change'
  tenantId: string
  requesterId: string
  raisedByRole: Role
  /** For `new`: the environment created on approval. For `change`: the environment being changed. */
  envId: string | null
  spec: EnvSpec
  previousSpec: EnvSpec | null
  status: RequestStatus
  createdAt: string
  updatedAt: string
  history: LifecycleEvent[]
  comments: Comment[]
  /** Allocation edits an approver made before forwarding or approving. */
  adminChanges: SpecChange[]
  simulateFailure: boolean
}

export interface Environment {
  id: string
  tenantId: string
  projectId: string
  ownerId: string
  requestId: string
  status: EnvStatus
  spec: EnvSpec
  endpoint: string
  apiKey: string
  creditsUsed: number
  createdAt: string
  expiresAt: string | null
  history: LifecycleEvent[]
  failureReason: string | null
  /** When provisioning completes (ISO). Null for held or finished environments. */
  provisionDueAt: string | null
  /** Keeps a seeded environment in Provisioning so the state stays visible. */
  hold: boolean
  loadProfile: 'normal' | 'hot'
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
  /** 'all' or the tenant IDs it is published to. */
  availability: 'all' | string[]
  origin: 'registry' | 'suggestion'
  dependencies: string
  installInstructions: string
  resourceRequirements: string
  runtimes: string[]
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
  serves: string[]
}

export interface UsagePoint {
  date: string
  tenantId: string
  credits: number
  gpuHours: number
  apiCalls: number
}

export type SuggestionStatus = 'submitted' | 'under_review' | 'needs_info' | 'approved_tenant' | 'published' | 'rejected'

export interface SuggestionEvent {
  status: SuggestionStatus
  at: string
  actorId: string
  actorRole: ActorRole
  comment?: string
}

export interface Suggestion {
  id: string
  tenantId: string
  suggestedById: string
  githubUrl: string
  name: string
  category: CatalogCategory
  description: string
  useCase: string
  licence: string
  docsUrl: string
  status: SuggestionStatus
  /** Tenant Admin has passed it to the Super Admin. */
  forwarded: boolean
  history: SuggestionEvent[]
  catalogItemId: string | null
  createdAt: string
}

export interface QuotaRequest {
  id: string
  tenantId: string
  requestedById: string
  current: Quota
  requested: Quota
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedById: string | null
  comment: string | null
}

export interface TestRun {
  id: string
  envId: string
  tenantId: string
  actorId: string
  kind: 'functional' | 'load'
  at: string
  summary: string
  passed: boolean
}

export type AuditEntity =
  | 'request'
  | 'environment'
  | 'tenant'
  | 'user'
  | 'project'
  | 'catalog'
  | 'provider'
  | 'suggestion'
  | 'quota'
  | 'test'
  | 'settings'
  | 'capacity'

export interface AuditEntry {
  id: string
  at: string
  actorId: string
  actorRole: ActorRole
  tenantId: string | null
  action: string
  entityType: AuditEntity
  entityId: string
  summary: string
  comment?: string
}

export interface Notification {
  id: string
  userId: string
  at: string
  text: string
  link: string | null
  read: boolean
}

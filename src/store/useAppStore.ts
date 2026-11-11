import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSeed, endpointFor, GPU_TIER, rateCardVersionAt, SAMPLE_PASSWORD, SEED_VERSION, type SeedState } from '@/data/seed'
import type {
  AdminCreation,
  ActorRole,
  AuditEntity,
  CatalogCategory,
  CatalogItem,
  CatalogStatus,
  CredentialKind,
  DataClassification,
  ModelBudget,
  ModelPlacement,
  Dataset,
  Deployment,
  DeploymentConfig,
  DeployRun,
  EnvCapability,
  EnvRequest,
  EnvSpec,
  EnvStatus,
  Environment,
  InfraProvider,
  LifecycleEvent,
  Project,
  ProjectAccess,
  ProjectType,
  Provider,
  ProviderApproval,
  ProviderRequest,
  ProviderRequestEvent,
  ProviderRequestStatus,
  QaAssignment,
  QaRun,
  Quota,
  RateCard,
  RequestStatus,
  Role,
  Runtime,
  ServiceAccess,
  Suggestion,
  Tenant,
  TestConfigSpec,
  TestRun,
  User,
} from '@/data/types'
import { canTransition, partiesFor, findTransition } from '@/lib/lifecycle'
import { addsInfrastructure, diffSpecs } from '@/lib/spec'
import { alertLevel, currentPoint, utilisation } from '@/lib/metrics'
import { envPath, itemPath, projectPath, providerRequestPath, reportPath, requestPath, suggestionPath } from '@/lib/paths'
import { seedQaRuns } from '@/lib/qa'
import { isModelOnly, residencyProblem } from '@/lib/providers'
import { isPlatformModel, modelUsageBlocked, monthKey, platformModelOptions, tenantModelSpend } from '@/lib/modelCost'
import { formatINR as formatCurrency } from '@/lib/format'
import { environmentsInUse } from '@/lib/cost'
import { parseGithubUrl } from '@/lib/suggestions'
import { formatDate, formatDuration, formatInt } from '@/lib/format'
import { roleLabel } from '@/lib/labels'
import { canEditProject, isAdmin } from '@/lib/roles'
import { uid, slugify } from '@/lib/utils'
import {
  canManageEnvProjects,
  canOperateDeployment,
  capacityShortfall,
  checksPass,
  type CheckKey,
  preDeployChecks,
  defaultConfig,
  envCapacity,
  fakeCommit,
  limitsUsed,
  serviceNameFor,
  shortfallText,
  simulateSteps,
  STEP_LABELS,
  STEP_ORDER,
  validateConfig,
} from '@/lib/deploy'
import { allocationOf } from '@/lib/quota'
import { adminCreateCheck, MAX_COPIES } from '@/lib/adminCreate'
import { batchName, TENANT_OWNER } from '@/lib/ownership'

export const STORAGE_KEY = `aic-demo-data-${SEED_VERSION}`

/** What the project form edits. */
export interface ProjectInput {
  name: string
  description: string
  type: ProjectType
  repoUrl: string
  defaultBranch: string
  defaultRuntime: Runtime
  defaultRuntimeVersion: string
  memberIds: string[]
  memberAccess: Record<string, ProjectAccess>
  limits?: Quota
  dataClassification?: DataClassification
}

const PROJECT_FIELD_LABELS: Partial<Record<keyof ProjectInput | 'status', string>> = {
  name: 'name',
  description: 'description',
  type: 'project type',
  repoUrl: 'repository',
  defaultBranch: 'default branch',
  defaultRuntime: 'default runtime',
  defaultRuntimeVersion: 'runtime version',
  memberIds: 'members',
  memberAccess: 'member access',
  limits: 'limits',
  dataClassification: 'data classification',
  status: 'status',
}
const PROVISIONING_MS = 5000
const FAILURE_REASON = 'Simulated: GPU capacity unavailable in pool'
const DEPLOY_STEP_MS = 750

/* ---------- session (per tab) ---------- */

interface SessionState {
  currentUserId: string | null
  /** Super Admin tenant filter: 'all' or a tenant id. */
  tenantFilter: string
  /** QA Engineer: show every project in the tenant (only when the Tenant Admin allows it). */
  qaTenantWide: boolean
  setCurrentUser: (id: string | null) => void
  setTenantFilter: (id: string) => void
  setQaTenantWide: (on: boolean) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      tenantFilter: 'all',
      qaTenantWide: false,
      setCurrentUser: (id) => set({ currentUserId: id, tenantFilter: 'all', qaTenantWide: false }),
      setTenantFilter: (id) => set({ tenantFilter: id }),
      setQaTenantWide: (on) => set({ qaTenantWide: on }),
    }),
    { name: 'aic-session', storage: createJSONStorage(() => sessionStorage) },
  ),
)

/* ---------- app data ---------- */

export type InfraProviderInput = Pick<InfraProvider, 'name' | 'code' | 'type' | 'logoUrl' | 'status' | 'regions' | 'aiServices' | 'maxGpus' | 'allowedTenants'>
export type RateCardInput = Omit<RateCard, 'version' | 'publishedAt' | 'publishedById'>

export type ProviderRequestInput = Pick<ProviderRequest, 'providerId' | 'regionIds' | 'justification' | 'workloads' | 'expectedMonthlySpend' | 'requestedCap' | 'dataClassification'>
export type ProviderRequestAction = 'forward' | 'request_changes' | 'reject' | 'approve' | 'cancel'

export type Result = { ok: true; id?: string } | { ok: false; error: string }

/** What an admin fills in to create infrastructure directly. */
export interface AdminCreateInput {
  tenantId: string
  spec: EnvSpec
  /** A user in the tenant, or TENANT_OWNER. */
  ownerId: string
  accessUserIds: string[]
  reason: string
  /** Number of identical environments, 1–20. */
  count: number
  /** YYYY-MM-DD; auto-terminates on that date. */
  expiresAt: string | null
  overrideReason?: string
  simulateFailure?: boolean
}
export type AdminCreateResult = { ok: true; envIds: string[]; requestIds: string[] } | { ok: false; error: string }
const ok = (id?: string): Result => ({ ok: true, id })
const fail = (error: string): Result => ({ ok: false, error })

export interface SuggestionInput {
  githubUrl: string
  name: string
  category: CatalogCategory
  description: string
  useCase: string
  licence: string
  docsUrl: string
}

export interface RegistryFields {
  version: string
  licence: string
  dependencies: string
  installInstructions: string
  resourceRequirements: string
  runtimes: string[]
}

export type SuggestionAction = 'approve_tenant' | 'needs_info' | 'reject' | 'forward' | 'publish'

interface AppState extends SeedState {
  // auth
  login: (email: string, password: string) => { user: User } | { error: string }
  quickLogin: (userId: string) => User | null
  logout: () => void

  // requests
  saveDraft: (spec: EnvSpec, draftId?: string) => string
  submitRequest: (spec: EnvSpec, draftId?: string) => Result
  editEnvironment: (envId: string, spec: EnvSpec) => { mode: 'applied' | 'requested'; id: string } | { mode: 'error'; error: string }
  openRequest: (id: string) => void
  transitionRequest: (id: string, to: RequestStatus, opts?: { comment?: string; spec?: EnvSpec; simulateFailure?: boolean }) => Result
  addComment: (id: string, text: string) => void

  // environments
  transitionEnv: (id: string, to: EnvStatus, opts?: { comment?: string }) => Result
  restartEnv: (id: string) => void
  /** Simulated terminal: audit who opened and closed a session, and for how long. Command contents are never stored. */
  openTerminalSession: (envId: string, readOnly: boolean) => void
  closeTerminalSession: (envId: string, startedAt: number) => void
  extendEnv: (id: string, weeks: number) => void
  scheduleProvisioning: () => void
  /** Super Admin or Tenant Admin: create environments directly, skipping the approval flow. */
  createInfrastructure: (input: AdminCreateInput) => AdminCreateResult
  /** Tenant Admin over quota or budget: send the same configuration to the Super Admin as escalated requests. */
  escalateAdminCreate: (input: AdminCreateInput) => AdminCreateResult
  /** Super Admin: approve a provider for a tenant inline, with regions and a monthly budget cap. */
  enableProviderForTenant: (tenantId: string, providerId: string, regionIds: string[], budgetCap: number) => Result
  /** Tenant Admin or Super Admin: hand the environment to someone else in the tenant, or make it tenant-owned. */
  changeEnvOwner: (envId: string, ownerId: string) => Result

  // deployments (projects hosted on an environment)
  addProjectsToEnv: (envId: string, items: { projectId: string; limits: { vcpu: number; ramGb: number } }[]) => Result
  removeDeployment: (id: string) => Result
  updateDeploymentConfig: (id: string, config: DeploymentConfig) => Result
  /** Runs only after the review: blocked unless every pre-deploy check passes or its warning is overridden. */
  deploy: (id: string, opts?: { overrides?: CheckKey[] }) => Result
  stopDeployment: (id: string) => Result
  /** Redeploys an earlier version's configuration (the latest working one when `version` is omitted). */
  rollbackDeployment: (id: string, opts?: { version?: number; overrides?: CheckKey[] }) => Result
  setDeploymentChoices: (id: string, patch: { capabilityChoice?: Record<string, string>; serviceAccess?: Record<string, ServiceAccess> }) => Result
  addEnvCapability: (envId: string, itemId: string, version?: string) => Result
  removeEnvCapability: (envId: string, itemId: string) => Result
  /** Attach catalog items a project needs. Applies at once unless it adds infrastructure, then it becomes a change request. */
  attachDependencies: (envId: string, itemIds: string[]) => { mode: 'applied' | 'requested'; id: string } | { mode: 'error'; error: string }
  /** Ask for a bigger instance so `extra` vCPU/RAM fits on top of what projects already reserve. */
  requestEnvUpgrade: (envId: string, extra: { vcpu: number; ramGb: number }, reason: string) => { mode: 'applied' | 'requested'; id: string } | { mode: 'error'; error: string }
  /** Marks runs interrupted by a reload as failed. */
  recoverDeployments: () => void

  // projects
  createProject: (p: ProjectInput) => Result
  updateProject: (id: string, patch: Partial<ProjectInput & Pick<Project, 'status'>>) => Result
  /** Platform models (llm, asr, embedding) need a placement: the provider and region that serve them. */
  addProjectCapability: (projectId: string, itemId: string, placement?: ModelPlacement, version?: string) => Result
  removeProjectCapability: (projectId: string, itemId: string) => Result
  setProjectCapabilityVersion: (projectId: string, itemId: string, version: string) => Result

  // tenants & users
  createTenant: (t: Pick<Tenant, 'name' | 'code' | 'description' | 'orgType' | 'city' | 'state' | 'contactName' | 'contactEmail' | 'quota'> & { providers: { providerId: string; budgetCap: number }[] }) => string | null
  /** Super Admin: change an approved provider's regions or budget cap. */
  adjustProviderApproval: (tenantId: string, providerId: string, patch: { regionIds: string[]; budgetCap: number }) => Result
  /** Super Admin: take a provider away from a tenant. Blocked while environments use it unless they migrate later. */
  revokeProviderAccess: (tenantId: string, providerId: string, opts?: { migrateLater?: boolean; comment?: string }) => Result
  /** Ask for a provider (new), or send a changed request again. */
  submitProviderRequest: (input: ProviderRequestInput, resubmitId?: string) => Result
  openProviderRequest: (id: string) => void
  decideProviderRequest: (id: string, action: ProviderRequestAction, opts?: { comment?: string; regionIds?: string[]; budgetCap?: number }) => Result
  updateTenant: (id: string, patch: Partial<Pick<Tenant, 'name' | 'description' | 'orgType' | 'city' | 'state' | 'contactName' | 'contactEmail'>>) => void
  setTenantStatus: (id: string, status: Tenant['status']) => void
  setTenantQuota: (id: string, quota: Quota) => void
  setItemEnabled: (tenantId: string, itemId: string, enabled: boolean) => void
  createUser: (u: Pick<User, 'name' | 'email' | 'title' | 'role' | 'tenantId' | 'qa'>) => Result
  updateUser: (id: string, patch: Partial<Pick<User, 'name' | 'title' | 'role' | 'qa'>>) => void
  setUserStatus: (id: string, status: User['status']) => void
  resetPassword: (id: string) => void

  // quota & capacity
  requestQuotaIncrease: (requested: Quota, reason: string) => void
  decideQuotaRequest: (id: string, approve: boolean, comment: string) => void
  setCapacity: (capacity: Quota) => void

  // catalog & providers
  upsertCatalogItem: (item: CatalogItem) => void
  setCatalogStatus: (id: string, status: CatalogStatus) => void
  updateProvider: (id: string, patch: Partial<Provider>) => void

  // suggestions
  submitSuggestion: (input: SuggestionInput) => Result
  resubmitSuggestion: (id: string, input: SuggestionInput) => void
  openSuggestion: (id: string) => void
  decideSuggestion: (id: string, action: SuggestionAction, opts?: { comment?: string; publishTo?: 'all' | string[]; registry?: RegistryFields }) => Result

  // tests, monitoring, notifications
  recordTestRun: (run: Omit<TestRun, 'id' | 'at' | 'actorId' | 'tenantId'>) => void
  createInfraProvider: (p: InfraProviderInput, card: RateCardInput) => Result
  updateInfraProvider: (id: string, p: InfraProviderInput) => Result
  setInfraProviderStatus: (id: string, status: InfraProvider['status']) => Result
  publishRateCard: (id: string, card: RateCardInput) => Result
  /** Super Admin: save the provider's model service credential. Only a masked value is kept. */
  setModelServiceKey: (id: string, input: { credentialKind: CredentialKind; key: string; endpoint?: string }) => Result
  revokeModelServiceKey: (id: string) => Result
  testModelServiceKey: (id: string) => Promise<Result>
  /** Tenant Admin (own tenant) or Super Admin: monthly model budget and what happens at 100%. */
  setModelBudget: (tenantId: string, patch: Pick<ModelBudget, 'monthly' | 'onExceed'>) => Result
  /** Sends 80% and 100% model budget alerts once per month. */
  checkModelBudgets: () => void
  createDataset: (input: Pick<Dataset, 'name' | 'language' | 'rows'>) => Result
  createTestConfig: (spec: TestConfigSpec) => Result
  /** Saves the change as a new version; earlier versions stay. */
  updateTestConfig: (id: string, spec: TestConfigSpec, summary: string) => Result
  duplicateTestConfig: (id: string) => Result
  setTestConfigArchived: (id: string, archived: boolean) => void
  recordQaRun: (run: Omit<QaRun, 'id' | 'at' | 'actorId' | 'tenantId'>) => Result
  setRecommendation: (projectId: string, modelId: string, runId: string, note: string) => Result
  checkAlerts: () => void
  markNotificationsRead: () => void
  markNotificationRead: (id: string) => void

  resetSampleData: () => void
}

/** Seed data plus QA history computed from it. */
const fullSeed = () => {
  const seed = createSeed()
  return { ...seed, qaRuns: seedQaRuns(seed) }
}

const now = () => new Date().toISOString()
const timers = new Map<string, number>()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /* ---------- helpers ---------- */

      const me = () => get().users.find((u) => u.id === useSessionStore.getState().currentUserId) ?? null
      const userById = (id: string) => get().users.find((u) => u.id === id)
      const projectName = (id: string) => get().projects.find((p) => p.id === id)?.name ?? id
      /** Keep only active projects of that tenant. */
      const cleanQa = (qa: QaAssignment | undefined, tenantId: string): QaAssignment => ({
        projectIds: (qa?.projectIds ?? []).filter((pid) => get().projects.some((p) => p.id === pid && p.tenantId === tenantId)),
        tenantWideAllowed: !!qa?.tenantWideAllowed,
      })
      const qaScopeText = (qa: QaAssignment) =>
        `${qa.projectIds.length ? qa.projectIds.map(projectName).join(', ') : 'no projects yet'}${qa.tenantWideAllowed ? ' (tenant-wide view allowed)' : ''}`
      const providerProblem = (input: InfraProviderInput, selfId?: string): string | null => {
        if (input.name.trim().length < 2) return 'Give the provider a name.'
        const code = input.code.trim().toUpperCase()
        if (!/^[A-Z0-9]{2,6}$/.test(code)) return 'Use a short code of 2 to 6 letters or digits, such as AWS or E2E.'
        if (get().infraProviders.some((p) => p.id !== selfId && p.code.toUpperCase() === code)) return `The code ${code} is already used by another provider.`
        if (!input.regions.length) return 'Add at least one region.'
        if (input.regions.some((r) => !r.name.trim())) return 'Every region needs a name.'
        if (input.maxGpus < 0) return 'Maximum GPUs can’t be negative.'
        if (input.allowedTenants !== 'all' && !input.allowedTenants.length) return 'Pick at least one tenant, or allow all tenants.'
        return null
      }
      const rateCardProblem = (c: RateCardInput, latest: RateCard | null, modelOnly = false): string | null => {
        if (!modelOnly && !c.instanceTypes.length) return 'Add at least one instance type.'
        if (modelOnly && !c.modelPrices.length) return 'Add at least one model price.'
        if (c.modelPrices.some((m) => !m.modelId || !m.providerModelId.trim())) return 'Each model price needs a model and its ID at this provider.'
        if (c.modelPrices.some((m) => !m.regionIds.length)) return 'Each model price needs at least one region.'
        if (c.modelPrices.some((m) => [m.inputPer1M, m.outputPer1M, m.perAudioMinute ?? 0].some((n) => !Number.isFinite(n) || n < 0))) return 'Model prices must be zero or more.'
        if (new Set(c.modelPrices.map((m) => m.modelId)).size !== c.modelPrices.length) return 'Each model can appear only once on a rate card.'
        if (c.instanceTypes.some((i) => !i.name.trim() || i.vcpu < 1 || i.ramGb < 1 || i.hourlyRate < 0 || (i.gpuType !== 'none' && i.gpuCount < 1))) return 'Each instance type needs a name, vCPU, RAM, an hourly rate and, for GPU types, a GPU count.'
        if ([c.storageRate, c.egressRate, c.platformFeePct, c.ngoDiscountPct, c.gstPct].some((n) => !Number.isFinite(n) || n < 0)) return 'Rates and percentages must be zero or more.'
        if (c.platformFeePct > 100 || c.ngoDiscountPct > 100 || c.gstPct > 100) return 'Percentages must be 100 or less.'
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.effectiveFrom)) return 'Choose the date these rates take effect.'
        if (!c.source.trim()) return 'Say where these rates come from, for example “Published price list, Oct 2026”.'
        if (latest) {
          const today = new Date().toISOString().slice(0, 10)
          if (c.effectiveFrom < today) return 'A new rate card can’t start in the past. Past costs stay on the rates in force at the time.'
          if (c.effectiveFrom <= latest.effectiveFrom) return `Choose a date after ${latest.effectiveFrom}, when the current rate card took effect.`
        }
        return null
      }
      const providerName = (pid: string) => get().infraProviders.find((p) => p.id === pid)?.name ?? pid
      /** Why these providers can't be taken away from a tenant (environments still use them), or null. */
      const removalBlockers = (tenantId: string, providerIds: string[]): string | null => {
        const live = get().environments.filter((e) => e.tenantId === tenantId && providerIds.includes(e.spec.providerId) && !['terminated', 'provisioning_failed'].includes(e.status))
        if (!live.length) return null
        const byProvider = providerIds
          .map((pid) => ({ pid, envs: live.filter((e) => e.spec.providerId === pid) }))
          .filter((x) => x.envs.length)
          .map((x) => `${providerName(x.pid)} (${x.envs.map((e) => `“${e.spec.name}”`).join(', ')})`)
        return `Still in use by ${tenantName(tenantId)}: ${byProvider.join('; ')}. Stop or terminate those environments first.`
      }
      /** Provider must be active and allowed for the tenant; personal and children's data must stay in India. */
      const placementProblem = (spec: EnvSpec, tenantId: string): string | null => {
        const p = get().infraProviders.find((x) => x.id === spec.providerId)
        if (!p) return 'Choose an infrastructure provider on the Compute step.'
        if (p.status !== 'active') return `${p.name} is disabled. Choose another provider on the Compute step.`
        if (p.allowedTenants !== 'all' && !p.allowedTenants.includes(tenantId)) return `${p.name} isn’t available to your organisation. Choose another provider.`
        const tenant = get().tenants.find((t) => t.id === tenantId)
        const approval = tenant?.approvedProviders.find((a) => a.providerId === p.id && a.status === 'approved')
        if (tenant && !approval) return `${p.name} isn’t approved for ${tenant.name}. Choose another provider, or ask your Tenant Admin to request access.`
        if (tenant && approval && !approval.regionIds.includes(spec.regionId)) return `${p.regions.find((r) => r.id === spec.regionId)?.name ?? 'This region'} isn’t one of ${tenant.name}’s approved ${p.name} regions. Choose another region.`
        return residencyProblem(spec, get().infraProviders)
      }
      /** Why a project's name or details can't be saved, or null. Names are unique within an organisation. */
      const projectProblem = (p: Pick<ProjectInput, 'name' | 'repoUrl' | 'memberIds'>, tenantId: string, selfId?: string): string | null => {
        const name = p.name.trim()
        if (name.length < 3) return 'Give the project a name of at least 3 characters.'
        if (name.length > 60) return 'Keep the project name under 60 characters.'
        const clash = get().projects.find((x) => x.tenantId === tenantId && x.id !== selfId && x.name.trim().toLowerCase() === name.toLowerCase())
        if (clash) return `${clash.name} already exists in your organisation. Choose another name.`
        if (p.repoUrl.trim() && !/^(https:\/\/[\w.-]+(:\d+)?\/[\w.~/-]+?(\.git)?|git@[\w.-]+:[\w.~/-]+\.git)$/.test(p.repoUrl.trim()))
          return 'Enter a Git URL such as https://github.com/org/repo.git, or leave the repository empty.'
        const outsiders = p.memberIds.filter((m) => !get().users.some((u) => u.id === m && u.tenantId === tenantId))
        if (outsiders.length) return 'Members must belong to your organisation.'
        return null
      }
      /** QA may act on assigned projects, or any project in the tenant when tenant-wide is allowed. */
      const qaCanUseProject = (user: User, projectId: string) => {
        const p = get().projects.find((x) => x.id === projectId)
        if (!p || p.tenantId !== user.tenantId) return false
        return !!user.qa?.tenantWideAllowed || !!user.qa?.projectIds.includes(projectId)
      }
      const tenantName = (id: string | null) => get().tenants.find((t) => t.id === id)?.name ?? ''
      const tenantAdmins = (tenantId: string) => get().users.filter((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.status === 'active').map((u) => u.id)
      const superAdmins = () => get().users.filter((u) => u.role === 'super_admin' && u.status === 'active').map((u) => u.id)
      const actorRole = (): ActorRole => me()?.role ?? 'system'

      const audit = (action: string, entityType: AuditEntity, entityId: string, summary: string, tenantId: string | null, comment?: string, system = false) =>
        set((s) => ({
          audit: [
            {
              id: uid('a'),
              at: now(),
              actorId: system ? 'system' : (me()?.id ?? 'system'),
              actorRole: system ? 'system' : actorRole(),
              tenantId,
              action,
              entityType,
              entityId,
              summary,
              ...(comment ? { comment } : {}),
            },
            ...s.audit,
          ],
        }))

      /** `link` receives each recipient's role so links land on the right page. */
      const notify = (userIds: string[], text: string, link: ((role: Role) => string) | null) => {
        const self = useSessionStore.getState().currentUserId
        const recipients = [...new Set(userIds)].filter((id) => id !== self && get().users.some((u) => u.id === id))
        if (!recipients.length) return
        set((s) => ({
          notifications: [
            ...recipients.map((userId) => {
              const role = s.users.find((x) => x.id === userId)?.role ?? 'user'
              return { id: uid('n'), userId, at: now(), text, link: link ? link(role) : null, read: false }
            }),
            ...s.notifications,
          ],
        }))
      }

      const patchRequest = (id: string, patch: Partial<EnvRequest>) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now() } : r)) }))
      const patchEnv = (id: string, patch: Partial<Environment>) =>
        set((s) => ({ environments: s.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))

      const event = (status: EnvRequest['status'] | EnvStatus, comment?: string, system = false): LifecycleEvent => ({
        status,
        at: now(),
        actorId: system ? 'system' : (me()?.id ?? 'system'),
        actorRole: system ? 'system' : actorRole(),
        ...(comment ? { comment } : {}),
      })

      const pushRequestEvent = (id: string, ev: LifecycleEvent, extra: Partial<EnvRequest> = {}) => {
        const r = get().requests.find((x) => x.id === id)!
        patchRequest(id, { ...extra, status: ev.status as RequestStatus, history: [...r.history, ev] })
      }

      const pushEnvEvent = (id: string, ev: LifecycleEvent, extra: Partial<Environment> = {}) => {
        const e = get().environments.find((x) => x.id === id)!
        patchEnv(id, { ...extra, status: ev.status as EnvStatus, history: [...e.history, ev] })
      }

      const reqLink = (id: string) => (role: Role) => requestPath(role, id)
      const envLink = (id: string) => (role: Role) => envPath(role, id)

      /** Automatic step after submit/resubmit: Tenant Admin-raised requests skip tenant review. */
      const routeAfterSubmit = (id: string) => {
        const r = get().requests.find((x) => x.id === id)!
        if (r.raisedByRole === 'tenant_admin') {
          pushRequestEvent(id, event('escalated', 'Raised by a Tenant Admin, so it went straight to the Super Admin.', true))
          audit('request.escalated', 'request', id, `“${r.spec.name}” went to the Super Admin`, r.tenantId, undefined, true)
          notify(superAdmins(), `New request from ${tenantName(r.tenantId)}: “${r.spec.name}”.`, reqLink(id))
        } else {
          notify(tenantAdmins(r.tenantId), `${r.status === 'resubmitted' ? 'Resubmitted' : 'New request'} from ${userById(r.requesterId)?.name}: “${r.spec.name}”.`, reqLink(id))
        }
      }

      const completeProvisioning = (envId: string) => {
        timers.delete(envId)
        const env = get().environments.find((e) => e.id === envId)
        if (!env || env.status !== 'provisioning' || env.hold) return
        const req = get().requests.find((r) => r.id === env.requestId)
        const people = [env.ownerId, ...tenantAdmins(env.tenantId)]
        if (req?.simulateFailure) {
          pushEnvEvent(envId, event('provisioning_failed', FAILURE_REASON, true), { failureReason: FAILURE_REASON, provisionDueAt: null })
          audit('environment.provisioning_failed', 'environment', envId, `Provisioning failed for “${env.spec.name}”`, env.tenantId, FAILURE_REASON, true)
          notify([...people, ...superAdmins()], `Provisioning failed for “${env.spec.name}”. ${FAILURE_REASON}.`, envLink(envId))
        } else {
          pushEnvEvent(envId, event('active', undefined, true), { failureReason: null, provisionDueAt: null })
          audit('environment.active', 'environment', envId, `“${env.spec.name}” is active`, env.tenantId, undefined, true)
          notify(people, `“${env.spec.name}” is active. Your endpoint and API key are ready.`, envLink(envId))
        }
      }

      const startProvisioning = (envId: string, simulateFailure: boolean) => {
        const env = get().environments.find((e) => e.id === envId)!
        const req = get().requests.find((r) => r.id === env.requestId)
        if (req) patchRequest(req.id, { simulateFailure })
        patchEnv(envId, { provisionDueAt: new Date(Date.now() + PROVISIONING_MS).toISOString(), failureReason: null })
        get().scheduleProvisioning()
      }

      /** Creates the environment for an approved (or admin-created) `new` request and starts provisioning. */
      const materialiseEnv = (
        requestId: string,
        opts: { ownerId: string; accessUserIds?: string[]; adminCreated?: Environment['adminCreated']; expiresAt?: string | null; autoTerminate?: boolean; simulateFailure: boolean },
      ) => {
        const r = get().requests.find((x) => x.id === requestId)!
        const tenant = get().tenants.find((x) => x.id === r.tenantId)!
        const envId = uid('env')
        const env: Environment = {
          id: envId,
          tenantId: r.tenantId,
          ownerId: opts.ownerId,
          requestId,
          status: 'provisioning',
          spec: r.spec,
          endpoint: endpointFor(tenant.code, envId),
          apiKey: `aic_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 41),
          creditsUsed: 0,
          rateCardVersion: rateCardVersionAt(r.spec.providerId, now(), get().infraProviders),
          createdAt: now(),
          expiresAt: opts.expiresAt ?? new Date(Date.now() + r.spec.durationWeeks * 7 * 86_400_000).toISOString(),
          history: [event('provisioning', undefined, true)],
          failureReason: null,
          provisionDueAt: null,
          hold: false,
          loadProfile: 'normal',
          capabilities: r.spec.capabilities.map((itemId) => ({ itemId, version: catalogVersion(itemId), addedById: r.requesterId, at: now() })),
          ...(opts.accessUserIds?.length ? { accessUserIds: opts.accessUserIds } : {}),
          ...(opts.adminCreated ? { adminCreated: opts.adminCreated } : {}),
          ...(opts.autoTerminate ? { autoTerminate: true } : {}),
        }
        set((s) => ({ environments: [env, ...s.environments] }))
        // Projects are optional: an environment can be created with none and get them later.
        const hosted = [...new Set(r.spec.projectIds)].filter((pid) => get().projects.some((p) => p.id === pid && p.tenantId === r.tenantId && p.status === 'active'))
        const deps: Deployment[] = []
        for (const pid of hosted) {
          const dep = newDeployment(env, pid, deps)
          const room = capacityShortfall(env, deps, dep.config.limits)
          deps.push(room ? { ...dep, config: { ...dep.config, limits: { vcpu: 1, ramGb: 1 } } } : dep)
        }
        set((s) => ({ deployments: [...s.deployments, ...deps] }))
        patchRequest(requestId, { envId })
        startProvisioning(envId, opts.simulateFailure)
        return envId
      }

      /** Shared checks for the admin create flow; returns an error or null. */
      const adminCreateProblem = (user: User, input: AdminCreateInput): string | null => {
        if (user.role !== 'super_admin' && user.role !== 'tenant_admin') return 'Only admins can create infrastructure directly. Request an environment instead.'
        const tenant = get().tenants.find((t) => t.id === input.tenantId)
        if (!tenant || tenant.isSystem) return 'Choose an organisation to create infrastructure for.'
        if (user.role === 'tenant_admin' && tenant.id !== user.tenantId) return 'You can create infrastructure only for your own organisation.'
        if (tenant.status === 'suspended') return `${tenant.name} is suspended, so no infrastructure can be created for it.`
        const inTenant = (id: string, roles: Role[]) => get().users.some((u) => u.id === id && u.tenantId === tenant.id && u.status === 'active' && roles.includes(u.role))
        if (input.ownerId !== TENANT_OWNER && !inTenant(input.ownerId, ['user', 'tenant_admin', 'qa'])) return `The owner must be an active person in ${tenant.name}, or choose Tenant-owned.`
        if (input.accessUserIds.some((id) => !inTenant(id, ['user', 'qa']))) return `Access can only be given to active Users and QA Engineers in ${tenant.name}.`
        if (input.reason.trim().length < 10) return 'Give a reason for creating this, in a sentence or two.'
        if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_COPIES) return `Create between 1 and ${MAX_COPIES} environments at a time.`
        if (input.spec.name.trim().length < 3) return 'Give the environment a name of at least 3 characters.'
        if (input.expiresAt && input.expiresAt <= new Date().toISOString().slice(0, 10)) return 'Choose an expiry date after today.'
        const foreign = input.spec.projectIds.filter((pid) => !get().projects.some((p) => p.id === pid && p.tenantId === tenant.id && p.status === 'active'))
        if (foreign.length) return `One of the chosen projects isn’t an active project in ${tenant.name}. Remove it, or add projects later.`
        return placementProblem(input.spec, tenant.id)
      }
      const adminCheck = (input: AdminCreateInput) => {
        const tenant = get().tenants.find((t) => t.id === input.tenantId)!
        return adminCreateCheck(input.spec, input.count, tenant, get().environments, { providers: get().infraProviders, catalog: get().catalog })
      }
      const adminMeta = (input: AdminCreateInput, batchId?: string): AdminCreation => ({
        ownerId: input.ownerId,
        accessUserIds: [...new Set(input.accessUserIds)].filter((id) => id !== input.ownerId),
        reason: input.reason.trim(),
        ...(input.overrideReason?.trim() ? { overrideReason: input.overrideReason.trim() } : {}),
        ...(batchId ? { batchId } : {}),
        expiresAt: input.expiresAt,
        autoTerminate: !!input.expiresAt,
      })
      const expiryIso = (day: string | null) => (day ? new Date(`${day}T23:59:00`).toISOString() : null)

      /* ---------- deployment helpers ---------- */

      const catalogVersion = (itemId: string) => get().catalog.find((c) => c.id === itemId)?.version ?? ''
      /** Keeps environment-level capabilities in step with capabilities added or removed through the environment's spec. */
      const syncCapabilities = (env: Environment, spec: EnvSpec): EnvCapability[] => {
        const removed = env.spec.capabilities.filter((id) => !spec.capabilities.includes(id))
        const kept = env.capabilities.filter((c) => !removed.includes(c.itemId))
        const added = spec.capabilities.filter((id) => !kept.some((c) => c.itemId === id))
        return [...kept, ...added.map((itemId) => ({ itemId, version: catalogVersion(itemId), addedById: me()?.id ?? 'system', at: now() }))]
      }
      const checksFor = (d: Deployment, config: DeploymentConfig = d.config) => {
        const env = envOf(d)!
        return preDeployChecks({
          dep: { ...d, config },
          env,
          projectName: depName(d),
          catalog: get().catalog,
          project: get().projects.find((p) => p.id === d.projectId),
          siblings: get().deployments.filter((x) => x.envId === env.id && x.id !== d.id),
          tenant: get().tenants.find((t) => t.id === env.tenantId),
          projectNameOf: projectName,
        })
      }
      const blockedBy = (d: Deployment, config: DeploymentConfig, overrides: CheckKey[] = []) => {
        const checks = checksFor(d, config)
        if (checksPass(checks, overrides)) return null
        const bad = checks.find((c) => !c.ok && !(c.severity === 'warning' && overrides.includes(c.key)))!
        return `${bad.label}: ${bad.detail}`
      }

      const patchDep = (id: string, patch: Partial<Deployment> | ((d: Deployment) => Partial<Deployment>)) =>
        set((s) => ({ deployments: s.deployments.map((d) => (d.id === id ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch), updatedAt: now() } : d)) }))
      const depName = (d: Deployment) => projectName(d.projectId)
      const envOf = (d: Deployment) => get().environments.find((e) => e.id === d.envId)
      const depMembers = (d: Deployment) => get().projects.find((p) => p.id === d.projectId)?.memberIds ?? []
      const canOperate = (user: User, d: Deployment) => {
        const env = envOf(d)
        return !!env && canOperateDeployment(user, env, get().projects.find((p) => p.id === d.projectId))
      }
      const newDeployment = (env: Environment, projectId: string, siblings: Deployment[], limits?: { vcpu: number; ramGb: number }): Deployment => {
        const project = get().projects.find((p) => p.id === projectId)!
        const config = defaultConfig(project, siblings, get().catalog)
        const base = serviceNameFor(project)
        const taken = new Set(siblings.map((d) => d.serviceName))
        let serviceName = base
        for (let i = 2; taken.has(serviceName); i++) serviceName = `${base}-${i}`
        return {
          id: uid('dep'),
          tenantId: env.tenantId,
          envId: env.id,
          projectId,
          serviceName,
          config: limits ? { ...config, limits } : config,
          status: 'not_deployed',
          lastRun: null,
          history: [],
          createdAt: now(),
          updatedAt: now(),
          usage: { cpuPct: 0, ramGb: 0 },
        }
      }

      /** Plays a run step by step: each step goes running → ok/failed/skipped with its log lines. */
      const runDeploy = (depId: string, note?: string) => {
        const user = me()
        const d = get().deployments.find((x) => x.id === depId)!
        const env = envOf(d)!
        const commit = fakeCommit()
        const version = (d.history[d.history.length - 1]?.version ?? 0) + 1
        const sim = simulateSteps({ dep: d, env, projectName: depName(d), catalog: get().catalog, project: get().projects.find((p) => p.id === d.projectId), breakBuild: d.breakBuild, commit })
        const run: DeployRun = {
          id: uid('run'),
          version,
          startedAt: now(),
          finishedAt: null,
          actorId: user?.id ?? 'system',
          steps: STEP_ORDER.map((key) => ({ key, status: 'pending' })),
          log: [{ at: now(), level: 'INFO', text: `Deploying ${depName(d)} v${version} to ${env.spec.name}${note ? ` · ${note}` : ''}` }],
          failedStep: null,
          error: null,
        }
        patchDep(depId, { status: 'deploying', lastRun: run, stoppedWithEnv: false })
        const config = d.config
        const byId = user?.id ?? 'system'

        const finish = (failed: { step: (typeof STEP_ORDER)[number]; error: string } | null) => {
          timers.delete(`dep:${depId}`)
          const cur = get().deployments.find((x) => x.id === depId)
          if (!cur || cur.status !== 'deploying' || cur.lastRun?.id !== run.id) return
          const history = cur.history.map((h) => (!failed && h.status === 'running' ? { ...h, status: 'superseded' as const } : h))
          history.push({ version, config, at: now(), byId, commit, status: failed ? 'failed' : 'running', ...(failed ? { note: `Failed at ${STEP_LABELS[failed.step].toLowerCase()}` } : note ? { note } : {}) })
          patchDep(depId, (x) => ({
            status: failed ? 'failed' : 'running',
            history,
            usage: failed ? { cpuPct: 0, ramGb: 0 } : { cpuPct: 12 + Math.round(Math.random() * 30), ramGb: Math.round(config.limits.ramGb * (0.3 + Math.random() * 0.3) * 10) / 10 },
            lastRun: x.lastRun && { ...x.lastRun, finishedAt: now(), failedStep: failed?.step ?? null, error: failed?.error ?? null },
          }))
          const name = depName(cur)
          const summary = failed ? `Deploying ${name} to “${env.spec.name}” failed at ${STEP_LABELS[failed.step].toLowerCase()}` : `${name} v${version} is running on “${env.spec.name}”`
          audit(failed ? 'deployment.failed' : 'deployment.running', 'deployment', depId, summary, env.tenantId, failed?.error, true)
          notify([...depMembers(cur), env.ownerId].filter((u) => u !== byId), `${summary}.`, envLink(env.id))
        }

        const tick = (i: number) => {
          const cur = get().deployments.find((x) => x.id === depId)
          if (!cur || cur.status !== 'deploying' || cur.lastRun?.id !== run.id) return timers.delete(`dep:${depId}`)
          const step = sim[i]
          if (!step) return finish(null)
          const at = now()
          const lines = step.lines.map((text, li) => ({ at, level: step.error && li >= step.lines.length - 2 ? ('ERROR' as const) : ('INFO' as const), text }))
          patchDep(depId, (x) => ({
            lastRun: x.lastRun && {
              ...x.lastRun,
              steps: x.lastRun.steps.map((s) => (s.key === step.key ? { ...s, status: step.skipped ? 'skipped' : step.error ? 'failed' : 'ok' } : s.key === sim[i + 1]?.key && !step.error ? { ...s, status: 'running' } : s)),
              log: [...x.lastRun.log, { at, level: 'INFO', text: `▸ ${STEP_LABELS[step.key]}` }, ...lines, ...(step.error ? [{ at, level: 'ERROR' as const, text: step.error }] : [])],
            },
          }))
          if (step.error) return finish({ step: step.key, error: step.error })
          timers.set(`dep:${depId}`, setTimeout(() => tick(i + 1), DEPLOY_STEP_MS) as unknown as number)
        }
        patchDep(depId, (x) => ({ lastRun: x.lastRun && { ...x.lastRun, steps: x.lastRun.steps.map((s, i) => (i === 0 ? { ...s, status: 'running' } : s)) } }))
        timers.set(`dep:${depId}`, setTimeout(() => tick(0), DEPLOY_STEP_MS) as unknown as number)
        return version
      }

      /** Running services follow their environment: stop with it, start again with it. */
      const followEnv = (envId: string, to: EnvStatus) => {
        const deps = get().deployments.filter((d) => d.envId === envId)
        if (['stopped', 'suspended', 'terminated'].includes(to)) {
          for (const d of deps) {
            if (d.status !== 'running' && d.status !== 'deploying') continue
            timers.delete(`dep:${d.id}`)
            patchDep(d.id, { status: 'stopped', stoppedWithEnv: to !== 'terminated', usage: { cpuPct: 0, ramGb: 0 } })
          }
        } else if (to === 'active') {
          for (const d of deps) if (d.status === 'stopped' && d.stoppedWithEnv) patchDep(d.id, { status: 'running', stoppedWithEnv: false, usage: { cpuPct: 15, ramGb: Math.round(d.config.limits.ramGb * 0.4 * 10) / 10 } })
        }
      }

      return {
        ...fullSeed(),

        /* ---------- auth ---------- */

        login: (email, password) => {
          const user = get().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
          if (!user || password !== SAMPLE_PASSWORD) return { error: 'That email and password don’t match. Check them, or use quick sign-in below.' }
          if (user.status !== 'active') return { error: 'This account is deactivated. Ask your Tenant Admin to reactivate it.' }
          const tenant = get().tenants.find((t) => t.id === user.tenantId)
          if (tenant && !tenant.isSystem && tenant.status === 'suspended') return { error: `${tenant.name} is suspended. Contact the platform team.` }
          useSessionStore.getState().setCurrentUser(user.id)
          set((s) => ({ users: s.users.map((x) => (x.id === user.id ? { ...x, lastActiveAt: now() } : x)) }))
          return { user }
        },

        quickLogin: (userId) => {
          const user = get().users.find((x) => x.id === userId)
          if (!user) return null
          useSessionStore.getState().setCurrentUser(user.id)
          set((s) => ({ users: s.users.map((x) => (x.id === user.id ? { ...x, lastActiveAt: now() } : x)) }))
          return user
        },

        logout: () => useSessionStore.getState().setCurrentUser(null),

        /* ---------- requests ---------- */

        saveDraft: (spec, draftId) => {
          const user = me()
          if (!user || user.role === 'super_admin') return ''
          const existing = draftId ? get().requests.find((r) => r.id === draftId && r.status === 'draft' && r.requesterId === user.id) : undefined
          if (existing) {
            patchRequest(existing.id, { spec })
            return existing.id
          }
          const id = uid('req')
          const req: EnvRequest = {
            id,
            kind: 'new',
            tenantId: user.tenantId,
            requesterId: user.id,
            raisedByRole: user.role,
            envId: null,
            spec,
            previousSpec: null,
            status: 'draft',
            createdAt: now(),
            updatedAt: now(),
            history: [event('draft')],
            comments: [],
            adminChanges: [],
            simulateFailure: false,
          }
          set((s) => ({ requests: [req, ...s.requests] }))
          return id
        },

        submitRequest: (spec, draftId) => {
          const user = me()
          if (!user || user.role === 'super_admin') return fail('Only people in an organisation can request environments.')
          const foreign = spec.projectIds.filter((pid) => !get().projects.some((p) => p.id === pid && p.tenantId === user.tenantId && p.status === 'active'))
          if (foreign.length) return fail('One of the chosen projects isn’t an active project in your organisation. Remove it, or add projects later.')
          const placement = placementProblem(spec, user.tenantId)
          if (placement) return fail(placement)
          let id = draftId
          const draft = draftId ? get().requests.find((r) => r.id === draftId && r.status === 'draft' && r.requesterId === user.id) : undefined
          if (draft) {
            pushRequestEvent(draft.id, event('submitted'), { spec, createdAt: now() })
          } else {
            id = uid('req')
            const req: EnvRequest = {
              id,
              kind: 'new',
              tenantId: user.tenantId,
              requesterId: user.id,
              raisedByRole: user.role,
              envId: null,
              spec,
              previousSpec: null,
              status: 'submitted',
              createdAt: now(),
              updatedAt: now(),
              history: [event('submitted')],
              comments: [],
              adminChanges: [],
              simulateFailure: false,
            }
            set((s) => ({ requests: [req, ...s.requests] }))
          }
          audit('request.submitted', 'request', id!, `${user.name} submitted “${spec.name}”`, user.tenantId)
          routeAfterSubmit(id!)
          return ok(id)
        },

        editEnvironment: (envId, spec) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return { mode: 'error', error: 'Environment not found.' }
          const parties = partiesFor(user, env.ownerId, env.tenantId)
          if (!parties.length) return { mode: 'error', error: 'You can’t change this environment.' }
          if (!['active', 'stopped', 'provisioning'].includes(env.status)) return { mode: 'error', error: 'Only active or stopped environments can be changed.' }
          if (spec.providerId !== env.spec.providerId || spec.regionId !== env.spec.regionId)
            return { mode: 'error', error: 'The provider and region are set when an environment is created. To run it elsewhere, request a new environment.' }
          const placement = placementProblem(spec, env.tenantId)
          if (placement) return { mode: 'error', error: placement }
          if (user.role === 'super_admin' || !addsInfrastructure(env.spec, spec)) {
            const changes = diffSpecs(env.spec, spec, get().catalog, get().projects, get().infraProviders)
            patchEnv(envId, { spec, capabilities: syncCapabilities(env, spec) })
            audit('environment.config_updated', 'environment', envId, `${user.name} changed “${env.spec.name}”: ${changes.map((c) => c.field).join(', ') || 'no visible changes'}`, env.tenantId)
            if (user.role === 'user') notify(tenantAdmins(env.tenantId), `${user.name} changed the setup of “${env.spec.name}”. No new infrastructure was needed.`, envLink(envId))
            return { mode: 'applied', id: envId }
          }
          if (get().requests.some((r) => r.envId === envId && r.kind === 'change' && !['approved', 'rejected', 'cancelled', 'draft'].includes(r.status)))
            return { mode: 'error', error: 'A change to this environment is already waiting for review.' }
          const id = uid('req')
          const req: EnvRequest = {
            id,
            kind: 'change',
            tenantId: env.tenantId,
            requesterId: user.id,
            raisedByRole: user.role,
            envId,
            spec,
            previousSpec: env.spec,
            status: 'submitted',
            createdAt: now(),
            updatedAt: now(),
            history: [event('submitted', 'Asks for more infrastructure than the environment has.')],
            comments: [],
            adminChanges: [],
            simulateFailure: false,
          }
          set((s) => ({ requests: [req, ...s.requests] }))
          audit('request.submitted', 'request', id, `${user.name} asked to change “${env.spec.name}”`, env.tenantId)
          routeAfterSubmit(id)
          return { mode: 'requested', id }
        },

        openRequest: (id) => {
          const user = me()
          const r = get().requests.find((x) => x.id === id)
          if (!user || !r || user.role !== 'tenant_admin' || user.tenantId !== r.tenantId) return
          if (r.status !== 'submitted' && r.status !== 'resubmitted') return
          if (r.raisedByRole === 'tenant_admin') return
          pushRequestEvent(id, event('under_review'))
          audit('request.under_review', 'request', id, `${user.name} started reviewing “${r.spec.name}”`, r.tenantId)
          notify([r.requesterId], `${user.name} is reviewing “${r.spec.name}”.`, reqLink(id))
        },

        transitionRequest: (id, to, opts = {}) => {
          const user = me()
          const r = get().requests.find((x) => x.id === id)
          if (!user || !r) return fail('Request not found.')
          const parties = partiesFor(user, r.requesterId, r.tenantId)
          if (!canTransition('request', r.status, to, parties)) return fail('You can’t make that change to this request.')
          const t = findTransition('request', r.status, to)!
          const comment = opts.comment?.trim()
          if (t.requires && !comment) return fail(t.requires === 'reason' ? 'Give a reason.' : 'Add a comment for the requester.')

          const extra: Partial<EnvRequest> = {}
          if (opts.spec && to !== 'cancelled') {
            const placement = placementProblem(opts.spec, r.tenantId)
            if (placement) return fail(placement)
            if (to === 'resubmitted') extra.spec = opts.spec
            else {
              const changes = diffSpecs(r.spec, opts.spec, get().catalog, get().projects, get().infraProviders)
              if (changes.length) {
                extra.spec = opts.spec
                extra.adminChanges = [...r.adminChanges, ...changes]
              }
            }
          }
          if (to === 'approved') extra.simulateFailure = !!opts.simulateFailure
          pushRequestEvent(id, event(to, comment), extra)
          const updated = get().requests.find((x) => x.id === id)!
          const name = updated.spec.name
          const sentence: Record<RequestStatus, string> = {
            draft: `${user.name} saved “${name}” as a draft`,
            submitted: `${user.name} submitted “${name}”`,
            under_review: `${user.name} started reviewing “${name}”`,
            changes_requested: `${user.name} asked for changes to “${name}”`,
            resubmitted: `${user.name} resubmitted “${name}”`,
            escalated: `${user.name} forwarded “${name}” to the Super Admin`,
            approved: `${user.name} approved “${name}”`,
            rejected: `${user.name} rejected “${name}”`,
            cancelled: `${user.name} cancelled “${name}”`,
          }
          audit(`request.${to}`, 'request', id, sentence[to], r.tenantId, comment)

          const requester = [r.requesterId]
          const tas = tenantAdmins(r.tenantId)
          switch (to) {
            case 'escalated':
              notify(superAdmins(), `Escalated from ${tenantName(r.tenantId)}: “${name}”.`, reqLink(id))
              notify(requester, `${user.name} forwarded “${name}” to the Super Admin for approval.`, reqLink(id))
              break
            case 'changes_requested':
              notify([...requester, ...(user.role === 'super_admin' ? tas : [])], `${user.name} asked for changes to “${name}”: ${comment}`, reqLink(id))
              break
            case 'rejected':
              notify([...requester, ...(user.role === 'super_admin' ? tas : [])], `“${name}” was rejected: ${comment}`, reqLink(id))
              break
            case 'cancelled':
              if (r.status !== 'draft') notify(tas, `${user.name} cancelled “${name}”.`, reqLink(id))
              break
            case 'resubmitted':
              routeAfterSubmit(id)
              break
            case 'approved': {
              notify([...requester, ...tas], `“${name}” was approved${updated.kind === 'new' ? '. It is being set up now.' : ' and applied.'}`, reqLink(id))
              if (updated.kind === 'new') {
                // Escalated admin-created configurations keep the owner and access list the admin chose.
                const meta = updated.admin
                materialiseEnv(id, {
                  ownerId: meta?.ownerId ?? r.requesterId,
                  accessUserIds: meta?.accessUserIds,
                  expiresAt: expiryIso(meta?.expiresAt ?? null) ?? undefined,
                  autoTerminate: meta?.autoTerminate,
                  simulateFailure: !!opts.simulateFailure,
                })
              } else if (updated.envId) {
                const target = get().environments.find((e) => e.id === updated.envId)
                patchEnv(updated.envId, { spec: updated.spec, ...(target ? { capabilities: syncCapabilities(target, updated.spec) } : {}) })
                audit('environment.config_updated', 'environment', updated.envId, `Approved change applied to “${name}”`, r.tenantId)
              }
              break
            }
          }
          return ok(id)
        },

        addComment: (id, text) => {
          const user = me()
          const r = get().requests.find((x) => x.id === id)
          if (!user || !r || !text.trim()) return
          if (user.role !== 'super_admin' && user.tenantId !== r.tenantId) return
          patchRequest(id, { comments: [...r.comments, { id: uid('c'), authorId: user.id, text: text.trim(), at: now() }] })
          audit('request.comment', 'request', id, `${user.name} commented on “${r.spec.name}”`, r.tenantId)
          notify([r.requesterId, ...tenantAdmins(r.tenantId), ...(r.status === 'escalated' ? superAdmins() : [])], `${user.name} commented on “${r.spec.name}”.`, reqLink(id))
        },

        /* ---------- environments ---------- */

        transitionEnv: (id, to, opts = {}) => {
          const user = me()
          const env = get().environments.find((e) => e.id === id)
          if (!user || !env) return fail('Environment not found.')
          const parties = partiesFor(user, env.ownerId, env.tenantId)
          if (!canTransition('env', env.status, to, parties)) return fail('You can’t make that change to this environment.')
          const t = findTransition('env', env.status, to)!
          const comment = opts.comment?.trim()
          if (t.requires && !comment) return fail('Give a reason. The owner will see it.')
          if (to === 'active' && env.status === 'stopped') {
            const tenant = get().tenants.find((x) => x.id === env.tenantId)
            if (tenant?.status === 'suspended') return fail(`${tenant.name} is suspended, so environments can’t start.`)
          }
          const extra: Partial<Environment> = {}
          if (to === 'terminated') Object.assign(extra, { provisionDueAt: null, expiresAt: null })
          pushEnvEvent(id, event(to, comment), extra)
          followEnv(id, to)
          if (to === 'provisioning') startProvisioning(id, false)
          const verbs: Record<EnvStatus, string> = {
            active: env.status === 'suspended' ? 'resumed' : 'started',
            stopped: 'stopped',
            suspended: 'suspended',
            terminated: 'terminated',
            provisioning: 'retried provisioning for',
            provisioning_failed: 'marked provisioning failed for',
          }
          const summary = `${user.name} ${verbs[to]} “${env.spec.name}”`
          audit(`environment.${to}`, 'environment', id, summary, env.tenantId, comment)
          notify([env.ownerId, ...tenantAdmins(env.tenantId)], `${summary}${comment ? `: ${comment}` : '.'}`, envLink(id))
          return ok(id)
        },

        restartEnv: (id) => {
          const user = me()
          const env = get().environments.find((e) => e.id === id)
          if (!user || !env || env.status !== 'active' || !partiesFor(user, env.ownerId, env.tenantId).length) return
          pushEnvEvent(id, event('active', 'Restarted'))
          audit('environment.restarted', 'environment', id, `${user.name} restarted “${env.spec.name}”`, env.tenantId)
          notify([env.ownerId], `${user.name} restarted “${env.spec.name}”.`, envLink(id))
        },

        openTerminalSession: (envId, readOnly) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return
          audit('environment.terminal_opened', 'environment', envId, `${user.name} opened a terminal session on “${env.spec.name}”${readOnly ? ' (read-only)' : ''}`, env.tenantId)
        },

        closeTerminalSession: (envId, startedAt) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return
          audit('environment.terminal_closed', 'environment', envId, `${user.name} closed a terminal session on “${env.spec.name}” after ${formatDuration(Date.now() - startedAt)}`, env.tenantId)
        },

        extendEnv: (id, weeks) => {
          const user = me()
          const env = get().environments.find((e) => e.id === id)
          if (!user || !env || !partiesFor(user, env.ownerId, env.tenantId).length) return
          const base = env.expiresAt ? new Date(env.expiresAt).getTime() : Date.now()
          patchEnv(id, { expiresAt: new Date(base + weeks * 7 * 86_400_000).toISOString(), spec: { ...env.spec, durationWeeks: env.spec.durationWeeks + weeks } })
          audit('environment.extended', 'environment', id, `${user.name} extended “${env.spec.name}” by ${weeks} weeks`, env.tenantId)
        },

        scheduleProvisioning: () => {
          for (const env of get().environments) {
            if (env.status !== 'provisioning' || env.hold || !env.provisionDueAt || timers.has(env.id)) continue
            const wait = Math.max(0, new Date(env.provisionDueAt).getTime() - Date.now())
            timers.set(env.id, setTimeout(() => completeProvisioning(env.id), wait) as unknown as number)
          }
        },

        createInfrastructure: (input) => {
          const user = me()
          if (!user) return { ok: false, error: 'Sign in again.' }
          const problem = adminCreateProblem(user, input)
          if (problem) return { ok: false, error: problem }
          const check = adminCheck(input)
          const tenant = get().tenants.find((t) => t.id === input.tenantId)!
          if (check.over && user.role === 'tenant_admin') return { ok: false, error: `This goes over ${tenant.name}’s quota or provider budget. Escalate it to the Super Admin instead.` }
          if (check.over && !input.overrideReason?.trim()) return { ok: false, error: 'This goes over quota or budget. Give an override reason.' }
          const byRole = user.role as 'super_admin' | 'tenant_admin'
          const batchId = input.count > 1 ? uid('batch') : undefined
          const meta = adminMeta(input, batchId)
          const roleName = roleLabel(byRole)
          const comment = [`Created by ${user.name} (${roleName}) — no approval required.`, `Reason: ${meta.reason}`, meta.overrideReason ? `Override reason: ${meta.overrideReason}` : ''].filter(Boolean).join(' ')
          const envIds: string[] = []
          const requestIds: string[] = []
          for (let i = 0; i < input.count; i++) {
            const spec: EnvSpec = { ...input.spec, name: batchName(input.spec.name.trim(), i, input.count), justification: meta.reason }
            const id = uid('req')
            const req: EnvRequest = {
              id,
              kind: 'new',
              tenantId: tenant.id,
              requesterId: user.id,
              raisedByRole: user.role,
              envId: null,
              spec,
              previousSpec: null,
              status: 'approved',
              createdAt: now(),
              updatedAt: now(),
              history: [event('approved', comment)],
              comments: [],
              adminChanges: [],
              simulateFailure: !!input.simulateFailure,
              origin: 'admin',
              admin: meta,
            }
            set((s) => ({ requests: [req, ...s.requests] }))
            const envId = materialiseEnv(id, {
              ownerId: meta.ownerId,
              accessUserIds: meta.accessUserIds,
              adminCreated: { byId: user.id, byRole, reason: meta.reason, ...(meta.overrideReason ? { overrideReason: meta.overrideReason } : {}) },
              expiresAt: expiryIso(input.expiresAt) ?? undefined,
              autoTerminate: meta.autoTerminate,
              simulateFailure: !!input.simulateFailure,
            })
            envIds.push(envId)
            requestIds.push(id)
            audit('environment.admin_created', 'environment', envId, `${user.name} (${roleName}) created “${spec.name}” for ${tenant.name}; no approval required`, tenant.id, [`Reason: ${meta.reason}`, meta.overrideReason ? `Override reason: ${meta.overrideReason}` : ''].filter(Boolean).join(' · '))
            notify([meta.ownerId, ...meta.accessUserIds], `${user.name} created “${spec.name}” for you.`, envLink(envId))
            if (user.role === 'super_admin') notify(tenantAdmins(tenant.id), `The Super Admin created “${spec.name}” in ${tenant.name}.`, envLink(envId))
          }
          return { ok: true, envIds, requestIds }
        },

        escalateAdminCreate: (input) => {
          const user = me()
          if (!user) return { ok: false, error: 'Sign in again.' }
          if (user.role !== 'tenant_admin') return { ok: false, error: 'Only a Tenant Admin escalates; the Super Admin can create it directly.' }
          const problem = adminCreateProblem(user, input)
          if (problem) return { ok: false, error: problem }
          const batchId = input.count > 1 ? uid('batch') : undefined
          const meta = adminMeta(input, batchId)
          const requestIds: string[] = []
          for (let i = 0; i < input.count; i++) {
            const spec: EnvSpec = { ...input.spec, name: batchName(input.spec.name.trim(), i, input.count), justification: meta.reason }
            const id = uid('req')
            const req: EnvRequest = {
              id,
              kind: 'new',
              tenantId: user.tenantId,
              requesterId: user.id,
              raisedByRole: user.role,
              envId: null,
              spec,
              previousSpec: null,
              status: 'submitted',
              createdAt: now(),
              updatedAt: now(),
              history: [event('submitted', `Over quota or provider budget, so escalated from Create infrastructure. Reason: ${meta.reason}`)],
              comments: [],
              adminChanges: [],
              simulateFailure: false,
              origin: 'admin',
              admin: meta,
            }
            set((s) => ({ requests: [req, ...s.requests] }))
            audit('request.submitted', 'request', id, `${user.name} escalated “${spec.name}” to the Super Admin (over quota or budget)`, user.tenantId)
            routeAfterSubmit(id)
            requestIds.push(id)
          }
          return { ok: true, envIds: [], requestIds }
        },

        enableProviderForTenant: (tenantId, providerId, regionIds, budgetCap) => {
          const user = me()
          if (!user || user.role !== 'super_admin') return fail('Only the Super Admin approves providers for a tenant.')
          const tenant = get().tenants.find((t) => t.id === tenantId)
          const p = get().infraProviders.find((x) => x.id === providerId)
          if (!tenant || tenant.isSystem || !p) return fail('Provider or tenant not found.')
          if (p.status !== 'active') return fail(`${p.name} is disabled.`)
          const regions = regionIds.filter((rid) => p.regions.some((r) => r.id === rid))
          if (!regions.length) return fail('Approve at least one region.')
          const cap = Math.round(budgetCap)
          if (!(cap > 0)) return fail('Set a monthly budget cap above zero.')
          const approval: ProviderApproval = { providerId: p.id, regionIds: regions, budgetCap: cap, approvedAt: now(), approvedById: user.id, requestId: null, status: 'approved' }
          set((s) => ({
            tenants: s.tenants.map((t) => (t.id === tenant.id ? { ...t, approvedProviders: [...t.approvedProviders.filter((a) => a.providerId !== p.id), approval] } : t)),
            infraProviders: s.infraProviders.map((x) => (x.id === p.id && x.allowedTenants !== 'all' && !x.allowedTenants.includes(tenant.id) ? { ...x, allowedTenants: [...x.allowedTenants, tenant.id] } : x)),
          }))
          audit('provider.approved', 'infra_provider', p.id, `${user.name} approved ${p.name} for ${tenant.name} while creating infrastructure: ${formatInt(cap)} credits a month`, tenant.id)
          notify(tenantAdmins(tenant.id), `The Super Admin enabled ${p.name} for ${tenant.name}: ${formatInt(cap)} credits a month.`, () => '/tenant-admin/infra-providers')
          return ok(p.id)
        },

        changeEnvOwner: (envId, ownerId) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return fail('Environment not found.')
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === env.tenantId))) return fail('Only the Tenant Admin or the Super Admin can change the owner.')
          if (ownerId === env.ownerId) return fail('That’s already the owner.')
          const next = get().users.find((u) => u.id === ownerId && u.tenantId === env.tenantId && u.status === 'active')
          if (ownerId !== TENANT_OWNER && !next) return fail('The owner must be an active person in this organisation.')
          const fromLabel = env.ownerId === TENANT_OWNER ? 'tenant-owned' : (userById(env.ownerId)?.name ?? 'nobody')
          const toLabel = ownerId === TENANT_OWNER ? 'tenant-owned' : next!.name
          patchEnv(envId, { ownerId, accessUserIds: (env.accessUserIds ?? []).filter((id) => id !== ownerId) })
          audit('environment.owner_changed', 'environment', envId, `${user.name} changed the owner of “${env.spec.name}” from ${fromLabel} to ${toLabel}`, env.tenantId)
          notify([env.ownerId, ownerId], `${user.name} changed the owner of “${env.spec.name}” to ${toLabel}.`, envLink(envId))
          return ok(envId)
        },


        /* ---------- deployments ---------- */

        addProjectsToEnv: (envId, items) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return fail('Environment not found.')
          if (!['active', 'stopped'].includes(env.status)) return fail('Projects can be added while the environment is active or stopped.')
          if (!items.length) return fail('Choose at least one project.')
          const current = get().deployments.filter((d) => d.envId === envId)
          // Environment owners and admins can add any project; a project's editors can add it to an environment they can use.
          const managesEnv = canManageEnvProjects(user, env)
          const usesEnv =
            user.tenantId === env.tenantId &&
            current.some((d) => {
              const hp = get().projects.find((x) => x.id === d.projectId)
              return !!hp && (hp.ownerId === user.id || hp.memberIds.includes(user.id))
            })
          for (const it of items) {
            const p = get().projects.find((x) => x.id === it.projectId)
            if (!p || p.tenantId !== env.tenantId || p.status !== 'active') return fail('One of those projects isn’t an active project in this organisation.')
            if (!managesEnv && !(usesEnv && canEditProject(user, p))) return fail(`You can’t add ${p.name} here. Ask the environment owner or your Tenant Admin.`)
            if (current.some((d) => d.projectId === it.projectId)) return fail(`${p.name} is already on this environment.`)
            if (!(it.limits.vcpu > 0 && it.limits.ramGb > 0)) return fail(`Give ${p.name} some CPU and RAM.`)
          }
          const extra = items.reduce((s, it) => ({ vcpu: s.vcpu + it.limits.vcpu, ramGb: s.ramGb + it.limits.ramGb }), { vcpu: 0, ramGb: 0 })
          const short = capacityShortfall(env, current, extra)
          if (short) return fail(`These projects need ${shortfallText(short)} more than this environment has. Lower their limits or request an upgrade.`)
          const created: Deployment[] = []
          for (const it of items) created.push(newDeployment(env, it.projectId, [...current, ...created], it.limits))
          set((s) => ({ deployments: [...s.deployments, ...created] }))
          const names = created.map(depName).join(', ')
          audit('deployment.added', 'environment', envId, `${user.name} added ${names} to “${env.spec.name}”`, env.tenantId)
          notify([...created.flatMap(depMembers), env.ownerId, ...tenantAdmins(env.tenantId)], `${user.name} added ${names} to “${env.spec.name}”. Configure and deploy when ready.`, envLink(envId))
          return ok(created[0]!.id)
        },

        removeDeployment: (id) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canManageEnvProjects(user, env)) return fail('Only the environment owner or an admin can remove projects.')
          timers.delete(`dep:${id}`)
          const wasLive = d.status === 'running' || d.status === 'deploying'
          set((s) => ({ deployments: s.deployments.filter((x) => x.id !== id) }))
          audit('deployment.removed', 'deployment', id, `${user.name} ${wasLive ? 'stopped and removed' : 'removed'} ${depName(d)} from “${env.spec.name}”`, env.tenantId)
          notify([...depMembers(d), env.ownerId], `${user.name} removed ${depName(d)} from “${env.spec.name}”.${wasLive ? ' Its service was stopped.' : ''}`, envLink(env.id))
          return ok(id)
        },

        updateDeploymentConfig: (id, config) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canOperate(user, d)) return fail('You can’t change this project’s deployment.')
          if (d.status === 'deploying') return fail('Wait for the current deployment to finish.')
          const siblings = get().deployments.filter((x) => x.envId === env.id && x.id !== id)
          const errors = validateConfig(config, { env, siblings, projectName })
          const first = Object.values(errors)[0]
          if (first) return fail(first)
          const src = (c: DeploymentConfig) => (c.source.kind === 'git' ? `${c.source.repoUrl}#${c.source.branch}` : c.source.fileName)
          const fixed = d.breakBuild && (src(config) !== src(d.config) || config.buildCmd !== d.config.buildCmd || config.installCmd !== d.config.installCmd)
          patchDep(id, { config, ...(fixed ? { breakBuild: false } : {}) })
          audit('deployment.config_updated', 'deployment', id, `${user.name} changed the deployment settings of ${depName(d)} on “${env.spec.name}”`, env.tenantId)
          return ok(id)
        },

        deploy: (id, opts = {}) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canOperate(user, d)) return fail('You can’t deploy this project.')
          if (env.status !== 'active') return fail('Start the environment before deploying.')
          if (d.status === 'deploying') return fail('A deployment is already running.')
          const blocked = blockedBy(d, d.config, opts.overrides)
          if (blocked) return fail(blocked)
          const overridden = (opts.overrides ?? []).filter((k) => checksFor(d).some((c) => c.key === k && !c.ok))
          const v = runDeploy(id, overridden.length ? `Confirmed with a warning overridden (${overridden.join(', ')})` : undefined)
          audit('deployment.started', 'deployment', id, `${user.name} reviewed the steps and started deploying ${depName(d)} v${v} to “${env.spec.name}”`, env.tenantId, overridden.length ? `Overrode: ${overridden.join(', ')}` : undefined)
          return ok(id)
        },

        stopDeployment: (id) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canOperate(user, d)) return fail('You can’t stop this project.')
          if (d.status !== 'running' && d.status !== 'deploying') return fail('This project isn’t running.')
          timers.delete(`dep:${id}`)
          patchDep(id, { status: 'stopped', stoppedWithEnv: false, usage: { cpuPct: 0, ramGb: 0 } })
          audit('deployment.stopped', 'deployment', id, `${user.name} stopped ${depName(d)} on “${env.spec.name}”`, env.tenantId)
          return ok(id)
        },

        rollbackDeployment: (id, opts = {}) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canOperate(user, d)) return fail('You can’t roll back this project.')
          if (env.status !== 'active') return fail('Start the environment before rolling back.')
          if (d.status === 'deploying') return fail('Wait for the current deployment to finish.')
          const good = d.history.filter((h) => h.status === 'running' || h.status === 'superseded')
          const current = d.status === 'running' ? good[good.length - 1] : undefined
          const target = opts.version !== undefined ? d.history.find((h) => h.version === opts.version) : [...good].reverse().find((h) => h !== current)
          if (!target) return fail('There is no earlier working version to roll back to.')
          const blocked = blockedBy(d, target.config, opts.overrides)
          if (blocked) return fail(blocked)
          patchDep(id, (x) => ({ config: target.config, history: x.history.map((h) => (h === current ? { ...h, status: 'rolled_back' as const } : h)) }))
          runDeploy(id, `Rollback to v${target.version}`)
          audit('deployment.rolled_back', 'deployment', id, `${user.name} rolled ${depName(d)} back to v${target.version} on “${env.spec.name}”`, env.tenantId)
          return ok(id)
        },

        attachDependencies: (envId, itemIds) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return { mode: 'error', error: 'Environment not found.' }
          const tenant = get().tenants.find((t) => t.id === env.tenantId)
          const items = itemIds.map((id) => get().catalog.find((c) => c.id === id)).filter((x): x is CatalogItem => !!x)
          const blocked = items.filter((i) => !tenant?.enabledItemIds.includes(i.id))
          if (blocked.length) return { mode: 'error', error: `${blocked.map((b) => b.name).join(', ')} isn’t switched on for ${tenant?.name ?? 'this organisation'}. Ask your Tenant Admin to enable it in the catalog.` }
          // Shared capabilities go straight onto the environment; models change its spec (and may need approval).
          for (const it of items.filter((i) => i.category !== 'llm' && i.category !== 'asr')) {
            if (env.capabilities.some((c) => c.itemId === it.id)) continue
            const r = get().addEnvCapability(envId, it.id)
            if (!r.ok) return { mode: 'error', error: r.error }
          }
          const models = items.filter((i) => i.category === 'llm' || i.category === 'asr')
          if (!models.length) return { mode: 'applied', id: envId }
          const fresh = get().environments.find((e) => e.id === envId)!
          const spec = { ...fresh.spec, llms: [...fresh.spec.llms], asr: [...fresh.spec.asr] }
          for (const it of models) {
            if (it.category === 'llm') {
              if (!spec.llms.some((l) => l.id === it.id)) spec.llms.push({ id: it.id, tokenBudget: 1 })
            } else {
              if (!spec.asr.includes(it.id)) spec.asr.push(it.id)
              if (!spec.asrHoursPerMonth) spec.asrHoursPerMonth = 10
              if (!spec.languages.length) spec.languages = ['Hindi']
            }
          }
          return get().editEnvironment(envId, spec)
        },

        requestEnvUpgrade: (envId, extra, reason) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) return { mode: 'error', error: 'Environment not found.' }
          if (!canManageEnvProjects(user, env)) return { mode: 'error', error: 'Only the environment owner or an admin can request an upgrade.' }
          const used = limitsUsed(get().deployments.filter((d) => d.envId === envId))
          const need = { vcpu: used.vcpu + extra.vcpu, ramGb: used.ramGb + extra.ramGb }
          const cap = envCapacity(env)
          if (need.vcpu <= cap.vcpu && need.ramGb <= cap.ramGb) return { mode: 'error', error: 'This environment already has room for these projects.' }
          const provider = get().infraProviders.find((p) => p.id === env.spec.providerId)
          const card = provider?.rateCards[provider.rateCards.length - 1]
          if (!card) return { mode: 'error', error: 'The provider’s rate card isn’t available.' }
          const gpuType = env.spec.instance.gpuType
          const gpuCount = env.spec.instance.gpuCount
          const candidates = card.instanceTypes
            .filter((t) => (gpuType === 'none' ? true : t.gpuType === gpuType && t.gpuCount >= gpuCount))
            .sort((a, b) => a.hourlyRate - b.hourlyRate)
          let pick: { it: (typeof candidates)[number]; count: number } | null = null
          for (const it of candidates) {
            if (it.vcpu * env.spec.instanceCount >= need.vcpu && it.ramGb * env.spec.instanceCount >= need.ramGb) {
              pick = { it, count: env.spec.instanceCount }
              break
            }
          }
          if (!pick) {
            const cur = card.instanceTypes.find((t) => t.id === env.spec.instanceTypeId) ?? candidates[candidates.length - 1]
            if (!cur) return { mode: 'error', error: 'No larger instance type is available from this provider.' }
            const count = Math.max(Math.ceil(need.vcpu / cur.vcpu), Math.ceil(need.ramGb / cur.ramGb))
            pick = { it: cur, count }
          }
          const { it, count } = pick
          const spec = {
            ...env.spec,
            instanceTypeId: it.id,
            instanceCount: count,
            instance: { name: it.name, vcpu: it.vcpu, ramGb: it.ramGb, gpuType: it.gpuType, gpuCount: it.gpuCount },
            compute: GPU_TIER[it.gpuType],
            gpuCount: it.gpuCount * count,
            justification: reason,
          }
          const before = allocationOf(env.spec)
          const res = get().editEnvironment(envId, spec)
          if (res.mode !== 'error') audit('environment.upgrade_requested', 'environment', envId, `${user.name} asked to grow “${env.spec.name}” from ${before.vcpu} vCPU / ${before.ramGb} GB to ${it.vcpu * count} vCPU / ${it.ramGb * count} GB for more projects`, env.tenantId)
          return res
        },

        recoverDeployments: () => {
          for (const d of get().deployments) {
            if (d.status !== 'deploying' || timers.has(`dep:${d.id}`)) continue
            const msg = 'The deployment was interrupted when the page reloaded. Redeploy to try again.'
            patchDep(d.id, (x) => ({
              status: 'failed',
              lastRun: x.lastRun && {
                ...x.lastRun,
                finishedAt: now(),
                failedStep: x.lastRun.steps.find((s) => s.status === 'running')?.key ?? 'connect',
                error: msg,
                steps: x.lastRun.steps.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s)),
                log: [...x.lastRun.log, { at: now(), level: 'ERROR', text: msg }],
              },
            }))
          }
        },

        setDeploymentChoices: (id, patch) => {
          const user = me()
          const d = get().deployments.find((x) => x.id === id)
          const env = d && envOf(d)
          if (!user || !d || !env) return fail('Project not found on this environment.')
          if (!canOperate(user, d)) return fail('You can’t change this project’s deployment.')
          if (d.status === 'deploying') return fail('Wait for the current deployment to finish.')
          const config = {
            ...d.config,
            capabilityChoice: { ...d.config.capabilityChoice, ...(patch.capabilityChoice ?? {}) },
            serviceAccess: { ...d.config.serviceAccess, ...(patch.serviceAccess ?? {}) },
          }
          patchDep(id, { config })
          const parts = [
            ...Object.entries(patch.capabilityChoice ?? {}).map(([item, v]) => `use ${get().catalog.find((c) => c.id === item)?.name ?? item} ${v}`),
            ...Object.entries(patch.serviceAccess ?? {}).map(([item, v]) => `reach ${get().catalog.find((c) => c.id === item)?.name ?? item} as ${v === 'platform' ? 'a platform service' : v === 'external' ? 'an external service' : 'an environment service'}`),
          ]
          audit('deployment.capabilities_resolved', 'deployment', id, `${user.name} chose to ${parts.join(' and ')} for ${depName(d)} on “${env.spec.name}”`, env.tenantId)
          return ok(id)
        },

        addEnvCapability: (envId, itemId, version) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !env || !item) return fail('Environment not found.')
          if (!canManageEnvProjects(user, env)) return fail('Only the environment owner or an admin can add shared capabilities.')
          if (['terminated', 'provisioning_failed'].includes(env.status)) return fail('This environment is no longer running.')
          const tenant = get().tenants.find((t) => t.id === env.tenantId)
          if (!tenant?.enabledItemIds.includes(itemId)) return fail(`${item.name} isn’t switched on for ${tenant?.name ?? 'this organisation'}. Ask your Tenant Admin to enable it in the catalog.`)
          if (env.capabilities.some((c) => c.itemId === itemId)) return fail(`${item.name} is already on this environment.`)
          const v = version ?? item.version
          patchEnv(envId, {
            capabilities: [...env.capabilities, { itemId, version: v, addedById: user.id, at: now() }],
            spec: { ...env.spec, capabilities: env.spec.capabilities.includes(itemId) ? env.spec.capabilities : [...env.spec.capabilities, itemId] },
          })
          const hosted = get().deployments.filter((d) => d.envId === envId)
          audit('environment.capability_added', 'environment', envId, `${user.name} added ${item.name} ${v} to “${env.spec.name}” for all its projects`, env.tenantId)
          notify([...hosted.flatMap(depMembers), env.ownerId], `${user.name} added ${item.name} ${v} to “${env.spec.name}”. It’s available to every project on it.`, envLink(envId))
          return ok(envId)
        },

        removeEnvCapability: (envId, itemId) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !env || !item) return fail('Environment not found.')
          if (!canManageEnvProjects(user, env)) return fail('Only the environment owner or an admin can remove shared capabilities.')
          patchEnv(envId, { capabilities: env.capabilities.filter((c) => c.itemId !== itemId), spec: { ...env.spec, capabilities: env.spec.capabilities.filter((x) => x !== itemId) } })
          audit('environment.capability_removed', 'environment', envId, `${user.name} removed ${item.name} from “${env.spec.name}”`, env.tenantId)
          return ok(envId)
        },

        /* ---------- projects ---------- */

        createProject: (input) => {
          const user = me()
          if (!user || user.role === 'super_admin' || user.role === 'qa') return fail('Only people in an organisation can create projects.')
          const problem = projectProblem(input, user.tenantId)
          if (problem) return fail(problem)
          const id = uid('p')
          const memberIds = [...new Set(input.memberIds.filter((m) => m !== user.id))]
          const tenant = get().tenants.find((t) => t.id === user.tenantId)
          const project: Project = {
            id,
            tenantId: user.tenantId,
            name: input.name.trim(),
            description: input.description.trim(),
            type: input.type,
            repoUrl: input.repoUrl.trim(),
            defaultBranch: input.defaultBranch.trim() || 'main',
            defaultRuntime: input.defaultRuntime,
            defaultRuntimeVersion: input.defaultRuntimeVersion,
            ownerId: user.id,
            memberIds,
            memberAccess: Object.fromEntries(memberIds.map((m) => [m, input.memberAccess[m] ?? 'viewer'])),
            status: 'active',
            limits: input.limits ?? { vcpu: 16, ramGb: 64, gpus: 0, storageGb: Math.min(200, tenant?.quota.storageGb ?? 200) },
            capabilityIds: [],
            capabilityVersions: {},
            dataClassification: input.dataClassification ?? 'internal',
            platformModels: {},
            createdAt: now(),
            updatedAt: now(),
            updatedById: user.id,
          }
          set((s) => ({ projects: [...s.projects, project] }))
          audit('project.created', 'project', id, `${user.name} created the project “${project.name}”`, user.tenantId)
          notify(memberIds, `${user.name} added you to the project “${project.name}”.`, (role) => projectPath(role, id))
          return ok(id)
        },

        updateProject: (id, patch) => {
          const user = me()
          const p = get().projects.find((x) => x.id === id)
          if (!user || !p) return fail('Project not found.')
          if (!canEditProject(user, p)) return fail('You can view this project but not change it. Ask its owner for edit rights.')
          const next = { ...p, ...patch }
          const problem = projectProblem(next, p.tenantId, id)
          if (problem) return fail(problem)
          if (patch.status === 'archived' && p.status !== 'archived') {
            const live = get().deployments.filter((d) => d.projectId === id && (d.status === 'running' || d.status === 'deploying'))
            if (live.length) {
              const envs = live.map((d) => `“${envOf(d)?.spec.name ?? d.envId}”`).join(', ')
              return fail(`${p.name} is still running on ${envs}. Stop it there before archiving.`)
            }
          }
          const memberIds = [...new Set(next.memberIds.filter((m) => m !== p.ownerId))]
          const memberAccess = Object.fromEntries(memberIds.map((m) => [m, next.memberAccess[m] ?? 'viewer']))
          const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify((p as unknown as Record<string, unknown>)[k]))
          if (!changed.length) return ok(id)
          set((s) => ({
            projects: s.projects.map((x) =>
              x.id === id ? { ...next, name: next.name.trim(), description: next.description.trim(), memberIds, memberAccess, updatedAt: now(), updatedById: user.id } : x,
            ),
          }))
          const fields = [...new Set(changed.map((k) => PROJECT_FIELD_LABELS[k] ?? String(k)))]
          const what = patch.status && changed.includes('status') ? (patch.status === 'archived' ? 'archived' : 'restored') : `updated ${fields.join(', ')} of`
          audit(`project.${changed.includes('status') ? patch.status : 'updated'}`, 'project', id, `${user.name} ${what} “${p.name}”`, p.tenantId, changed.includes('name') ? `Renamed to “${next.name.trim()}”` : undefined)
          const added = memberIds.filter((m) => !p.memberIds.includes(m))
          notify(added, `${user.name} added you to the project “${next.name}”.`, (role) => projectPath(role, id))
          return ok(id)
        },

        addProjectCapability: (projectId, itemId, placement, version) => {
          const user = me()
          const p = get().projects.find((x) => x.id === projectId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !p || !item) return fail('Project not found.')
          if (!canEditProject(user, p)) return fail('Only the project owner, its editors or an admin can add capabilities.')
          if (p.capabilityIds.includes(itemId)) return fail(`${item.name} is already in this project.`)
          const tenant = get().tenants.find((t) => t.id === p.tenantId)
          let via = ''
          if (isPlatformModel(item)) {
            if (!placement) return fail(`Choose the provider that will serve ${item.name}.`)
            const option = platformModelOptions(itemId, get().infraProviders, tenant, p.dataClassification).find((o) => o.provider.id === placement.providerId)
            if (!option) return fail(`${providerName(placement.providerId)} can’t serve ${item.name} for this project. Choose another provider.`)
            if (!option.regions.some((r) => r.id === placement.regionId)) return fail('That region isn’t allowed for this project’s data. Choose a region in India.')
            if (modelUsageBlocked(tenant, get().modelUsage, { providers: get().infraProviders, tenants: get().tenants }))
              return fail('Your organisation’s model budget for this month is used up. Ask your Tenant Admin to raise it.')
            via = ` through ${option.provider.name} (${option.regions.find((r) => r.id === placement.regionId)?.name})`
          }
          const v = version && item.versions.includes(version) ? version : item.version
          set((s) => ({
            projects: s.projects.map((x) =>
              x.id === projectId
                ? {
                    ...x,
                    capabilityIds: [...x.capabilityIds, itemId],
                    capabilityVersions: v !== item.version ? { ...x.capabilityVersions, [itemId]: v } : x.capabilityVersions,
                    ...(placement && isPlatformModel(item) ? { platformModels: { ...x.platformModels, [itemId]: placement } } : {}),
                    updatedAt: now(),
                    updatedById: user.id,
                  }
                : x,
            ),
          }))
          audit('project.capability_added', 'project', projectId, `${user.name} added ${item.name} ${v} to “${p.name}”${via}`, p.tenantId)
          return ok(projectId)
        },

        removeProjectCapability: (projectId, itemId) => {
          const user = me()
          const p = get().projects.find((x) => x.id === projectId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !p || !item) return fail('Project not found.')
          if (!canEditProject(user, p)) return fail('Only the project owner, its editors or an admin can remove capabilities.')
          const { [itemId]: _v, ...versions } = p.capabilityVersions
          const { [itemId]: _a, ...platformModels } = p.platformModels
          set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, capabilityIds: x.capabilityIds.filter((c) => c !== itemId), capabilityVersions: versions, platformModels, updatedAt: now(), updatedById: user.id } : x)) }))
          audit('project.capability_removed', 'project', projectId, `${user.name} removed ${item.name} from “${p.name}”`, p.tenantId)
          return ok(projectId)
        },

        setProjectCapabilityVersion: (projectId, itemId, version) => {
          const user = me()
          const p = get().projects.find((x) => x.id === projectId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !p || !item || !p.capabilityIds.includes(itemId)) return fail('Capability not found on this project.')
          if (!canEditProject(user, p)) return fail('Only the project owner, its editors or an admin can change versions.')
          if (!item.versions.includes(version)) return fail(`${item.name} has no version ${version}.`)
          const before = p.capabilityVersions[itemId] ?? item.version
          if (before === version) return ok(projectId)
          set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, capabilityVersions: { ...x.capabilityVersions, [itemId]: version }, updatedAt: now(), updatedById: user.id } : x)) }))
          audit('project.capability_version', 'project', projectId, `${user.name} changed ${item.name} from ${before} to ${version} in “${p.name}”`, p.tenantId)
          return ok(projectId)
        },

        /* ---------- tenants & users ---------- */

        createTenant: (input) => {
          const user = me()
          if (user?.role !== 'super_admin') return null
          const { providers, ...t } = input
          const usable = providers.filter((x) => get().infraProviders.some((p) => p.id === x.providerId && p.status === 'active') && x.budgetCap > 0)
          if (!usable.length) return null
          const id = uid('t')
          const enabled = get().catalog.filter((c) => c.availability === 'all' && c.status !== 'deprecated').map((c) => c.id)
          const approvedProviders: ProviderApproval[] = usable.map((x) => ({
            providerId: x.providerId,
            regionIds: get().infraProviders.find((p) => p.id === x.providerId)!.regions.map((r) => r.id),
            budgetCap: Math.round(x.budgetCap),
            approvedAt: now(),
            approvedById: user.id,
            requestId: null,
            status: 'approved',
          }))
          set((s) => ({ tenants: [...s.tenants, { ...t, id, approvedProviders, enabledItemIds: enabled, connectedKeys: [], modelBudget: { monthly: 10000, onExceed: 'notify', alerted: [] }, status: 'active', isSystem: false, createdAt: now() }] }))
          audit('tenant.created', 'tenant', id, `${user.name} created the tenant ${t.name} with ${usable.map((x) => providerName(x.providerId)).join(', ')}`, id)
          return id
        },

        adjustProviderApproval: (tenantId, providerId, patch) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === tenantId)
          const p = get().infraProviders.find((x) => x.id === providerId)
          const a = t?.approvedProviders.find((x) => x.providerId === providerId && x.status === 'approved')
          if (!user || user.role !== 'super_admin' || !t || !p || !a) return fail('Approval not found.')
          const regionIds = patch.regionIds.filter((rid) => p.regions.some((r) => r.id === rid))
          if (!regionIds.length) return fail('Keep at least one region.')
          if (!(patch.budgetCap > 0)) return fail('Set a monthly budget cap above zero.')
          const stranded = get().environments.filter((e) => e.tenantId === tenantId && e.spec.providerId === providerId && !regionIds.includes(e.spec.regionId) && !['terminated', 'provisioning_failed'].includes(e.status))
          if (stranded.length) return fail(`${stranded.map((e) => `“${e.spec.name}”`).join(', ')} still run in a region you removed. Keep that region, or move them first.`)
          set((s) => ({ tenants: s.tenants.map((x) => (x.id === tenantId ? { ...x, approvedProviders: x.approvedProviders.map((y) => (y === a ? { ...y, regionIds, budgetCap: Math.round(patch.budgetCap) } : y)) } : x)) }))
          audit('infra_provider.access_adjusted', 'infra_provider', providerId, `${user.name} set ${t.name}’s ${p.name} cap to ${formatInt(patch.budgetCap)} credits a month in ${regionIds.length} region${regionIds.length === 1 ? '' : 's'}`, tenantId)
          notify(tenantAdmins(tenantId), `The Super Admin updated your ${p.name} access: ${formatInt(patch.budgetCap)} credits a month.`, () => '/tenant-admin/infra-providers')
          return ok(tenantId)
        },

        revokeProviderAccess: (tenantId, providerId, opts = {}) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === tenantId)
          const a = t?.approvedProviders.find((x) => x.providerId === providerId && x.status === 'approved')
          if (!user || user.role !== 'super_admin' || !t || !a) return fail('Approval not found.')
          const blocked = removalBlockers(tenantId, [providerId])
          if (blocked && !opts.migrateLater) return fail(blocked)
          set((s) => ({
            tenants: s.tenants.map((x) => (x.id === tenantId ? { ...x, approvedProviders: x.approvedProviders.map((y) => (y === a ? { ...y, status: 'revoked', revokedAt: now(), migrateLater: !!blocked } : y)) } : x)),
            providerRequests: s.providerRequests.map((pr) =>
              pr.id === a.requestId && pr.status === 'approved'
                ? { ...pr, status: 'revoked', updatedAt: now(), history: [...pr.history, { status: 'revoked', at: now(), actorId: user.id, actorRole: user.role, comment: opts.comment?.trim() || undefined }] }
                : pr,
            ),
          }))
          audit('infra_provider.access_revoked', 'infra_provider', providerId, `${user.name} revoked ${t.name}’s access to ${providerName(providerId)}${blocked ? '; its environments migrate later' : ''}`, tenantId, opts.comment)
          notify(
            tenantAdmins(tenantId),
            blocked
              ? `The Super Admin revoked ${providerName(providerId)}. Environments still on it are flagged to move; no new ones can be requested there.`
              : `The Super Admin revoked ${providerName(providerId)}. New environments can’t be requested there.`,
            () => '/tenant-admin/infra-providers',
          )
          return ok(tenantId)
        },

        /* ---------- provider access requests ---------- */

        submitProviderRequest: (input, resubmitId) => {
          const user = me()
          if (!user || (user.role !== 'user' && user.role !== 'tenant_admin')) return fail('Only people in an organisation can ask for a provider.')
          const tenant = get().tenants.find((t) => t.id === user.tenantId)
          const p = get().infraProviders.find((x) => x.id === input.providerId)
          if (!tenant || !p || p.status !== 'active' || (p.allowedTenants !== 'all' && !p.allowedTenants.includes(tenant.id))) return fail('That provider isn’t available to your organisation.')
          if (!resubmitId && tenant.approvedProviders.some((a) => a.providerId === p.id && a.status === 'approved')) return fail(`${p.name} is already approved for ${tenant.name}.`)
          const OPEN: ProviderRequestStatus[] = ['submitted', 'under_review', 'escalated', 'changes_requested', 'resubmitted']
          if (!resubmitId && get().providerRequests.some((x) => x.tenantId === tenant.id && x.providerId === p.id && OPEN.includes(x.status)))
            return fail(`There’s already an open request for ${p.name}. Follow it in Requests.`)
          const regionIds = input.regionIds.filter((rid) => p.regions.some((r) => r.id === rid))
          if (!regionIds.length) return fail('Choose at least one region.')
          const sensitive = input.dataClassification === 'personal' || input.dataClassification === 'children'
          const outside = p.regions.filter((r) => regionIds.includes(r.id) && !r.indiaResident)
          if (sensitive && outside.length) return fail(`${outside.map((r) => r.name).join(', ')} ${outside.length === 1 ? 'is' : 'are'} outside India. ${input.dataClassification === 'children' ? 'Children’s' : 'Personal'} data must stay in India.`)
          if (input.justification.trim().length < 15) return fail('Say in a sentence or two why your organisation needs this provider.')
          if (!input.workloads.length) return fail('Pick at least one expected workload.')
          if (!(input.expectedMonthlySpend >= 0) || !(input.requestedCap > 0)) return fail('Enter the expected monthly spend and a budget cap above zero.')
          const clean = { ...input, regionIds, justification: input.justification.trim(), expectedMonthlySpend: Math.round(input.expectedMonthlySpend), requestedCap: Math.round(input.requestedCap) }
          const isTa = user.role === 'tenant_admin'
          if (resubmitId) {
            const pr = get().providerRequests.find((x) => x.id === resubmitId)
            if (!pr || pr.requesterId !== user.id || pr.status !== 'changes_requested') return fail('This request can’t be resubmitted.')
            const events: ProviderRequestEvent[] = [{ status: 'resubmitted', at: now(), actorId: user.id, actorRole: user.role }]
            if (isTa) events.push({ status: 'escalated', at: now(), actorId: 'system', actorRole: 'system', comment: 'Raised by a Tenant Admin, so it went straight to the Super Admin.' })
            set((s) => ({ providerRequests: s.providerRequests.map((x) => (x.id === resubmitId ? { ...x, ...clean, status: events[events.length - 1]!.status, updatedAt: now(), history: [...x.history, ...events] } : x)) }))
            audit('infra_provider.access_resubmitted', 'infra_provider', p.id, `${user.name} resubmitted the request for ${p.name}`, tenant.id)
            notify(isTa ? superAdmins() : tenantAdmins(tenant.id), `${user.name} resubmitted the ${p.name} access request for ${tenant.name}.`, (role) => providerRequestPath(role, resubmitId))
            return ok(resubmitId)
          }
          const id = uid('pr')
          const history: ProviderRequestEvent[] = [{ status: 'submitted', at: now(), actorId: user.id, actorRole: user.role }]
          if (isTa) history.push({ status: 'escalated', at: now(), actorId: 'system', actorRole: 'system', comment: 'Raised by a Tenant Admin, so it went straight to the Super Admin.' })
          const pr: ProviderRequest = { id, tenantId: tenant.id, requesterId: user.id, raisedByRole: user.role, ...clean, status: history[history.length - 1]!.status, history, createdAt: now(), updatedAt: now() }
          set((s) => ({ providerRequests: [pr, ...s.providerRequests] }))
          audit('infra_provider.access_requested', 'infra_provider', p.id, `${user.name} asked for access to ${p.name} for ${tenant.name}`, tenant.id)
          notify(isTa ? superAdmins() : tenantAdmins(tenant.id), `${user.name} asked for access to ${p.name} for ${tenant.name}.`, (role) => providerRequestPath(role, id))
          return ok(id)
        },

        openProviderRequest: (id) => {
          const user = me()
          const pr = get().providerRequests.find((x) => x.id === id)
          if (!user || !pr || user.role !== 'tenant_admin' || user.tenantId !== pr.tenantId || pr.raisedByRole !== 'user') return
          if (pr.status !== 'submitted' && pr.status !== 'resubmitted') return
          set((s) => ({ providerRequests: s.providerRequests.map((x) => (x.id === id ? { ...x, status: 'under_review', updatedAt: now(), history: [...x.history, { status: 'under_review', at: now(), actorId: user.id, actorRole: user.role }] } : x)) }))
          notify([pr.requesterId], `${user.name} is reviewing your ${providerName(pr.providerId)} request.`, (role) => providerRequestPath(role, id))
        },

        decideProviderRequest: (id, action, opts = {}) => {
          const user = me()
          const pr = get().providerRequests.find((x) => x.id === id)
          if (!user || !pr) return fail('Request not found.')
          const p = get().infraProviders.find((x) => x.id === pr.providerId)
          const tenant = get().tenants.find((t) => t.id === pr.tenantId)
          if (!p || !tenant) return fail('Request not found.')
          const isSa = user.role === 'super_admin'
          const isTa = user.role === 'tenant_admin' && user.tenantId === pr.tenantId
          const taStage = pr.raisedByRole === 'user' && ['submitted', 'under_review', 'resubmitted'].includes(pr.status)
          const saStage = pr.status === 'escalated'
          const comment = opts.comment?.trim()
          let to: ProviderRequestStatus
          if (action === 'cancel') {
            if (pr.requesterId !== user.id || !['submitted', 'under_review', 'escalated', 'changes_requested', 'resubmitted'].includes(pr.status)) return fail('You can’t cancel this request.')
            to = 'cancelled'
          } else if (action === 'forward') {
            if (!isTa || !taStage) return fail('Only your Tenant Admin can forward this.')
            to = 'escalated'
          } else if (action === 'request_changes' || action === 'reject') {
            if (!((isTa && taStage) || (isSa && saStage))) return fail('You can’t decide on this request.')
            if (!comment) return fail(action === 'reject' ? 'Give a reason.' : 'Say what needs to change.')
            to = action === 'reject' ? 'rejected' : 'changes_requested'
          } else {
            if (!isSa || !saStage) return fail('Only the Super Admin approves provider access.')
            const regionIds = (opts.regionIds ?? pr.regionIds).filter((rid) => p.regions.some((r) => r.id === rid))
            const cap = Math.round(opts.budgetCap ?? pr.requestedCap)
            if (!regionIds.length) return fail('Approve at least one region.')
            if (!(cap > 0)) return fail('Set a monthly budget cap above zero.')
            const sensitive = pr.dataClassification === 'personal' || pr.dataClassification === 'children'
            if (sensitive && p.regions.some((r) => regionIds.includes(r.id) && !r.indiaResident)) return fail('This request covers personal or children’s data, so only India-resident regions can be approved.')
            const approval: ProviderApproval = { providerId: p.id, regionIds, budgetCap: cap, approvedAt: now(), approvedById: user.id, requestId: pr.id, status: 'approved' }
            set((s) => ({ tenants: s.tenants.map((t) => (t.id === tenant.id ? { ...t, approvedProviders: [...t.approvedProviders.filter((a) => a.providerId !== p.id), approval] } : t)) }))
            to = 'approved'
            const changed = [cap !== pr.requestedCap ? `cap ${formatInt(cap)} credits a month (asked ${formatInt(pr.requestedCap)})` : `cap ${formatInt(cap)} credits a month`, regionIds.join() !== pr.regionIds.join() ? `${regionIds.length} of the requested regions` : ''].filter(Boolean).join(', ')
            opts.comment = comment ? `${comment} (${changed})` : `Approved with a ${changed}.`
          }
          set((s) => ({
            providerRequests: s.providerRequests.map((x) =>
              x.id === id ? { ...x, status: to, updatedAt: now(), history: [...x.history, { status: to, at: now(), actorId: user.id, actorRole: user.role, comment: opts.comment?.trim() || undefined }] } : x,
            ),
          }))
          const verb = { escalated: 'forwarded to the Super Admin', changes_requested: 'sent back for changes', rejected: 'rejected', approved: 'approved', cancelled: 'cancelled' }[to as 'escalated'] ?? to
          audit(`infra_provider.access_${to}`, 'infra_provider', p.id, `${user.name} ${verb} ${tenant.name}’s request for ${p.name}`, tenant.id, opts.comment)
          const link = (role: Role) => providerRequestPath(role, id)
          if (to === 'escalated') notify(superAdmins(), `${tenant.name} asked for access to ${p.name}.`, link)
          if (to !== 'cancelled') notify([pr.requesterId], `Your ${p.name} request was ${verb}.${opts.comment ? ` ${opts.comment}` : ''}`, link)
          if (isSa && pr.raisedByRole === 'user') notify(tenantAdmins(tenant.id), `The Super Admin ${verb} the ${p.name} request.`, link)
          return ok(id)
        },

        updateTenant: (id, patch) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === id)
          if (!user || !t || t.isSystem) return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === id))) return
          set((s) => ({ tenants: s.tenants.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          audit('tenant.updated', user.role === 'tenant_admin' ? 'settings' : 'tenant', id, `${user.name} updated ${patch.name ?? t.name}’s profile`, id)
        },

        setTenantStatus: (id, status) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === id)
          if (user?.role !== 'super_admin' || !t || t.isSystem) return
          set((s) => ({
            tenants: s.tenants.map((x) => (x.id === id ? { ...x, status } : x)),
            environments:
              status === 'suspended'
                ? s.environments.map((e) =>
                    e.tenantId === id && e.status === 'active'
                      ? { ...e, status: 'stopped' as const, history: [...e.history, event('stopped', 'Stopped because the tenant was suspended')] }
                      : e,
                  )
                : s.environments,
          }))
          audit(`tenant.${status}`, 'tenant', id, `${user.name} ${status === 'suspended' ? 'suspended' : 'reactivated'} ${t.name}`, id)
          notify(get().users.filter((x) => x.tenantId === id).map((x) => x.id), status === 'suspended' ? `${t.name} has been suspended. Active environments were stopped.` : `${t.name} is active again.`, null)
        },

        setTenantQuota: (id, quota) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === id)
          if (user?.role !== 'super_admin' || !t || t.isSystem) return
          set((s) => ({ tenants: s.tenants.map((x) => (x.id === id ? { ...x, quota } : x)) }))
          audit('tenant.quota', 'quota', id, `${user.name} set ${t.name}’s quota to ${quota.vcpu} vCPU, ${quota.ramGb} GB RAM, ${quota.gpus} GPUs, ${formatInt(quota.storageGb)} GB storage`, id)
          notify(tenantAdmins(id), `The Super Admin changed ${t.name}’s quota.`, () => '/tenant-admin/quotas')
        },

        setItemEnabled: (tenantId, itemId, enabled) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === tenantId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !t || !item) return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === tenantId))) return
          if (enabled && !(item.availability === 'all' || item.availability.includes(tenantId))) return
          set((s) => ({
            tenants: s.tenants.map((x) =>
              x.id === tenantId
                ? { ...x, enabledItemIds: enabled ? [...new Set([...x.enabledItemIds, itemId])] : x.enabledItemIds.filter((i) => i !== itemId) }
                : x,
            ),
          }))
          audit(`catalog.${enabled ? 'enabled' : 'disabled'}`, 'catalog', itemId, `${user.name} ${enabled ? 'enabled' : 'disabled'} ${item.name} for ${t.name}`, tenantId)
        },

        createUser: (input) => {
          const user = me()
          if (!user || !isAdmin(user.role)) return fail('Only admins can add people.')
          const tenantId = user.role === 'tenant_admin' ? user.tenantId : input.tenantId
          const tenant = get().tenants.find((t) => t.id === tenantId)
          if (!tenant || tenant.isSystem) return fail('Choose a tenant.')
          if (input.role === 'super_admin') return fail('Super Admins can’t be created here.')
          if (get().users.some((x) => x.email.toLowerCase() === input.email.trim().toLowerCase())) return fail('Someone with this email already has an account.')
          const id = uid('u')
          const qa = input.role === 'qa' ? cleanQa(input.qa, tenantId) : undefined
          set((s) => ({ users: [...s.users, { ...input, qa, tenantId, id, status: 'active', lastActiveAt: now() }] }))
          audit('user.created', 'user', id, `${user.name} added ${input.name} to ${tenant.name} as ${roleLabel(input.role)}`, tenantId)
          if (qa) audit('user.qa_assigned', 'user', id, `${user.name} assigned ${input.name} to ${qaScopeText(qa)}`, tenantId)
          return ok(id)
        },

        updateUser: (id, patch) => {
          const user = me()
          const target = get().users.find((x) => x.id === id)
          if (!user || !target || target.role === 'super_admin') return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === target.tenantId))) return
          if (patch.role === 'super_admin') return
          const role = patch.role ?? target.role
          const qa = role === 'qa' ? cleanQa(patch.qa ?? target.qa, target.tenantId) : undefined
          set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, ...patch, qa } : x)) }))
          audit(patch.role && patch.role !== target.role ? 'user.role_changed' : 'user.updated', 'user', id, patch.role && patch.role !== target.role ? `${user.name} made ${target.name} a ${roleLabel(patch.role)}` : `${user.name} updated ${target.name}’s profile`, target.tenantId)
          if (patch.role && patch.role !== target.role) notify([id], `You are now a ${roleLabel(patch.role)} in ${tenantName(target.tenantId)}. Sign in again to see the change.`, null)
          if (qa && JSON.stringify(qa) !== JSON.stringify(target.qa)) {
            audit('user.qa_assigned', 'user', id, `${user.name} assigned ${target.name} to ${qaScopeText(qa)}`, target.tenantId)
            if (patch.role === target.role || !patch.role) notify([id], `${user.name} changed the projects you test: ${qaScopeText(qa)}.`, () => '/qa')
          }
        },

        setUserStatus: (id, status) => {
          const user = me()
          const target = get().users.find((x) => x.id === id)
          if (!user || !target || target.id === user.id || target.role === 'super_admin') return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === target.tenantId))) return
          set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, status } : x)) }))
          audit(`user.${status}`, 'user', id, `${user.name} ${status === 'deactivated' ? 'deactivated' : 'reactivated'} ${target.name}`, target.tenantId)
        },

        resetPassword: (id) => {
          const user = me()
          const target = get().users.find((x) => x.id === id)
          if (!user || !target) return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === target.tenantId))) return
          audit('user.password_reset', 'user', id, `${user.name} reset ${target.name}’s password`, target.tenantId)
          notify([id], `${user.name} reset your password.`, null)
        },

        /* ---------- quota & capacity ---------- */

        requestQuotaIncrease: (requested, reason) => {
          const user = me()
          if (user?.role !== 'tenant_admin') return
          const tenant = get().tenants.find((t) => t.id === user.tenantId)!
          const id = uid('qr')
          set((s) => ({
            quotaRequests: [
              { id, tenantId: tenant.id, requestedById: user.id, current: tenant.quota, requested, reason, status: 'pending', createdAt: now(), decidedAt: null, decidedById: null, comment: null },
              ...s.quotaRequests,
            ],
          }))
          audit('quota.requested', 'quota', id, `${user.name} asked for a quota increase for ${tenant.name}`, tenant.id, reason)
          notify(superAdmins(), `${tenant.name} asked for a quota increase.`, () => '/super-admin/requests?tab=quota')
        },

        decideQuotaRequest: (id, approve, comment) => {
          const user = me()
          const qr = get().quotaRequests.find((x) => x.id === id)
          if (user?.role !== 'super_admin' || !qr || qr.status !== 'pending') return
          set((s) => ({
            quotaRequests: s.quotaRequests.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'rejected', decidedAt: now(), decidedById: user.id, comment: comment || null } : x)),
            tenants: approve ? s.tenants.map((t) => (t.id === qr.tenantId ? { ...t, quota: qr.requested } : t)) : s.tenants,
          }))
          audit(`quota.${approve ? 'approved' : 'rejected'}`, 'quota', id, `${user.name} ${approve ? 'approved' : 'rejected'} ${tenantName(qr.tenantId)}’s quota increase`, qr.tenantId, comment)
          notify([qr.requestedById], `Your quota increase was ${approve ? 'approved' : 'not approved'}${comment ? `: ${comment}` : '.'}`, () => '/tenant-admin/quotas')
        },

        setCapacity: (capacity) => {
          const user = me()
          if (user?.role !== 'super_admin') return
          set({ capacity })
          audit('capacity.updated', 'capacity', 'platform', `${user.name} updated platform capacity`, null)
        },

        /* ---------- catalog & providers ---------- */

        upsertCatalogItem: (item) => {
          const user = me()
          if (user?.role !== 'super_admin') return
          const exists = get().catalog.some((c) => c.id === item.id)
          set((s) => ({ catalog: exists ? s.catalog.map((c) => (c.id === item.id ? item : c)) : [...s.catalog, item] }))
          audit(`catalog.${exists ? 'updated' : 'added'}`, 'catalog', item.id, `${user.name} ${exists ? 'updated' : 'added'} ${item.name} in the registry`, null)
        },

        setCatalogStatus: (id, status) => {
          const user = me()
          const item = get().catalog.find((c) => c.id === id)
          if (user?.role !== 'super_admin' || !item) return
          set((s) => ({ catalog: s.catalog.map((c) => (c.id === id ? { ...c, status } : c)) }))
          audit(`catalog.${status}`, 'catalog', id, `${user.name} marked ${item.name} as ${status}`, null)
        },

        updateProvider: (id, patch) => {
          const user = me()
          const p = get().providers.find((x) => x.id === id)
          if (user?.role !== 'super_admin' || !p) return
          set((s) => ({ providers: s.providers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          if (patch.enabled !== undefined) audit(`provider.${patch.enabled ? 'enabled' : 'disabled'}`, 'provider', id, `${user.name} ${patch.enabled ? 'enabled' : 'disabled'} ${p.name}`, null)
          if (patch.maskedKey !== undefined) audit('provider.key_replaced', 'provider', id, `${user.name} replaced the API key for ${p.name}`, null)
        },

        /* ---------- suggestions ---------- */

        submitSuggestion: (input) => {
          const user = me()
          if (!user || user.role === 'super_admin') return fail('Only people in an organisation can suggest capabilities.')
          const parsed = parseGithubUrl(input.githubUrl)
          if (!parsed) return fail('Enter a GitHub repository link like https://github.com/owner/repo')
          const id = uid('s')
          const s: Suggestion = {
            id,
            tenantId: user.tenantId,
            suggestedById: user.id,
            githubUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
            name: input.name.trim(),
            category: input.category,
            description: input.description.trim(),
            useCase: input.useCase.trim(),
            licence: input.licence.trim(),
            docsUrl: input.docsUrl.trim(),
            status: 'submitted',
            forwarded: false,
            history: [{ status: 'submitted', at: now(), actorId: user.id, actorRole: user.role }],
            catalogItemId: null,
            createdAt: now(),
          }
          set((st) => ({ suggestions: [s, ...st.suggestions] }))
          audit('suggestion.submitted', 'suggestion', id, `${user.name} suggested ${s.name} (${s.githubUrl})`, user.tenantId)
          notify(tenantAdmins(user.tenantId), `${user.name} suggested a capability: ${s.name}.`, (role) => suggestionPath(role, id))
          return ok(id)
        },

        resubmitSuggestion: (id, input) => {
          const user = me()
          const s = get().suggestions.find((x) => x.id === id)
          if (!user || !s || s.suggestedById !== user.id || s.status !== 'needs_info') return
          set((st) => ({
            suggestions: st.suggestions.map((x) =>
              x.id === id
                ? { ...x, ...input, forwarded: false, status: 'submitted', history: [...x.history, { status: 'submitted', at: now(), actorId: user.id, actorRole: user.role, comment: 'Updated with more information' }] }
                : x,
            ),
          }))
          audit('suggestion.resubmitted', 'suggestion', id, `${user.name} added information to the suggestion ${input.name}`, s.tenantId)
          notify(s.forwarded ? superAdmins() : tenantAdmins(s.tenantId), `${user.name} updated the suggestion ${input.name}.`, (role) => suggestionPath(role, id))
        },

        openSuggestion: (id) => {
          const user = me()
          const s = get().suggestions.find((x) => x.id === id)
          if (!user || !s || s.status !== 'submitted') return
          const isTa = user.role === 'tenant_admin' && user.tenantId === s.tenantId
          if (!isTa && user.role !== 'super_admin') return
          set((st) => ({
            suggestions: st.suggestions.map((x) => (x.id === id ? { ...x, status: 'under_review', history: [...x.history, { status: 'under_review', at: now(), actorId: user.id, actorRole: user.role }] } : x)),
          }))
          audit('suggestion.under_review', 'suggestion', id, `${user.name} started reviewing the suggestion ${s.name}`, s.tenantId)
          notify([s.suggestedById], `${user.name} is reviewing your suggestion ${s.name}.`, (role) => suggestionPath(role, id))
        },

        decideSuggestion: (id, action, opts = {}) => {
          const user = me()
          const s = get().suggestions.find((x) => x.id === id)
          if (!user || !s) return fail('Suggestion not found.')
          const isTa = user.role === 'tenant_admin' && user.tenantId === s.tenantId
          const isSa = user.role === 'super_admin'
          const comment = opts.comment?.trim()
          const open = ['submitted', 'under_review'].includes(s.status)
          if (action === 'forward' && !(isTa && open && !s.forwarded)) return fail('Only the Tenant Admin can forward this suggestion.')
          if (action === 'approve_tenant' && !((isTa && open && !s.forwarded) || (isSa && open))) return fail('This suggestion can’t be approved now.')
          if ((action === 'needs_info' || action === 'reject') && !((isTa && open && !s.forwarded) || (isSa && (open || s.status === 'approved_tenant'))))
            return fail('You can’t change this suggestion.')
          if (action === 'publish' && !(isSa && (open || s.status === 'approved_tenant'))) return fail('Only the Super Admin can publish.')
          if ((action === 'needs_info' || action === 'reject') && !comment) return fail(action === 'reject' ? 'Give a reason.' : 'Say what information you need.')

          const tenants = get().tenants.filter((t) => !t.isSystem)
          let catalogItemId = s.catalogItemId
          const buildItem = (availability: CatalogItem['availability'], reg?: RegistryFields): CatalogItem => {
            const existing = catalogItemId ? get().catalog.find((c) => c.id === catalogItemId) : undefined
            const itemId = existing?.id ?? (get().catalog.some((c) => c.id === `cap-${slugify(s.name)}`) ? uid('cap') : `cap-${slugify(s.name)}`)
            catalogItemId = itemId
            return {
              id: itemId,
              name: s.name,
              category: s.category,
              provider: s.githubUrl.split('/')[3] ?? 'Community',
              hosting: 'open-source',
              version: reg?.version || existing?.version || 'latest',
              versions: [reg?.version || existing?.version || 'latest'],
              licence: reg?.licence || existing?.licence || s.licence || 'Not stated',
              gitUrl: s.githubUrl,
              docsUrl: s.docsUrl || null,
              costPerUnit: 0,
              costUnit: 'free',
              languages: [],
              status: 'beta',
              description: s.description,
              availability,
              origin: 'suggestion',
              dependencies: reg?.dependencies ?? existing?.dependencies ?? 'Not reviewed yet',
              installInstructions: reg?.installInstructions ?? existing?.installInstructions ?? 'Pre-installed when attached to an environment.',
              resourceRequirements: reg?.resourceRequirements ?? existing?.resourceRequirements ?? '1 vCPU and 2 GB RAM',
              runtimes: reg?.runtimes ?? existing?.runtimes ?? ['Python'],
            }
          }
          const putItem = (item: CatalogItem, enableFor: string[]) =>
            set((st) => ({
              catalog: st.catalog.some((c) => c.id === item.id) ? st.catalog.map((c) => (c.id === item.id ? item : c)) : [...st.catalog, item],
              tenants: st.tenants.map((t) => (enableFor.includes(t.id) ? { ...t, enabledItemIds: [...new Set([...t.enabledItemIds, item.id])] } : t)),
            }))

          let status: Suggestion['status'] = s.status
          let forwarded = s.forwarded
          let note = comment
          let audience = tenantName(s.tenantId)
          switch (action) {
            case 'approve_tenant':
              putItem(buildItem([s.tenantId]), [s.tenantId])
              status = 'approved_tenant'
              break
            case 'forward':
              status = 'under_review'
              forwarded = true
              note = comment || 'Forwarded to the Super Admin'
              break
            case 'needs_info':
              status = 'needs_info'
              break
            case 'reject':
              status = 'rejected'
              break
            case 'publish': {
              const to = opts.publishTo ?? 'all'
              const targets = to === 'all' ? tenants.map((t) => t.id) : [...new Set([...to, s.tenantId])]
              putItem(buildItem(to === 'all' ? 'all' : targets, opts.registry), targets)
              status = 'published'
              audience = to === 'all' ? 'all tenants' : targets.map(tenantName).join(', ')
              break
            }
          }
          set((st) => ({
            suggestions: st.suggestions.map((x) =>
              x.id === id
                ? { ...x, status, forwarded, catalogItemId, history: [...x.history, { status, at: now(), actorId: user.id, actorRole: user.role, ...(note ? { comment: note } : {}) }] }
                : x,
            ),
          }))
          const verb = { approve_tenant: `approved for ${tenantName(s.tenantId)}`, forward: 'forwarded to the Super Admin', needs_info: 'asked for more information on', reject: 'rejected', publish: `published to ${audience}` }[action]
          audit(`suggestion.${action}`, 'suggestion', id, `${user.name} ${verb} the suggestion ${s.name}`, s.tenantId, comment)
          const msg = {
            approve_tenant: `Your suggestion ${s.name} was approved for ${tenantName(s.tenantId)}. It’s now in the marketplace.`,
            forward: `Your suggestion ${s.name} was forwarded to the Super Admin.`,
            needs_info: `${user.name} needs more information about ${s.name}: ${comment}`,
            reject: `Your suggestion ${s.name} was not accepted: ${comment}`,
            publish: `Your suggestion ${s.name} was published to ${audience}.`,
          }[action]
          notify([s.suggestedById], msg, (role) => (catalogItemId && (action === 'approve_tenant' || action === 'publish') ? itemPath(role, catalogItemId) : suggestionPath(role, id)))
          if (action === 'forward') notify(superAdmins(), `${tenantName(s.tenantId)} forwarded a capability suggestion: ${s.name}.`, (role) => suggestionPath(role, id))
          if (isSa) notify(tenantAdmins(s.tenantId), `The Super Admin ${verb} the suggestion ${s.name}.`, (role) => suggestionPath(role, id))
          return ok(id)
        },

        /* ---------- tests, monitoring, notifications ---------- */

        /* ---------- infrastructure providers ---------- */

        createInfraProvider: (input, cardInput) => {
          const user = me()
          if (!user || user.role !== 'super_admin') return fail('Only the Super Admin can add providers.')
          const problem = providerProblem(input) ?? rateCardProblem(cardInput, null, isModelOnly({ type: input.type }))
          if (problem) return fail(problem)
          const id = uid('ip')
          const provider: InfraProvider = {
            ...input,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            id,
            rateCards: [{ ...cardInput, version: 1, publishedAt: now(), publishedById: user.id }],
            createdAt: now(),
          }
          set((s) => ({ infraProviders: [...s.infraProviders, provider] }))
          audit('infra_provider.created', 'infra_provider', id, `${user.name} added the provider ${provider.name} (${provider.code})`, null)
          return ok(id)
        },

        updateInfraProvider: (id, input) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p) return fail('Provider not found.')
          const problem = providerProblem(input, id)
          if (problem) return fail(problem)
          if (input.status === 'disabled' && p.status === 'active') {
            const inUse = environmentsInUse(id, get().environments)
            if (inUse.length) return fail(`${p.name} is used by ${inUse.length} environment${inUse.length === 1 ? '' : 's'}. Move or stop them before disabling it.`)
          }
          const nowAllowed = (tid: string) => input.allowedTenants === 'all' || input.allowedTenants.includes(tid)
          const dropped = get().tenants.filter((t) => t.approvedProviders.some((a) => a.providerId === id && a.status === 'approved') && !nowAllowed(t.id))
          for (const t of dropped) {
            const blocked = removalBlockers(t.id, [id])
            if (blocked) return fail(blocked)
          }
          const gone = p.regions.filter((r) => !input.regions.some((x) => x.id === r.id)).filter((r) => environmentsInUse(id, get().environments).some((e) => e.spec.regionId === r.id))
          if (gone.length) return fail(`${gone.map((r) => r.name).join(', ')} still has environments, so it can’t be removed.`)
          set((s) => ({
            infraProviders: s.infraProviders.map((x) => (x.id === id ? { ...x, ...input, code: input.code.trim().toUpperCase(), name: input.name.trim() } : x)),
            tenants: s.tenants.map((t) =>
              dropped.some((d) => d.id === t.id)
                ? { ...t, approvedProviders: t.approvedProviders.map((a) => (a.providerId === id && a.status === 'approved' ? { ...a, status: 'revoked' as const, revokedAt: now() } : a)) }
                : t,
            ),
          }))
          audit('infra_provider.updated', 'infra_provider', id, `${user.name} updated the provider ${input.name.trim()}`, null)
          return ok(id)
        },

        setInfraProviderStatus: (id, status) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p) return fail('Provider not found.')
          if (status === 'disabled') {
            const inUse = environmentsInUse(id, get().environments)
            if (inUse.length) return fail(`${p.name} is used by ${inUse.length} environment${inUse.length === 1 ? '' : 's'}. Move or stop them before disabling it.`)
          }
          set((s) => ({ infraProviders: s.infraProviders.map((x) => (x.id === id ? { ...x, status } : x)) }))
          audit(`infra_provider.${status === 'disabled' ? 'disabled' : 'enabled'}`, 'infra_provider', id, `${user.name} ${status === 'disabled' ? 'disabled' : 'enabled'} the provider ${p.name}`, null)
          return ok(id)
        },

        publishRateCard: (id, cardInput) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p) return fail('Provider not found.')
          const latest = p.rateCards[p.rateCards.length - 1]!
          const problem = rateCardProblem(cardInput, latest, isModelOnly(p))
          if (problem) return fail(problem)
          const version = latest.version + 1
          set((s) => ({
            infraProviders: s.infraProviders.map((x) => (x.id === id ? { ...x, rateCards: [...x.rateCards, { ...cardInput, version, publishedAt: now(), publishedById: user.id }] } : x)),
          }))
          audit('infra_provider.rate_card_published', 'infra_provider', id, `${user.name} published rate card v${version} for ${p.name}, effective from ${cardInput.effectiveFrom}`, null, cardInput.source)
          const tenantIds = get().tenants.filter((t) => !t.isSystem && (p.allowedTenants === 'all' || p.allowedTenants.includes(t.id))).map((t) => t.id)
          notify(tenantIds.flatMap(tenantAdmins), `${p.name} has new rates from ${cardInput.effectiveFrom}. Estimates for its environments change from that date; past months stay on the old rates.`, null)
          return ok(id)
        },

        setModelServiceKey: (id, input) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p) return fail('Provider not found.')
          const key = input.key.trim()
          if (key.length < 12) return fail('Paste the full credential. It looks too short.')
          if (input.credentialKind === 'API key + endpoint' && !/^https:\/\/\S+$/.test(input.endpoint?.trim() ?? '')) return fail('Enter the endpoint URL, starting with https://')
          // Only the masked value is kept; the credential itself is never stored or shown again.
          const maskedKey = `${key.slice(0, Math.min(6, Math.floor(key.length / 4)))}••••••••${key.slice(-4)}`
          const replaced = !!p.modelService && p.modelService.status === 'connected'
          set((s) => ({
            infraProviders: s.infraProviders.map((x) =>
              x.id === id ? { ...x, modelService: { credentialKind: input.credentialKind, maskedKey, ...(input.endpoint?.trim() ? { endpoint: input.endpoint.trim() } : {}), status: 'connected', updatedAt: now() } } : x,
            ),
          }))
          audit('infra_provider.model_key_saved', 'infra_provider', id, `${user.name} ${replaced ? 'replaced' : 'connected'} the model service credential for ${p.name}`, null)
          return ok(id)
        },

        revokeModelServiceKey: (id) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p?.modelService) return fail('Provider not found.')
          set((s) => ({ infraProviders: s.infraProviders.map((x) => (x.id === id && x.modelService ? { ...x, modelService: { ...x.modelService, status: 'revoked', updatedAt: now() } } : x)) }))
          audit('infra_provider.model_key_revoked', 'infra_provider', id, `${user.name} revoked the model service credential for ${p.name}`, null)
          const affected = get().projects.filter((pr) => Object.values(pr.platformModels).some((m) => m.providerId === id))
          const tenantIds = [...new Set(affected.map((pr) => pr.tenantId))]
          notify(tenantIds.flatMap(tenantAdmins), `Platform models served by ${p.name} are paused: its model service credential was revoked. Projects using it need another provider.`, null)
          return ok(id)
        },

        testModelServiceKey: async (id) => {
          const user = me()
          const p = get().infraProviders.find((x) => x.id === id)
          if (!user || user.role !== 'super_admin' || !p?.modelService) return fail('Provider not found.')
          await new Promise((r) => setTimeout(r, 900))
          const okNow = p.modelService.status === 'connected'
          const latency = okNow ? 120 + Math.round(Math.random() * 600) : 0
          set((s) => ({
            infraProviders: s.infraProviders.map((x) =>
              x.id === id && x.modelService ? { ...x, modelService: { ...x.modelService, lastTestedAt: now(), lastTestOk: okNow, lastTestLatencyMs: latency } } : x,
            ),
          }))
          return okNow ? ok(id) : fail(`The credential for ${p.name} is revoked. Replace it, then test again.`)
        },

        setModelBudget: (tenantId, patch) => {
          const user = me()
          const t = get().tenants.find((x) => x.id === tenantId)
          if (!user || !t) return fail('Organisation not found.')
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === tenantId))) return fail('Only your Tenant Admin can change the model budget.')
          if (!Number.isFinite(patch.monthly) || patch.monthly < 0) return fail('Enter a monthly budget of ₹0 or more.')
          const monthly = Math.round(patch.monthly)
          // A raised budget re-arms the alerts for levels no longer reached.
          const pct = monthly > 0 ? (tenantModelSpend({ ...t, modelBudget: { ...t.modelBudget, monthly } }, get().modelUsage, { providers: get().infraProviders, tenants: get().tenants }).pct) : 0
          const alerted = t.modelBudget.alerted.filter((a) => a.month === monthKey() && pct >= a.level)
          set((s) => ({ tenants: s.tenants.map((x) => (x.id === tenantId ? { ...x, modelBudget: { monthly, onExceed: patch.onExceed, alerted } } : x)) }))
          audit('tenant.model_budget', 'tenant', tenantId, `${user.name} set ${t.name}’s model budget to ${formatCurrency(monthly)} a month (${patch.onExceed === 'block' ? 'block new platform model usage' : 'notify only'} at 100%)`, tenantId)
          get().checkModelBudgets()
          return ok(tenantId)
        },

        checkModelBudgets: () => {
          const ctx = { providers: get().infraProviders, tenants: get().tenants }
          const month = monthKey()
          for (const t of get().tenants) {
            if (t.isSystem || !t.modelBudget || t.modelBudget.monthly <= 0) continue
            const spend = tenantModelSpend(t, get().modelUsage, ctx)
            const sent = t.modelBudget.alerted.filter((a) => a.month === month)
            const levels = ([80, 100] as const).filter((l) => spend.pct >= l && !sent.some((a) => a.level === l))
            if (!levels.length) continue
            const level = levels[levels.length - 1]!
            const text =
              level === 100
                ? `${t.name} has used ${Math.round(spend.pct)}% of this month’s model budget (${formatCurrency(spend.mtd)} of ${formatCurrency(t.modelBudget.monthly)}). ${t.modelBudget.onExceed === 'block' ? 'New platform models are blocked until the budget is raised.' : 'Usage continues; raise the budget or review Model Costs.'}`
                : `${t.name} has used ${Math.round(spend.pct)}% of this month’s model budget (${formatCurrency(spend.mtd)} of ${formatCurrency(t.modelBudget.monthly)}). Projected month-end: ${formatCurrency(spend.projected)}.`
            // Budget alerts reach every Tenant Admin, including one who is signed in.
            const recipients = tenantAdmins(t.id)
            set((s) => ({
              tenants: s.tenants.map((x) => (x.id === t.id ? { ...x, modelBudget: { ...x.modelBudget, alerted: [...x.modelBudget.alerted, ...levels.map((l) => ({ month, level: l }))] } } : x)),
              notifications: [...recipients.map((userId) => ({ id: uid('n'), userId, at: now(), text, link: '/tenant-admin/quotas#model-costs', read: false })), ...s.notifications],
            }))
            audit('tenant.model_budget_alert', 'tenant', t.id, `${t.name} reached ${level}% of its monthly model budget`, t.id, undefined, true)
          }
        },

        /* ---------- QA ---------- */

        createDataset: (input) => {
          const user = me()
          if (!user || user.role !== 'qa') return fail('Only QA Engineers can add datasets.')
          if (input.name.trim().length < 3) return fail('Give the dataset a name.')
          if (!input.rows.length) return fail('The dataset has no rows.')
          const id = uid('ds')
          set((s) => ({ datasets: [{ ...input, name: input.name.trim(), id, tenantId: user.tenantId, source: 'upload', createdById: user.id, createdAt: now() }, ...s.datasets] }))
          audit('qa.dataset_uploaded', 'qa', id, `${user.name} uploaded the dataset ${input.name.trim()} (${input.rows.length} rows)`, user.tenantId)
          return ok(id)
        },

        createTestConfig: (spec) => {
          const user = me()
          if (!user || user.role !== 'qa') return fail('Only QA Engineers can manage test configurations.')
          if (!qaCanUseProject(user, spec.projectId)) return fail('You aren’t assigned to that project. Ask your Tenant Admin to add you.')
          const id = uid('cfg')
          set((s) => ({ testConfigs: [{ id, tenantId: user.tenantId, archived: false, versions: [{ version: 1, spec, at: now(), byId: user.id, summary: 'Created' }], createdAt: now() }, ...s.testConfigs] }))
          audit('qa.config_created', 'qa', id, `${user.name} created the test configuration ${spec.name}`, user.tenantId)
          return ok(id)
        },

        updateTestConfig: (id, spec, summary) => {
          const user = me()
          const c = get().testConfigs.find((x) => x.id === id)
          if (!user || user.role !== 'qa' || !c || c.tenantId !== user.tenantId) return fail('You can’t change this configuration.')
          if (!qaCanUseProject(user, spec.projectId)) return fail('You aren’t assigned to that project. Ask your Tenant Admin to add you.')
          const version = c.versions[c.versions.length - 1]!.version + 1
          set((s) => ({ testConfigs: s.testConfigs.map((x) => (x.id === id ? { ...x, versions: [...x.versions, { version, spec, at: now(), byId: user.id, summary }] } : x)) }))
          audit('qa.config_versioned', 'qa', id, `${user.name} saved version ${version} of ${spec.name}: ${summary}`, user.tenantId)
          return ok(id)
        },

        duplicateTestConfig: (id) => {
          const user = me()
          const c = get().testConfigs.find((x) => x.id === id)
          if (!user || user.role !== 'qa' || !c || c.tenantId !== user.tenantId) return fail('You can’t copy this configuration.')
          const spec = { ...c.versions[c.versions.length - 1]!.spec }
          spec.name = `Copy of ${spec.name}`
          const nid = uid('cfg')
          set((s) => ({ testConfigs: [{ id: nid, tenantId: user.tenantId, archived: false, versions: [{ version: 1, spec, at: now(), byId: user.id, summary: `Copied from ${c.versions[c.versions.length - 1]!.spec.name}` }], createdAt: now() }, ...s.testConfigs] }))
          audit('qa.config_duplicated', 'qa', nid, `${user.name} copied the test configuration ${spec.name.replace(/^Copy of /, '')}`, user.tenantId)
          return ok(nid)
        },

        setTestConfigArchived: (id, archived) => {
          const user = me()
          const c = get().testConfigs.find((x) => x.id === id)
          if (!user || user.role !== 'qa' || !c || c.tenantId !== user.tenantId) return
          set((s) => ({ testConfigs: s.testConfigs.map((x) => (x.id === id ? { ...x, archived } : x)) }))
          audit(archived ? 'qa.config_archived' : 'qa.config_restored', 'qa', id, `${user.name} ${archived ? 'archived' : 'restored'} the test configuration ${c.versions[c.versions.length - 1]!.spec.name}`, user.tenantId)
        },

        recordQaRun: (run) => {
          const user = me()
          if (!user || user.role !== 'qa') return fail('Only QA Engineers can record test runs.')
          const project = get().projects.find((p) => p.id === run.projectId)
          if (!project || !qaCanUseProject(user, project.id)) return fail('You aren’t assigned to that project.')
          const id = uid('qr')
          set((s) => ({ qaRuns: [{ ...run, id, at: now(), actorId: user.id, tenantId: user.tenantId }, ...s.qaRuns] }))
          audit(`qa.run_${run.kind}`, 'qa', id, `${user.name} ran “${run.title}” for ${project.name}: ${run.passed ? 'passed' : 'did not pass'}`, user.tenantId)
          const config = run.configId ? get().testConfigs.find((c) => c.id === run.configId) : undefined
          if (!run.passed && config && config.versions[config.versions.length - 1]!.spec.notifyOnFailure) {
            notify([project.ownerId, user.id], `QA run “${run.title}” for ${project.name} did not pass its thresholds.`, (role) => reportPath(role, id))
          }
          return ok(id)
        },

        setRecommendation: (projectId, modelId, runId, note) => {
          const user = me()
          const project = get().projects.find((p) => p.id === projectId)
          const model = get().catalog.find((c) => c.id === modelId)
          const run = get().qaRuns.find((r) => r.id === runId)
          if (!user || user.role !== 'qa' || !project || !model || !run) return fail('Pick a model from a finished comparison.')
          if (!qaCanUseProject(user, projectId) || run.projectId !== projectId) return fail('You aren’t assigned to that project.')
          if (!run.models.some((m) => m.modelId === modelId)) return fail('That model wasn’t part of this comparison.')
          set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, recommendation: { modelId, runId, byId: user.id, at: now(), note: note.trim() } } : p)) }))
          audit('qa.model_recommended', 'qa', projectId, `${user.name} recommended ${model.name} for ${project.name}`, project.tenantId, note.trim() || undefined)
          notify([...project.memberIds, project.ownerId], `${user.name} recommended ${model.name} for ${project.name}.`, (role) => (role === 'user' ? itemPath(role, modelId) : reportPath(role, runId)))
          return ok(projectId)
        },

        recordTestRun: (run) => {
          const user = me()
          const env = get().environments.find((e) => e.id === run.envId)
          if (!user || !env) return
          const id = uid('tr')
          set((s) => ({ testRuns: [{ ...run, id, at: now(), actorId: user.id, tenantId: env.tenantId }, ...s.testRuns] }))
          audit(`test.${run.kind}`, 'test', id, `${user.name} ${run.summary.charAt(0).toLowerCase()}${run.summary.slice(1)} on “${env.spec.name}”`, env.tenantId)
        },

        checkAlerts: () => {
          const { environments, catalog, alertKeys } = get()
          const fresh: string[] = []
          for (const env of environments) {
            if (env.status !== 'active') continue
            const point = currentPoint(env, catalog)
            for (const u of utilisation(point)) {
              const level = alertLevel(u.pct)
              if (!level) continue
              const key = `${env.id}:${u.key}:${level}`
              if (alertKeys.includes(key) || fresh.includes(key)) continue
              fresh.push(key)
              if (level === 95) fresh.push(`${env.id}:${u.key}:80`)
              notify(
                [env.ownerId, ...tenantAdmins(env.tenantId)],
                `${u.label} on “${env.spec.name}” is at ${Math.round(u.pct)}%, above ${level}%.`,
                (role) => `${envPath(role, env.id)}?tab=monitoring`,
              )
            }
          }
          // Admin-set expiry: remind the owner 3 days before, then terminate.
          const nowMs = Date.now()
          for (const env of get().environments) {
            if (!env.autoTerminate || !env.expiresAt || ['terminated', 'provisioning_failed'].includes(env.status)) continue
            const left = new Date(env.expiresAt).getTime() - nowMs
            if (left <= 0) {
              pushEnvEvent(env.id, event('terminated', 'Reached its expiry date.', true), { provisionDueAt: null })
              followEnv(env.id, 'terminated')
              audit('environment.terminated', 'environment', env.id, `“${env.spec.name}” terminated on its expiry date`, env.tenantId, undefined, true)
              notify([env.ownerId, ...(env.accessUserIds ?? []), ...tenantAdmins(env.tenantId)], `“${env.spec.name}” reached its expiry date and was terminated.`, envLink(env.id))
            } else if (left <= 3 * 86_400_000) {
              const key = `${env.id}:expiry`
              if (get().alertKeys.includes(key) || fresh.includes(key)) continue
              fresh.push(key)
              notify(env.ownerId === TENANT_OWNER ? tenantAdmins(env.tenantId) : [env.ownerId], `“${env.spec.name}” terminates automatically on ${formatDate(env.expiresAt)}.`, envLink(env.id))
            }
          }
          if (fresh.length) set((s) => ({ alertKeys: [...new Set([...s.alertKeys, ...fresh])] }))
        },

        markNotificationsRead: () => {
          const id = useSessionStore.getState().currentUserId
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === id ? { ...n, read: true } : n)) }))
        },

        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),

        resetSampleData: () => {
          timers.forEach((t) => clearTimeout(t))
          timers.clear()
          set({ ...fullSeed() })
        },
      }
    },
    {
      name: STORAGE_KEY,
      // Bump whenever the shape of stored data changes: older saved data is replaced with fresh sample data.
      // 3: projects gained type, memberAccess, capabilityVersions and updatedAt; environments gained capabilities.
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: () => fullSeed() as unknown as AppState,
      partialize: (s) => ({
        tenants: s.tenants,
        users: s.users,
        projects: s.projects,
        environments: s.environments,
        deployments: s.deployments,
        requests: s.requests,
        catalog: s.catalog,
        providers: s.providers,
        usage: s.usage,
        audit: s.audit,
        notifications: s.notifications,
        suggestions: s.suggestions,
        quotaRequests: s.quotaRequests,
        testRuns: s.testRuns,
        infraProviders: s.infraProviders,
        modelUsage: s.modelUsage,
        providerRequests: s.providerRequests,
        datasets: s.datasets,
        testConfigs: s.testConfigs,
        qaRuns: s.qaRuns,
        capacity: s.capacity,
        alertKeys: s.alertKeys,
      }),
    },
  ),
)

/* Clean up state saved by the first version of the prototype. */
try {
  sessionStorage.removeItem('aic-demo-state')
} catch {
  /* storage unavailable */
}

/* ---------- basic selectors ---------- */

export const useCurrentUser = () => {
  const id = useSessionStore((s) => s.currentUserId)
  return useAppStore((s) => s.users.find((u) => u.id === id) ?? null)
}

export const useCurrentTenant = () => {
  const user = useCurrentUser()
  return useAppStore((s) => (user ? (s.tenants.find((t) => t.id === user.tenantId) ?? null) : null))
}

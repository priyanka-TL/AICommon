import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSeed, endpointFor, SAMPLE_PASSWORD, SEED_VERSION, type SeedState } from '@/data/seed'
import type {
  ActorRole,
  AuditEntity,
  CatalogCategory,
  CatalogItem,
  CatalogStatus,
  EnvRequest,
  EnvSpec,
  EnvStatus,
  Environment,
  LifecycleEvent,
  Project,
  Provider,
  Quota,
  RequestStatus,
  Role,
  Suggestion,
  Tenant,
  TestRun,
  User,
} from '@/data/types'
import { canTransition, partiesFor, findTransition } from '@/lib/lifecycle'
import { addsInfrastructure, diffSpecs } from '@/lib/spec'
import { alertLevel, currentPoint, utilisation } from '@/lib/metrics'
import { envPath, itemPath, requestPath, suggestionsPath } from '@/lib/paths'
import { parseGithubUrl } from '@/lib/suggestions'
import { formatInt } from '@/lib/format'
import { uid, slugify } from '@/lib/utils'

export const STORAGE_KEY = `aic-demo-data-${SEED_VERSION}`
const PROVISIONING_MS = 5000
const FAILURE_REASON = 'Simulated: GPU capacity unavailable in pool'

/* ---------- session (per tab) ---------- */

interface SessionState {
  currentUserId: string | null
  /** Super Admin tenant filter: 'all' or a tenant id. */
  tenantFilter: string
  setCurrentUser: (id: string | null) => void
  setTenantFilter: (id: string) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      tenantFilter: 'all',
      setCurrentUser: (id) => set({ currentUserId: id, tenantFilter: 'all' }),
      setTenantFilter: (id) => set({ tenantFilter: id }),
    }),
    { name: 'aic-session', storage: createJSONStorage(() => sessionStorage) },
  ),
)

/* ---------- app data ---------- */

export type Result = { ok: true; id?: string } | { ok: false; error: string }
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
  extendEnv: (id: string, weeks: number) => void
  scheduleProvisioning: () => void

  // projects
  createProject: (p: Pick<Project, 'name' | 'description' | 'memberIds' | 'limits'>) => string | null
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'memberIds' | 'limits' | 'status'>>) => void
  addProjectCapability: (projectId: string, itemId: string) => Result

  // tenants & users
  createTenant: (t: Pick<Tenant, 'name' | 'code' | 'description' | 'orgType' | 'city' | 'state' | 'contactName' | 'contactEmail' | 'quota'>) => string | null
  updateTenant: (id: string, patch: Partial<Pick<Tenant, 'name' | 'description' | 'orgType' | 'city' | 'state' | 'contactName' | 'contactEmail'>>) => void
  setTenantStatus: (id: string, status: Tenant['status']) => void
  setTenantQuota: (id: string, quota: Quota) => void
  setItemEnabled: (tenantId: string, itemId: string, enabled: boolean) => void
  createUser: (u: Pick<User, 'name' | 'email' | 'title' | 'role' | 'tenantId'>) => Result
  updateUser: (id: string, patch: Partial<Pick<User, 'name' | 'title' | 'role'>>) => void
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
  checkAlerts: () => void
  markNotificationsRead: () => void
  markNotificationRead: (id: string) => void

  resetSampleData: () => void
}

const now = () => new Date().toISOString()
const timers = new Map<string, number>()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /* ---------- helpers ---------- */

      const me = () => get().users.find((u) => u.id === useSessionStore.getState().currentUserId) ?? null
      const userById = (id: string) => get().users.find((u) => u.id === id)
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
        const recipients = [...new Set(userIds)].filter((id) => id !== self)
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

      return {
        ...createSeed(),

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
          const project = get().projects.find((p) => p.id === spec.projectId)
          if (!project || project.tenantId !== user.tenantId) return fail('Choose a project in your organisation.')
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
          if (user.role === 'super_admin' || !addsInfrastructure(env.spec, spec)) {
            const changes = diffSpecs(env.spec, spec, get().catalog, get().projects)
            patchEnv(envId, { spec })
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
            if (to === 'resubmitted') extra.spec = opts.spec
            else {
              const changes = diffSpecs(r.spec, opts.spec, get().catalog, get().projects)
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
                const tenant = get().tenants.find((x) => x.id === r.tenantId)!
                const envId = uid('env')
                const env: Environment = {
                  id: envId,
                  tenantId: r.tenantId,
                  projectId: updated.spec.projectId,
                  ownerId: r.requesterId,
                  requestId: id,
                  status: 'provisioning',
                  spec: updated.spec,
                  endpoint: endpointFor(tenant.code, envId),
                  apiKey: `aic_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 41),
                  creditsUsed: 0,
                  createdAt: now(),
                  expiresAt: new Date(Date.now() + updated.spec.durationWeeks * 7 * 86_400_000).toISOString(),
                  history: [event('provisioning', undefined, true)],
                  failureReason: null,
                  provisionDueAt: null,
                  hold: false,
                  loadProfile: 'normal',
                }
                set((s) => ({ environments: [env, ...s.environments] }))
                patchRequest(id, { envId })
                startProvisioning(envId, !!opts.simulateFailure)
              } else if (updated.envId) {
                patchEnv(updated.envId, { spec: updated.spec })
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

        /* ---------- projects ---------- */

        createProject: (p) => {
          const user = me()
          if (!user || user.role !== 'tenant_admin') return null
          const id = uid('p')
          set((s) => ({
            projects: [...s.projects, { ...p, id, tenantId: user.tenantId, ownerId: user.id, status: 'active', capabilityIds: [], createdAt: now() }],
          }))
          audit('project.created', 'project', id, `${user.name} created the project “${p.name}”`, user.tenantId)
          notify(p.memberIds, `${user.name} added you to the project “${p.name}”.`, null)
          return id
        },

        updateProject: (id, patch) => {
          const user = me()
          const p = get().projects.find((x) => x.id === id)
          if (!user || !p || user.role !== 'tenant_admin' || user.tenantId !== p.tenantId) return
          set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          const what = patch.status ? (patch.status === 'archived' ? 'archived' : 'restored') : patch.memberIds ? 'changed the members of' : patch.limits ? 'changed the limits of' : 'updated'
          audit(`project.${patch.status ?? 'updated'}`, 'project', id, `${user.name} ${what} “${p.name}”`, p.tenantId)
          if (patch.memberIds) {
            const added = patch.memberIds.filter((m) => !p.memberIds.includes(m))
            notify(added, `${user.name} added you to the project “${p.name}”.`, null)
          }
        },

        addProjectCapability: (projectId, itemId) => {
          const user = me()
          const p = get().projects.find((x) => x.id === projectId)
          const item = get().catalog.find((c) => c.id === itemId)
          if (!user || !p || !item) return fail('Project not found.')
          const allowed = (user.role === 'tenant_admin' && user.tenantId === p.tenantId) || (user.tenantId === p.tenantId && p.memberIds.includes(user.id))
          if (!allowed) return fail('Only project members can add capabilities.')
          if (p.capabilityIds.includes(itemId)) return fail(`${item.name} is already in this project.`)
          set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, capabilityIds: [...x.capabilityIds, itemId] } : x)) }))
          audit('project.capability_added', 'project', projectId, `${user.name} added ${item.name} to “${p.name}”`, p.tenantId)
          return ok(projectId)
        },

        /* ---------- tenants & users ---------- */

        createTenant: (t) => {
          const user = me()
          if (user?.role !== 'super_admin') return null
          const id = uid('t')
          const enabled = get().catalog.filter((c) => c.availability === 'all' && c.status !== 'deprecated').map((c) => c.id)
          set((s) => ({ tenants: [...s.tenants, { ...t, id, enabledItemIds: enabled, status: 'active', isSystem: false, createdAt: now() }] }))
          audit('tenant.created', 'tenant', id, `${user.name} created the tenant ${t.name}`, id)
          return id
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
          if (!user || user.role === 'user') return fail('Only admins can add people.')
          const tenantId = user.role === 'tenant_admin' ? user.tenantId : input.tenantId
          const tenant = get().tenants.find((t) => t.id === tenantId)
          if (!tenant || tenant.isSystem) return fail('Choose a tenant.')
          if (input.role === 'super_admin') return fail('Super Admins can’t be created here.')
          if (get().users.some((x) => x.email.toLowerCase() === input.email.trim().toLowerCase())) return fail('Someone with this email already has an account.')
          const id = uid('u')
          set((s) => ({ users: [...s.users, { ...input, tenantId, id, status: 'active', lastActiveAt: now() }] }))
          audit('user.created', 'user', id, `${user.name} added ${input.name} to ${tenant.name} as ${input.role === 'tenant_admin' ? 'Tenant Admin' : 'User'}`, tenantId)
          return ok(id)
        },

        updateUser: (id, patch) => {
          const user = me()
          const target = get().users.find((x) => x.id === id)
          if (!user || !target || target.role === 'super_admin') return
          if (!(user.role === 'super_admin' || (user.role === 'tenant_admin' && user.tenantId === target.tenantId))) return
          if (patch.role === 'super_admin') return
          set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          audit(patch.role && patch.role !== target.role ? 'user.role_changed' : 'user.updated', 'user', id, patch.role && patch.role !== target.role ? `${user.name} made ${target.name} a ${patch.role === 'tenant_admin' ? 'Tenant Admin' : 'User'}` : `${user.name} updated ${target.name}’s profile`, target.tenantId)
          if (patch.role && patch.role !== target.role) notify([id], `You are now a ${patch.role === 'tenant_admin' ? 'Tenant Admin' : 'User'} in ${tenantName(target.tenantId)}. Sign in again to see the change.`, null)
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
          notify(tenantAdmins(user.tenantId), `${user.name} suggested a capability: ${s.name}.`, (role) => suggestionsPath(role))
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
          notify(s.forwarded ? superAdmins() : tenantAdmins(s.tenantId), `${user.name} updated the suggestion ${input.name}.`, (role) => suggestionsPath(role))
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
          notify([s.suggestedById], `${user.name} is reviewing your suggestion ${s.name}.`, (role) => suggestionsPath(role))
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
          notify([s.suggestedById], msg, (role) => (catalogItemId && (action === 'approve_tenant' || action === 'publish') ? itemPath(role, catalogItemId) : suggestionsPath(role)))
          if (action === 'forward') notify(superAdmins(), `${tenantName(s.tenantId)} forwarded a capability suggestion: ${s.name}.`, (role) => suggestionsPath(role))
          if (isSa) notify(tenantAdmins(s.tenantId), `The Super Admin ${verb} the suggestion ${s.name}.`, (role) => suggestionsPath(role))
          return ok(id)
        },

        /* ---------- tests, monitoring, notifications ---------- */

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
          set({ ...createSeed() })
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: () => createSeed() as unknown as AppState,
      partialize: (s) => ({
        tenants: s.tenants,
        users: s.users,
        projects: s.projects,
        environments: s.environments,
        requests: s.requests,
        catalog: s.catalog,
        providers: s.providers,
        usage: s.usage,
        audit: s.audit,
        notifications: s.notifications,
        suggestions: s.suggestions,
        quotaRequests: s.quotaRequests,
        testRuns: s.testRuns,
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

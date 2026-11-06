import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSeed, DEMO_ADMIN_ID, DEMO_USER_ID, endpointFor, type SeedState } from '@/data/seed'
import type {
  ActivityKind,
  CatalogItem,
  CatalogStatus,
  EnvSpec,
  Environment,
  EnvRequest,
  Provider,
  Role,
  Tenant,
  TenantStatus,
  TimelineEntry,
  User,
} from '@/data/types'
import { diffSpecs } from '@/lib/spec'
import { uid } from '@/lib/utils'

const PROVISIONING_MS = 5000
const scheduledProvisioning = new Set<string>()

interface AppState extends SeedState {
  currentUserId: string | null
  drafts: Record<string, EnvSpec>

  // auth
  login: (email: string) => User | null
  quickLogin: (role: Role) => User
  logout: () => void

  // requests
  submitRequest: (spec: EnvSpec) => string
  submitChangeRequest: (envId: string, spec: EnvSpec) => string
  approveRequest: (id: string, comment?: string) => void
  approveWithChanges: (id: string, spec: EnvSpec, comment: string) => void
  rejectRequest: (id: string, reason: string) => void
  addComment: (id: string, text: string) => void

  // environments
  startEnv: (id: string) => void
  stopEnv: (id: string) => void
  suspendEnv: (id: string) => void
  extendEnv: (id: string, weeks: number) => void
  deleteEnv: (id: string) => void
  kickProvisioning: () => void

  // drafts
  saveDraft: (spec: EnvSpec) => void
  clearDraft: () => void

  // tenants & users
  createTenant: (t: Omit<Tenant, 'id' | 'createdAt' | 'creditsUsed' | 'gpuUsed' | 'status'>) => string
  updateTenant: (id: string, patch: Partial<Tenant>) => void
  setTenantStatus: (id: string, status: TenantStatus) => void
  createUser: (u: Omit<User, 'id' | 'status' | 'lastActiveAt'>) => string
  setUserStatus: (id: string, status: User['status']) => void
  resetPassword: (id: string) => void

  // catalog & providers
  upsertCatalogItem: (item: CatalogItem) => void
  setCatalogStatus: (id: string, status: CatalogStatus) => void
  updateProvider: (id: string, patch: Partial<Provider>) => void

  // misc
  recordActivity: (kind: ActivityKind, text: string) => void
  markNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  resetDemo: () => void
}

const now = () => new Date().toISOString()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /* ---------- internal helpers ---------- */

      const me = () => get().users.find((u) => u.id === get().currentUserId) ?? null
      const tenantName = (id: string | null) => get().tenants.find((t) => t.id === id)?.name ?? ''

      const activity = (kind: ActivityKind, text: string, tenantId: string | null) =>
        set((s) => ({
          activity: [
            { id: uid('a'), at: now(), actorId: s.currentUserId ?? 'system', tenantId, kind, text },
            ...s.activity,
          ],
        }))

      const notify = (userIds: string[], text: string, link: string | null) =>
        set((s) => ({
          notifications: [
            ...userIds
              .filter((id) => id !== s.currentUserId)
              .map((userId) => ({ id: uid('n'), userId, at: now(), text, link, read: false })),
            ...s.notifications,
          ],
        }))

      const adminIds = () => get().users.filter((u) => u.role === 'admin' && u.status === 'active').map((u) => u.id)

      const patchEnv = (id: string, patch: Partial<Environment>, entry?: Omit<TimelineEntry, 'at'>) =>
        set((s) => ({
          environments: s.environments.map((e) =>
            e.id === id
              ? { ...e, ...patch, timeline: entry ? [...e.timeline, { ...entry, at: now() }] : e.timeline }
              : e,
          ),
        }))

      const patchRequest = (id: string, patch: Partial<EnvRequest>) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))

      const finaliseApproval = (req: EnvRequest, spec: EnvSpec, changed: boolean) => {
        const env = get().environments.find((e) => e.id === req.envId)
        if (!env) return
        const by = me()?.name ?? 'Admin'
        if (req.type === 'new') {
          set((s) => ({
            environments: s.environments.map((e) =>
              e.id === env.id
                ? {
                    ...e,
                    spec,
                    status: 'provisioning',
                    expiresAt: new Date(Date.now() + spec.durationWeeks * 7 * 86_400_000).toISOString(),
                    timeline: [
                      ...e.timeline,
                      { status: 'approved', at: now(), note: changed ? `Approved with changes by ${by}` : `Approved by ${by}` },
                      { status: 'provisioning', at: now() },
                    ],
                  }
                : e,
            ),
          }))
        } else {
          patchEnv(env.id, { spec }, { status: env.status, note: changed ? `Change approved with edits by ${by}` : `Change approved by ${by}` })
        }
        const label = req.type === 'new' ? `“${spec.name}”` : `the change to “${spec.name}”`
        activity(
          'approval',
          `${by} approved ${label}${changed ? ' with changes' : ''} for ${tenantName(req.tenantId)}`,
          req.tenantId,
        )
        notify(
          [req.requesterId],
          req.type === 'new'
            ? `“${spec.name}” was approved${changed ? ' with changes' : ''}. It is being set up now.`
            : `Your change to “${spec.name}” was approved${changed ? ' with edits' : ''}.`,
          `/app/environments/${env.id}`,
        )
      }

      return {
        ...createSeed(),
        currentUserId: null,
        drafts: {},

        /* ---------- auth ---------- */

        login: (email) => {
          const user = get().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
          if (!user || user.status !== 'active') return null
          const tenant = get().tenants.find((t) => t.id === user.tenantId)
          if (tenant?.status === 'suspended') return null
          set((s) => ({
            currentUserId: user.id,
            users: s.users.map((u) => (u.id === user.id ? { ...u, lastActiveAt: now() } : u)),
          }))
          return user
        },

        quickLogin: (role) => {
          const id = role === 'admin' ? DEMO_ADMIN_ID : DEMO_USER_ID
          set((s) => ({
            currentUserId: id,
            users: s.users.map((u) => (u.id === id ? { ...u, lastActiveAt: now() } : u)),
          }))
          return get().users.find((u) => u.id === id)!
        },

        logout: () => set({ currentUserId: null }),

        /* ---------- requests ---------- */

        submitRequest: (spec) => {
          const user = me()
          if (!user?.tenantId) throw new Error('Only organisation users can request environments')
          const tenant = get().tenants.find((t) => t.id === user.tenantId)!
          const envId = uid('env')
          const reqId = uid('req')
          const env: Environment = {
            id: envId,
            tenantId: tenant.id,
            ownerId: user.id,
            requestId: reqId,
            status: 'pending',
            spec,
            endpoint: endpointFor(tenant.shortName, envId),
            apiKey: `aic_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 41),
            creditsUsed: 0,
            createdAt: now(),
            expiresAt: null,
            timeline: [{ status: 'pending', at: now(), note: 'Request submitted' }],
          }
          const req: EnvRequest = {
            id: reqId,
            type: 'new',
            tenantId: tenant.id,
            requesterId: user.id,
            envId,
            spec,
            previousSpec: null,
            status: 'pending',
            createdAt: now(),
            decidedAt: null,
            decidedById: null,
            adminChanges: [],
            rejectionReason: null,
            comments: [],
          }
          set((s) => {
            const drafts = { ...s.drafts }
            delete drafts[user.id]
            return { environments: [env, ...s.environments], requests: [req, ...s.requests], drafts }
          })
          activity('request', `${user.name} requested “${spec.name}”`, tenant.id)
          notify(adminIds(), `New environment request from ${tenant.name}: “${spec.name}”.`, '/admin/requests')
          return envId
        },

        submitChangeRequest: (envId, spec) => {
          const user = me()
          const env = get().environments.find((e) => e.id === envId)
          if (!user || !env) throw new Error('Environment not found')
          const reqId = uid('req')
          const req: EnvRequest = {
            id: reqId,
            type: 'change',
            tenantId: env.tenantId,
            requesterId: user.id,
            envId,
            spec,
            previousSpec: env.spec,
            status: 'pending',
            createdAt: now(),
            decidedAt: null,
            decidedById: null,
            adminChanges: [],
            rejectionReason: null,
            comments: [],
          }
          set((s) => ({ requests: [req, ...s.requests] }))
          activity('request', `${user.name} requested a change to “${env.spec.name}”`, env.tenantId)
          notify(adminIds(), `Change request from ${tenantName(env.tenantId)}: “${env.spec.name}”.`, '/admin/requests')
          return reqId
        },

        approveRequest: (id, comment) => {
          const req = get().requests.find((r) => r.id === id)
          if (!req || req.status !== 'pending') return
          const comments = comment?.trim()
            ? [...req.comments, { id: uid('c'), authorId: get().currentUserId!, text: comment.trim(), at: now() }]
            : req.comments
          patchRequest(id, { status: 'approved', decidedAt: now(), decidedById: get().currentUserId, comments })
          finaliseApproval(req, req.spec, false)
        },

        approveWithChanges: (id, spec, comment) => {
          const req = get().requests.find((r) => r.id === id)
          if (!req || req.status !== 'pending') return
          const adminChanges = diffSpecs(req.spec, spec, get().catalog)
          const comments = comment.trim()
            ? [...req.comments, { id: uid('c'), authorId: get().currentUserId!, text: comment.trim(), at: now() }]
            : req.comments
          patchRequest(id, {
            status: 'approved',
            spec,
            decidedAt: now(),
            decidedById: get().currentUserId,
            adminChanges,
            comments,
          })
          finaliseApproval(req, spec, adminChanges.length > 0)
        },

        rejectRequest: (id, reason) => {
          const req = get().requests.find((r) => r.id === id)
          if (!req || req.status !== 'pending') return
          const by = me()?.name ?? 'Admin'
          patchRequest(id, { status: 'rejected', decidedAt: now(), decidedById: get().currentUserId, rejectionReason: reason })
          if (req.type === 'new') patchEnv(req.envId, { status: 'rejected' }, { status: 'rejected', note: `Rejected by ${by}` })
          activity('rejection', `${by} rejected ${req.type === 'change' ? 'the change to ' : ''}“${req.spec.name}”: ${reason}`, req.tenantId)
          notify(
            [req.requesterId],
            `${req.type === 'change' ? 'Your change to ' : ''}“${req.spec.name}” was not approved. ${reason}`,
            '/app/requests',
          )
        },

        addComment: (id, text) => {
          const req = get().requests.find((r) => r.id === id)
          const user = me()
          if (!req || !user || !text.trim()) return
          patchRequest(id, {
            comments: [...req.comments, { id: uid('c'), authorId: user.id, text: text.trim(), at: now() }],
          })
          activity('comment', `${user.name} commented on “${req.spec.name}”`, req.tenantId)
          notify(
            user.role === 'admin' ? [req.requesterId] : adminIds(),
            `${user.name} commented on “${req.spec.name}”.`,
            user.role === 'admin' ? '/app/requests' : '/admin/requests',
          )
        },

        /* ---------- environments ---------- */

        startEnv: (id) => {
          const env = get().environments.find((e) => e.id === id)
          if (!env) return
          const by = me()?.name ?? 'Someone'
          patchEnv(id, { status: 'running' }, { status: 'running', note: `Started by ${by}` })
          activity('environment', `${by} started “${env.spec.name}”`, env.tenantId)
        },

        stopEnv: (id) => {
          const env = get().environments.find((e) => e.id === id)
          if (!env) return
          const by = me()?.name ?? 'Someone'
          patchEnv(id, { status: 'stopped' }, { status: 'stopped', note: `Stopped by ${by}` })
          activity('environment', `${by} stopped “${env.spec.name}”`, env.tenantId)
          if (me()?.role === 'admin') notify([env.ownerId], `An admin stopped “${env.spec.name}”.`, `/app/environments/${id}`)
        },

        suspendEnv: (id) => {
          const env = get().environments.find((e) => e.id === id)
          if (!env) return
          const by = me()?.name ?? 'Admin'
          patchEnv(id, { status: 'stopped' }, { status: 'stopped', note: `Suspended by ${by}` })
          activity('environment', `${by} suspended “${env.spec.name}”`, env.tenantId)
          notify([env.ownerId], `“${env.spec.name}” was suspended by the platform team.`, `/app/environments/${id}`)
        },

        extendEnv: (id, weeks) => {
          const env = get().environments.find((e) => e.id === id)
          if (!env) return
          const base = env.expiresAt ? new Date(env.expiresAt).getTime() : Date.now()
          patchEnv(id, {
            expiresAt: new Date(base + weeks * 7 * 86_400_000).toISOString(),
            spec: { ...env.spec, durationWeeks: env.spec.durationWeeks + weeks },
          })
          activity('environment', `${me()?.name ?? 'Someone'} extended “${env.spec.name}” by ${weeks} weeks`, env.tenantId)
        },

        deleteEnv: (id) => {
          const env = get().environments.find((e) => e.id === id)
          if (!env) return
          set((s) => ({ environments: s.environments.filter((e) => e.id !== id) }))
          activity('environment', `${me()?.name ?? 'Someone'} deleted “${env.spec.name}”`, env.tenantId)
        },

        kickProvisioning: () => {
          const user = me()
          if (!user?.tenantId) return
          const pending = get().environments.filter(
            (e) => e.tenantId === user.tenantId && e.status === 'provisioning' && !scheduledProvisioning.has(e.id),
          )
          for (const env of pending) {
            scheduledProvisioning.add(env.id)
            setTimeout(() => {
              scheduledProvisioning.delete(env.id)
              const current = get().environments.find((e) => e.id === env.id)
              if (!current || current.status !== 'provisioning') return
              patchEnv(env.id, { status: 'running' }, { status: 'running', note: 'Environment is ready' })
              set((s) => ({
                activity: [
                  { id: uid('a'), at: now(), actorId: 'system', tenantId: env.tenantId, kind: 'environment', text: `“${env.spec.name}” is now running` },
                  ...s.activity,
                ],
                notifications: [
                  { id: uid('n'), userId: env.ownerId, at: now(), text: `“${env.spec.name}” is running. Your endpoint and API key are ready.`, link: `/app/environments/${env.id}`, read: false },
                  ...s.notifications,
                ],
              }))
            }, PROVISIONING_MS)
          }
        },

        /* ---------- drafts ---------- */

        saveDraft: (spec) => {
          const id = get().currentUserId
          if (id) set((s) => ({ drafts: { ...s.drafts, [id]: spec } }))
        },

        clearDraft: () => {
          const id = get().currentUserId
          if (!id) return
          set((s) => {
            const drafts = { ...s.drafts }
            delete drafts[id]
            return { drafts }
          })
        },

        /* ---------- tenants & users ---------- */

        createTenant: (t) => {
          const id = uid('t')
          set((s) => ({
            tenants: [...s.tenants, { ...t, id, creditsUsed: 0, gpuUsed: 0, status: 'active', createdAt: now() }],
          }))
          activity('tenant', `${me()?.name} created the organisation ${t.name}`, id)
          return id
        },

        updateTenant: (id, patch) => {
          set((s) => ({ tenants: s.tenants.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
          activity('tenant', `${me()?.name} updated ${tenantName(id)}`, id)
        },

        setTenantStatus: (id, status) => {
          set((s) => ({
            tenants: s.tenants.map((t) => (t.id === id ? { ...t, status } : t)),
            environments:
              status === 'suspended'
                ? s.environments.map((e) =>
                    e.tenantId === id && (e.status === 'running' || e.status === 'provisioning')
                      ? {
                          ...e,
                          status: 'stopped',
                          timeline: [...e.timeline, { status: 'stopped', at: now(), note: 'Stopped because the organisation was suspended' }],
                        }
                      : e,
                  )
                : s.environments,
          }))
          activity('tenant', `${me()?.name} ${status === 'suspended' ? 'suspended' : 'reactivated'} ${tenantName(id)}`, id)
          notify(
            get().users.filter((u) => u.tenantId === id).map((u) => u.id),
            status === 'suspended'
              ? `${tenantName(id)} has been suspended. Running environments were stopped.`
              : `${tenantName(id)} has been reactivated. You can start your environments again.`,
            '/app',
          )
        },

        createUser: (u) => {
          const id = uid('u')
          set((s) => ({ users: [...s.users, { ...u, id, status: 'active', lastActiveAt: now() }] }))
          activity('user', `${me()?.name} added ${u.name}${u.tenantId ? ` to ${tenantName(u.tenantId)}` : ' as an admin'}`, u.tenantId)
          return id
        },

        setUserStatus: (id, status) => {
          const user = get().users.find((u) => u.id === id)
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, status } : u)) }))
          activity('user', `${me()?.name} ${status === 'deactivated' ? 'deactivated' : 'reactivated'} ${user?.name}`, user?.tenantId ?? null)
        },

        resetPassword: (id) => {
          const user = get().users.find((u) => u.id === id)
          activity('user', `${me()?.name} sent a password reset link to ${user?.name}`, user?.tenantId ?? null)
        },

        /* ---------- catalog & providers ---------- */

        upsertCatalogItem: (item) => {
          const exists = get().catalog.some((c) => c.id === item.id)
          set((s) => ({
            catalog: exists ? s.catalog.map((c) => (c.id === item.id ? item : c)) : [...s.catalog, item],
          }))
          activity('catalog', `${me()?.name} ${exists ? 'updated' : 'added'} ${item.name} in the catalog`, null)
        },

        setCatalogStatus: (id, status) => {
          const item = get().catalog.find((c) => c.id === id)
          set((s) => ({ catalog: s.catalog.map((c) => (c.id === id ? { ...c, status } : c)) }))
          activity('catalog', `${me()?.name} marked ${item?.name} as ${status}`, null)
        },

        updateProvider: (id, patch) => {
          const p = get().providers.find((x) => x.id === id)
          set((s) => ({ providers: s.providers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          if (patch.enabled !== undefined) {
            activity('provider', `${me()?.name} ${patch.enabled ? 'enabled' : 'disabled'} ${p?.name}`, null)
          }
          if (patch.maskedKey !== undefined) {
            activity('provider', `${me()?.name} replaced the API key for ${p?.name}`, null)
          }
        },

        /* ---------- misc ---------- */

        recordActivity: (kind, text) => activity(kind, text, me()?.tenantId ?? null),

        markNotificationsRead: () => {
          const id = get().currentUserId
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === id ? { ...n, read: true } : n)) }))
        },

        markNotificationRead: (id) =>
          set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),

        resetDemo: () => {
          scheduledProvisioning.clear()
          set({ ...createSeed(), drafts: {} })
        },
      }
    },
    {
      name: 'aic-demo-state',
      version: 2,
      migrate: (persisted) => {
        const old = persisted as Partial<AppState> | undefined
        return { ...createSeed(), currentUserId: old?.currentUserId ?? null, drafts: {} } as unknown as AppState
      },
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        tenants: s.tenants,
        users: s.users,
        environments: s.environments,
        requests: s.requests,
        catalog: s.catalog,
        providers: s.providers,
        usage: s.usage,
        activity: s.activity,
        notifications: s.notifications,
        currentUserId: s.currentUserId,
        drafts: s.drafts,
      }),
    },
  ),
)

/* ---------- selectors ---------- */

export const useCurrentUser = () =>
  useAppStore((s) => s.users.find((u) => u.id === s.currentUserId) ?? null)

export const useCurrentTenant = () =>
  useAppStore((s) => {
    const u = s.users.find((x) => x.id === s.currentUserId)
    return u?.tenantId ? (s.tenants.find((t) => t.id === u.tenantId) ?? null) : null
  })

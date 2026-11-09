import { useMemo } from 'react'
import type { CatalogItem, Environment, Project, Role, User } from '@/data/types'
import { isEnabledFor, isVisibleTo } from '@/lib/suggestions'
import { fromProviderRequest, fromRequest, fromSuggestion, type RequestItem } from '@/lib/requestItems'
import { useAppStore, useCurrentUser, useSessionStore } from './useAppStore'

export interface Scope {
  user: User
  role: Role
  /** null = every tenant (Super Admin with "All tenants"). */
  tenantId: string | null
}

export function useScope(): Scope | null {
  const user = useCurrentUser()
  const filter = useSessionStore((s) => s.tenantFilter)
  return useMemo(() => {
    if (!user) return null
    if (user.role === 'super_admin') return { user, role: user.role, tenantId: filter === 'all' ? null : filter }
    return { user, role: user.role, tenantId: user.tenantId }
  }, [user, filter])
}

const inTenant = (scope: Scope, tenantId: string) => scope.tenantId === null || scope.tenantId === tenantId

/** Real tenants (never the system tenant), narrowed by the Super Admin filter. */
export function useVisibleTenants(ignoreFilter = false) {
  const scope = useScope()
  const tenants = useAppStore((s) => s.tenants)
  return useMemo(
    () =>
      tenants.filter((t) => {
        if (t.isSystem || !scope) return false
        if (scope.role !== 'super_admin') return t.id === scope.user.tenantId
        return ignoreFilter || inTenant(scope, t.id)
      }),
    [tenants, scope, ignoreFilter],
  )
}

/**
 * `hostedProjectIds`: projects on the environment (linked through deployments; may be none).
 * Members of any of them can see it, and so can its owner.
 */
export function canSeeEnvironment(scope: Scope, env: Environment, memberProjectIds: string[], hostedProjectIds: string[] = []) {
  if (scope.role === 'super_admin') return true
  if (env.tenantId !== scope.user.tenantId) return false
  if (scope.role === 'tenant_admin') return true
  const inProject = hostedProjectIds.some((p) => memberProjectIds.includes(p))
  // QA Engineers see Active environments in the projects they test, read-only.
  if (scope.role === 'qa') return env.status === 'active' && inProject
  return env.ownerId === scope.user.id || inProject
}

/** Project ids deployed on each environment. */
export function useHostedProjectIds() {
  const deployments = useAppStore((s) => s.deployments)
  return useMemo(() => {
    const map = new Map<string, string[]>()
    for (const d of deployments) map.set(d.envId, [...(map.get(d.envId) ?? []), d.projectId])
    return map
  }, [deployments])
}

export function useEnvDeployments(envId: string | undefined) {
  const deployments = useAppStore((s) => s.deployments)
  return useMemo(() => deployments.filter((d) => d.envId === envId), [deployments, envId])
}

/** Projects the current QA Engineer tests: assigned ones, or the whole tenant when allowed and switched on. */
export function qaProjectIds(user: User, projects: Project[], tenantWide: boolean) {
  const inTenant = projects.filter((p) => p.tenantId === user.tenantId && p.status === 'active')
  if (user.qa?.tenantWideAllowed && tenantWide) return inTenant.map((p) => p.id)
  return inTenant.filter((p) => user.qa?.projectIds.includes(p.id)).map((p) => p.id)
}

/** Project ids the current person works in: members for Users, assigned (or tenant-wide) for QA. */
export function useMemberProjectIds() {
  const scope = useScope()
  const projects = useAppStore((s) => s.projects)
  const tenantWide = useSessionStore((s) => s.qaTenantWide)
  return useMemo(() => {
    if (!scope) return []
    if (scope.role === 'qa') return qaProjectIds(scope.user, projects, tenantWide)
    return projects.filter((p) => p.tenantId === scope.user.tenantId && (p.memberIds.includes(scope.user.id) || p.ownerId === scope.user.id)).map((p) => p.id)
  }, [projects, scope, tenantWide])
}

export function useScopedEnvironments(includeTerminated = false) {
  const scope = useScope()
  const envs = useAppStore((s) => s.environments)
  const memberOf = useMemberProjectIds()
  const hosted = useHostedProjectIds()
  return useMemo(
    () =>
      scope
        ? envs.filter((e) => (includeTerminated || e.status !== 'terminated') && inTenant(scope, e.tenantId) && canSeeEnvironment(scope, e, memberOf, hosted.get(e.id)))
        : [],
    [envs, scope, memberOf, hosted, includeTerminated],
  )
}

export function useScopedRequests() {
  const scope = useScope()
  const requests = useAppStore((s) => s.requests)
  return useMemo(() => {
    if (!scope) return []
    return requests.filter((r) => {
      if (!inTenant(scope, r.tenantId)) return false
      if (scope.role === 'qa') return false
      if (scope.role === 'user') return r.requesterId === scope.user.id
      if (scope.role === 'tenant_admin') return r.tenantId === scope.user.tenantId && (r.status !== 'draft' || r.requesterId === scope.user.id)
      return r.status !== 'draft'
    })
  }, [requests, scope])
}

export function useScopedProjects(includeArchived = true) {
  const scope = useScope()
  const projects = useAppStore((s) => s.projects)
  const memberOf = useMemberProjectIds()
  return useMemo(() => {
    if (!scope) return []
    return projects.filter((p) => {
      if (!includeArchived && p.status === 'archived') return false
      if (!inTenant(scope, p.tenantId)) return false
      if (scope.role === 'super_admin') return true
      if (p.tenantId !== scope.user.tenantId) return false
      return scope.role === 'tenant_admin' || memberOf.includes(p.id)
    })
  }, [projects, scope, includeArchived, memberOf])
}

export function useScopedUsers() {
  const scope = useScope()
  const users = useAppStore((s) => s.users)
  return useMemo(() => {
    if (!scope) return []
    if (scope.role === 'super_admin') return users.filter((u) => scope.tenantId === null || u.tenantId === scope.tenantId)
    if (scope.role === 'tenant_admin') return users.filter((u) => u.tenantId === scope.user.tenantId)
    return []
  }, [users, scope])
}

export function useScopedAudit() {
  const scope = useScope()
  const audit = useAppStore((s) => s.audit)
  return useMemo(() => {
    if (!scope || scope.role === 'user' || scope.role === 'qa') return []
    if (scope.role === 'tenant_admin') return audit.filter((a) => a.tenantId === scope.user.tenantId)
    return audit.filter((a) => scope.tenantId === null || a.tenantId === scope.tenantId)
  }, [audit, scope])
}

export function useScopedSuggestions() {
  const scope = useScope()
  const suggestions = useAppStore((s) => s.suggestions)
  return useMemo(() => {
    if (!scope) return []
    if (scope.role === 'qa') return []
    if (scope.role === 'user') return suggestions.filter((s) => s.suggestedById === scope.user.id)
    if (scope.role === 'tenant_admin') return suggestions.filter((s) => s.tenantId === scope.user.tenantId)
    return suggestions.filter((s) => scope.tenantId === null || s.tenantId === scope.tenantId)
  }, [suggestions, scope])
}

/** Catalog items the current tenant can see (published to it), with an `enabled` flag. */
export function useTenantCatalog(): (CatalogItem & { enabled: boolean })[] {
  const scope = useScope()
  const catalog = useAppStore((s) => s.catalog)
  const tenants = useAppStore((s) => s.tenants)
  return useMemo(() => {
    if (!scope) return []
    const tenant = tenants.find((t) => t.id === scope.user.tenantId)
    if (!tenant || tenant.isSystem) return catalog.map((c) => ({ ...c, enabled: true }))
    return catalog.filter((c) => isVisibleTo(c, tenant.id)).map((c) => ({ ...c, enabled: isEnabledFor(c, tenant) }))
  }, [catalog, tenants, scope])
}

/** Environment requests and capability suggestions in one list, scoped like their own hooks. */
export function useRequestItems(): RequestItem[] {
  const requests = useScopedRequests()
  const suggestions = useScopedSuggestions()
  const providerRequests = useScopedProviderRequests()
  const providers = useAppStore((s) => s.infraProviders)
  return useMemo(
    () => [...requests.map(fromRequest), ...suggestions.map(fromSuggestion), ...providerRequests.map((r) => fromProviderRequest(r, providers))],
    [requests, suggestions, providerRequests, providers],
  )
}

/** Provider access requests: users see their own, Tenant Admins their tenant's, the Super Admin anything that reached them. */
export function useScopedProviderRequests() {
  const scope = useScope()
  const all = useAppStore((s) => s.providerRequests)
  return useMemo(() => {
    if (!scope) return []
    if (scope.role === 'qa') return []
    if (scope.role === 'user') return all.filter((r) => r.requesterId === scope.user.id)
    if (scope.role === 'tenant_admin') return all.filter((r) => r.tenantId === scope.user.tenantId)
    return all.filter((r) => inTenant(scope, r.tenantId) && r.history.some((h) => h.status === 'escalated'))
  }, [all, scope])
}

/** Everything the cost engine needs for one tenant. */
export function useCostContext(tenantId: string | undefined) {
  const providers = useAppStore((s) => s.infraProviders)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  return useMemo(() => ({ providers, catalog, tenant: tenants.find((t) => t.id === tenantId) }), [providers, catalog, tenants, tenantId])
}

/** Builds a cost context for any tenant (for lists that span tenants). */
export function useCostContexts() {
  const providers = useAppStore((s) => s.infraProviders)
  const tenants = useAppStore((s) => s.tenants)
  const catalog = useAppStore((s) => s.catalog)
  return useMemo(() => (tenantId: string) => ({ providers, catalog, tenant: tenants.find((t) => t.id === tenantId) }), [providers, catalog, tenants])
}

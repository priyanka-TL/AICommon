import { useMemo } from 'react'
import type { CatalogItem, Environment, Role, User } from '@/data/types'
import { isEnabledFor, isVisibleTo } from '@/lib/suggestions'
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

export function canSeeEnvironment(scope: Scope, env: Environment, memberProjectIds: string[]) {
  if (scope.role === 'super_admin') return true
  if (env.tenantId !== scope.user.tenantId) return false
  if (scope.role === 'tenant_admin') return true
  return env.ownerId === scope.user.id || memberProjectIds.includes(env.projectId)
}

export function useMemberProjectIds() {
  const scope = useScope()
  const projects = useAppStore((s) => s.projects)
  return useMemo(() => (scope ? projects.filter((p) => p.tenantId === scope.user.tenantId && p.memberIds.includes(scope.user.id)).map((p) => p.id) : []), [projects, scope])
}

export function useScopedEnvironments(includeTerminated = false) {
  const scope = useScope()
  const envs = useAppStore((s) => s.environments)
  const memberOf = useMemberProjectIds()
  return useMemo(
    () =>
      scope
        ? envs.filter((e) => (includeTerminated || e.status !== 'terminated') && inTenant(scope, e.tenantId) && canSeeEnvironment(scope, e, memberOf))
        : [],
    [envs, scope, memberOf, includeTerminated],
  )
}

export function useScopedRequests() {
  const scope = useScope()
  const requests = useAppStore((s) => s.requests)
  return useMemo(() => {
    if (!scope) return []
    return requests.filter((r) => {
      if (!inTenant(scope, r.tenantId)) return false
      if (scope.role === 'user') return r.requesterId === scope.user.id
      if (scope.role === 'tenant_admin') return r.tenantId === scope.user.tenantId && (r.status !== 'draft' || r.requesterId === scope.user.id)
      return r.status !== 'draft'
    })
  }, [requests, scope])
}

export function useScopedProjects(includeArchived = true) {
  const scope = useScope()
  const projects = useAppStore((s) => s.projects)
  return useMemo(() => {
    if (!scope) return []
    return projects.filter((p) => {
      if (!includeArchived && p.status === 'archived') return false
      if (!inTenant(scope, p.tenantId)) return false
      if (scope.role === 'super_admin') return true
      if (p.tenantId !== scope.user.tenantId) return false
      return scope.role === 'tenant_admin' || p.memberIds.includes(scope.user.id)
    })
  }, [projects, scope, includeArchived])
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
    if (!scope || scope.role === 'user') return []
    if (scope.role === 'tenant_admin') return audit.filter((a) => a.tenantId === scope.user.tenantId)
    return audit.filter((a) => scope.tenantId === null || a.tenantId === scope.tenantId)
  }, [audit, scope])
}

export function useScopedSuggestions() {
  const scope = useScope()
  const suggestions = useAppStore((s) => s.suggestions)
  return useMemo(() => {
    if (!scope) return []
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

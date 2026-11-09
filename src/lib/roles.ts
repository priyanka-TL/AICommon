import type { Project, Role, User } from '@/data/types'

/** Tenant Admin or Super Admin: the roles that manage and approve. */
export const isAdmin = (role: Role) => role === 'tenant_admin' || role === 'super_admin'

/** Edit a project: its owner, members with edit rights, the Tenant Admin of its organisation, or the Super Admin. */
export function canEditProject(user: Pick<User, 'id' | 'role' | 'tenantId'> | null | undefined, project: Pick<Project, 'ownerId' | 'memberIds' | 'memberAccess' | 'tenantId'>) {
  if (!user) return false
  if (user.role === 'super_admin') return true
  if (user.tenantId !== project.tenantId) return false
  if (user.role === 'tenant_admin' || project.ownerId === user.id) return true
  return project.memberIds.includes(user.id) && project.memberAccess[user.id] === 'editor'
}

/** See a project: anyone who can edit it, plus its viewers and (in their tenant) QA Engineers assigned to it. */
export function canViewProject(user: Pick<User, 'id' | 'role' | 'tenantId' | 'qa'> | null | undefined, project: Pick<Project, 'id' | 'ownerId' | 'memberIds' | 'memberAccess' | 'tenantId'>) {
  if (!user) return false
  if (canEditProject(user, project)) return true
  if (user.tenantId !== project.tenantId) return false
  if (user.role === 'qa') return !!user.qa?.tenantWideAllowed || !!user.qa?.projectIds.includes(project.id)
  return project.memberIds.includes(user.id)
}

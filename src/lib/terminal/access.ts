import type { Deployment, Environment, Project, User } from '@/data/types'
import { canManageEnvProjects } from '@/lib/deploy'

export type TerminalAccess = { allowed: false; reason: string } | { allowed: true; readOnly: boolean }

export const terminalPath = (envId: string) => `/environments/${envId}/terminal`

/**
 * Who may open the simulated terminal: the owner, members of a project on the environment,
 * the Tenant Admin and the Super Admin. QA Engineers assigned to a project on it get read-only access.
 * Only Active environments accept a session.
 */
export function terminalAccess(user: User, env: Environment, projects: Project[], deployments: Pick<Deployment, 'envId' | 'projectId'>[]): TerminalAccess {
  const projectIds = new Set(deployments.filter((d) => d.envId === env.id).map((d) => d.projectId))
  let readOnly = false
  if (canManageEnvProjects(user, env)) {
    readOnly = false
  } else if (user.tenantId !== env.tenantId) {
    return { allowed: false, reason: 'This environment belongs to another organisation.' }
  } else if (user.role === 'user') {
    const member = env.ownerId === user.id || projects.some((p) => projectIds.has(p.id) && (p.memberIds.includes(user.id) || p.ownerId === user.id))
    if (!member) return { allowed: false, reason: 'Only the owner, members of a project on this environment and admins can open a terminal.' }
  } else if (user.role === 'qa') {
    const assigned = !!env.accessUserIds?.includes(user.id) || projects.some((p) => projectIds.has(p.id) && p.status === 'active' && (user.qa?.tenantWideAllowed || user.qa?.projectIds.includes(p.id)))
    if (!assigned) return { allowed: false, reason: 'You aren’t assigned to a project on this environment.' }
    readOnly = true
  } else {
    return { allowed: false, reason: 'You can’t open a terminal on this environment.' }
  }
  if (env.status !== 'active') {
    const why: Partial<Record<Environment['status'], string>> = {
      stopped: 'The environment is stopped. Start it to open a terminal.',
      suspended: 'The environment is suspended, so terminal sessions are closed.',
      provisioning: 'The environment is still being set up.',
      provisioning_failed: 'Provisioning failed, so there is no machine to connect to.',
      terminated: 'The environment has been terminated.',
    }
    return { allowed: false, reason: why[env.status] ?? 'The terminal is only available for Active environments.' }
  }
  return { allowed: true, readOnly }
}

import type { Environment, User } from '@/data/types'

/** Owner id used for tenant-owned environments: no single owner; managed by the Tenant Admin. */
export const TENANT_OWNER = 'tenant'

export const isTenantOwned = (env: Pick<Environment, 'ownerId'>) => env.ownerId === TENANT_OWNER

export function ownerLabel(env: Pick<Environment, 'ownerId'>, users: Pick<User, 'id' | 'name'>[]) {
  if (isTenantOwned(env)) return 'Tenant-owned'
  return users.find((u) => u.id === env.ownerId)?.name ?? ''
}

/** Has this person been given access to the environment (beyond owning it)? */
export const hasAccess = (env: Pick<Environment, 'accessUserIds'>, userId: string) => !!env.accessUserIds?.includes(userId)

/** Suffix used when creating several identical environments: -01, -02… */
export const batchName = (name: string, i: number, count: number) => (count > 1 ? `${name}-${String(i + 1).padStart(2, '0')}` : name)

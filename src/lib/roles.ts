import type { Role } from '@/data/types'

/** Tenant Admin or Super Admin: the roles that manage and approve. */
export const isAdmin = (role: Role) => role === 'tenant_admin' || role === 'super_admin'

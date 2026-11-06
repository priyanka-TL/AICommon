import type { Role } from '@/data/types'

export const BASE: Record<Role, string> = {
  super_admin: '/super-admin',
  tenant_admin: '/tenant-admin',
  user: '/app',
}

export const homeFor = (role: Role) => BASE[role]
export const requestsPath = (role: Role) => `${BASE[role]}/requests`
export const requestPath = (role: Role, id: string) => `${BASE[role]}/requests/${id}`
export const envListPath = (role: Role) => (role === 'user' ? '/app' : `${BASE[role]}/infrastructure`)
export const envPath = (role: Role, id: string) => (role === 'user' ? `/app/environments/${id}` : `${BASE[role]}/infrastructure/${id}`)
export const newEnvPath = (role: Role) => (role === 'user' ? '/app/environments/new' : `${BASE[role]}/infrastructure/new`)
export const editEnvPath = (role: Role, id: string) => `${envPath(role, id)}/edit`
/** Opens the wizard on an existing draft or changes-requested request. */
export const continueRequestPath = (role: Role, requestId: string) => `${newEnvPath(role)}?request=${requestId}`
export const itemPath = (role: Role, id: string) =>
  role === 'user' ? `/app/catalog/${id}` : role === 'tenant_admin' ? `/tenant-admin/capabilities?item=${id}` : `/super-admin/registry?item=${id}`
export const suggestionsPath = (role: Role) => (role === 'user' ? '/app/catalog?tab=suggestions' : `${BASE[role]}/suggestions`)
export const monitoringPath = (role: Role) => `${BASE[role]}/monitoring`

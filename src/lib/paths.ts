import type { Role } from '@/data/types'

export const BASE: Record<Role, string> = {
  super_admin: '/super-admin',
  tenant_admin: '/tenant-admin',
  user: '/app',
  qa: '/qa',
}

export const homeFor = (role: Role) => BASE[role]
export const requestsPath = (role: Role) => `${BASE[role]}/requests`
export const requestPath = (role: Role, id: string) => `${BASE[role]}/requests/${id}`
export const envListPath = (role: Role) => (role === 'user' ? '/app' : role === 'qa' ? '/qa' : `${BASE[role]}/infrastructure`)
export const envPath = (role: Role, id: string) =>
  role === 'user' ? `/app/environments/${id}` : role === 'qa' ? `/qa/environments/${id}` : `${BASE[role]}/infrastructure/${id}`
export const newEnvPath = (role: Role) => (role === 'user' ? '/app/environments/new' : role === 'qa' ? '/qa' : `${BASE[role]}/infrastructure/new`)
export const editEnvPath = (role: Role, id: string) => `${envPath(role, id)}/edit`
/** Opens the wizard on an existing draft or changes-requested request. */
export const continueRequestPath = (role: Role, requestId: string) => `${newEnvPath(role)}?request=${requestId}`
export const itemPath = (role: Role, id: string) =>
  role === 'user' ? `/app/catalog/${id}` : role === 'qa' ? `/qa/catalog/${id}` : role === 'tenant_admin' ? `/tenant-admin/capabilities?item=${id}` : `/super-admin/registry?item=${id}`
export const suggestionsPath = (role: Role) => (role === 'qa' ? '/qa' : `${BASE[role]}/requests?type=capability`)
/** A user's suggestion opens its own page; admins review it in the Requests queue drawer. */
export const suggestionPath = (role: Role, id: string) => (role === 'user' ? `/app/suggestions/${id}` : role === 'qa' ? '/qa' : `${BASE[role]}/requests?type=capability&id=${id}`)
export const monitoringPath = (role: Role) => `${BASE[role]}/monitoring`
export const reportPath = (role: Role, id: string) => (role === 'qa' ? `/qa/reports/${id}` : `${BASE[role]}/reports/${id}`)
/** Role-neutral link to share inside a tenant; it redirects to the viewer's own report path. */
export const sharedReportPath = (id: string) => `/reports/${id}`
export const providerRequestPath = (role: Role, id: string) => (role === 'qa' ? '/qa' : `${BASE[role]}/provider-requests/${id}`)

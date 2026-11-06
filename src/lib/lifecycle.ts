import type { Environment, EnvRequest, EnvStatus, LifecycleStatus, RequestStatus, User } from '@/data/types'

/** Who may perform a transition. 'owner' = the requester (requests) or owner (environments). */
export type Party = 'owner' | 'tenant_admin' | 'super_admin' | 'system'

export interface Transition<S extends LifecycleStatus = LifecycleStatus> {
  from: S
  to: S
  by: Party[]
  label: string
  requires?: 'reason' | 'comment'
  tone: 'primary' | 'secondary' | 'destructive'
}

export const REQUEST_TRANSITIONS: Transition<RequestStatus>[] = [
  { from: 'draft', to: 'submitted', by: ['owner'], label: 'Submit request', tone: 'primary' },
  { from: 'draft', to: 'cancelled', by: ['owner'], label: 'Discard draft', tone: 'destructive' },
  { from: 'submitted', to: 'under_review', by: ['system'], label: 'Start review', tone: 'secondary' },
  { from: 'submitted', to: 'escalated', by: ['system'], label: 'Send to Super Admin', tone: 'secondary' },
  { from: 'submitted', to: 'cancelled', by: ['owner'], label: 'Withdraw request', tone: 'destructive' },
  { from: 'resubmitted', to: 'under_review', by: ['system'], label: 'Start review', tone: 'secondary' },
  { from: 'resubmitted', to: 'escalated', by: ['system'], label: 'Send to Super Admin', tone: 'secondary' },
  { from: 'resubmitted', to: 'cancelled', by: ['owner'], label: 'Withdraw request', tone: 'destructive' },
  { from: 'under_review', to: 'escalated', by: ['tenant_admin'], label: 'Forward to Super Admin', tone: 'primary' },
  { from: 'under_review', to: 'changes_requested', by: ['tenant_admin'], label: 'Request changes', requires: 'comment', tone: 'secondary' },
  { from: 'under_review', to: 'rejected', by: ['tenant_admin'], label: 'Reject', requires: 'reason', tone: 'destructive' },
  { from: 'escalated', to: 'approved', by: ['super_admin'], label: 'Approve request', tone: 'primary' },
  { from: 'escalated', to: 'changes_requested', by: ['super_admin'], label: 'Request changes', requires: 'comment', tone: 'secondary' },
  { from: 'escalated', to: 'rejected', by: ['super_admin'], label: 'Reject', requires: 'reason', tone: 'destructive' },
  { from: 'changes_requested', to: 'resubmitted', by: ['owner'], label: 'Edit & resubmit', tone: 'primary' },
  { from: 'changes_requested', to: 'cancelled', by: ['owner'], label: 'Cancel request', tone: 'destructive' },
]

export const ENV_TRANSITIONS: Transition<EnvStatus>[] = [
  { from: 'provisioning', to: 'active', by: ['system'], label: 'Mark active', tone: 'primary' },
  { from: 'provisioning', to: 'provisioning_failed', by: ['system'], label: 'Mark failed', tone: 'destructive' },
  { from: 'provisioning_failed', to: 'provisioning', by: ['tenant_admin', 'super_admin'], label: 'Retry provisioning', tone: 'primary' },
  { from: 'provisioning_failed', to: 'terminated', by: ['tenant_admin', 'super_admin'], label: 'Terminate', tone: 'destructive' },
  { from: 'active', to: 'stopped', by: ['owner', 'tenant_admin', 'super_admin'], label: 'Stop', tone: 'secondary' },
  { from: 'active', to: 'suspended', by: ['super_admin'], label: 'Suspend', requires: 'reason', tone: 'destructive' },
  { from: 'active', to: 'terminated', by: ['owner', 'tenant_admin', 'super_admin'], label: 'Terminate', tone: 'destructive' },
  { from: 'stopped', to: 'active', by: ['owner', 'tenant_admin', 'super_admin'], label: 'Start', tone: 'primary' },
  { from: 'stopped', to: 'terminated', by: ['owner', 'tenant_admin', 'super_admin'], label: 'Terminate', tone: 'destructive' },
  { from: 'suspended', to: 'active', by: ['super_admin'], label: 'Resume', tone: 'primary' },
  { from: 'suspended', to: 'terminated', by: ['tenant_admin', 'super_admin'], label: 'Terminate', tone: 'destructive' },
]

export const REQUEST_STATUSES: RequestStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'resubmitted',
  'escalated',
  'approved',
  'rejected',
  'cancelled',
]

export const FINAL_REQUEST: RequestStatus[] = ['approved', 'rejected', 'cancelled']
export const OPEN_REQUEST: RequestStatus[] = ['submitted', 'under_review', 'changes_requested', 'resubmitted', 'escalated']
export const FAILURE_STATUSES: LifecycleStatus[] = ['rejected', 'provisioning_failed', 'cancelled', 'terminated']

export function partiesFor(user: User, ownerId: string, tenantId: string): Party[] {
  const parties: Party[] = []
  if (user.role === 'super_admin') parties.push('super_admin')
  if (user.role === 'tenant_admin' && user.tenantId === tenantId) parties.push('tenant_admin')
  if (user.id === ownerId && user.tenantId === tenantId) parties.push('owner')
  return parties
}

export function requestActions(req: EnvRequest, user: User) {
  const parties = partiesFor(user, req.requesterId, req.tenantId)
  return REQUEST_TRANSITIONS.filter((t) => t.from === req.status && t.by.some((p) => parties.includes(p)))
}

export function envActions(env: Environment, user: User) {
  const parties = partiesFor(user, env.ownerId, env.tenantId)
  return ENV_TRANSITIONS.filter((t) => t.from === env.status && t.by.some((p) => parties.includes(p)))
}

export function findTransition(kind: 'request' | 'env', from: LifecycleStatus, to: LifecycleStatus) {
  const table: Transition[] = kind === 'request' ? REQUEST_TRANSITIONS : ENV_TRANSITIONS
  return table.find((t) => t.from === from && t.to === to)
}

export function canTransition(kind: 'request' | 'env', from: LifecycleStatus, to: LifecycleStatus, parties: Party[]) {
  const t = findTransition(kind, from, to)
  return !!t && t.by.some((p) => parties.includes(p))
}

/** Happy-path order used to draw future steps on timelines. */
export const REQUEST_PATH: LifecycleStatus[] = ['submitted', 'under_review', 'escalated', 'approved', 'provisioning', 'active']

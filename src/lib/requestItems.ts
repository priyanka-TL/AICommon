import type { EnvRequest, InfraProvider, ProviderRequest, ProviderRequestStatus, RequestStatus, Role, Suggestion, SuggestionStatus } from '@/data/types'
import { STATUS_LABELS, SUGGESTION_LABELS } from '@/lib/labels'
import { REQUEST_STATUSES } from '@/lib/lifecycle'

export type RequestType = 'environment' | 'capability' | 'provider'
export type TypeFilter = 'all' | RequestType
export type SortKey = 'updated' | 'submitted' | 'status'
export type AnyStatus = RequestStatus | SuggestionStatus | ProviderRequestStatus

interface Base {
  id: string
  name: string
  tenantId: string
  requesterId: string
  projectId: string | null
  /** Environment requests can name several projects, or none. */
  projectIds?: string[]
  repo: string | null
  submittedAt: string
  updatedAt: string
  status: AnyStatus
  reviewerComment: { actorId: string; text: string } | null
}

export type RequestItem =
  | (Base & { type: 'environment'; source: EnvRequest })
  | (Base & { type: 'capability'; source: Suggestion })
  | (Base & { type: 'provider'; source: ProviderRequest })

const latestReviewerComment = (history: { actorId: string; comment?: string }[], requesterId: string) => {
  const h = [...history].reverse().find((e) => e.comment && e.actorId !== requesterId)
  return h ? { actorId: h.actorId, text: h.comment! } : null
}

export function fromRequest(r: EnvRequest): RequestItem {
  return {
    type: 'environment',
    id: r.id,
    name: r.spec.name,
    tenantId: r.tenantId,
    requesterId: r.requesterId,
    projectId: r.spec.projectIds[0] ?? null,
    projectIds: r.spec.projectIds,
    repo: null,
    submittedAt: r.history.find((h) => h.status === 'submitted')?.at ?? r.createdAt,
    updatedAt: r.updatedAt,
    status: r.status,
    reviewerComment: latestReviewerComment(r.history, r.requesterId),
    source: r,
  }
}

export function fromSuggestion(s: Suggestion): RequestItem {
  return {
    type: 'capability',
    id: s.id,
    name: s.name,
    tenantId: s.tenantId,
    requesterId: s.suggestedById,
    projectId: null,
    repo: s.githubUrl.replace(/^https?:\/\//, ''),
    submittedAt: s.createdAt,
    updatedAt: s.history[s.history.length - 1]?.at ?? s.createdAt,
    status: s.status,
    reviewerComment: latestReviewerComment(s.history, s.suggestedById),
    source: s,
  }
}

export function fromProviderRequest(r: ProviderRequest, providers: InfraProvider[]): RequestItem {
  const p = providers.find((x) => x.id === r.providerId)
  return {
    type: 'provider',
    id: r.id,
    name: p ? `${p.name} access` : 'Provider access',
    tenantId: r.tenantId,
    requesterId: r.requesterId,
    projectId: null,
    repo: p ? p.regions.filter((x) => r.regionIds.includes(x.id)).map((x) => x.name).join(', ') : null,
    submittedAt: r.createdAt,
    updatedAt: r.updatedAt,
    status: r.status,
    reviewerComment: latestReviewerComment(r.history, r.requesterId),
    source: r,
  }
}

export const PROVIDER_REQUEST_LABELS: Record<ProviderRequestStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  escalated: 'With Super Admin',
  changes_requested: 'Changes requested',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Rejected',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
}

export const TYPE_LABELS: Record<RequestType, string> = { environment: 'Environment', capability: 'Capability', provider: 'Provider' }

const SUGGESTION_STATUSES = Object.keys(SUGGESTION_LABELS) as SuggestionStatus[]

/** Statuses that are valid for the selected type. Admins never see drafts. */
export function statusOptions(type: TypeFilter, role: Role): { value: AnyStatus; label: string }[] {
  const env = REQUEST_STATUSES.filter((s) => role === 'user' || s !== 'draft').map((s) => ({ value: s as AnyStatus, label: STATUS_LABELS[s] }))
  const cap = SUGGESTION_STATUSES.map((s) => ({ value: s as AnyStatus, label: SUGGESTION_LABELS[s] }))
  if (type === 'environment') return env
  const prov = (Object.keys(PROVIDER_REQUEST_LABELS) as ProviderRequestStatus[]).map((s) => ({ value: s as AnyStatus, label: PROVIDER_REQUEST_LABELS[s] }))
  if (type === 'capability') return cap
  if (type === 'provider') return prov
  const seen = new Set<string>()
  return [...env, ...cap, ...prov].filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
}

/** Lower comes first: waiting on the requester, then in review, then decided. */
const STATUS_RANK: Record<AnyStatus, number> = {
  changes_requested: 0,
  needs_info: 0,
  draft: 1,
  escalated: 2,
  submitted: 3,
  resubmitted: 3,
  under_review: 3,
  approved_tenant: 4,
  approved: 5,
  published: 5,
  rejected: 6,
  revoked: 6,
  cancelled: 7,
}

export interface RequestFilters {
  type: TypeFilter
  statuses: AnyStatus[]
  project: string
  from: string
  to: string
  q: string
  sort: SortKey
}

/** Filters that apply regardless of type (used for the per-type counts). */
export function filterCommon(items: RequestItem[], f: RequestFilters, extraSearch?: (i: RequestItem) => string[]) {
  const q = f.q.trim().toLowerCase()
  return items.filter((i) => {
    if (f.project && !(i.projectIds ?? (i.projectId ? [i.projectId] : [])).includes(f.project)) return false
    const day = i.submittedAt.slice(0, 10)
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
    if (q && ![i.name, i.id, i.repo ?? '', ...(extraSearch?.(i) ?? [])].some((s) => s.toLowerCase().includes(q))) return false
    return true
  })
}

export function filterItems(items: RequestItem[], f: RequestFilters, extraSearch?: (i: RequestItem) => string[]) {
  return filterCommon(items, f, extraSearch).filter((i) => (f.type === 'all' || i.type === f.type) && (!f.statuses.length || f.statuses.includes(i.status)))
}

export function sortItems(items: RequestItem[], sort: SortKey) {
  const byUpdated = (a: RequestItem, b: RequestItem) => b.updatedAt.localeCompare(a.updatedAt)
  return [...items].sort((a, b) => {
    if (sort === 'submitted') return b.submittedAt.localeCompare(a.submittedAt)
    if (sort === 'status') return STATUS_RANK[a.status] - STATUS_RANK[b.status] || byUpdated(a, b)
    return byUpdated(a, b)
  })
}

import { cn } from '@/lib/utils'
import type { DeploymentStatus, LifecycleStatus, ProviderRequestStatus, SuggestionStatus } from '@/data/types'
import { DEPLOYMENT_STATUS_LABELS } from '@/lib/deploy'
import { STATUS_LABELS, SUGGESTION_LABELS } from '@/lib/labels'

export type BadgeStatus = LifecycleStatus | 'over-quota' | Exclude<DeploymentStatus, 'stopped'>

type Style = { pill: string; dot: string }

const NEUTRAL: Style = { pill: 'bg-status-stopped-bg text-status-stopped-fg', dot: 'bg-stopped-dot' }
const BLUE: Style = { pill: 'bg-status-provisioning-bg text-status-provisioning-fg', dot: 'bg-blue' }
const RED: Style = { pill: 'bg-status-rejected-bg text-status-rejected-fg', dot: 'bg-red' }

const styles: Record<BadgeStatus, Style> = {
  draft: NEUTRAL,
  submitted: BLUE,
  under_review: { pill: 'bg-status-review-bg text-status-review-fg', dot: 'bg-purple' },
  changes_requested: { pill: 'bg-status-change-bg text-status-change-fg', dot: 'bg-purple' },
  resubmitted: BLUE,
  escalated: { pill: 'bg-status-over-bg text-status-over-fg', dot: 'bg-vermilion' },
  approved: { pill: 'bg-status-approved-bg text-status-approved-fg', dot: 'bg-indigo dark:bg-indigo-text' },
  rejected: RED,
  cancelled: NEUTRAL,
  provisioning: { pill: BLUE.pill, dot: 'bg-blue animate-pulse-dot' },
  active: { pill: 'bg-status-running-bg text-status-running-fg', dot: 'bg-teal' },
  stopped: NEUTRAL,
  suspended: { pill: 'bg-status-pending-bg text-status-pending-fg', dot: 'bg-tangerine' },
  provisioning_failed: RED,
  terminated: { pill: 'bg-status-terminated-bg text-status-terminated-fg', dot: 'bg-border-strong' },
  'over-quota': { pill: 'bg-status-over-bg text-status-over-fg', dot: 'bg-vermilion' },
  not_deployed: NEUTRAL,
  deploying: { pill: BLUE.pill, dot: 'bg-blue animate-pulse-dot' },
  running: { pill: 'bg-status-running-bg text-status-running-fg', dot: 'bg-teal' },
  failed: RED,
}

const DEPLOY_KEYS = new Set<string>(['not_deployed', 'deploying', 'running', 'failed'])

export function StatusBadge({ status, label, className }: { status: BadgeStatus; label?: string; className?: string }) {
  const s = styles[status]
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', s.pill, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {label ?? (status === 'over-quota' ? 'Over quota' : DEPLOY_KEYS.has(status) ? DEPLOYMENT_STATUS_LABELS[status as DeploymentStatus] : STATUS_LABELS[status as LifecycleStatus])}
    </span>
  )
}

const SUGGESTION_STYLE: Record<SuggestionStatus, BadgeStatus> = {
  submitted: 'submitted',
  under_review: 'under_review',
  needs_info: 'changes_requested',
  approved_tenant: 'approved',
  published: 'active',
  rejected: 'rejected',
}

export function SuggestionBadge({ status, forwarded }: { status: SuggestionStatus; forwarded?: boolean }) {
  return <StatusBadge status={SUGGESTION_STYLE[status]} label={status === 'under_review' && forwarded ? 'With Super Admin' : SUGGESTION_LABELS[status]} />
}

export function ActiveBadge({ active, inactiveLabel }: { active: boolean; inactiveLabel: string }) {
  return active ? <StatusBadge status="active" /> : <StatusBadge status="stopped" label={inactiveLabel} />
}

export function HealthBadge({ health }: { health: 'healthy' | 'degraded' | 'down' }) {
  if (health === 'healthy') return <StatusBadge status="active" label="Healthy" />
  if (health === 'degraded') return <StatusBadge status="suspended" label="Degraded" />
  return <StatusBadge status="rejected" label="Down" />
}

export function CatalogStatusBadge({ status }: { status: 'active' | 'beta' | 'deprecated' }) {
  if (status === 'active') return <StatusBadge status="active" />
  if (status === 'beta') return <StatusBadge status="approved" label="Beta" />
  return <StatusBadge status="stopped" label="Deprecated" />
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-6 max-w-full truncate whitespace-nowrap rounded-full border border-border bg-bg-surface px-2.5 align-middle text-xs font-semibold leading-[22px] text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}

const PROVIDER_REQUEST_STYLE: Record<ProviderRequestStatus, [BadgeStatus, string]> = {
  submitted: ['submitted', 'Submitted'],
  under_review: ['under_review', 'Under review'],
  escalated: ['escalated', 'With Super Admin'],
  changes_requested: ['changes_requested', 'Changes requested'],
  resubmitted: ['resubmitted', 'Resubmitted'],
  approved: ['approved', 'Approved'],
  rejected: ['rejected', 'Rejected'],
  revoked: ['stopped', 'Revoked'],
  cancelled: ['cancelled', 'Cancelled'],
}

export function ProviderRequestBadge({ status, className }: { status: ProviderRequestStatus; className?: string }) {
  const [style, label] = PROVIDER_REQUEST_STYLE[status]
  return <StatusBadge status={style} label={label} className={className} />
}

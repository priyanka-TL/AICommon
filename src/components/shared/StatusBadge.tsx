import { cn } from '@/lib/utils'
import type { EnvStatus } from '@/data/types'

export type BadgeStatus = EnvStatus | 'change-requested' | 'over-quota'

const styles: Record<BadgeStatus, { label: string; pill: string; dot: string }> = {
  pending: { label: 'Pending', pill: 'bg-status-pending-bg text-status-pending-fg', dot: 'bg-tangerine' },
  approved: { label: 'Approved', pill: 'bg-status-approved-bg text-status-approved-fg', dot: 'bg-indigo dark:bg-indigo-text' },
  provisioning: { label: 'Provisioning', pill: 'bg-status-provisioning-bg text-status-provisioning-fg', dot: 'bg-blue animate-pulse-dot' },
  running: { label: 'Running', pill: 'bg-status-running-bg text-status-running-fg', dot: 'bg-teal' },
  stopped: { label: 'Stopped', pill: 'bg-status-stopped-bg text-status-stopped-fg', dot: 'bg-stopped-dot' },
  rejected: { label: 'Rejected', pill: 'bg-status-rejected-bg text-status-rejected-fg', dot: 'bg-red' },
  'change-requested': { label: 'Change requested', pill: 'bg-status-change-bg text-status-change-fg', dot: 'bg-purple' },
  'over-quota': { label: 'Over quota', pill: 'bg-status-over-bg text-status-over-fg', dot: 'bg-vermilion' },
}

export function StatusBadge({ status, label, className }: { status: BadgeStatus; label?: string; className?: string }) {
  const s = styles[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
        s.pill,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  )
}

export function ActiveBadge({ active, inactiveLabel }: { active: boolean; inactiveLabel: string }) {
  return active ? <StatusBadge status="running" label="Active" /> : <StatusBadge status="stopped" label={inactiveLabel} />
}

export function HealthBadge({ health }: { health: 'healthy' | 'degraded' | 'down' }) {
  if (health === 'healthy') return <StatusBadge status="running" label="Healthy" />
  if (health === 'degraded') return <StatusBadge status="pending" label="Degraded" />
  return <StatusBadge status="rejected" label="Down" />
}

export function CatalogStatusBadge({ status }: { status: 'active' | 'beta' | 'deprecated' }) {
  if (status === 'active') return <StatusBadge status="running" label="Active" />
  if (status === 'beta') return <StatusBadge status="approved" label="Beta" />
  return <StatusBadge status="stopped" label="Deprecated" />
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-full border border-border bg-bg-surface px-2.5 text-xs font-semibold text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}

import { Check, X } from 'lucide-react'
import type { Environment, EnvRequest, LifecycleEvent, LifecycleStatus, User } from '@/data/types'
import { FAILURE_STATUSES } from '@/lib/lifecycle'
import { formatDateTime } from '@/lib/format'
import { roleLabel, STATUS_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { Tooltip } from '@/components/ui/tooltip'

const SETTLED: LifecycleStatus[] = ['active', 'stopped', 'suspended', 'terminated', 'provisioning_failed', 'rejected', 'cancelled']

export function mergedHistory(request?: EnvRequest | null, env?: Environment | null): LifecycleEvent[] {
  return [...(request?.history ?? []), ...(env?.history ?? [])]
}

export function futureSteps(events: LifecycleEvent[], request?: EnvRequest | null): LifecycleStatus[] {
  const last = events[events.length - 1]?.status
  if (!last || SETTLED.includes(last)) return []
  const tenantAdminRaised = request?.raisedByRole === 'tenant_admin'
  const tail: LifecycleStatus[] = request?.kind === 'change' ? ['approved'] : ['approved', 'provisioning', 'active']
  const review: LifecycleStatus[] = tenantAdminRaised ? ['escalated'] : ['under_review', 'escalated']
  switch (last) {
    case 'draft':
      return ['submitted', ...review, ...tail]
    case 'submitted':
    case 'resubmitted':
      return [...review, ...tail]
    case 'under_review':
      return ['escalated', ...tail]
    case 'escalated':
      return tail
    case 'changes_requested':
      return ['resubmitted', ...review, ...tail]
    case 'approved':
      return request?.kind === 'change' ? [] : ['provisioning', 'active']
    case 'provisioning':
      return ['active']
    default:
      return []
  }
}

const isFailure = (s: LifecycleStatus) => FAILURE_STATUSES.includes(s)

export function LifecycleTimeline({ events, future, users, className }: { events: LifecycleEvent[]; future: LifecycleStatus[]; users: User[]; className?: string }) {
  const name = (id: string) => (id === 'system' ? 'System' : (users.find((u) => u.id === id)?.name ?? 'Someone'))
  return (
    <ol className={cn('flex flex-col', className)} aria-label="Status history">
      {events.map((e, i) => {
        const current = i === events.length - 1
        const failed = isFailure(e.status)
        const last = current && future.length === 0
        return (
          <li key={`${e.status}-${e.at}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className="absolute left-[13px] top-8 h-[calc(100%-28px)] w-0.5 bg-indigo/40 dark:bg-indigo-text/40" aria-hidden />}
            <span
              className={cn(
                'relative z-[1] mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                failed ? 'bg-red text-white' : 'bg-indigo text-white dark:bg-indigo-text dark:text-bg-page',
                current && !failed && 'ring-4 ring-indigo/20 dark:ring-indigo-text/25',
              )}
              aria-hidden
            >
              {current && !failed && <span className="absolute inset-0 animate-ping rounded-full bg-indigo/30 dark:bg-indigo-text/30" />}
              {failed ? <X className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={e.status} />
                {current && <span className="text-caption font-semibold text-indigo-text">Current</span>}
              </div>
              <p className="mt-1 text-caption text-text-secondary">
                <span className="font-semibold text-text-primary">{name(e.actorId)}</span>
                {e.actorRole !== 'system' && <> · {roleLabel(e.actorRole)}</>} · {formatDateTime(e.at)}
              </p>
              {e.comment && <p className="mt-2 rounded-control bg-bg-subtle px-3 py-2 text-sm text-text-primary">{e.comment}</p>}
            </div>
          </li>
        )
      })}
      {future.map((s, i) => (
        <li key={`future-${s}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
          {i < future.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-28px)] w-0.5 border-l-2 border-dashed border-border-strong" aria-hidden />}
          <span className="mt-0.5 size-7 shrink-0 rounded-full border-2 border-dashed border-border-strong bg-bg-surface" aria-hidden />
          <p className="pt-1 text-sm text-text-muted">{STATUS_LABELS[s]}</p>
        </li>
      ))}
    </ol>
  )
}

export function CompactTimeline({ events, future, className }: { events: LifecycleEvent[]; future: LifecycleStatus[]; className?: string }) {
  const steps = events.filter((e, i) => i === 0 || e.status !== events[i - 1]!.status).map((e) => e.status)
  const shown = steps.length > 6 ? steps.slice(-6) : steps
  const currentIdx = shown.length - 1
  const all = [...shown, ...future.slice(0, Math.max(0, 7 - shown.length))]
  return (
    <ol className={cn('flex items-center', className)} aria-label={`Progress: ${STATUS_LABELS[shown[currentIdx]!]}`}>
      {all.map((s, i) => {
        const done = i < currentIdx
        const current = i === currentIdx
        const failed = isFailure(s) && i <= currentIdx
        return (
          <li key={`${s}-${i}`} className="flex items-center">
            {i > 0 && <span className={cn('h-0.5 w-4 sm:w-6', i <= currentIdx ? 'bg-indigo dark:bg-indigo-text' : 'bg-border-strong')} aria-hidden />}
            <Tooltip content={STATUS_LABELS[s]}>
              <span
                className={cn(
                  'relative block size-3 rounded-full',
                  failed ? 'bg-red' : done || current ? 'bg-indigo dark:bg-indigo-text' : 'border-2 border-border-strong bg-bg-surface',
                )}
              >
                {current && !failed && <span className="absolute inset-0 animate-ping rounded-full bg-indigo/40" aria-hidden />}
              </span>
            </Tooltip>
          </li>
        )
      })}
    </ol>
  )
}

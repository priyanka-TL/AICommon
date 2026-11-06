import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, PencilLine, Plus } from 'lucide-react'
import type { EnvRequest } from '@/data/types'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScopedRequests } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { relativeTime } from '@/lib/format'
import { purposeLabel } from '@/lib/labels'
import { continueRequestPath, requestPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, Tag } from '@/components/shared/StatusBadge'
import { CompactTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Filter = 'all' | 'drafts' | 'open' | 'approved' | 'closed'

const FILTERS: [Filter, string, (r: EnvRequest) => boolean][] = [
  ['all', 'All', () => true],
  ['drafts', 'Drafts', (r) => r.status === 'draft'],
  ['open', 'In progress', (r) => ['submitted', 'under_review', 'changes_requested', 'resubmitted', 'escalated'].includes(r.status)],
  ['approved', 'Approved', (r) => r.status === 'approved'],
  ['closed', 'Rejected or cancelled', (r) => r.status === 'rejected' || r.status === 'cancelled'],
]

export default function MyRequests() {
  const loading = useSimulatedLoading()
  const tenant = useCurrentTenant()!
  const requests = useScopedRequests()
  const environments = useAppStore((s) => s.environments)
  const projects = useAppStore((s) => s.projects)
  const users = useAppStore((s) => s.users)
  const [filter, setFilter] = useState<Filter>('all')

  const sorted = useMemo(() => [...requests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [requests])
  const test = FILTERS.find((f) => f[0] === filter)![2]
  const rows = sorted.filter(test)

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title="My requests"
        description="Drafts, requests in review and decisions. Open one to see its full approval timeline."
        actions={
          <Button asChild>
            <Link to="/app/environments/new">
              <Plus /> Request environment
            </Link>
          </Button>
        }
      />

      <div className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Filter requests">
        {FILTERS.map(([f, label, fn]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
              filter === f ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
            )}
          >
            {label} <span className="tabular text-text-muted">{sorted.filter(fn).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={requests.length === 0 ? 'You haven’t made any requests yet' : 'No requests here'}
            description={requests.length === 0 ? 'Request an environment and follow its review here.' : undefined}
            action={
              requests.length === 0 ? (
                <Button asChild variant="secondary">
                  <Link to="/app/environments/new">Request environment</Link>
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  Show all
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => {
            const env = r.kind === 'new' && r.envId ? environments.find((e) => e.id === r.envId) : null
            const events = mergedHistory(r, env)
            const latest = [...r.history].reverse().find((h) => h.comment && h.actorId !== r.requesterId)
            const editable = r.status === 'draft' || r.status === 'changes_requested'
            return (
              <li key={r.id} className="card flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={editable ? continueRequestPath('user', r.id) : requestPath('user', r.id)} className="font-heading text-h3 text-text-primary hover:text-indigo-text">
                        {r.spec.name}
                      </Link>
                      <Tag>{r.kind === 'new' ? 'New environment' : 'Change'}</Tag>
                    </div>
                    <p className="mt-1 text-caption text-text-secondary">
                      {projects.find((p) => p.id === r.spec.projectId)?.name} · {purposeLabel(r.spec.purpose)} · updated {relativeTime(r.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    {env && <StatusBadge status={env.status} />}
                  </div>
                </div>
                <CompactTimeline events={events} future={futureSteps(events, r)} />
                {latest && (r.status === 'changes_requested' || r.status === 'rejected' || r.status === 'escalated') && (
                  <p className={cn('rounded-control px-3 py-2 text-sm', r.status === 'rejected' ? 'bg-status-rejected-bg text-status-rejected-fg' : r.status === 'changes_requested' ? 'bg-status-change-bg text-status-change-fg' : 'bg-bg-subtle text-text-primary')}>
                    <span className="font-semibold">{users.find((u) => u.id === latest.actorId)?.name}:</span> {latest.comment}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {editable && (
                    <Button asChild variant="secondary" size="compact">
                      <Link to={continueRequestPath('user', r.id)}>
                        <PencilLine /> {r.status === 'draft' ? 'Continue draft' : 'Edit & resubmit'}
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="compact">
                    <Link to={requestPath('user', r.id)}>
                      View timeline <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

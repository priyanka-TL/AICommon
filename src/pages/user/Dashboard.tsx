import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, ServerOff } from 'lucide-react'
import type { EnvStatus } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useScopedEnvironments, useScopedRequests } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { relativeTime } from '@/lib/format'
import { STATUS_LABELS } from '@/lib/labels'
import { tenantAllocated } from '@/lib/quota'
import { continueRequestPath, requestPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { SpendThisMonth } from '@/components/shared/SpendThisMonth'
import { EmptyState } from '@/components/shared/EmptyState'
import { EnvironmentCard } from '@/components/shared/EnvironmentCard'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CompactTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_ORDER: EnvStatus[] = ['active', 'provisioning', 'provisioning_failed', 'suspended', 'stopped']

export default function UserDashboard() {
  const loading = useSimulatedLoading()
  const user = useCurrentUser()!
  const tenant = useCurrentTenant()!
  const envs = useScopedEnvironments()
  const envIds = useMemo(() => envs.map((e) => e.id), [envs])
  const myRequests = useScopedRequests()
  const allEnvs = useAppStore((s) => s.environments)
  const requests = useAppStore((s) => s.requests)
  const users = useAppStore((s) => s.users)
  const projects = useAppStore((s) => s.projects)
  const catalog = useAppStore((s) => s.catalog)
  const notifications = useAppStore((s) => s.notifications)
  const markAll = useAppStore((s) => s.markNotificationsRead)
  const markOne = useAppStore((s) => s.markNotificationRead)
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | EnvStatus>('all')

  const inProgress = useMemo(() => myRequests.filter((r) => !['approved', 'rejected', 'cancelled'].includes(r.status)), [myRequests])
  const myNotifications = notifications.filter((n) => n.userId === user.id).slice(0, 5)
  const unread = myNotifications.filter((n) => !n.read).length
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, envs.filter((e) => e.status === s).length])) as Record<EnvStatus, number>
  const groups = STATUS_ORDER.filter((s) => (filter === 'all' || filter === s) && counts[s] > 0)

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Environments in your projects, requests in progress and your tenant’s quota."
        actions={
          <Button asChild>
            <Link to="/app/environments/new">
              <Plus /> Request environment
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <h2 className="font-heading text-h3 text-text-primary">Tenant quota</h2>
          <p className="mb-5 mt-0.5 text-caption text-text-secondary">Shared by everyone at {tenant.name}. Your Tenant Admin can ask for more.</p>
          {loading ? <Skeleton className="h-24" /> : <ResourceQuota used={tenantAllocated(allEnvs, tenant.id)} total={tenant.quota} />}
        </section>

        <section className="card flex flex-col p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
              Notifications
              {unread > 0 && <span className="tabular rounded-full bg-pink px-2 py-0.5 font-sans text-xs font-semibold text-white">{unread}</span>}
            </h2>
            {unread > 0 && (
              <button type="button" className="link text-caption" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {myNotifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">You’re all caught up.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {myNotifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markOne(n.id)
                      if (n.link) navigate(n.link)
                    }}
                    className="flex w-full gap-3 rounded-control px-2 py-2.5 text-left hover:bg-bg-subtle"
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-border-strong' : 'bg-pink')} aria-hidden />
                    <span className="min-w-0">
                      <span className={cn('block text-sm', n.read ? 'text-text-secondary' : 'font-semibold text-text-primary')}>{n.text}</span>
                      <span className="text-caption text-text-muted">{relativeTime(n.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SpendThisMonth tenantId={tenant.id} envIds={envIds} title="Your environments’ spend this month" className="mt-6" />

      {inProgress.length > 0 && (
        <section className="card mt-6 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-h3 text-text-primary">Your requests in progress</h2>
            <Button asChild variant="ghost" size="compact">
              <Link to="/app/requests">
                All requests <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {inProgress.map((r) => {
              const ev = mergedHistory(r, null)
              const to = r.status === 'draft' || r.status === 'changes_requested' ? continueRequestPath('user', r.id) : requestPath('user', r.id)
              return (
                <li key={r.id}>
                  <Link to={to} className="flex flex-col gap-2 py-3 hover:bg-bg-subtle sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text-primary">{r.spec.name}</span>
                      <span className="text-caption text-text-muted">
                        {r.status === 'draft' ? 'Draft, not submitted' : r.status === 'changes_requested' ? 'Changes requested: edit and resubmit' : `Updated ${relativeTime(r.updatedAt)}`}
                      </span>
                    </span>
                    <CompactTimeline events={ev} future={futureSteps(ev, r)} />
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-heading text-h2 text-text-primary">Environments</h2>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0" role="group" aria-label="Filter by status">
            {(['all', ...STATUS_ORDER] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
                  filter === s ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text' : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
                )}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
                <span className="tabular text-text-muted">{s === 'all' ? envs.length : counts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-card" />
            ))}
          </div>
        ) : envs.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ServerOff}
              title="No environments in your projects yet"
              description="Request one. Your Tenant Admin reviews it and the Super Admin approves the infrastructure."
              action={
                <Button asChild variant="secondary">
                  <Link to="/app/environments/new">Request environment</Link>
                </Button>
              }
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="card">
            <EmptyState icon={ServerOff} title="No environments with this status" action={<Button variant="secondary" onClick={() => setFilter('all')}>Show all</Button>} />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((status) => (
              <div key={status}>
                <div className="mb-3 flex items-center gap-2">
                  <StatusBadge status={status} />
                  <span className="tabular text-caption text-text-muted">{counts[status]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {envs
                    .filter((e) => e.status === status)
                    .map((env) => (
                      <EnvironmentCard
                        key={env.id}
                        env={env}
                        role="user"
                        catalog={catalog}
                        owner={users.find((u) => u.id === env.ownerId)}
                        project={projects.find((p) => p.id === env.projectId)}
                        hasPendingChange={requests.some((r) => r.envId === env.id && r.kind === 'change' && ['submitted', 'under_review', 'resubmitted', 'escalated'].includes(r.status))}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

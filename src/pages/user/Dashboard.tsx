import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileClock, Plus, ServerOff } from 'lucide-react'
import type { EnvStatus } from '@/data/types'
import { useAppStore, useCurrentTenant, useCurrentUser } from '@/store/useAppStore'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatDate, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { QuotaBar } from '@/components/shared/QuotaBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { EnvironmentCard } from '@/components/shared/EnvironmentCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_ORDER: EnvStatus[] = ['pending', 'approved', 'provisioning', 'running', 'stopped', 'rejected']
const STATUS_TITLES: Record<EnvStatus, string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  provisioning: 'Being set up',
  running: 'Running',
  stopped: 'Stopped',
  rejected: 'Not approved',
}

export default function UserDashboard() {
  const loading = useSimulatedLoading()
  const user = useCurrentUser()!
  const tenant = useCurrentTenant()!
  const allEnvs = useAppStore((s) => s.environments)
  const requests = useAppStore((s) => s.requests)
  const users = useAppStore((s) => s.users)
  const catalog = useAppStore((s) => s.catalog)
  const notifications = useAppStore((s) => s.notifications)
  const markAll = useAppStore((s) => s.markNotificationsRead)
  const markOne = useAppStore((s) => s.markNotificationRead)
  const draft = useAppStore((s) => s.drafts[user.id])
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | EnvStatus>('all')

  const envs = useMemo(() => allEnvs.filter((e) => e.tenantId === tenant.id), [allEnvs, tenant.id])
  const myNotifications = notifications.filter((n) => n.userId === user.id).slice(0, 5)
  const unread = myNotifications.filter((n) => !n.read).length
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, envs.filter((e) => e.status === s).length])) as Record<EnvStatus, number>
  const groups = STATUS_ORDER.filter((s) => (filter === 'all' || filter === s) && counts[s] > 0)
  const nextReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  return (
    <>
      <PageHeader
        eyebrow={tenant.name}
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Your organisation’s environments, quota and latest updates."
        actions={
          <Button asChild>
            <Link to="/app/environments/new">
              <Plus /> Request environment
            </Link>
          </Button>
        }
      />

      {draft && (
        <div className="mb-6 flex flex-col gap-3 rounded-card border border-border bg-indigo-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileClock className="size-5 shrink-0 text-indigo-text" aria-hidden />
            <p className="text-sm text-text-primary">
              You have a saved draft{draft.name ? <>: <span className="font-semibold">“{draft.name}”</span></> : ''}.
            </p>
          </div>
          <Button asChild variant="secondary" size="compact">
            <Link to="/app/environments/new">Continue draft</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-heading text-h3 text-text-primary">Organisation quota</h2>
              <p className="mt-0.5 text-caption text-text-secondary">Shared by everyone at {tenant.name}. Resets on {formatDate(nextReset)}.</p>
            </div>
          </div>
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <QuotaBar label="Credits" used={tenant.creditsUsed} total={tenant.creditQuota} unit="credits" />
              <QuotaBar label="GPU-hours" used={tenant.gpuUsed} total={tenant.gpuQuota} unit="hours" />
            </div>
          )}
          {tenant.creditsUsed / tenant.creditQuota > 0.8 && !loading && (
            <p className="mt-5 rounded-control bg-status-pending-bg px-3 py-2 text-caption text-status-pending-fg">
              Your organisation has used over 80% of this month’s credits. New requests may need a smaller setup or extra quota from your admin.
            </p>
          )}
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

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-heading text-h2 text-text-primary">Environments</h2>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0" role="group" aria-label="Filter by status">
            {(['all', ...STATUS_ORDER] as const).map((s) => {
              const count = s === 'all' ? envs.length : counts[s]
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-colors',
                    filter === s
                      ? 'border-indigo bg-indigo-50 text-indigo-text dark:border-indigo-text'
                      : 'border-border bg-bg-surface text-text-secondary hover:border-border-strong',
                  )}
                >
                  {s === 'all' ? 'All' : STATUS_TITLES[s]}
                  <span className="tabular text-text-muted">{count}</span>
                </button>
              )
            })}
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
              title="No environments yet"
              description="Request your first environment. An admin reviews it, and it is usually ready the same day."
              action={
                <Button asChild>
                  <Link to="/app/environments/new">
                    <Plus /> Request environment
                  </Link>
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
                  <StatusBadge status={status} label={STATUS_TITLES[status]} />
                  <span className="tabular text-caption text-text-muted">{counts[status]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {envs
                    .filter((e) => e.status === status)
                    .map((env) => (
                      <EnvironmentCard
                        key={env.id}
                        env={env}
                        catalog={catalog}
                        owner={users.find((u) => u.id === env.ownerId)}
                        request={requests.find((r) => r.id === env.requestId)}
                        hasPendingChange={requests.some((r) => r.envId === env.id && r.type === 'change' && r.status === 'pending')}
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

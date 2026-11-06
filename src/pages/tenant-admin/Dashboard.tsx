import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, FolderKanban, Inbox, Plus, Server, UserPlus, Users } from 'lucide-react'
import { useAppStore, useCurrentTenant } from '@/store/useAppStore'
import { useScopedAudit, useScopedEnvironments, useScopedProjects, useScopedRequests, useScopedUsers } from '@/store/selectors'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { formatCompact, formatShortDate, plural } from '@/lib/format'
import { tenantAllocated } from '@/lib/quota'
import { axisProps, CHART_COLORS, CHART_GRID } from '@/lib/chart'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { ChartCard, ChartTooltip } from '@/components/shared/ChartCard'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { ResourceQuota } from '@/components/shared/ResourceQuota'
import { CompactTimeline, futureSteps, mergedHistory } from '@/components/shared/LifecycleTimeline'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'

export default function TenantAdminDashboard() {
  const loading = useSimulatedLoading()
  const tenant = useCurrentTenant()!
  const users = useScopedUsers()
  const projects = useScopedProjects()
  const environments = useScopedEnvironments()
  const requests = useScopedRequests()
  const audit = useScopedAudit()
  const allEnvs = useAppStore((s) => s.environments)
  const usage = useAppStore((s) => s.usage)
  const allUsers = useAppStore((s) => s.users)
  const navigate = useNavigate()

  const toReview = requests.filter((r) => ['submitted', 'resubmitted', 'under_review'].includes(r.status) && r.raisedByRole !== 'tenant_admin')
  const withSuper = requests.filter((r) => r.status === 'escalated')
  const used = tenantAllocated(allEnvs, tenant.id)
  const series = usage.filter((u) => u.tenantId === tenant.id).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <PageHeader
        eyebrow={`${tenant.name} · ${tenant.code}`}
        title="Tenant dashboard"
        description="People, projects and infrastructure in your tenant, and what needs your attention."
        actions={
          <Button asChild>
            <Link to="/tenant-admin/requests">
              <Inbox /> Review requests ({toReview.length})
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard loading={loading} label="Users" icon={Users} value={String(users.filter((u) => u.status === 'active').length)} trend={{ direction: 'flat', text: plural(users.filter((u) => u.role === 'tenant_admin').length, 'Tenant Admin') }} />
        <KpiCard loading={loading} label="Projects" icon={FolderKanban} value={String(projects.filter((p) => p.status === 'active').length)} trend={{ direction: 'flat', text: `${projects.filter((p) => p.status === 'archived').length} archived` }} />
        <KpiCard loading={loading} label="Active environments" icon={Server} value={String(environments.filter((e) => e.status === 'active').length)} trend={{ direction: 'flat', text: `${environments.length} not terminated` }} />
        <KpiCard loading={loading} label="Pending approvals" icon={Inbox} value={String(toReview.length)} trend={{ direction: 'flat', text: `${withSuper.length} with the Super Admin` }} />
      </div>

      <section className="card mt-6 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Quota used and available</h2>
            <p className="mt-0.5 text-caption text-text-secondary">Resources held by provisioning, active, stopped and suspended environments</p>
          </div>
          <Button asChild variant="ghost" size="compact">
            <Link to="/tenant-admin/quotas">
              Quotas & Usage <ArrowRight />
            </Link>
          </Button>
        </div>
        <ResourceQuota used={used} total={tenant.quota} className="lg:grid-cols-4" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <ChartCard title="Usage" description="Credits per day, last 30 days" loading={loading} height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => formatShortDate(d)} minTickGap={24} />
                <YAxis {...axisProps} tickFormatter={(v) => formatCompact(v)} width={48} />
                <Tooltip content={<ChartTooltip labelFormatter={(d) => formatShortDate(d)} />} />
                <Area type="monotone" dataKey="credits" name="Credits" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="gpuHours" name="GPU-hours" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Waiting for you</h2>
            {toReview.length === 0 ? (
              <p className="text-sm text-text-secondary">Nothing to review right now.</p>
            ) : (
              <ul className="divide-y divide-border">
                {toReview.map((r) => {
                  const ev = mergedHistory(r, null)
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => navigate(`/tenant-admin/requests/${r.id}`)} className="flex w-full flex-col gap-2 py-3 text-left hover:bg-bg-subtle sm:flex-row sm:items-center">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-text-primary">{r.spec.name}</span>
                          <span className="text-caption text-text-muted">{allUsers.find((u) => u.id === r.requesterId)?.name}</span>
                        </span>
                        <CompactTimeline events={ev} future={futureSteps(ev, r)} />
                        <StatusBadge status={r.status} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Quick actions</h2>
            <div className="grid gap-2">
              <Button asChild variant="secondary" className="justify-start">
                <Link to="/tenant-admin/users">
                  <UserPlus /> Add a user
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link to="/tenant-admin/projects">
                  <FolderKanban /> Create a project
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link to="/tenant-admin/infrastructure/new">
                  <Plus /> Request infrastructure
                </Link>
              </Button>
            </div>
          </section>
          <section className="card p-6">
            <h2 className="mb-4 font-heading text-h3 text-text-primary">Recent activity</h2>
            <ActivityFeed items={audit.slice(0, 7)} loading={loading} />
          </section>
        </div>
      </div>
    </>
  )
}
